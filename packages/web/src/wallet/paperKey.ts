/**
 * A paper account from a name and a password (tickets/0006 §H): no server holds a key or a
 * password — the same two words on any device derive the same two addresses.
 *
 *   seed   = scrypt(password, 'yieldcircle-paper:' + name, N = 2^16, r = 8, p = 1) → 64 bytes
 *   evmKey = hkdf-sha256(seed, info 'evm/<index>')  → secp256k1, viem's local account
 *   solKey = hkdf-sha256(seed, info 'sol/<index>')  → ed25519 seed (a Solana keypair)
 *
 * Scrypt is slow on purpose (~0.3–1 s on a phone): a guessed password costs a guesser the same.
 * The name is the salt, lower-cased, so two people with the same password are two accounts. It is
 * play money: no reset, and a different password is simply a different account.
 */
import { scryptAsync } from '@noble/hashes/scrypt'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha2'
import { ed25519 } from '@noble/curves/ed25519'
import { secp256k1 } from '@noble/curves/secp256k1'
import { privateKeyToAccount } from 'viem/accounts'
import { bytesToHex, type Hex } from 'viem'
import { base58Encode } from '@yieldcircle/core/model/address'

/** The social service's handle rule — the name IS the handle. */
export const PAPER_NAME = /^[a-z0-9_]{3,20}$/
export const PAPER_PASSWORD_MIN = 8
export const normName = (n: string) => n.trim().toLowerCase()

export interface PaperKeys {
  name: string
  index: number
  evmKey: Hex
  evm: string
  /** the 32-byte ed25519 seed, hex */
  solKey: Hex
  sol: string
}

const enc = (s: string) => new TextEncoder().encode(s)

export async function derivePaperKeys(name0: string, password: string, index = 0, onProgress?: (p: number) => void): Promise<PaperKeys> {
  const name = normName(name0)
  if (!PAPER_NAME.test(name)) throw new Error('A name is 3–20 characters: a–z, 0–9 and _.')
  if (password.length < PAPER_PASSWORD_MIN) throw new Error(`The password needs at least ${PAPER_PASSWORD_MIN} characters.`)
  const seed = await scryptAsync(enc(password), enc(`yieldcircle-paper:${name}`), { N: 2 ** 16, r: 8, p: 1, dkLen: 64, onProgress, asyncTick: 25 })
  // a secp256k1 key must be below the curve order: the odd derivation that is not takes the next counter
  let evmBytes: Uint8Array | null = null
  for (let c = 0; !evmBytes; c++) {
    const k = hkdf(sha256, seed, undefined, enc(`evm/${index}${c ? `/${c}` : ''}`), 32)
    if (secp256k1.utils.isValidPrivateKey(k)) evmBytes = k
  }
  const evmKey = bytesToHex(evmBytes)
  const solSeed = hkdf(sha256, seed, undefined, enc(`sol/${index}`), 32)
  return {
    name, index, evmKey,
    evm: privateKeyToAccount(evmKey).address.toLowerCase(),
    solKey: bytesToHex(solSeed),
    sol: base58Encode(ed25519.getPublicKey(solSeed)),
  }
}

/** Sign bytes with the paper Solana key (ed25519 over the raw message, as a wallet's `signMessage`). */
export const solSign = (solKey: Hex, message: Uint8Array): Uint8Array => ed25519.sign(message, hexBytes(solKey))
export const solPublicKey = (solKey: Hex): Uint8Array => ed25519.getPublicKey(hexBytes(solKey))
function hexBytes(h: Hex): Uint8Array {
  const s = h.slice(2), out = new Uint8Array(s.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16)
  return out
}
