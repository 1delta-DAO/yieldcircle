import { describe, expect, it, vi } from 'vitest'

const fetchEnv = vi.fn()
vi.mock('../vendor/allocator/http', () => ({ apiFetchEnvelope: (...a: unknown[]) => fetchEnv(...a) }))
const { signStep, walletTypedData, withSignature } = await import('./signedAction')

const step = {
  purpose: 'authorize-action' as const,
  format: 'eip712' as const,
  signer: '0x1',
  description: 'x',
  typedData: {
    domain: { name: 'DBR MARKET', version: '1', chainId: '1', verifyingContract: '0x3542b39dcedc01f82c6e7af0eec424726d019eaa' },
    types: { BorrowOnBehalf: [{ name: 'caller', type: 'address' }, { name: 'from', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
    primaryType: 'BorrowOnBehalf',
    message: { caller: '0x43fa5e63253b00d5e34f42e711d734a058142055', from: '0x1', amount: '3140000000000000000000', nonce: '0', deadline: '1792500000' },
  },
  submit: { method: 'GET' as const, endpoint: '/v1/actions/loop/leverage', params: { account: '0x1', permitId: 'inv.abc' }, signatureField: 'signature' },
}
const tx = { to: '0xa', data: '0x', value: '0' }

describe('actions.signs — the mandatory sign step', () => {
  it('is a step only when there is nothing to send', () => {
    expect(signStep({ transactions: [], permissions: [], signs: [step] })).toBe(step)
    expect(signStep({ transactions: [], permissions: [], alternatives: [tx], signs: [step] })).toBeUndefined()
  })
  it('hands the wallet bigints and a numeric chainId', () => {
    const td = walletTypedData(step.typedData)
    expect(td.message.amount).toBe(3140000000000000000000n)
    expect(td.domain.chainId).toBe(1)
  })
  it('signs, then replays submit verbatim with the signature', async () => {
    fetchEnv.mockResolvedValueOnce({ actions: { transactions: [], permissions: [], alternatives: [tx] } })
    const out: { actions?: import('./types').LoopActions | null } = await withSignature({ actions: { transactions: [], permissions: [], signs: [step] } as import('./types').LoopActions }, async () => '0xsig')
    expect(fetchEnv).toHaveBeenCalledWith('/v1/actions/loop/leverage', { params: { account: '0x1', permitId: 'inv.abc', signature: '0xsig' } })
    expect(out.actions!.alternatives).toEqual([tx])
  })
  it('POSTs the body for a POST step, and never signs on paper', async () => {
    fetchEnv.mockResolvedValueOnce({ actions: { transactions: [], permissions: [], alternatives: [tx] } })
    const post = { ...step, submit: { method: 'POST' as const, endpoint: '/v1/actions/midnight/finalize', body: { inputs: { a: 1 } }, signatureField: 'signature' } }
    await withSignature({ actions: { transactions: [], permissions: [], signs: [post] } }, async () => '0xs')
    expect(fetchEnv).toHaveBeenLastCalledWith('/v1/actions/midnight/finalize', { body: { inputs: { a: 1 }, signature: '0xs' } })
    const paper = await withSignature({ actions: { transactions: [], permissions: [], signs: [step] } }, null)
    expect(paper.actions!.signs).toEqual([step])
  })
})
