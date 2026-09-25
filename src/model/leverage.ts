/** Leverage math on equity. L = collateral / equity; debt = E·(L−1). */
export const netAprAtLeverage = (dep: number, bor: number, L: number) => dep * L - bor * (L - 1)
/**
 * The borrow rate a loop actually pays once its own debt is in the market.
 *
 * `extraDebtUsd` is what THIS action adds to the market's debt (negative when
 * it repays). The curve's shape moves the spot rate: spot + (curve(u′) −
 * curve(u₀)), so whatever the headline carries on top of the model (rewards,
 * fees) is kept. Without a curve the $10k quote is the honest fallback — it is
 * what the list ranked on. `null` curve fields read as "no curve".
 */
export function borrowAtSize(
  spot: number, atTenK: number, extraDebtUsd: number,
  curve: { points: { utilization: number; borrowRate: number }[]; currentUtilization: number; totalDepositsUsd?: string; totalDebtUsd?: string } | null | undefined,
): number {
  const dep = curve ? parseFloat(curve.totalDepositsUsd ?? '') : NaN, debt = curve ? parseFloat(curve.totalDebtUsd ?? '') : NaN
  if (!curve || !(curve.points.length >= 2) || !(dep > 0) || !Number.isFinite(debt)) return atTenK
  const at = (u: number) => {
    const ps = curve.points, x = Math.min(1, Math.max(0, u))
    for (let i = 1; i < ps.length; i++) if (x <= ps[i].utilization) {
      const a = ps[i - 1], b = ps[i], du = b.utilization - a.utilization
      return du > 0 ? a.borrowRate + (b.borrowRate - a.borrowRate) * (x - a.utilization) / du : b.borrowRate
    }
    return ps[ps.length - 1].borrowRate
  }
  return spot + at((debt + extraDebtUsd) / dep) - at(curve.currentUtilization)
}
/** Collateral/debt price-ratio drop before liquidation: 1 − LTV_pos / liquidation factor. */
export const liqBuffer = (liqLtv: number, L: number) => (L <= 1 ? 1 : 1 - ((L - 1) / L) / liqLtv)
/** Health factor at open: collateral · liqFactor / debt. */
export const healthAt = (liqLtv: number, L: number) => (L <= 1 ? Infinity : (L * liqLtv) / (L - 1))
/**
 * Leverage is chosen as a TIER, not a number: a fraction of the venue's own range. The range runs
 * from 1× to the pair's `maxLeverage` (the API derives it from the venue's borrow collateral
 * factor and borrow factor: 1 / (1 − cf / bf)), so Defensive / Balanced / Aggressive sit at 50 %,
 * 75 % and 90 % of the way up THAT venue's range: L = 1 + frac · (maxLeverage − 1). A venue that
 * allows 28× therefore gets very different tiers from one that allows 5× — and the cards show the
 * drop-to-liquidation each tier leaves, because the same fraction is a different risk on each.
 * See docs/leverage-tiers.md for what the API offers here and what it could add.
 */
export type TierId = 'defensive' | 'balanced' | 'aggressive'
export interface Tier { id: TierId; name: string; frac: number; blurb: string }
export const TIERS: Tier[] = [
  { id: 'defensive', name: 'Defensive', frac: 0.5, blurb: 'Half way up this venue\'s range.' },
  { id: 'balanced', name: 'Balanced', frac: 0.75, blurb: 'Three quarters of the way up this venue\'s range.' },
  { id: 'aggressive', name: 'Aggressive', frac: 0.9, blurb: 'Near the top of this venue\'s range. Watch the liquidation buffer.' },
]
export const DEFAULT_TIER: TierId = 'balanced'
/** Leverage at a fraction of the venue's range [1, maxLeverage]. */
export const tierLeverage = (maxLev: number, frac: number) => Math.round(Math.max(1.1, 1 + frac * (Math.max(1, maxLev) - 1)) * 100) / 100
export type TierLeverages = Record<TierId, number>
export const tierLeverages = (maxLev: number): TierLeverages => ({ defensive: tierLeverage(maxLev, 0.5), balanced: tierLeverage(maxLev, 0.75), aggressive: tierLeverage(maxLev, 0.9) })
/** Decimal amount → raw integer string (never floats in a query). */
export const toRaw = (amount: number, decimals: number): string => {
  const [i, f = ''] = Math.max(0, amount).toFixed(Math.min(decimals, 12)).split('.')
  return (BigInt(i) * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0')).toString()
}
