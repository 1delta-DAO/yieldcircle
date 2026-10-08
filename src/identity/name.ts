/**
 * Every wallet gets a name derived from its address alone — deterministic,
 * offline, identical in every client. A signed profile overrides it; until
 * someone signs one, `0x7a3f…9c21` reads as "Amber Otter", which is what makes
 * a feed of addresses legible.
 *
 * Ported from `pos-indexer/apps/ui/src/lib/identity.ts` so both clients call
 * the same wallet the same thing. PORTED, not imported: that app is a
 * different stack, and the index's own rule is to copy rather than link.
 */

// 32 × 32 = 1024 combinations; enough that two wallets in one view rarely
// collide, short enough to read at a glance.
const ADJECTIVES = [
  'amber', 'azure', 'brisk', 'calm', 'clever', 'copper', 'crimson', 'dapper',
  'eager', 'electric', 'fearless', 'gentle', 'golden', 'humble', 'indigo', 'jolly',
  'keen', 'lucky', 'mellow', 'nimble', 'olive', 'patient', 'quiet', 'rapid',
  'silver', 'steady', 'swift', 'tidal', 'velvet', 'vivid', 'wandering', 'zesty',
]
const NOUNS = [
  'otter', 'falcon', 'badger', 'heron', 'lynx', 'marten', 'osprey', 'panther',
  'raven', 'sparrow', 'tapir', 'urchin', 'viper', 'walrus', 'yak', 'zebra',
  'anchor', 'beacon', 'comet', 'delta', 'ember', 'fathom', 'gale', 'harbor',
  'ingot', 'jetty', 'kelp', 'lantern', 'meridian', 'nimbus', 'orbit', 'quarry',
]
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/**
 * FNV-1a over the RAW string — the seed for a non-hex address. A base58
 * address is case-significant, so no lowering here: `So11…` and `so11…` are
 * different wallets and get different names.
 */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h >>> 0
}
/** "Amber Otter" — the same for a given address everywhere. */
export function autoName(addr: string): string {
  const a = addr.toLowerCase().replace(/^0x/, '')
  if (a.length < 10) return addr
  // the historical seed for hex, so no EVM wallet changes its name; a base58
  // address used to come out as `parseInt → NaN` and crash on `cap(undefined)`
  if (/^[0-9a-f]+$/.test(a.slice(0, 10))) {
    const n1 = parseInt(a.slice(0, 5), 16)
    const n2 = parseInt(a.slice(5, 10), 16)
    return `${cap(ADJECTIVES[n1 % ADJECTIVES.length])} ${cap(NOUNS[n2 % NOUNS.length])}`
  }
  const h = fnv1a(addr)
  return `${cap(ADJECTIVES[(h >>> 16) % ADJECTIVES.length])} ${cap(NOUNS[h % NOUNS.length])}`
}

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export interface NameLike { handle?: string | null; displayName?: string | null }
/** What to call a wallet: its handle, its display name, else the generated one. */
export function displayFor(addr: string, profile?: NameLike | null): { label: string; generated: boolean } {
  if (profile?.handle) return { label: `@${profile.handle}`, generated: false }
  if (profile?.displayName) return { label: profile.displayName, generated: false }
  return { label: autoName(addr), generated: true }
}

/**
 * The one line every surface says about a generated name. Copy identical to
 * the index's own UI (`apps/ui/src/components/Identity.tsx::AUTO_TITLE`), so
 * the same wallet gets the same explanation in both clients.
 */
export const AUTO_TITLE =
  'no signed profile yet — this name and face are generated from the address, the same everywhere'

/**
 * What the INDEX says an address is, which outranks a made-up name: a vault
 * share token is "Steakhouse Financial USDC", not a whale called Amber Otter,
 * and a roster emitter is the protocol itself.
 *
 * `generated` is the whole point of the return (pos-indexer tickets/0019): a
 * made-up name must be MARKED wherever it renders, and only this function
 * knows — a renderer that asks `!handle && !displayName` calls every labelled
 * vault auto.
 */
/**
 * label sources that NAME a plain wallet: the wallet's own ENS / Basename /
 * .sol (`sns`) / Seeker .skr (`skr`), our seed file, a third-party tag, and the
 * Solana KOL lists (`kolscan`, `gmgn` — pos-indexer docs/sol-names.md)
 */
const WALLET_NAME_SOURCES = new Set(['ens', 'basename', 'sns', 'skr', 'seed', 'tag', 'kolscan', 'gmgn'])

export function labelFor(
  addr: string,
  profile?: NameLike | null,
  idx?: {
    accountKind?: string | null
    accountLabel?: string | null
    accountLabelSource?: string | null
  } | null,
): { label: string; generated: boolean; kind?: string | null } {
  // 'unknown' is the index's DEFAULT for an address it has not classified —
  // it says nothing, so it must not outrank the generated name. A label whose
  // SOURCE is a name (ENS / Basename / seed / tag) stands on its own: an
  // ENS-named EOA is `vitalik.eth`, not Amber Otter — but never over a
  // signed profile, which is the wallet speaking for itself.
  const strongKind =
    idx?.accountKind && idx.accountKind !== 'eoa' && idx.accountKind !== 'unknown'
  const named = idx?.accountLabelSource && WALLET_NAME_SOURCES.has(idx.accountLabelSource)
  if (idx?.accountLabel && strongKind)
    return { label: idx.accountLabel, generated: false, kind: idx.accountKind }
  if (idx?.accountLabel && named && !profile?.handle && !profile?.displayName)
    return { label: idx.accountLabel, generated: false, kind: idx.accountKind ?? null }
  return { ...displayFor(addr, profile), kind: idx?.accountKind ?? null }
}
