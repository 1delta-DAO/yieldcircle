/**
 * The join between this app's catalogue and the position index.
 *
 * A LOOP is already joined: the index's `createMarketUid` is a port of the
 * lending-sdks function the optimizer uses — `<lender>:<chainId>:<ref>` with
 * the ref lower-cased on EVM chain ids (base58 keeps its case) — so
 * `marketLongUid` here and `market_uid` there are the same string, and so is
 * the social thread key. Nothing to translate.
 *
 * A DEPOSIT is not. `/v1/data/earn` rows carry an `earnUid`, which spans
 * lending markets AND vaults, while the index keys a vault
 * `vault.<provider>:<chainId>:<address>`. Both listings do however agree on
 * what a venue keys a market by — `EarnMarket.ref` is exactly the index's
 * `ref` — so the uid can be rebuilt from the row rather than mapped.
 *
 * ⚠️ Verify against live data before trusting it for a whole family: dump the
 * earn listing per chain and diff against `GET /vaults` and `GET /markets/:uid`
 * (docs/social.md §6). `indexUid` returns null rather than guess when a row
 * has no ref, and every caller treats null as "no social layer for this row",
 * never as an error.
 */
import type { EarnMarket } from '../sdk/types'
import { isEvmChain } from './address'
import type { Strategy } from './strategies'

/**
 * `<lender>:<chainId>:<ref>` — the index's shape, ported (never imported).
 * The ref is lower-cased only on EVM chain ids: hex is case-insignificant,
 * base58 is not — a lowered Solana ref is a DIFFERENT key, and would orphan
 * the market's threads and holders (lending-sdks `margin-fetcher-sol`
 * `marketUid.ts` does the same).
 */
export function createMarketUid(chainId: string, lender: string, ref: string): string | null {
  if (!chainId || !lender || !ref) return null
  return `${lender}:${chainId}:${isEvmChain(chainId) ? ref.toLowerCase() : ref}`
}

/** The index / social uid of one `/v1/data/earn` row. */
export function uidOfEarn(m: Pick<EarnMarket, 'chainId' | 'venue' | 'ref' | 'asset'>): string | null {
  return createMarketUid(m.chainId, m.venue, m.ref || m.asset?.address)
}

/**
 * The market a strategy sits in: a loop's COLLATERAL leg (the position you
 * hold, and the market the index's holders list is about). Not where it is
 * talked about any more — that is `threadOf`.
 */
export function uidOf(s: Strategy): string | null {
  return s.kind === 'loop' ? s.marketLongUid : uidOfEarnLike(s)
}
/** A `SimpleStrategy` keeps only what the row needed, so the uid is rebuilt from those fields. */
function uidOfEarnLike(s: Extract<Strategy, { kind: 'simple' }>): string | null {
  // `earnUid` is already `<venue>:<chain>:<ref>` on every row the listing has
  // returned so far; the rebuild is the fallback for a row shaped otherwise.
  if (/^[^:]+:[^:]+:[^:]+$/.test(s.earnUid)) {
    const [venue, chainId, ref] = s.earnUid.split(':')
    return createMarketUid(chainId, venue, ref)
  }
  return createMarketUid(s.chainId, s.venueKey, s.assetAddress)
}

/** the uid as `createMarketUid` spells it — the social service refuses any other spelling in a loop key */
const canonUid = (uid: string) => { const p = parseUid(uid); return p ? createMarketUid(p.chainId, p.lender, p.ref) : null }

/**
 * A loop's OWN thread key (tickets/0005, pos-indexer `social/strategyKey.ts`):
 * `loop:<collateral uid>|<debt uid>`. Two loops on one collateral market used
 * to share that market's thread with each other and with the plain deposit
 * into it; the pair is what the user actually opened. Leverage and a fixed
 * term are parameters of one strategy, so they stay out of the key.
 */
export function loopKey(s: Extract<Strategy, { kind: 'loop' }>): string | null {
  const a = canonUid(s.marketLongUid), b = canonUid(s.marketShortUid)
  return a && b && a !== b ? `loop:${a}|${b}` : null
}
/** The two legs of a loop key; null when it is not one. */
export function parseLoopKey(key: string): { long: string; short: string } | null {
  if (!key.startsWith('loop:')) return null
  const [long, short, ...rest] = key.slice(5).split('|')
  return long && short && !rest.length ? { long, short } : null
}

/** Where a strategy is talked about. */
export interface ThreadRef { kind: 'market' | 'strategy'; key: string }
/**
 * The ONE answer to "which thread is this strategy's" — the ticket, Say why,
 * the row's 💬 and the feed all ask here, so none drifts back to `uidOf`. A
 * deposit is one market and keeps that market's thread; a loop has its own
 * once the service takes `strategy` (`loops`), else it stays on its
 * collateral market as before.
 */
export function threadOf(s: Strategy, loops: boolean): ThreadRef | null {
  if (s.kind === 'loop' && loops) {
    const k = loopKey(s)
    if (k) return { kind: 'strategy', key: k }
  }
  const u = uidOf(s)
  return u ? { kind: 'market', key: u } : null
}

/** Both legs of a loop, for a market page that wants the whole position. */
export const uidsOf = (s: Strategy): string[] =>
  s.kind === 'loop' ? [s.marketLongUid, s.marketShortUid] : [uidOf(s)].filter((x): x is string => !!x)

/** Split a uid back into its parts; `null` when it is not one. */
export function parseUid(uid: string): { lender: string; chainId: string; ref: string } | null {
  const i = uid.indexOf(':'), j = uid.indexOf(':', i + 1)
  if (i < 0 || j < 0) return null
  return { lender: uid.slice(0, i), chainId: uid.slice(i + 1, j), ref: uid.slice(j + 1) }
}

/**
 * The PROTOCOL a lender key belongs to — a port of the index's
 * `protocolKeyOf`, so a client can tell which leg of a transaction matched a
 * protocol filter without asking. Ported and not imported, like every other
 * rule this app shares with the index; the index's own tests pin the cases
 * (`packages/position-store/test/protocolKey.test.ts`).
 *
 *   AAVE_V4_94E7A5DC…  → AAVE_V4       COMPOUND_V3_WETH   → COMPOUND_V3
 *   FLUID_8453_LENDING → FLUID         vault.morpho       → vault.morpho
 */
export function protocolKeyOf(lenderKey: string): string {
  if (lenderKey.startsWith('vault.')) return lenderKey
  if (/^FLUID_\d+(_|$)/.test(lenderKey)) return 'FLUID'
  if (/^COMPOUND_V3_/.test(lenderKey)) return 'COMPOUND_V3'
  return lenderKey.replace(/(_(?:[0-9A-Fa-f]{8,}|\d+))+$/, '')
}
