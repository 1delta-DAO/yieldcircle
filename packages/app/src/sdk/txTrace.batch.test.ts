import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, custom, numberToHex } from 'viem'

// the wallet balances a batch moves: what the "touched moved" path reads
const balances = { raw: '100' }
vi.mock('@yieldcircle/core/sdk/api', () => ({
  bridgeStatus: vi.fn(),
  fetchEarnPositions: vi.fn(),
  fetchTokenBalances: vi.fn(async () => ({ items: [{ address: '0x' + 'cc'.repeat(20), balanceRaw: balances.raw, symbol: 'USDC', decimals: 6 }] })),
}))

const { batchLanded, configureTrace, markBatch, traceBatch, traceOf } = await import('./txTrace')

const ME = '0x' + 'aa'.repeat(20)
const TOKEN = '0x' + 'cc'.repeat(20)
const hashOf = (n: number) => '0x' + n.toString(16).padStart(64, '0')

/** A chain that answers the handful of calls the batch watcher makes. */
function fakeChain(o: { code?: string }) {
  const s = { head: 100, nonceAt: (_b: number) => 5, blocks: new Map<number, { hash: string; from: string; nonce: number; to: string }[]>() }
  const block = (n: number) => ({
    number: numberToHex(n), hash: hashOf(1000 + n), parentHash: hashOf(999 + n), timestamp: '0x1', gasLimit: '0x1', gasUsed: '0x1', baseFeePerGas: '0x1',
    transactions: (s.blocks.get(n) ?? []).map((t) => ({ ...t, nonce: numberToHex(t.nonce), blockNumber: numberToHex(n), blockHash: hashOf(1000 + n), value: '0x0', gas: '0x1', input: '0x', type: '0x2', chainId: '0x2105' })),
  })
  const found = (h: string) => { for (const [n, txs] of s.blocks) { const t = txs.find((x) => x.hash === h); if (t && n <= s.head) return { n, t } } return null }
  const request = async ({ method, params }: { method: string; params?: unknown[] }) => {
    const p = (params ?? []) as string[]
    switch (method) {
      case 'eth_chainId': return '0x2105'
      case 'eth_blockNumber': return numberToHex(s.head)
      case 'eth_getCode': return o.code ?? '0x'
      case 'eth_getTransactionCount': return numberToHex(s.nonceAt(Number(p[1])))
      case 'eth_getBlockByNumber': { const n = Number(p[0]); if (n > s.head) return null; return block(n) }
      case 'eth_getTransactionReceipt': {
        const f = found(p[0])
        return f && { transactionHash: f.t.hash, blockNumber: numberToHex(f.n), blockHash: hashOf(1000 + f.n), status: '0x1', from: f.t.from, to: f.t.to, logs: [], cumulativeGasUsed: '0x1', gasUsed: '0x1', effectiveGasPrice: '0x1', transactionIndex: '0x0', type: '0x2', contractAddress: null, logsBloom: '0x' }
      }
      case 'eth_getTransactionByHash': { const f = found(p[0]); return f ? block(f.n).transactions.find((x) => x.hash === p[0]) : null }
      default: throw new Error(`unexpected ${method}`)
    }
  }
  const client = createClient({ transport: custom({ request }), pollingInterval: 20 })
  configureTrace({ evm: () => client })
  return s
}

const until = async (f: () => Promise<boolean> | boolean, ms = 15_000) => {
  const end = Date.now() + ms
  while (!(await f())) { if (Date.now() > end) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 25)) }
}

describe('a wallet_sendCalls batch, traced from send', () => {
  beforeEach(() => { balances.raw = '100' })

  it('an EOA: the nonce moves, the transaction with it is found in the blocks since, and followed to the end', async () => {
    const chain = fakeChain({})
    const mark = await markBatch('8453', ME)
    expect(mark).toEqual({ nonce: 5, block: 100 })
    const id = traceBatch({ walletId: 'w1', chainId: '8453', account: ME, title: 'Deposit', moves: 'none', mark })
    expect(traceOf(id)?.hash).toBe('')
    // it lands two blocks on, self-sponsored 7702: the authorization takes a nonce too
    chain.blocks.set(102, [{ hash: hashOf(1), from: '0x' + 'bb'.repeat(20), nonce: 5, to: TOKEN }, { hash: hashOf(2), from: ME, nonce: 5, to: ME }])
    chain.nonceAt = (b) => (b >= 102 ? 7 : 5)
    chain.head = 103
    await until(() => traceOf(id)?.phase === 'settled')
    expect(traceOf(id)?.hash).toBe(hashOf(2))
  }, 20_000)

  it('a smart account (no nonce of its own): landed once what it touched moved against the baseline', async () => {
    fakeChain({ code: '0x6080' })
    const mark = await markBatch('8453', ME)
    expect(mark).toBeUndefined()
    const watch = [{ chainId: '8453', address: TOKEN }]
    const id = traceBatch({ walletId: 'w2', chainId: '8453', account: ME, title: 'Withdraw', moves: 'balances', watch, mark }, { snap: null, watchBase: { [`8453:${TOKEN}`]: '100' } })
    await new Promise((r) => setTimeout(r, 400))
    expect(traceOf(id)?.phase).toBe('pending')
    balances.raw = '250'
    await until(() => traceOf(id)?.phase === 'settled')
    const t = traceOf(id)
    expect(t?.hash).toBe('')
    expect(t?.received).toEqual([{ symbol: 'USDC', amount: '0.00015' }])
  }, 20_000)

  it('the wallet reports first: its transaction is followed', async () => {
    const chain = fakeChain({ code: '0x6080' })
    const id = traceBatch({ walletId: 'w3', chainId: '8453', account: ME, title: 'Deposit', moves: 'none' })
    chain.blocks.set(101, [{ hash: hashOf(9), from: '0x' + 'dd'.repeat(20), nonce: 0, to: ME }])
    chain.head = 101
    batchLanded(id, hashOf(9))
    await until(() => traceOf(id)?.phase === 'settled')
    expect(traceOf(id)?.hash).toBe(hashOf(9))
  }, 20_000)
})

describe('canBatchOn', () => {
  it('reads EIP-5792 `atomic`, and the draft `atomicBatch` older wallets answer', async () => {
    const { canBatchOn } = await import('../ladder')
    expect(canBatchOn({ 8453: { atomic: { status: 'supported' } } }, '8453')).toBe(true)
    expect(canBatchOn({ 8453: { atomic: { status: 'ready' } } }, 8453)).toBe(true)
    expect(canBatchOn({ 8453: { atomic: { status: 'unsupported' } } }, '8453')).toBe(false)
    expect(canBatchOn({ 8453: { atomicBatch: { supported: true } } }, '8453')).toBe(true)
    expect(canBatchOn({ 1: { atomic: { status: 'supported' } } }, '8453')).toBe(false)
    expect(canBatchOn(undefined, '8453')).toBe(false)
  })
})
