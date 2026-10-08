/**
 * How much WORK a strategy asks of its holder — the beginner's first question,
 * before the rate. Three bands, read off what the strategy IS (the same fields
 * the ticket and the exit cell read), never off the rate:
 *
 *   passive  a plain savings deposit: interest accrues, nothing to tend
 *   medium   a loop with no fixed maturity: two floating legs — the net rate
 *            moves, so it wants a look now and then
 *   active   anything on a clock. A PT (fixed maturity): the rate is locked,
 *            but the instrument EXPIRES — the money must be redeemed or rolled
 *            on a date, and before it the only exit is selling at the market's
 *            bid. Or a loop on FIXED-RATE debt (Morpho Midnight's dated loans,
 *            Loopscale's tenors, Lista's broker terms): the borrow cost is
 *            locked, but the loan falls due and must be repaid or rolled —
 *            Midnight's can be liquidated once past due, whatever its health
 *
 * A deposit that is not savings (perp LP, managed, marked — `model/nature.ts`)
 * fits no band: its principal moves with a market, which is not "passive"
 * however little work it asks. `bandOf` answers null and the beginner page
 * leaves it out rather than file it somewhere misleading.
 *
 * Pure functions; the only imports are types.
 */
import type { StrategyProofRow } from '../index/api'
import { isSavings } from './nature'
import { ptMaturityOf, type LoopStrategy, type Strategy } from './strategies'
import { bookKeyOf } from './uid'

/**
 * What a strategy EARNS IN — the lander's second axis, so exposures are never
 * mixed: a SOL loop's rate is SOL-on-SOL and does not belong on a list next to
 * a dollar rate. A dollar is a dollar whoever issues it (the USD group); the
 * coins are themselves; everything else (JLP, euro, gold, HYPE…) is off the
 * lander and lives in the Earn catalogue.
 */
export type Denom = 'USD' | 'ETH' | 'BTC' | 'SOL' | 'BNB' | 'AVAX' | 'MON'
export const DENOMS: { id: Denom; word: string }[] = [
  { id: 'USD', word: 'Dollar' },
  { id: 'ETH', word: 'ETH' },
  { id: 'BTC', word: 'BTC' },
  { id: 'SOL', word: 'SOL' },
  { id: 'BNB', word: 'BNB' },
  { id: 'AVAX', word: 'AVAX' },
  { id: 'MON', word: 'MON' },
]
const MORE_DENOMS = new Set<string>(['SOL', 'BNB', 'AVAX', 'MON'])
/** By group for the moneys (any dollar desk is `USD`), by base asset in `MORE` (wrappers and LSTs already resolve: shMON is `MON`). */
export function denomOfAsset(group: string, asset: string): Denom | null {
  if (group === 'USD' || group === 'ETH' || group === 'BTC') return group
  return MORE_DENOMS.has(asset) ? (asset as Denom) : null
}
export const denomOf = (s: Strategy): Denom | null => denomOfAsset(s.group, s.asset)

export type Band = 'passive' | 'medium' | 'active'
export interface BandMeta {
  /** the section heading */
  word: string
  /** 1–3: how many effort marks the band draws */
  effort: 1 | 2 | 3
  /** one plain sentence: what holding it is like */
  why: string
  /** what the holder actually has to do */
  tend: string
}
export const BANDS: Record<Band, BandMeta> = {
  passive: {
    word: 'Passive',
    effort: 1,
    why: 'Plain savings: deposit, and interest accrues on its own. The value does not move with a market.',
    tend: 'Nothing to tend — check in whenever you like.',
  },
  medium: {
    word: 'Medium',
    effort: 2,
    why: 'A loop: the deposit is leveraged against borrowed money, so it earns the gap between two rates — both of which float.',
    tend: 'Worth a look every week or two: if the borrow rate rises past the deposit rate, the loop earns less, or nothing.',
  },
  active: {
    word: 'Active',
    effort: 3,
    why: 'Built on a fixed rate — a PT, or a fixed-rate loan: the rate is locked until a set date, and often higher — but it runs out.',
    tend: 'On that date a PT stops earning until you redeem or roll it, and a fixed loan must be repaid or rolled; leaving a PT early means selling at the market’s bid.',
  },
}
export const BAND_ORDER: Band[] = ['passive', 'medium', 'active']

/** A loop borrowing at a fixed rate for a term: Lista's broker card, Loopscale's tenors, a Midnight maturity. */
export const isFixedDebt = (s: LoopStrategy): boolean => !!(s.terms?.length || s.tenors?.length || s.dueAt)

/**
 * The clock a strategy runs on, when it has one: a loop's collateral expiry or
 * its dated loan's due date (Midnight), a fixed deposit's maturity — or, for a
 * LENDING market whose asset is itself a PT (those rows carry no `maturity`
 * field), the date in the PT's own symbol. A tenor or term loan (Loopscale,
 * Lista) has a clock too, but it starts when the loan is opened: no date here.
 */
export function clockOf(s: Strategy): number | undefined {
  if (s.kind === 'loop') return s.expiry ?? s.dueAt
  return s.maturity ?? ptMaturityOf(s.assetSymbol) ?? ptMaturityOf(s.holds)
}

/** The band a strategy belongs to, or null when it fits none a beginner should start in. */
export function bandOf(s: Strategy): Band | null {
  // anything on a PT clock is active, whatever shape it is sold in — a plain
  // lending market ON a PT matures exactly like the PT held outright
  if (clockOf(s)) return 'active'
  if (s.kind === 'loop') {
    // a loop whose collateral earns nothing is a pure rate bet — not a starting point
    if (!s.collateralYields) return null
    // fixed-rate debt runs out like a PT does: the loan must be repaid or rolled at the end of its term
    return isFixedDebt(s) ? 'active' : 'medium'
  }
  // a fixed-rate deposit (Pendle PT) is active even where no date was parsed
  if (s.source === 'fixed') return 'active'
  return isSavings(s.nature) ? 'passive' : null
}

/**
 * Who holds this strategy, and with how much — the index's strategy book
 * (pos-indexer docs/strategy-book.md), which files EVERY person's position
 * with a leg ≥ $1k under the strategies it runs. The matching is the index's:
 * a loop is a position with the collateral on a held leg and the debt on a
 * debt leg (more legs beside them are allowed — the wallet runs this loop
 * too); a deposit is a debt-free position holding the market, where a
 * collateral leg of a DIFFERENT token under a shared uid (Silo, Fraxlend)
 * does not count. The wallet count is a floor: holders under $1k are not in
 * the book.
 */
export interface Proof {
  totalUsd: number
  wallets: number
  /** the face on the card: the best clean APR ≥ $10k, else the largest stake */
  best: { account: string; equityUsd: number; aprPct: number | null } | null
}
export type ProofBook = Map<string, StrategyProofRow>
export function proofOf(s: Strategy, book: ProofBook | undefined): Proof | null {
  const k = book && bookKeyOf(s)
  const r = k ? book.get(k) : undefined
  if (!r || !r.wallets) return null
  return { totalUsd: r.equityUsd, wallets: r.wallets, best: r.best ?? r.top }
}

export interface Pick_ {
  s: Strategy
  proof: Proof | null
}

/**
 * Held by a crowd, not by one or two wallets: the bar a medium or active card's
 * proof must clear to count. Below it the book is a hint, not a reason — a
 * single $30m wallet in a 5 % PT says what that wallet wanted, not what the
 * band is good for.
 */
export const PROVEN = { wallets: 3, usd: 250_000 }
const proven = (p: Proof | null): boolean => !!p && p.wallets >= PROVEN.wallets && p.totalUsd >= PROVEN.usd

/**
 * How much more than the passive card a band that asks more attention must pay
 * to be worth that attention: a loop or a PT at 5 % beside savings at 3.7 % is
 * more work for a point and a bit. A multiple, not points, so it scales across
 * denominations (dollar savings near 4 %, ETH near 2 %).
 */
export const PREMIUM = 1.5

/**
 * The cards of one band, one per desk row (`asset`) like the Earn digest —
 * three USDC vaults are one recommendation, not three. Low-to-medium risk only,
 * unless the band would otherwise be empty.
 *
 * Passive is the beginner's savings account: the lowest risk tier leads, then
 * the biggest stake real wallets hold, then the steadiest rate — a low-risk
 * USDC market at 8 % outranks a yellow synthetic dollar at 12 %.
 *
 * Medium and active ask more of the holder, so they must PAY for it: a row
 * held by a crowd (`PROVEN`) leads, ordered by its steady rate (stake size only
 * breaks ties — the biggest pile is often the oldest, lowest-rate one), and a
 * row earning under `hurdle` (the passive card × `PREMIUM`) is shown only when
 * nothing that clears it is left to fill the band.
 */
export function recommend(all: Strategy[], band: Band, book: ProofBook | undefined, rank: (s: Strategy) => number, hurdle = 0, per = 3): Pick_[] {
  const whole = all.filter((s) => bandOf(s) === band)
  // a starting point is low-to-medium risk; high-risk rows only when the band would otherwise be empty
  const calm = whole.filter((s) => s.risk <= 2)
  const inBand = calm.length ? calm : whole
  const better = band === 'passive' ? saferFirst : paidFirst
  const byAsset = new Map<string, Pick_>()
  for (const s of inBand) {
    const p: Pick_ = { s, proof: proofOf(s, book) }
    const cur = byAsset.get(s.asset)
    if (!cur || better(p, cur, rank)) byAsset.set(s.asset, p)
  }
  const sorted = [...byAsset.values()].sort((a, b) => (better(a, b, rank) ? -1 : 1))
  const pays = sorted.filter((p) => rank(p.s) >= hurdle)
  return [...pays, ...sorted.filter((p) => rank(p.s) < hurdle)].slice(0, per)
}

/** Every band's cards for one denomination; medium and active must beat the passive card by `PREMIUM`. */
export function recommendAll(all: Strategy[], book: ProofBook | undefined, rank: (s: Strategy) => number): Record<Band, Pick_[]> {
  const passive = recommend(all, 'passive', book, rank)
  const hurdle = Math.max(0, ...passive.map((p) => rank(p.s))) * PREMIUM
  return { passive, medium: recommend(all, 'medium', book, rank, hurdle), active: recommend(all, 'active', book, rank, hurdle) }
}

type Better = (a: Pick_, b: Pick_, rank: (s: Strategy) => number) => boolean
const stake = (p: Pick_) => p.proof?.totalUsd ?? 0
const saferFirst: Better = (a, b, rank) =>
  a.s.risk !== b.s.risk ? a.s.risk < b.s.risk
  : stake(a) !== stake(b) ? stake(a) > stake(b)
  : rank(a.s) > rank(b.s)
const paidFirst: Better = (a, b, rank) =>
  proven(a.proof) !== proven(b.proof) ? proven(a.proof)
  : rank(a.s) !== rank(b.s) ? rank(a.s) > rank(b.s)
  : stake(a) > stake(b)
