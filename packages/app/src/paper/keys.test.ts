import { describe, expect, it } from 'vitest'
import { derivePaperKeys } from './keys'

/**
 * A paper account IS its derivation: the same name and password must open the same book on every
 * device, forever. These are the addresses the web and the phone derive today — a change here
 * loses every paper account, so it is never an expected diff.
 */
describe('derivePaperKeys', () => {
  it('derives the same two addresses as every build before it', async () => {
    const k = await derivePaperKeys('Alice_1', 'correct horse battery')
    expect({ name: k.name, evm: k.evm, sol: k.sol }).toEqual({ name: 'alice_1', evm: '0xdf1cd10759eb3c337428bfadcc21bb9c97bafd0f', sol: 'HhhmoYXCSJ4eCDAkhXCTsh8brEctSAtXyvXny2veai7b' })
  })
  it('refuses a name or a password the service would not take', async () => {
    await expect(derivePaperKeys('a', 'correct horse battery')).rejects.toThrow(/3–20 characters/)
    await expect(derivePaperKeys('alice_1', 'short')).rejects.toThrow(/at least 8/)
  })
})
