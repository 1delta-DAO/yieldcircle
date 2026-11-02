/**
 * One position's PnL record (pos-indexer tickets/0061, docs/pnl-series.md), the rules both apps read
 * it by: which money it is valued in, what each leg holds, what it earned between its moves, its
 * holding periods per day, where a held PT matured, and what the index's flags mean. The web's
 * `PnlDrawer` and the phone's position screen draw it.
 */
import type { PositionSeries, SeriesEvent, SeriesInterval } from '../index/api'
import { moneyOf } from './desk'
import { protocolKeyOf } from './uid'
import { prettyProtocol } from './protocolName'

/** What each of the index's record flags means, in words. */
export const FLAG_WORDS: Record<string, string> = {
  'negative-units': 'the ledger misses a move here: walked back, the balance goes below zero (drawn at zero)',
  'dex-transfers-unseen': 'vault shares bought or sold on a DEX are not ledger rows — this record can miss them',
  'index-backfilled': 'the interest index starts later than this record: flat before its first point',
  'index-spliced': 'the interest index had a break (two sources, or a bad sample) and was joined at it',
  'no-index': 'no interest index for this market: drawn without interest',
  snapshot: 'a row states an absolute balance and is not walked',
  'amountless-row': 'a “withdraw all” row names no amount',
  'converted-row': 'a row without units was converted at the index of its hour',
  uncalibrated: 'the index scale could not be checked against the read',
  'no-decimals': 'token decimals unknown (18 assumed)',
  impaired: 'the market cannot pay this leg — its value is a phantom',
  'unpriced-flow': 'a move had no price at all',
  'flow-priced-nearby': 'a move had no price in its own hour and is valued at the nearest price within two weeks',
  'price-despiked': 'a price point that broke from both its neighbours (another source’s odd hour) was replaced by theirs',
  'price-rebased': 'hours the venue’s own price was silent are valued at the price feed, moved onto the venue’s level',
  'price-mixed': 'the price record alternated with a second source at another level; those hours were dropped and the token’s own track kept',
  'flow-repriced': 'a move’s stored value came off the dropped source’s hour; it is valued at the token’s own track instead',
  sampled: 'the balance is read off the chain at every midnight: moves the protocol makes with no event (Alchemix redemptions) land on the day they happened',
  redemption: 'a Transmuter redemption repaid part of the debt with the collateral at par: booked as PnL (its fee), not as a withdrawal',
}
/** A move's tone, as the feed's verb classes (`describeBundle`'s `cls`) */
export const MOVE_CLASS: Record<string, string> = {
  deposit: 'k-in', transfer_in: 'k-in', repay: 'k-in',
  withdraw: 'k-out', transfer_out: 'k-out',
  borrow: 'k-borrow', liquidated: 'k-liq', redeemed: 'k-liq',
}
/** a time's day, `2026-11-02` */
export const day = (t: string) => t.slice(0, 10)
/**
 * The venue by name: `MORPHO_BLUE` → Morpho Markets. A Solana lender key carries its market's
 * addresses (`KAMINO_<lending market>`, a Loopscale pair's `LOOPSCALE_<mint>_<mint>`): they go,
 * so it reads Kamino, Loopscale.
 */
export const venueOf = (lk: string | undefined) => (lk ? prettyProtocol(protocolKeyOf(lk.replace(/(_[1-9A-HJ-NP-Za-km-z]{32,44})+$/, ''))) : '')
/** an amount in its own token: whole above a thousand, two places above one, six below */
export const fmtAmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : Math.abs(n) >= 1 ? 2 : 6 })
/** how long, in words: `12 days`, `3.5 days`, `6 h`, `20 min` */
export const daysTxt = (d: number) => (d >= 1 ? `${d.toFixed(d >= 10 ? 0 : 1)} days` : d * 24 >= 1 ? `${(d * 24).toFixed(0)} h` : `${Math.max(1, Math.round(d * 1440))} min`)

/** a leg that is owed, not held */
export const isDebtSide = (side: string) => side === 'borrow' || side === 'debt'
/**
 * The money of the whole position, from its legs: `USD` / `ETH` / `BTC` when
 * every leg is that money (ours, else the money the index names per leg), the
 * legs' one asset group when they are all one
 * token the taxonomy does not place, else null (a price position).
 */
export function moneyOfPosition(s: PositionSeries): { unit: string; label: string } | null {
  const ms = s.legs.map((l) => moneyOf({ symbol: l.symbol ?? undefined, address: l.asset ?? undefined, chainId: s.chainId }))
  if (ms.length && ms.every((m) => m && m === ms[0])) return { unit: ms[0]!, label: ms[0]! }
  // the index names the money of tokens the taxonomy has no desk for (slisBNB → BNB). Without it
  // a staked token fell to its own group, and valued in itself it never grows: +0 slisBNB, 0 % APR
  const im = s.legs.map((l) => l.money?.toUpperCase())
  if (im.length && im.every((m) => m && m === im[0])) return { unit: im[0]!, label: im[0]! }
  const gs = new Set(s.legs.map((l) => l.assetGroup))
  if (gs.size === 1 && s.legs[0]?.assetGroup) return { unit: s.legs[0].assetGroup, label: s.legs[0].symbol ?? s.legs[0].assetGroup }
  return null
}

const MONTHS: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, SEPT: 8, OCT: 9, NOV: 10, DEC: 11 }
/** a PT's maturity off its ticker (`PT-ONyc-10SEPT26`, Pendle's `PT-sUSDE-27NOV2025`): the day, 00:00 UTC */
export function maturityOfSymbol(sym: string | null): number | null {
  const m = sym?.match(/^PT-.*-(\d{1,2})([A-Z]{3,4})(\d{4}|\d{2})$/)
  if (!m || MONTHS[m[2]] === undefined) return null
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  return Date.UTC(y, MONTHS[m[2]], Number(m[1]))
}

/**
 * Where a PT the position HELD matured inside the chart: from there it
 * redeems for a fixed amount and earns nothing, so a loop that kept it
 * pays its debt's interest against nothing — the line turning down there is
 * that, not a loss on the PT. The index's `maturesAt`, else the ticker's date.
 */
export function maturityMarks(s: PositionSeries, t0: number, t1: number): { t: number; symbol: string }[] {
  const out = new Map<number, string[]>()
  s.legs.forEach((l, li) => {
    const t = l.maturesAt ? Date.parse(l.maturesAt) : maturityOfSymbol(l.symbol)
    if (t == null || !Number.isFinite(t) || t <= t0 || t > t1) return
    // held at maturity: a balance on the last point before it
    let held = false
    for (const p of s.points) {
      if (Date.parse(p.t) > t) break
      held = (p.legs[li] ?? 0) > 0
    }
    if (!held) return
    const day = Math.floor(t / 86_400_000) * 86_400_000
    out.set(day, [...(out.get(day) ?? []), l.symbol ?? 'PT'])
  })
  return [...out].map(([t, syms]) => ({ t, symbol: [...new Set(syms)].join(', ') }))
}

/** The legs' prices on a day (one entry per token), so a swing in the PnL can be read off the price that made it. */
export function priceLine(s: PositionSeries, prices: (number | null)[], unit: string, label: string): string {
  const seen = new Set<string>()
  const out: string[] = []
  s.legs.forEach((l, i) => {
    const sym = l.symbol ?? '?'
    const p = prices[i]
    if (seen.has(sym) || p == null) return
    seen.add(sym)
    const digits = p >= 1000 ? 0 : p >= 10 ? 2 : 4
    const n = p.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    out.push(`${sym} ${unit === 'USD' ? `$${n}` : `${n} ${label}`}`)
  })
  return out.join(' · ')
}

/**
 * What the position earned between the previous move and each one — the interest and the price on
 * the balance it held in between — by the move's time. A transaction's moves share one snapshot (the
 * first one's). The running total is the chart's; a column of totals read as a loss on every row
 * while the position was down overall.
 */
export function earnedBefore(events: SeriesEvent[]): Map<string, number | null> {
  const m = new Map<string, number | null>()
  let prev: number | null = 0
  const firstAt = new Map<string, number | null>()
  for (const e of events) if (!firstAt.has(e.t)) firstAt.set(e.t, e.pnl)
  for (const t of [...firstAt.keys()].sort()) {
    const cur = firstAt.get(t) ?? null
    m.set(t, cur != null && prev != null ? cur - prev : null)
    prev = cur
  }
  return m
}

/** What each leg holds now: its newest amount, in its own asset, and that at its price. */
export function legHoldings(s: PositionSeries): { amount: number | null; value: number | null }[] {
  return s.legs.map((_, li) => {
    for (let k = s.points.length - 1; k >= 0; k--) {
      const a = s.points[k].legs[li]
      if (a == null) continue
      const px = s.points[k].prices?.[li]
      return { amount: a, value: px == null ? null : Math.abs(a) * px }
    }
    return { amount: null, value: null }
  })
}

/**
 * The holding periods, merged per day (a loop opened in five transactions is one row), newest
 * first: how long, the value from → to, what it earned and that as a share of the value at work —
 * never annualised, an hour's swing is not a rate.
 */
export function holdingPeriods(intervals: SeriesInterval[]) {
  const by = new Map<string, SeriesInterval[]>()
  for (const iv of intervals) by.set(day(iv.from), [...(by.get(day(iv.from)) ?? []), iv])
  return [...by.entries()].map(([d, xs]) => {
    const days = xs.reduce((t, x) => t + x.days, 0)
    const cap = xs.reduce((t, x) => t + x.capitalDays, 0)
    const pnl = xs.reduce((t, x) => t + x.pnl, 0)
    return {
      d, n: xs.length, days, pnl,
      start: xs[0].navStart, end: xs[xs.length - 1].navEnd,
      ret: cap > 0 && days > 0 ? (pnl / (cap / days)) * 100 : null,
      complete: xs.every((x) => x.complete), liquidation: xs.some((x) => x.liquidation),
    }
  }).reverse()
}
