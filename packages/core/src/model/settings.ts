// The menu's floors as plain data — shared by every app; the web app's provider and its storage
// are `packages/web/src/state/Settings.tsx`.

/**
 * What the menu is allowed to show.
 *
 * The catalogue is CURATED: real size, a collateral that earns on its own, a
 * carry that pays more than it costs. That is right as a default and wrong as
 * a wall — on a young chain almost everything is below the floors, so the list
 * came back empty with nothing on screen admitting that anything had been left
 * out (HyperEVM, 2026-09-24: four deposits, zero loops, 104 pairs upstream).
 *
 * So the floors live here, one per dimension, persisted, and every screen that
 * hides a row can say which of them did it and offer to move it. Three of them
 * change the REQUEST (`minTvlUsd` is the earn listing's own filter, `wideNet`
 * drops the optimizer's collateral tags, `showCollateral` asks the listing for
 * its passthrough rows) and therefore cost a fetch; the rest
 * are applied to rows already in hand, so they flip instantly.
 */
export interface Settings {
  /** deposits: how much has to be in a market before it is on the menu */
  minTvlUsd: number
  /** loops: how much of the debt asset has to be borrowable right now */
  minBorrowLiquidityUsd: number
  /** the API's own 1–5 risk score, capped (5 = show everything it will serve) */
  maxRisk: number
  /** a deposit paying less than this is furniture */
  minRate: number
  /** above this a rate is a spike, an incentive or a bug */
  maxRate: number
  /** loops whose collateral earns nothing on its own — a rate bet, not a carry */
  showRateBets: boolean
  /** loops that cost more than they pay */
  showNegative: boolean
  /** ask the optimizer with the DEBT tag only, so untagged collateral is found too */
  wideNet: boolean
  /**
   * deposits whose market pays nothing of its own (`rate.passthrough`): the token parked as
   * collateral, earning only what it earns in the wallet. Left out of the earn listing unless
   * asked, so for a token like Piku's USP — no lending market, two Morpho collateral slots —
   * they are the only way to hold it at all.
   */
  showCollateral: boolean
  /**
   * The max slippage every swap-routed build carries, in bp — a loop's open, leverage step and
   * close, and a deposit or withdrawal that trades on a book (a Pendle PT). `null` is AUTO
   * ({@link slippageFor}). Not a filter (it is left out of `widened`): a TRADING preference. Low
   * because nearly every trade the app builds is between two of the same money — an LST against
   * its own coin, a savings dollar against a dollar, a PT against its underlying — so the pair
   * barely moves between the quote and the block, and on Solana whatever the swap fills above its
   * guaranteed minimum (≤ this) lands idle in the wallet instead of in the position (lending-sdks
   * SOLANA_LOOP_DUST.md). The cost of going too low is a revert, never a loss.
   */
  slippageBp: number | null
}

/** What AUTO picks: tight between two of the same money, a little wider for a pair priced on its own (JLP against dollars). */
export const AUTO_SLIPPAGE_BP = { pegged: 5, floating: 10 } as const
/**
 * How far a dollar debt may sit from $1 and still count as "the same money" for AUTO. A loop that
 * SELLS a debt trading off its peg (alUSD at 0.956) does not swap like-for-like: its route runs
 * through other assets (alUSD → WETH → USDC) and drifts past 5 bp between the build and the
 * signature — 2026-11-03 an Alchemix open reverted `InsufficientReturnAmount` in the wallet.
 */
export const PEG_TOLERANCE = 0.005
/** A loop's debt trades at its peg: a dollar debt within `PEG_TOLERANCE` of $1, or a price we cannot judge. */
export const debtAtPeg = (s: { group: string; priceShort?: number }): boolean =>
  s.group !== 'USD' || !(s.priceShort! > 0) || Math.abs(s.priceShort! - 1) <= PEG_TOLERANCE
/** The slippage a build for this pair goes out with: the reader's override, else AUTO's pick. */
export const slippageFor = (st: Settings, pegged: boolean): number => st.slippageBp ?? (pegged ? AUTO_SLIPPAGE_BP.pegged : AUTO_SLIPPAGE_BP.floating)

/** `maxRate` with the cap taken off — a number, so the whole thing still serialises. */
export const NO_CAP = 1000

export const DEFAULTS: Settings = {
  minTvlUsd: 2_000_000,
  minBorrowLiquidityUsd: 100_000,
  maxRisk: 4,
  minRate: 0.01,
  maxRate: 25,
  showRateBets: false,
  showNegative: false,
  wideNet: false,
  showCollateral: false,
  slippageBp: null,
}

/** The keys that decide what the menu SHOWS — what `widened` / `isCurated` count. */
export const FILTER_KEYS = (Object.keys({
  minTvlUsd: 0, minBorrowLiquidityUsd: 0, maxRisk: 0, minRate: 0, maxRate: 0, showRateBets: 0, showNegative: 0, wideNet: 0, showCollateral: 0,
}) as (keyof Settings)[])

/** Everything the API will serve, with only the structural gates left standing. */
export const WIDE_OPEN: Settings = {
  minTvlUsd: 0,
  minBorrowLiquidityUsd: 0,
  maxRisk: 5,
  minRate: 0,
  maxRate: NO_CAP,
  showRateBets: true,
  showNegative: true,
  wideNet: true,
  showCollateral: true,
  slippageBp: DEFAULTS.slippageBp,
}

const numOr = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d)
const boolOr = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
/** Stored settings from any source (a browser's localStorage, a phone's storage), each field checked and clamped, defaults for the rest. */
export function sanitizeSettings(p: Partial<Settings>): Settings {
  return {
    minTvlUsd: numOr(p.minTvlUsd, DEFAULTS.minTvlUsd),
    minBorrowLiquidityUsd: numOr(p.minBorrowLiquidityUsd, DEFAULTS.minBorrowLiquidityUsd),
    maxRisk: Math.min(5, Math.max(1, numOr(p.maxRisk, DEFAULTS.maxRisk))),
    minRate: numOr(p.minRate, DEFAULTS.minRate),
    maxRate: numOr(p.maxRate, DEFAULTS.maxRate),
    showRateBets: boolOr(p.showRateBets, DEFAULTS.showRateBets),
    showNegative: boolOr(p.showNegative, DEFAULTS.showNegative),
    wideNet: boolOr(p.wideNet, DEFAULTS.wideNet),
    showCollateral: boolOr(p.showCollateral, DEFAULTS.showCollateral),
    // the old `loopSlippageBp` (a fixed 10 persisted with every other switch) is dropped: everyone starts on auto
    slippageBp: typeof p.slippageBp === 'number' ? Math.min(100, Math.max(1, numOr(p.slippageBp, 10))) : null,
  }
}

/**
 * One control of a filters panel, as data: every app draws the same list (the web's Pro panel,
 * Lite's, the phone's). A `seg` picks one number for one key; a `check` is a switch that may move
 * more than one key (extreme rates is the pair `minRate` / `maxRate`).
 */
export type FilterControl =
  | { kind: 'seg'; key: 'minTvlUsd' | 'minBorrowLiquidityUsd' | 'maxRisk'; label: string; note?: string; opts: { v: number; word: string }[] }
  | { kind: 'check'; id: string; label: string; sub: string; on: (st: Settings) => boolean; to: (on: boolean) => Partial<Settings> }

const sizeWord = (x: number) => (x === 0 ? 'Any' : x >= 1e6 ? `$${x / 1e6}m+` : `$${x / 1e3}k+`)
export const SIZE_OPTS = [2_000_000, 250_000, 0].map((v) => ({ v, word: sizeWord(v) }))
export const RISK_OPTS = [{ v: 2, word: 'Careful' }, { v: 4, word: 'Standard' }, { v: 5, word: 'Any' }]
const flag = (k: 'showRateBets' | 'showNegative' | 'wideNet' | 'showCollateral', label: string, sub: string): FilterControl =>
  ({ kind: 'check', id: k, label, sub, on: (st) => st[k], to: (on) => ({ [k]: on }) })

/** Pro's whole panel: every key in {@link FILTER_KEYS}. */
export const FILTER_CONTROLS: FilterControl[] = [
  { kind: 'seg', key: 'minTvlUsd', label: 'Deposit size', note: 'one more request', opts: SIZE_OPTS },
  { kind: 'seg', key: 'minBorrowLiquidityUsd', label: 'Borrow liquidity', note: 'loops', opts: [100_000, 25_000, 0].map((v) => ({ v, word: sizeWord(v) })) },
  { kind: 'seg', key: 'maxRisk', label: 'Risk cap', note: "the API's 1-5 score", opts: RISK_OPTS },
  flag('showRateBets', 'Rate bets', 'loops whose collateral earns nothing by itself'),
  flag('showNegative', 'Negative carry', 'loops that cost more than they pay'),
  { kind: 'check', id: 'extremeRates', label: 'Extreme rates', sub: 'under 0.01 % and over 25 % — idle markets and spikes',
    on: (st) => st.minRate === 0 && st.maxRate === NO_CAP, to: (on) => (on ? { minRate: 0, maxRate: NO_CAP } : { minRate: DEFAULTS.minRate, maxRate: DEFAULTS.maxRate }) },
  flag('showCollateral', 'Collateral-only deposits', 'markets that pay nothing of their own — the token as collateral, earning only its own yield; one more request'),
  flag('wideNet', 'Wider pair search', 'ask the optimizer without collateral tags — finds untagged collateral (sUSDp, syzUSD), costs a few requests'),
]

/** The slippage switch's stops, in bp; `null` is Auto. */
export const SLIPPAGE_OPTS = [null, 5, 10, 30, 50] as const
