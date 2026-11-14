import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, custom, numberToHex } from 'viem'

// the bridge's answer, and the destination balance the fallback reads
const bridge = { status: 'NOT_FOUND' }
const balances = { raw: '100' }
vi.mock('@yieldcircle/core/sdk/api', () => ({
  bridgeStatus: vi.fn(async () => ({ status: bridge.status })),
  fetchEarnPositions: vi.fn(),
  fetchTokenBalances: vi.fn(async () => ({ items: [{ address: '0x' + 'cc'.repeat(20), balanceRaw: balances.raw, symbol: 'USDC', decimals: 6 }] })),
}))

const { configureTrace, traceOf, traceTx } = await import('./txTrace')
const { outcomeOf } = await import('./txOutcome')

const ME = '0x' + 'aa'.repeat(20)
const TOKEN = '0x' + 'cc'.repeat(20)
const hashOf = (n: number) => '0x' + n.toString(16).padStart(64, '0')

/** A chain on which every transaction asked about has landed in block 100. */
function fakeChain() {
  const request = async ({ method, params }: { method: string; params?: unknown[] }) => {
    const p = (params ?? []) as string[]
    switch (method) {
      case 'eth_chainId': return '0xa4b1'
      case 'eth_blockNumber': return numberToHex(101)
      case 'eth_getTransactionReceipt': return { transactionHash: p[0], blockNumber: numberToHex(100), blockHash: hashOf(1100), status: '0x1', from: ME, to: TOKEN, logs: [], cumulativeGasUsed: '0x1', gasUsed: '0x1', effectiveGasPrice: '0x1', transactionIndex: '0x0', type: '0x2', contractAddress: null, logsBloom: '0x' }
      default: throw new Error(`unexpected ${method}`)
    }
  }
  configureTrace({ evm: () => createClient({ transport: custom({ request }), pollingInterval: 20 }), bridgePollMs: 20 })
}

const until = async (f: () => boolean, ms = 15_000) => {
  const end = Date.now() + ms
  while (!f()) { if (Date.now() > end) throw new Error('timed out'); await new Promise((r) => setTimeout(r, 25)) }
}
const send = (n: number) => {
  const hash = hashOf(n)
  traceTx({ hash, chainId: '42161', account: ME, title: 'Bridge 250 USDC', moves: 'balances', bridge: { name: 'across', toChainId: '8453' }, watch: [{ chainId: '8453', address: TOKEN }], receipt: { kind: 'bridge', amount: '250 USDC' }, arrivesAt: Date.now() + 60_000 })
  return hash
}

describe('a bridge, followed to the destination', () => {
  beforeEach(() => { bridge.status = 'NOT_FOUND'; balances.raw = '100'; fakeChain() })

  it('the bridge says DONE: then the destination balance, and what arrived', async () => {
    const id = send(1)
    await until(() => !!traceOf(id)?.watchBase && traceOf(id)?.phase === 'bridging')
    expect(traceOf(id)?.arrivesAt).toBeGreaterThan(Date.now())
    bridge.status = 'DONE'; balances.raw = '250000100'
    await until(() => traceOf(id)?.phase === 'settled')
    expect(traceOf(id)?.received).toEqual([{ symbol: 'USDC', amount: '250' }])
    expect(outcomeOf(traceOf(id)!, { chain: (c) => (c === '8453' ? 'Base' : c) }).head).toBe('Landed on Base')
  }, 20_000)

  it('refunded: failed, and the screen says where the money went', async () => {
    const id = send(2)
    await until(() => traceOf(id)?.phase === 'bridging')
    bridge.status = 'TRANSFER_REFUNDED'
    await until(() => traceOf(id)?.phase === 'failed')
    const o = outcomeOf(traceOf(id)!, { chain: (c) => (c === '42161' ? 'Arbitrum' : c) })
    expect(o.state).toBe('lost')
    expect(o.money).toMatch(/Refunded to your wallet on Arbitrum/)
  }, 20_000)

  it('the bridge never knows it: the destination balance moving is landing too', async () => {
    const id = send(3)
    await until(() => !!traceOf(id)?.watchBase && traceOf(id)?.phase === 'bridging')
    await new Promise((r) => setTimeout(r, 200))
    expect(traceOf(id)?.phase).toBe('bridging')
    balances.raw = '5000100'
    await until(() => traceOf(id)?.phase === 'settled')
    expect(traceOf(id)?.received).toEqual([{ symbol: 'USDC', amount: '5' }])
    expect(traceOf(id)?.note).toBeUndefined()
  }, 20_000)
})
