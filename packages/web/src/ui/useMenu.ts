import React from 'react'
import { useApp } from '../state/AppState'
import { useSettings } from '../state/Settings'
import { useCatalog } from '../sdk/queries'
import { parseUid, uidOf, uidsOf } from '../model/uid'
import SEED from '../data/menu-seed.json'
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
  const { st } = useSettings()
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
  const settled = !cat.isLoading && cat.anyData
  const feedSet = useFeedSet(byUid, settled, chainIds, `${chainIds.join(',')}|${JSON.stringify(st)}`)
  return { ...cat, all, byUid, uids, settled, feedSet, forUid: (u?: string | null) => (u ? byUid.get(u) ?? null : null) }
}
export type Menu = ReturnType<typeof useMenu>

/** A set of market uids as the feed asks for it: sorted, and keyed by a short signature. */
export type MarketSet = { uids: string[]; sig: string }

const LS = 'yieldcircle.menu-uids:v1:'
const read = (scope: string): MarketSet | null => {
  try {
    const v = localStorage.getItem(LS + scope)
    return v ? (JSON.parse(v) as MarketSet) : null
  } catch { return null }
}
const keep = (scope: string, set: MarketSet) => {
  try {
    // one scope kept: a chain or settings change is a new menu, and the last one is what a reload wants
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(LS) && k !== LS + scope) localStorage.removeItem(k)
    }
    localStorage.setItem(LS + scope, JSON.stringify(set))
  } catch { /* private mode, quota: the next visit waits for the catalogue, as before */ }
}
/** FNV-1a, enough to tell two sets apart in a query key */
const sigOf = (uids: string[]) => {
  let h = 0x811c9dc5
  for (const u of uids) for (let i = 0; i < u.length + 1; i++) h = Math.imul(h ^ (i < u.length ? u.charCodeAt(i) : 44), 0x01000193)
  return `${uids.length}:${(h >>> 0).toString(36)}`
}

/**
 * The set the home feed's "In the menu" tab filters on.
 *
 * The menu is the whole catalogue — ~50 requests, and the slowest decides when
 * it is complete (4–8 s cold, measured 2026-09-29) — while the feed itself
 * answers in under a second. A join only needs the uids, and they barely move
 * between visits, so the feed never waits for the catalogue:
 *
 *   live   the catalogue's own set, once it has settled — and then kept
 *   kept   the last live set (localStorage, per chain selection and settings)
 *   seed   `data/menu-seed.json`, the deposit side of the menu at the default
 *          settings, built at deploy (`scripts/menu-seed.mjs`), narrowed to
 *          the chains in scope — what a first visit starts from
 *
 * The first one there wins. A set is keyed by its signature, so the live set
 * replacing an identical kept one asks the index nothing; a partial catalogue
 * is never used, or the feed would re-ask with every bucket that lands.
 */
function useFeedSet(byUid: Map<string, Strategy>, settled: boolean, chainIds: string[], scope: string): MarketSet | null {
  const live = React.useMemo(() => (settled ? toSet([...byUid.keys()]) : null), [byUid, settled])
  // read once per scope, in the render that needs it
  const cached = React.useMemo(() => read(scope), [scope])
  const seeded = React.useMemo(() => {
    const on = new Set(chainIds)
    return toSet(SEED.uids.filter((u) => on.has(parseUid(u)?.chainId ?? '')))
  }, [chainIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (live?.uids.length && live.sig !== cached?.sig) keep(scope, live)
  }, [live?.sig, scope])
  if (live?.uids.length) return live
  return cached ?? (seeded.uids.length ? seeded : live)
}
const toSet = (list: string[]): MarketSet => {
  const uids = [...list].sort()
  return { uids, sig: sigOf(uids) }
}
