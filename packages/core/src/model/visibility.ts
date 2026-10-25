/**
 * Why a row is not on the menu — and which switch brings it back.
 *
 * Every gate the catalogue applies has a code here, and every code says one of
 * two things: **structural** (the app cannot render or build the row at all:
 * an asset it does not map, a debt in another money, a market with no variable
 * borrow) or **soft** (a floor in `Settings` — size, liquidity, risk, a carry
 * that does not pay). A soft code names the field that hid it, so the list can
 * offer a `+` that moves exactly that floor and a `−` that puts it back.
 *
 * The point is not the switches. It is that an empty list can now say WHY it
 * is empty, with counts, instead of looking like a chain nobody lends on.
 */
import { DEFAULTS, NO_CAP, type Settings } from './settings'
import type { Strategy } from './strategies'
import { exposureOf, FIAT_FLOOR, isFiat } from './assets'

export type HideCode =
  // structural — no setting brings these back
  | 'unmapped' | 'cross-denom' | 'brokered' | 'basket' | 'no-leverage' | 'thin-ltv' | 'no-route' | 'closed'
  // soft — a floor in Settings
  | 'small' | 'collateral' | 'thin-borrow' | 'risky' | 'unrated' | 'negative' | 'rate-bet' | 'dust' | 'outlier'

export interface HideMeta {
  /** the chip's word */
  word: string
  /** one sentence: what the gate is FOR */
  why: string
  soft: boolean
  /** which listing it applies to, for a bar that only shows one kind */
  kind?: 'simple' | 'loop'
  /** widening this code needs a new request rather than a re-filter */
  refetch?: boolean
}

export const HIDES: Record<HideCode, HideMeta> = {
  unmapped: { word: 'asset not mapped', soft: false, why: 'YieldCircle presents a fixed whitelist of base assets, plus every US dollar filed under whose credit it is, and these rows are neither. Nothing on this page could name what you would be holding.' },
  'cross-denom': { word: 'price bet', soft: false, kind: 'loop', why: 'The debt is a different money than the collateral, so the position is a directional bet rather than a carry. The ticket only builds carries.' },
  brokered: { word: 'fixed term', soft: false, kind: 'loop', why: 'The debt is fixed-rate on an order book or at auction (Midnight, Term, TermMax, Teller). What it costs depends on who is offering at that size, which the API does not quote yet — or no lender offers it right now (a Loopscale pair whose strategies are fully lent) — so the ticket could not say what the loop pays.' },
  basket: { word: 'basket', soft: false, why: 'The collateral is a basket of several assets, which this app has no way to show as one thing you hold.' },
  'no-leverage': { word: 'no leverage', soft: false, kind: 'loop', why: 'The market allows less than 2×, so there is no loop to build.' },
  'thin-ltv': { word: 'ltv too low', soft: false, kind: 'loop', why: 'The collateral is worth less than 30 % of a borrow here — a loop would liquidate on noise.' },
  'no-route': { word: 'no loop route', soft: false, kind: 'loop', why: 'The API cannot build a loop on this lender: the venue only lets you borrow from your own wallet, one step at a time (Inverse FiRM allowlists every contract that could do it for you). The rates are real, but there is no button that would open the position.' },
  closed: { word: 'closed', soft: false, kind: 'simple', why: 'The venue is not accepting deposits through the API right now (paused, capped or permissioned).' },

  small: { word: 'small', soft: true, kind: 'simple', refetch: true, why: 'Below the size floor. A market with little in it can be emptied by one depositor and its rate is often a promotion.' },
  collateral: { word: 'collateral only', soft: true, kind: 'simple', refetch: true, why: 'The market pays nothing of its own: the token sits there as collateral and earns only what it earns in your wallet, with the market’s risk on top. Worth it when that is the only way to hold the token.' },
  'thin-borrow': { word: 'thin borrow', soft: true, kind: 'loop', why: 'Less of the debt asset is borrowable than the floor asks for. A loop that cannot be opened at size, or unwound, is a trap however good the rate looks.' },
  risky: { word: 'higher risk', soft: true, why: 'Above the risk cap. The score is the API’s own, over the market’s configuration, the lender and both tokens.' },
  unrated: { word: 'unrated', soft: true, why: 'The API has not scored this row: no score for the venue, the lender or the token. Unscored is not the same as safe, so these rows stay out with the higher-risk ones and come back with the same switch.' },
  negative: { word: 'costs more than it pays', soft: true, kind: 'loop', why: 'At the balanced tier the borrow rate eats the whole collateral rate. The loop loses money unless the rates move.' },
  'rate-bet': { word: 'rate bet', soft: true, kind: 'loop', why: 'The collateral earns nothing on its own (no staking, no savings, no PT), so the only return is the gap between two lending rates on the same money.' },
  dust: { word: 'pays ~nothing', soft: true, kind: 'simple', why: 'Under the minimum rate — a market that is live but idle.' },
  outlier: { word: 'rate looks wrong', soft: true, kind: 'simple', why: 'Over the maximum rate. Almost always a short incentive, a mispriced reward or a listing bug rather than a yield you will collect.' },
}

export const isSoft = (c: HideCode) => HIDES[c].soft
/** the order a bar lists them in: the ones a switch can fix first */
export const HIDE_ORDER: HideCode[] = ['thin-borrow', 'small', 'collateral', 'rate-bet', 'negative', 'risky', 'unrated', 'dust', 'outlier', 'cross-denom', 'unmapped', 'brokered', 'basket', 'no-leverage', 'thin-ltv', 'no-route', 'closed']

/**
 * The soft gate a built row fails under the current settings, or null when it
 * belongs on the menu. Pure, and computed at render: flipping a switch is a
 * re-filter of rows already in hand, not a new request.
 *
 * Order is attribution: the first answer is the one the row is told, so the
 * question it answers has to be the most basic one. What a row IS (a rate bet)
 * comes before whether it is big enough, which comes before what it pays.
 */
/**
 * The cap a row's score is held to. `Any` (5, the top of the 1–5 scale) is no cap at all: it
 * lets in 6 too, risk-data's `compromised`, which the row then wears as its label (`riskOf`).
 */
export const capOf = (st: Settings) => (st.maxRisk >= 5 ? Infinity : st.maxRisk)
export function softHide(s: Strategy, st: Settings): HideCode | null {
  if (s.kind === 'loop') {
    if (!s.collateralYields && !st.showRateBets) return 'rate-bet'
    if (s.borrowLiquidityUsd < st.minBorrowLiquidityUsd) return 'thin-borrow'
    if (s.riskScore > capOf(st)) return s.rated ? 'risky' : 'unrated'
    if (s.rate <= 0 && !st.showNegative) return 'negative'
    return null
  }
  // an exposure asset's deposits (JLP) are all passthrough and asked for by name: they are the menu
  if (s.passthrough && !st.showCollateral && !exposureOf(s.asset)) return 'collateral'
  // a euro, franc or pound row has its own, lower floor: the whole currency is a few rows (`FIAT`)
  if (s.tvlUsd < (isFiat(s.asset) ? Math.min(st.minTvlUsd, FIAT_FLOOR) : st.minTvlUsd)) return 'small'
  if (s.riskScore > capOf(st)) return s.rated ? 'risky' : 'unrated'
  if (s.rate < st.minRate) return 'dust'
  if (s.rate > st.maxRate) return 'outlier'
  return null
}

/** This row's own numbers, for the chip it wears once it is let in. */
export function hideDetail(s: Strategy, code: HideCode): string {
  const money = (x: number) => (x >= 1e9 ? `$${(x / 1e9).toFixed(1)}b` : x >= 1e6 ? `$${(x / 1e6).toFixed(1)}m` : x >= 1e3 ? `$${Math.round(x / 1e3)}k` : `$${Math.round(x)}`)
  switch (code) {
    case 'small': return `${money(s.tvlUsd)} in it`
    case 'thin-borrow': return s.kind === 'loop' ? `${money(s.borrowLiquidityUsd)} borrowable` : ''
    case 'risky': return `risk ${s.riskScore}/5`
    case 'negative': return `pays ${s.rate.toFixed(2)}%`
    case 'rate-bet': return 'collateral earns nothing by itself'
    case 'dust': return `${s.rate.toFixed(2)}%`
    case 'outlier': return `${s.rate.toFixed(0)}%`
    default: return ''
  }
}

/** What `+` on this bucket does: move exactly that floor, nothing else. */
export function relaxFor(code: HideCode): Partial<Settings> {
  switch (code) {
    case 'small': return { minTvlUsd: 0 }
    case 'collateral': return { showCollateral: true }
    case 'thin-borrow': return { minBorrowLiquidityUsd: 0 }
    case 'risky':
    case 'unrated': return { maxRisk: 5 }
    case 'negative': return { showNegative: true }
    case 'rate-bet': return { showRateBets: true }
    case 'dust': return { minRate: 0 }
    case 'outlier': return { maxRate: NO_CAP }
    default: return {}
  }
}
/** What `−` does: the default back, and only for this bucket. */
export function restoreFor(code: HideCode): Partial<Settings> {
  switch (code) {
    case 'small': return { minTvlUsd: 2_000_000 }
    case 'collateral': return { showCollateral: false }
    case 'thin-borrow': return { minBorrowLiquidityUsd: 100_000 }
    case 'risky':
    case 'unrated': return { maxRisk: 4 }
    case 'negative': return { showNegative: false }
    case 'rate-bet': return { showRateBets: false }
    case 'dust': return { minRate: 0.01 }
    case 'outlier': return { maxRate: 25 }
    default: return {}
  }
}

/**
 * The floor a row WOULD have failed with the defaults — the chip it wears once
 * a switch has let it in.
 *
 * Without this a widened list looks exactly like a curated one, which is the
 * failure mode the switches exist to avoid: a $12k-liquidity loop and a $40m
 * one reading the same on the row.
 */
export const letIn = (s: Strategy): HideCode | null => softHide(s, DEFAULTS)

/** This dimension is not at its default — so the bar can offer the `−` that puts it back. */
export function isWidened(code: HideCode, st: Settings): boolean {
  const back = restoreFor(code)
  return (Object.keys(back) as (keyof Settings)[]).some((k) => st[k] !== back[k])
}
/** Every soft code whose floor has been moved, in the bar's order. */
// `unrated` rides the risk cap: one `−` (higher risk) puts both back
export const widenedCodes = (st: Settings): HideCode[] => HIDE_ORDER.filter((c) => HIDES[c].soft && c !== 'unrated' && isWidened(c, st))
export { DEFAULTS, NO_CAP }
