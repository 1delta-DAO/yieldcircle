/**
 * What a whole account earns (pos-indexer tickets/0057 §E): Σ annual / Σ equity
 * over its positions — each position's APR weighted by its share of NAV. A
 * 54 % position on $2k beside a 3 % position on $2 m is a 3.05 % account, and
 * this is the number that says so.
 *
 * A COPY of pos-indexer `position-store/src/netting.ts::accountCarry`: the
 * index answers it in `/positions/:account` `totals.netAprPct` for the whole
 * account, and the wallet page recomputes it here only when it cuts the
 * account to a chain selection (or reads an index that predates the field).
 * Change both or neither.
 */
import type { PositionGroup } from '../index/types'

export interface AccountCarry {
  /** Σ equity — signed: an underwater position lowers it, as it lowers net value */
  navUsd: number
  /** Σ annual carry over the positions that carry a rate; null when none does */
  annualUsd: number | null
  /** annual / nav × 100; null when NAV is not positive */
  netAprPct: number | null
  /** the share of NAV whose positions carry a rate; below 1 the APR is a floor */
  ratedShare: number
  exact: boolean
  positions: number
}

export function accountCarry(groups: Pick<PositionGroup, 'equityUsd' | 'annualUsd' | 'exact'>[]): AccountCarry {
  let nav = 0
  let rated = 0
  let annual: number | null = null
  let exact = true
  for (const g of groups) {
    nav += g.equityUsd
    if (!g.exact) exact = false
    if (g.annualUsd == null) {
      exact = false
      continue
    }
    rated += g.equityUsd
    annual = (annual ?? 0) + g.annualUsd
  }
  return {
    navUsd: nav,
    annualUsd: annual,
    netAprPct: annual !== null && nav > 0 ? (annual / nav) * 100 : null,
    ratedShare: nav > 0 ? Math.max(0, Math.min(1, rated / nav)) : 0,
    exact,
    positions: groups.length,
  }
}
