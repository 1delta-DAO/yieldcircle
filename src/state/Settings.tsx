import React from 'react'

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
 * hides a row can say which of them did it and offer to move it. Two of them
 * change the REQUEST (`minTvlUsd` is the earn listing's own filter, `wideNet`
 * drops the optimizer's collateral tags) and therefore cost a fetch; the rest
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
  slippageBp: null,
}

/** The keys that decide what the menu SHOWS — what `widened` / `isCurated` count. */
export const FILTER_KEYS = (Object.keys({
  minTvlUsd: 0, minBorrowLiquidityUsd: 0, maxRisk: 0, minRate: 0, maxRate: 0, showRateBets: 0, showNegative: 0, wideNet: 0,
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
  slippageBp: DEFAULTS.slippageBp,
}

const LS = 'yieldcircle.settings'
const numOr = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d)
const boolOr = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
function read(): Settings {
  try {
    const raw = localStorage.getItem(LS)
    if (!raw) return DEFAULTS
    const p = JSON.parse(raw) as Partial<Settings>
    return {
      minTvlUsd: numOr(p.minTvlUsd, DEFAULTS.minTvlUsd),
      minBorrowLiquidityUsd: numOr(p.minBorrowLiquidityUsd, DEFAULTS.minBorrowLiquidityUsd),
      maxRisk: Math.min(5, Math.max(1, numOr(p.maxRisk, DEFAULTS.maxRisk))),
      minRate: numOr(p.minRate, DEFAULTS.minRate),
      maxRate: numOr(p.maxRate, DEFAULTS.maxRate),
      showRateBets: boolOr(p.showRateBets, DEFAULTS.showRateBets),
      showNegative: boolOr(p.showNegative, DEFAULTS.showNegative),
      wideNet: boolOr(p.wideNet, DEFAULTS.wideNet),
      // the old `loopSlippageBp` (a fixed 10 persisted with every other switch) is dropped: everyone starts on auto
      slippageBp: typeof p.slippageBp === 'number' ? Math.min(100, Math.max(1, numOr(p.slippageBp, 10))) : null,
    }
  } catch { return DEFAULTS }
}

interface SettingsCtx {
  st: Settings
  set: (patch: Partial<Settings>) => void
  reset: () => void
  /** true when nothing has been widened — what the copy calls "curated" */
  isDefault: boolean
  /** how far from the defaults, for the badge on the button */
  widened: number
}
const Ctx = React.createContext<SettingsCtx | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [st, setSt] = React.useState<Settings>(read)
  const set = React.useCallback((patch: Partial<Settings>) => {
    setSt((cur) => {
      const next = { ...cur, ...patch }
      try { localStorage.setItem(LS, JSON.stringify(next)) } catch { /* private mode */ }
      return next
    })
  }, [])
  // Reset puts the FILTERS back; the slippage is a trading preference and survives it
  const reset = React.useCallback(() => {
    setSt((cur) => {
      const next = { ...DEFAULTS, slippageBp: cur.slippageBp }
      try { localStorage.setItem(LS, JSON.stringify(next)) } catch { /* private mode */ }
      return next
    })
  }, [])
  const widened = FILTER_KEYS.filter((k) => st[k] !== DEFAULTS[k]).length
  return <Ctx.Provider value={{ st, set, reset, isDefault: widened === 0, widened }}>{children}</Ctx.Provider>
}
export const useSettings = () => { const c = React.useContext(Ctx); if (!c) throw new Error('SettingsProvider missing'); return c }
