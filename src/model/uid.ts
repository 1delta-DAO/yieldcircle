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
 * the market's threads and holders (lending-sdks-sol `marketUid.ts` does the
 * same).
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
 * The market a strategy's thread hangs on. A loop talks on its COLLATERAL leg
 * (that is the position you hold and the market the index's holders list is
 * about); its debt leg has its own thread, reachable from the market page.
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
