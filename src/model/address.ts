/**
 * Addresses across two VMs (docs/solana.md §A).
 *
 * An EVM address is 20 bytes of hex behind `0x`, case-insignificant — the
 * canonical spelling everywhere in this app is lower-case. A Solana address is
 * the base58 of 32 bytes, and its case IS the value: lower-casing one makes a
 * different key (social threads, holders, the feed's Copy). So every place
 * that used to call `.toLowerCase()` on an address goes through `normAddr`,
 * which lowers only the hex shape and is the identity on base58.
 *
 * The plan's signature was `normAddr(chainId, a)`; the chain id is redundant —
 * the shape says which VM an address belongs to, and half the call sites
 * (account comparisons, cache keys) have no chain in hand — so the shape
 * decides. A string that is neither shape (a lender key, a uid) is returned
 * unchanged, which is what those call sites want from a key: never invent a
 * second spelling.
 */

export const SOLANA_CHAIN_ID = 'solana'
/** An EVM chain id is a number in a string; everything else (today: `solana`) is not a wagmi chain. */
export const isEvmChain = (chainId: string | undefined): boolean => !!chainId && /^\d+$/.test(chainId)
export const isSvmChain = (chainId: string | undefined): boolean => chainId === SOLANA_CHAIN_ID

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const B58_INDEX: Record<string, number> = {}
for (let i = 0; i < B58.length; i++) B58_INDEX[B58[i]] = i
/** Base58 → bytes, or null when a character is outside the alphabet. */
export function base58Decode(s: string): Uint8Array | null {
  if (!s) return null
  const bytes: number[] = []
  for (const ch of s) {
    let carry = B58_INDEX[ch]
    if (carry === undefined) return null
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58
      bytes[j] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8 }
  }
  for (const ch of s) { if (ch === '1') bytes.push(0); else break }
  return new Uint8Array(bytes.reverse())
}
export function base58Encode(bytes: Uint8Array): string {
  const digits: number[] = []
  for (const b of bytes) {
    let carry = b
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8
      digits[j] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0 }
  }
  let out = ''
  for (const b of bytes) { if (b === 0) out += '1'; else break }
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]]
  return out
}

export const isEvmAddr = (a: string | undefined): a is string => !!a && /^0x[0-9a-fA-F]{40}$/.test(a)
/** A Solana pubkey: base58 that decodes to exactly 32 bytes. The length gate keeps ordinary words out before decoding. */
export const isSolAddr = (a: string | undefined): a is string =>
  !!a && a.length >= 32 && a.length <= 44 && base58Decode(a)?.length === 32
/** Either VM's address shape — the route / view-as / wallet-dialog test. */
export const isAddr = (a: string | undefined): a is string => isEvmAddr(a) || isSolAddr(a)
/** An 87–88 character base58 string of 64 bytes: a Solana transaction signature. */
export const isSolSignature = (s: string | undefined): s is string =>
  !!s && s.length >= 86 && s.length <= 88 && base58Decode(s)?.length === 64

/** Which chain-id an address shape can only belong to; `undefined` for a 0x address (any EVM chain). */
export const chainOfAddr = (a: string | undefined): string | undefined => (isSolAddr(a) ? SOLANA_CHAIN_ID : undefined)

/**
 * The canonical spelling of an address (or any address-like key): hex is
 * lower-cased, base58 — and anything that is not an address — is kept as is.
 */
export const normAddr = <T extends string | undefined | null>(a: T): T =>
  (a && /^0x[0-9a-fA-F]*$/.test(a) ? (a.toLowerCase() as T) : a)
