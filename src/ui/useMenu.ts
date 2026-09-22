import React from 'react'
import { useApp } from '../state/AppState'
import { useCatalog } from '../sdk/queries'
import { uidOf, uidsOf } from '../model/uid'
import type { Strategy } from '../model/strategies'

/**
 * The catalogue indexed by market uid — the join that makes a feed row
 * actionable. A move the menu has a row for gets a **Copy** button; one it
 * does not says so plainly and links the market instead.
 *
 * Lighter than `useBook`: no balances, no positions, so the feed and the
 * market page can use it without pulling a wallet's whole balance sheet.
 */
export function useMenu() {
  const { chainIds } = useApp()
  const cat = useCatalog(chainIds)
  const all: Strategy[] = React.useMemo(() => [...cat.simple, ...cat.loops], [cat.simple, cat.loops])
  const byUid = React.useMemo(() => {
    const m = new Map<string, Strategy>()
    for (const s of all) {
      const u = uidOf(s)
      // the collateral leg wins a collision: it is the position you hold
      if (u && (!m.has(u) || s.kind === 'loop')) m.set(u, s)
    }
    return m
  }, [all])
  /** every uid the menu covers — what "only markets in the menu" filters the feed to */
  const uids = React.useMemo(() => [...new Set(all.flatMap(uidsOf))], [all])
  return { ...cat, all, byUid, uids, forUid: (u?: string | null) => (u ? byUid.get(u) ?? null : null) }
}
export type Menu = ReturnType<typeof useMenu>
