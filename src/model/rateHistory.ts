/**
 * The 30-day rate history behind a list row (worker-api `/v1/data/earn/rate-history`,
 * yield-tracer migration 0159), and the arithmetic that turns it into the line
 * a row draws.
 *
 * Every point is a TIME-WEIGHTED mean of one UTC day's hourly samples, never a
 * sample: Aave V3 USDC on Ethereum is drained to ~99.8 % utilisation for an
 * hour every night and a single sample reads 12 % against 3.6 % for the day.
 * The arrays are basis points of a percent (360 = 3.60 %), `null` = no sample
 * that day; `hours` says how much of each day the samples cover, which is what
 * a window's mean is weighted by.
 *
 * A deposit reads its own uid. A LOOP reads two: the collateral leg's supply
 * side and the debt leg's borrow side, netted per day on equity at the row's
 * leverage — the same `dep·L − bor·(L−1)` the list ranks on — so a loop's line
 * is the position's yield, not either leg's.
 */
import type { Strategy } from './strategies'
import { netAprAtLeverage } from './leverage'
import { exposureOf } from './assets'

export interface RateHistoryItem {
  base: (number | null)[] | null
  rewards: (number | null)[] | null
  borrow: (number | null)[] | null
  borrowRewards: (number | null)[] | null
  hours: number[] | null
  avg7: number | null
  avg7Base: number | null
  avg30: number | null
  avg30Base: number | null
  borrowAvg30: number | null
  borrowAvg30Base: number | null
  coverage7: number | null
  coverage30: number | null
}
export interface RateHistoryResponse {
  days: number | null
  /** UTC date of the first point */
  start: string | null
  refreshedAt: string | null
  items: Record<string, RateHistoryItem>
  missing: string[]
}

/**
 * A row's line: one percent per day (null = no data), its hours-weighted mean
 * and how much of the window it covers. A loop's series carries the leverage
 * it was netted at, because every judgement about the series scales with it —
 * what is "flat" or "a spike" for a deposit is a rounding wobble at 25×.
 */
export interface RateSeries {
  points: (number | null)[]
  avg: number | null
  coverage: number | null
  leverage?: number
}

/**
 * The history does not carry an exposure asset's own yield: a JLP deposit paying 8.4 %, all of
 * it JLP's, answers `base` 0 every day (measured 2026-10-05), so its line read 0 % and every JLP
 * loop's −14 %. Those rows draw no line rather than a wrong one, and are not asked for.
 */
const blind = (s: Strategy) => (s.kind === 'simple' ? !!s.passthrough : !!exposureOf(s.asset))

/** The uids a row needs: its own, or a loop's two legs. */
export function historyUids(s: Strategy): string[] {
  if (blind(s)) return []
  return s.kind === 'simple' ? [s.earnUid] : [s.marketLongUid, s.marketShortUid]
}

const at = (xs: (number | null)[] | null, i: number) => (xs ? xs[i] ?? null : null)
const hoursAt = (it: RateHistoryItem, i: number) => it.hours?.[i] ?? 24

function mean(points: (number | null)[], weight: (i: number) => number): number | null {
  let s = 0, w = 0
  points.forEach((p, i) => { if (p !== null) { const h = weight(i); s += p * h; w += h } })
  return w > 0 ? s / w : null
}

/** What a deposit earned, per day — with or without its reward streams. */
export function supplySeries(it: RateHistoryItem, withRewards: boolean): RateSeries {
  const points = (it.base ?? []).map((b, i) => (b === null ? null : (b + (withRewards ? at(it.rewards, i) ?? 0 : 0)) / 100))
  return {
    points,
    // the server's mean is the exact one (it weighs by covered hours inside the day too)
    avg: (withRewards ? it.avg30 : it.avg30Base) ?? mean(points, (i) => hoursAt(it, i)),
    coverage: it.coverage30,
  }
}

/**
 * A loop's yield on equity per day at leverage `L`: the collateral leg's supply
 * rate (its own pool rate plus the token's intrinsic yield) on the whole
 * position, minus the debt leg's borrow cost on the borrowed part. A day counts
 * only when BOTH legs have a value; the mean weighs each day by the thinner leg.
 */
export function loopSeries(long: RateHistoryItem, short: RateHistoryItem, L: number, withRewards: boolean): RateSeries {
  const n = Math.max(long.base?.length ?? 0, short.borrow?.length ?? 0)
  const points: (number | null)[] = []
  for (let i = 0; i < n; i++) {
    const dep = at(long.base, i), bor = at(short.borrow, i)
    if (dep === null || bor === null) { points.push(null); continue }
    const d = (dep + (withRewards ? at(long.rewards, i) ?? 0 : 0)) / 100
    const b = (bor - (withRewards ? at(short.borrowRewards, i) ?? 0 : 0)) / 100
    points.push(netAprAtLeverage(d, b, L))
  }
  const cov = [long.coverage30, short.coverage30].filter((c): c is number => c !== null)
  return { points, avg: mean(points, (i) => Math.min(hoursAt(long, i), hoursAt(short, i))), coverage: cov.length ? Math.min(...cov) : null, leverage: L }
}

/** Where a series reads a uid's history from (the shared store's lookup). */
export type HistoryGet = (uid: string) => RateHistoryItem | undefined

/**
 * The row's series, or null when the history does not carry what it needs.
 * `L` overrides a loop's leverage (the ticket's tier or slider); the list draws
 * every loop at its Balanced tier, the leverage its rate is quoted at.
 */
export function seriesFor(s: Strategy, get: HistoryGet | undefined, withRewards: boolean, L?: number): RateSeries | null {
  if (!get || blind(s)) return null
  if (s.kind === 'simple') {
    const it = get(s.earnUid)
    return it?.base ? supplySeries(it, withRewards) : null
  }
  // a fixed-rate debt pays its term's rate, not the variable history of the market
  if (s.terms) return null
  const long = get(s.marketLongUid), short = get(s.marketShortUid)
  return long?.base && short?.borrow ? loopSeries(long, short, L ?? s.rec, withRewards) : null
}

/** The 7-day mean of a series (the last seven points, unweighted by hours — a display figure). */
export function avgLast(ser: RateSeries, days = 7): number | null {
  const xs = ser.points.slice(-days).filter((p): p is number => p !== null)
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

/**
 * Is the rate on the row a spike rather than what the market has paid? True
 * when it is well above the 30-day mean — half again and at least 1.5 points
 * per turn of leverage — on a window that is mostly covered. A one-night event
 * is not a yield. The absolute bar scales with the series' leverage: 1.5
 * points is a move on a deposit, but on a 25× loop it is one basis point of
 * spread, and without the scaling every levered row read as a spike.
 */
export function isSpike(now: number, ser: RateSeries | null): boolean {
  if (!ser || ser.avg === null || (ser.coverage ?? 0) < 0.6) return false
  return now - ser.avg >= 1.5 * Math.max(1, ser.leverage ?? 1) && now >= ser.avg * 1.5
}

/**
 * The rate to RANK by: today's, unless today's is a spike, in which case the
 * 30-day mean. Lists, the digest's "best rates" and "up to" headlines sort on
 * this, so a month of steady yield is not outranked by one hot night; the row
 * still SHOWS today's rate, with the mean beside it.
 */
export function steadyRate(s: Strategy, get: HistoryGet | undefined, withRewards = true): number {
  const ser = seriesFor(s, get, withRewards)
  return isSpike(s.rate, ser) && ser?.avg != null ? ser.avg : s.rate
}
