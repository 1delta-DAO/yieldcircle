import { describe, expect, it } from 'vitest'
import { verifyMessage } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { ed25519 } from '@noble/curves/ed25519'
import { derivePaperKeys, solSign, solPublicKey } from './paperKey'
import { base58Encode } from '@yieldcircle/core/model/address'

describe('paper keys', () => {
  it('derive the same two addresses from the same name and password, on any device', async () => {
    const a = await derivePaperKeys('Alice_1', 'correct horse')
    const b = await derivePaperKeys('alice_1', 'correct horse')
    expect(a.evm).toBe(b.evm)
    expect(a.sol).toBe(b.sol)
    expect(a.evm).toMatch(/^0x[0-9a-f]{40}$/)
    expect(base58Encode(solPublicKey(a.solKey))).toBe(a.sol)
  }, 60_000)
  it('another password is another account', async () => {
    const a = await derivePaperKeys('alice_1', 'correct horse')
    const c = await derivePaperKeys('alice_1', 'correct horsf')
    expect(c.evm).not.toBe(a.evm)
    expect(c.sol).not.toBe(a.sol)
  }, 60_000)
  it('sign as their addresses', async () => {
    const k = await derivePaperKeys('bob_2', 'hunter2hunter2')
    const sig = await privateKeyToAccount(k.evmKey).signMessage({ message: 'hi' })
    expect(await verifyMessage({ address: k.evm as `0x${string}`, message: 'hi', signature: sig })).toBe(true)
    const m = new TextEncoder().encode('hi')
    expect(ed25519.verify(solSign(k.solKey, m), m, solPublicKey(k.solKey))).toBe(true)
  }, 60_000)
  it('refuses a name the social service would refuse, and a short password', async () => {
    await expect(derivePaperKeys('a!', 'longenough')).rejects.toThrow(/3–20/)
    await expect(derivePaperKeys('alice', 'short')).rejects.toThrow(/at least/)
  })
})
