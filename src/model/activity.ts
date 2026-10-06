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
import type { EarnerRow } from '../index/api'
import { isSavings } from './nature'
import { ptMaturityOf, type LoopStrategy, type Strategy } from './strategies'
import { uidsOf } from './uid'

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
 * Who of the earners board sits in this strategy's market(s), and with how
 * much. A loop asks for BOTH its legs, so a mere lender of the same collateral
 * does not read as running the loop. A deposit asks for a row that holds it AS
 * a deposit — a supply/share leg of its market (`holdsAsDeposit`), with no
 * debt anywhere in the position: on Morpho Blue the lender, the collateral
 * poster and the borrower all share one market uid, so a PT looper borrowing
 * the loan asset would otherwise "prove" lending it (the 60 % loop vouching
 * for a 6 % deposit). Equity, not supply: what the wallet actually has at stake.
 */
export interface Proof {
  totalUsd: number
  wallets: number
  /** the biggest position: whose, how big, and what it earns */
  best: { account: string; equityUsd: number; aprPct: number | null } | null
}
export function proofOf(s: Strategy, rows: EarnerRow[] | undefined): Proof | null {
  if (!rows?.length) return null
  const want = uidsOf(s)
  if (!want.length) return null
  const matched = s.kind === 'loop'
    ? rows.filter((r) => want.every((u) => r.marketUids.includes(u)))
    : rows.filter((r) => !r.legs.some((l) => l.side === 'borrow') && r.legs.some((l) => want.includes(l.marketUid) && holdsAsDeposit(l, s.assetSymbol)))
  if (!matched.length) return null
  const accounts = new Set(matched.map((r) => r.account))
  const best = matched.reduce((m, r) => (r.equityUsd > m.equityUsd ? r : m))
  return {
    totalUsd: matched.reduce((a, r) => a + r.equityUsd, 0),
    wallets: accounts.size,
    best: { account: best.account, equityUsd: best.equityUsd, aprPct: best.netAprPct },
  }
}

/**
 * A supply or vault-share leg is the deposit itself; a collateral leg only when
 * it is the deposit's own asset (Aave-style collateral) — a Morpho market's
 * collateral is a DIFFERENT token under the same uid. A leg without a symbol
 * is given the benefit of the doubt.
 */
const holdsAsDeposit = (l: EarnerRow['legs'][number], sym: string) =>
  l.side !== 'borrow' && (l.side !== 'collateral' || !l.symbol || l.symbol.toUpperCase() === sym.toUpperCase())

export interface Pick_ {
  s: Strategy
  proof: Proof | null
}
/**
 * The cards of one band: proven strategies first (the ones top earners hold,
 * biggest stake leading), the steadiest rate breaking ties and filling the
 * rest. Passive is the beginner's savings account, so there the lowest risk
 * tier leads before proof or rate: a low-risk USDC market at 8 % outranks a
 * yellow synthetic dollar at 12 %, and the riskier rows only fill what is left. One card per desk row (`asset`), like the Earn digest — three USDC
 * vaults are one recommendation, not three.
 */
export function recommend(all: Strategy[], band: Band, rows: EarnerRow[] | undefined, rank: (s: Strategy) => number, per = 3): Pick_[] {
  const whole = all.filter((s) => bandOf(s) === band)
  // a starting point is low-to-medium risk; high-risk rows only when the band would otherwise be empty
  const calm = whole.filter((s) => s.risk <= 2)
  const inBand = calm.length ? calm : whole
  // best row per desk: (passive: risk first) proof beats rank, rank breaks the tie
  const riskFirst = band === 'passive'
  const byAsset = new Map<string, Pick_>()
  for (const s of inBand) {
    const p: Pick_ = { s, proof: proofOf(s, rows) }
    const cur = byAsset.get(s.asset)
    if (!cur || better(p, cur, rank, riskFirst)) byAsset.set(s.asset, p)
  }
  return [...byAsset.values()].sort((a, b) => (better(a, b, rank, riskFirst) ? -1 : 1)).slice(0, per)
}
const better = (a: Pick_, b: Pick_, rank: (s: Strategy) => number, riskFirst: boolean): boolean =>
  riskFirst && a.s.risk !== b.s.risk
    ? a.s.risk < b.s.risk
    : (a.proof?.totalUsd ?? 0) !== (b.proof?.totalUsd ?? 0)
    ? (a.proof?.totalUsd ?? 0) > (b.proof?.totalUsd ?? 0)
    : rank(a.s) > rank(b.s)
