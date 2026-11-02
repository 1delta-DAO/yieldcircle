import React from 'react'
import { useQueries } from '@tanstack/react-query'
import * as idx from '@yieldcircle/core/index/api'
import { bookKeyOf } from '@yieldcircle/core/model/uid'
import { boardPositions, closedPosition, plainName, type LiteRow } from '@yieldcircle/core/model/lite'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { useAccountPnlBook } from './index/pnl'
import { useClosedPositions } from './index/queries'
import { useLiteMenu } from './lite'

/** The Lite row each strategy key opens, for the Copy and the words. */
export function useLiteByKey(): Map<string, LiteRow> {
  const L = useLiteMenu()
  return React.useMemo(() => {
    const m = new Map<string, LiteRow>()
    for (const r of L.rows) { const k = bookKeyOf(r.s); if (k) m.set(k.toLowerCase(), r) }
    return m
  }, [L.rows])
}

/**
 * Every strategy the catalogue holds, named in Lite's words (`plainName`) — Lite's own row first
 * where it has one. The board ranks whatever earns most today, which is mostly rows Lite does not
 * list (another debt, a venue below a floor): they still get words, never a ticker, and Copy only
 * where Lite carries the strategy (docs/lite-design-review.md §3.4).
 */
export function useBoardNames(): Map<string, { title: string; sub: string; s: Strategy }> {
  const L = useLiteMenu()
  const { b } = L
  return React.useMemo(() => {
    const m = new Map<string, { title: string; sub: string; s: Strategy }>()
    for (const s of [...b.overflow, ...b.hidden, ...b.all]) { const k = bookKeyOf(s); if (k) m.set(k.toLowerCase(), { ...plainName(s), s }) }
    for (const r of L.rows) { const k = bookKeyOf(r.s); if (k) m.set(k.toLowerCase(), { title: r.title, sub: r.sub, s: r.s }) }
    return m
  }, [b.all, b.hidden, b.overflow, L.rows])
}

/**
 * A wallet's record on the board: what it runs (`open`, from its PnL book) and what it HAD — its
 * closed positions' keys, then each one's own record (the position drawer's query, so a tap opens
 * it from cache), the newest `closedShown`; `moreClosed` are Pro's.
 */
export function useWalletRecord(account: string, liteByKey: Map<string, LiteRow>, closedShown: number) {
  const q = useAccountPnlBook(account)
  const liteTitle = (k: string) => liteByKey.get(k.toLowerCase())?.title ?? null
  const open = q.data ? boardPositions(q.data, liteTitle) : []
  const closedQ = useClosedPositions(account)
  const closedKeys = React.useMemo(() => [...(closedQ.data ?? [])].sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, closedShown), [closedQ.data, closedShown])
  const series = useQueries({
    queries: closedKeys.map((k) => ({
      queryKey: ['pos-series', account, k.key, 'USD'],
      queryFn: () => idx.positionSeries(account, k.key, 'USD'),
      staleTime: 5 * 60_000,
      retry: (c: number, e: unknown) => c < 1 && !/→ 404$|no anchored position/.test((e as Error)?.message ?? ''),
    })),
  })
  const had = closedKeys.flatMap((k, i) => { const r = series[i].data; const p = r && closedPosition(k, r, liteTitle); return p ? [p] : [] })
  return { isLoading: q.isLoading, open, had, moreClosed: Math.max(0, (closedQ.data?.length ?? 0) - closedShown) }
}
