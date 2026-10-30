import { nameOf } from './assets'
import type { Risk, Strategy } from './strategies'

/**
 * The Earn lists' search, filters and sort — one rule for Lite's list, Pro's Earn and a group's
 * listing, so "low risk, $10m+, exit any time" means the same rows wherever it is asked.
 *
 * Pure: the list hands in its rows (a `Strategy` or anything carrying one) and its own order; the
 * `best` sort keeps that order, so each list's ranking rule (Lite: safer first, then the steady
 * rate; Pro: our pick, then the steady rate) stays the list's.
 */
export type EarnSort = 'best' | 'rate' | 'size' | 'risk' | 'name'
export const EARN_SORTS: { id: EarnSort; word: string }[] = [
  { id: 'best', word: 'Best first' },
  { id: 'rate', word: 'Highest rate' },
  { id: 'size', word: 'Biggest' },
  { id: 'risk', word: 'Safest' },
  { id: 'name', word: 'A–Z' },
]

export type EarnKind = 'all' | 'simple' | 'loop'
export interface EarnFilter {
  q: string
  sort: EarnSort
  /** deposits or loops; `all` mixes them (Lite) — Pro's listing has its own segment and leaves this `all` */
  kind: EarnKind
  /** the riskiest row kept: 3 is any */
  risk: Risk
  /** the smallest deposited size kept, in dollars (a loop: its collateral market's) */
  minTvl: number
  /** only rows whose money can leave in the same block — no cooldown, queue, lock or maturity */
  instant: boolean
}
export const EARN_FILTER: EarnFilter = { q: '', sort: 'best', kind: 'all', risk: 3, minTvl: 0, instant: false }
export const MIN_TVLS = [0, 1e6, 1e7, 1e8] as const

/** How many filters are set (the search and the sort not counted): the Filters button's badge. */
export const filtersOn = (f: EarnFilter) => Number(f.kind !== 'all') + Number(f.risk < 3) + Number(f.minTvl > 0) + Number(f.instant)
/** Anything narrowing or reordering the list: a list that shows its best few shows every match then. */
export const earnActive = (f: EarnFilter) => !!f.q.trim() || f.sort !== 'best' || filtersOn(f) > 0

/** Money that leaves in the same block: a loop unwinds in one transaction; a deposit by its exit terms. */
export const exitsNow = (s: Strategy) => s.kind === 'loop' ? true : !s.maturity && !s.book && (s.exitMode === 'instant' || s.exitMode === 'instant-capped')

/** Everything a row can be found by: the token, its long name, the venue, the curator, the vault, the debt. */
export function earnText(s: Strategy, extra: string[] = []): string {
  const parts = [s.holds, s.asset, nameOf(s.asset), s.venue, s.desk, s.assetGroup, ...extra]
  if (s.kind === 'simple') parts.push(s.via, s.brand, s.vaultName, s.source, s.assetSymbol, s.market, s.book ? 'fixed' : undefined, s.maturity ? 'fixed maturity' : undefined)
  else parts.push(s.debt, s.lender, s.instrument, 'loop levered leverage')
  return parts.filter(Boolean).join(' ').toLowerCase()
}

/** Every word of the query is somewhere in the row's text (`usdc morpho base`). */
export function matchesQuery(text: string, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  return words.every((w) => text.includes(w))
}

/**
 * The rows that pass, in the order asked for. `of` reads a row's strategy; `extra` adds words a
 * row is found by that the strategy does not carry (its chain's name, Lite's plain title);
 * `rank` is the steady rate the `rate` sort orders by.
 */
export function applyEarn<T>(rows: T[], f: EarnFilter, of: (t: T) => Strategy, opts: { extra?: (t: T) => string[]; rank?: (s: Strategy) => number } = {}): T[] {
  const q = f.q.trim()
  const kept = rows.filter((t) => {
    const s = of(t)
    if (f.kind !== 'all' && s.kind !== f.kind) return false
    if (s.risk > f.risk) return false
    if (f.minTvl > 0 && s.tvlUsd < f.minTvl) return false
    if (f.instant && !exitsNow(s)) return false
    return !q || matchesQuery(earnText(s, opts.extra?.(t)), q)
  })
  const rank = opts.rank ?? ((s: Strategy) => s.rate)
  const by: Record<EarnSort, ((a: Strategy, b: Strategy) => number) | null> = {
    best: null,
    rate: (a, b) => rank(b) - rank(a),
    size: (a, b) => b.tvlUsd - a.tvlUsd,
    risk: (a, b) => a.risk - b.risk || rank(b) - rank(a),
    name: (a, b) => a.holds.localeCompare(b.holds) || rank(b) - rank(a),
  }
  const cmp = by[f.sort]
  return cmp ? kept.sort((a, b) => cmp(of(a), of(b))) : kept
}
