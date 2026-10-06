/**
 * How much WORK a strategy asks of its holder — the beginner's first question,
 * before the rate. Three bands, read off what the strategy IS (the same fields
 * the ticket and the exit cell read), never off the rate:
 *
 *   passive  a plain savings deposit: interest accrues, nothing to tend
 *   medium   a loop with no fixed maturity: two floating legs — the net rate
 *            moves, so it wants a look now and then
 *   active   anything on a PT (fixed maturity): the rate is locked, but the
 *            instrument EXPIRES — the money must be redeemed or rolled on a
 *            date, and before it the only exit is selling at the market's bid
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
import { ptMaturityOf, type Strategy } from './strategies'
import { uidsOf } from './uid'

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
    why: 'Built on a fixed-rate PT: the rate is locked until a set date, and often higher — but the instrument matures.',
    tend: 'On the maturity date the money stops earning until you redeem or roll it; leaving early means selling at the market’s bid.',
  },
}
export const BAND_ORDER: Band[] = ['passive', 'medium', 'active']

/**
 * The clock a strategy runs on, when it has one: a loop's collateral expiry, a
 * fixed deposit's maturity — or, for a LENDING market whose asset is itself a
 * PT (those rows carry no `maturity` field), the date in the PT's own symbol.
 */
export function clockOf(s: Strategy): number | undefined {
  if (s.kind === 'loop') return s.expiry
  return s.maturity ?? ptMaturityOf(s.assetSymbol) ?? ptMaturityOf(s.holds)
}

/** The band a strategy belongs to, or null when it fits none a beginner should start in. */
export function bandOf(s: Strategy): Band | null {
  // anything on a PT clock is active, whatever shape it is sold in — a plain
  // lending market ON a PT matures exactly like the PT held outright
  if (clockOf(s)) return 'active'
  if (s.kind === 'loop') {
    // a loop whose collateral earns nothing is a pure rate bet — not a starting point
    return s.collateralYields ? 'medium' : null
  }
  // a fixed-rate deposit (Pendle PT) is active even where no date was parsed
  if (s.source === 'fixed') return 'active'
  return isSavings(s.nature) ? 'passive' : null
}

/**
 * Who of the earners board sits in this strategy's market(s), and with how
 * much. A deposit matches a row holding its market; a loop asks for BOTH its
 * legs, so a mere lender of the same collateral does not read as running the
 * loop. Equity, not supply: what the wallet actually has at stake.
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
  const matched = rows.filter((r) => want.every((u) => r.marketUids.includes(u)))
  if (!matched.length) return null
  const accounts = new Set(matched.map((r) => r.account))
  const best = matched.reduce((m, r) => (r.equityUsd > m.equityUsd ? r : m))
  return {
    totalUsd: matched.reduce((a, r) => a + r.equityUsd, 0),
    wallets: accounts.size,
    best: { account: best.account, equityUsd: best.equityUsd, aprPct: best.netAprPct },
  }
}

export interface Pick_ {
  s: Strategy
  proof: Proof | null
}
/**
 * The cards of one band: proven strategies first (the ones top earners hold,
 * biggest stake leading), the steadiest rate breaking ties and filling the
 * rest. One card per desk row (`asset`), like the Earn digest — three USDC
 * vaults are one recommendation, not three.
 */
export function recommend(all: Strategy[], band: Band, rows: EarnerRow[] | undefined, rank: (s: Strategy) => number, per = 3): Pick_[] {
  const whole = all.filter((s) => bandOf(s) === band)
  // a starting point is low-to-medium risk; high-risk rows only when the band would otherwise be empty
  const calm = whole.filter((s) => s.risk <= 2)
  const inBand = calm.length ? calm : whole
  // best row per desk: proof beats rank, rank breaks the tie
  const byAsset = new Map<string, Pick_>()
  for (const s of inBand) {
    const p: Pick_ = { s, proof: proofOf(s, rows) }
    const cur = byAsset.get(s.asset)
    if (!cur || better(p, cur, rank)) byAsset.set(s.asset, p)
  }
  return [...byAsset.values()].sort((a, b) => (better(a, b, rank) ? -1 : 1)).slice(0, per)
}
const better = (a: Pick_, b: Pick_, rank: (s: Strategy) => number) =>
  (a.proof?.totalUsd ?? 0) !== (b.proof?.totalUsd ?? 0)
    ? (a.proof?.totalUsd ?? 0) > (b.proof?.totalUsd ?? 0)
    : rank(a.s) > rank(b.s)
