/**
 * Loans whose RATE the borrower picks (the Liquity family, Flex).
 *
 * On these lenders the rate is not a quote, it is a choice — and the choice decides who is
 * redeemed first: redemptions take the lowest rates, so the cheapest rate is also the first to
 * lose its collateral (at par, not a liquidation). The API publishes the market's redemption
 * queue in the order-book shape (`/v1/data/lending/book`, `pricing: 'queue'`) and three
 * pickable rates on it — the lowest rate with 5 / 25 / 50 % of the market's debt ahead
 * (cheapest / balanced / protected) — plus the one lists rank by (`recommended`).
 * See lending-sdks docs/terms/USER_SET_RATE_PLAN.md.
 *
 * Everything here is percent APR, like every other rate in the app.
 */
import type { LendingBook, OptimizerRowRaw, RatePick, RatePickId, UserSetDescriptor } from '../sdk/types'

export interface UserSetRate {
  /** allowed range, percent APR */
  min: number
  max: number
  /** cheapest first; empty when the queue was not read */
  picks: RatePick[]
  recommended?: RatePickId
  pressure?: LendingBook['pressure']
  /** a rate change sooner than this after the last one pays the upfront fee again */
  cooldownSecs?: number
}

export const PICK_WORD: Record<RatePickId, string> = { cheapest: 'Cheapest', balanced: 'Balanced', protected: 'Protected' }

/** The Liquity family + Flex by key — the fallback when a row does not say `rateModelShort` yet. */
const USER_SET_KEYS = /^(LIQUITY|USDAF|FELIX|NERITE|QUILL|EBISU|SONETA|ENOSYS_LOANS|FLEX)/

/** Is the debt leg of this row one whose rate the borrower picks? */
export function isUserSetRow(r: Pick<OptimizerRowRaw, 'lender' | 'rateModelShort'>): boolean {
  return r.rateModelShort === 'userSet' || (r.rateModelShort == null && USER_SET_KEYS.test(r.lender))
}

const n = (v: unknown): number | undefined => {
  const x = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN
  return Number.isFinite(x) ? x : undefined
}

/** A bound as written in the descriptor → percent: a WAD string (Liquity) or a number fraction (Flex, 2.5 = 250 %). */
function boundPct(v: unknown): number | undefined {
  const x = n(v)
  if (x == null) return undefined
  return typeof v === 'string' ? x / 1e16 : x * 100
}

/** The user-set terms a pair row carries, or null when it carries none. */
export function userSetOfRow(r: Pick<OptimizerRowRaw, 'liquityShort' | 'flexShort'>): UserSetRate | null {
  const d: UserSetDescriptor | null | undefined = r.liquityShort ?? r.flexShort
  if (!d) return null
  const q = d.queue ?? undefined
  const min = q?.min ?? boundPct(d.minAnnualInterestRate)
  const max = q?.max ?? boundPct(d.maxAnnualInterestRate)
  if (min == null || max == null) return null
  return {
    min, max,
    picks: d.shutdown ? [] : q?.picks ?? [],
    ...(q?.recommended ? { recommended: q.recommended } : {}),
    ...(q?.pressure ? { pressure: q.pressure } : {}),
    ...(n(d.interestRateAdjCooldownSeconds ?? d.interestRateAdjCooldown) ? { cooldownSecs: n(d.interestRateAdjCooldownSeconds ?? d.interestRateAdjCooldown) } : {}),
  }
}

/** The same terms off a live queue book (fresher than the row). */
export function userSetOfBook(b: LendingBook | null | undefined): UserSetRate | null {
  if (!b || b.pricing !== 'queue' || !b.range) return null
  return { min: b.range.min, max: b.range.max, picks: b.picks ?? [], ...(b.recommended ? { recommended: b.recommended } : {}), ...(b.pressure ? { pressure: b.pressure } : {}) }
}

export const recommendedOf = (u: UserSetRate | null | undefined): RatePick | undefined => u?.picks.find((p) => p.id === u.recommended)

/**
 * Debt redeemed before a trove at `apr`: every level at or below it (ties count as ahead — a new
 * trove joins behind them). Off the queue book; 0 on an empty market.
 */
export function debtAheadAt(book: LendingBook | null | undefined, apr: number): number {
  let t = 0
  for (const l of book?.levels ?? []) if (l.aprPct <= apr + 1e-9) t += l.assets
  return t
}

/** A rate on the 1 bp grid, inside the range. */
export const clampRate = (u: UserSetRate, apr: number): number => Math.min(u.max, Math.max(u.min, Math.round(apr * 100) / 100))

/** Percent APR → the `interestRate` the API takes on both families: a WAD fraction string (5 % = `5e16`). */
export function rateToWad(apr: number): string {
  return (BigInt(Math.round(apr * 100)) * 10n ** 14n).toString()
}

/** What triggers redemptions here, in words. */
export function pressureLine(p: LendingBook['pressure'] | undefined, debtSymbol: string): string | null {
  if (!p) return null
  if (p.driver === 'below-peg') {
    const price = p.signal != null ? ` (now $${p.signal.toFixed(3)})` : ''
    return `Redemptions here happen when ${debtSymbol} trades under $1${price}${p.level === 'high' ? ' — they are likely now' : p.level === 'elevated' ? ' — it is close' : ''}.`
  }
  const util = p.signal != null ? ` (${Math.round(p.signal * 100)} % lent out now)` : ''
  return `Redemptions here happen when lenders take out more than the cash the market holds${util}${p.level === 'high' ? ' — every withdrawal redeems someone right now' : ''}.`
}
