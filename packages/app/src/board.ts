import React from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import * as idx from '@yieldcircle/core/index/api'
import { bookKeyOf } from '@yieldcircle/core/model/uid'
import { boardPositions, closedPosition, heldPositions, liteName, plainName, type BoardSort, type HeldPosition, type LiteRow } from '@yieldcircle/core/model/lite'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { useAccountPnlBook } from './index/pnl'
import { RATE_BOARD_LIMIT, useClosedPositions, useIndexPositions } from './index/queries'
import { useLiteMenu } from './lite'

/**
 * What a board is cut to: the sort, the money held, and the chain scope as the index takes it —
 * a CSV, absent for every chain. A Solana-only scope asks only the Solana index (`splitScope`).
 */
export interface BoardCut { sort: BoardSort; held?: idx.ExposureChip; chains?: string }

/** The wallet board, for the chains in scope. All chains keeps the key the header and You read, so they stay one request. */
export function useWalletBoard({ sort, held, chains }: BoardCut) {
  return useQuery({
    queryKey: chains ? ['earners-lite', sort, held ?? 'all', chains] : sort === 'perDay' && !held ? ['earners-me'] : ['earners-lite', sort, held ?? 'all'],
    // a rate board at the size the index pre-warms (`RATE_BOARD_LIMIT`); dollars a day at 100, as the header reads it
    queryFn: () => idx.walletEarners({ sort, people: true, chainIds: chains, exposure: held, limit: sort === 'apr' ? RATE_BOARD_LIMIT : 100 }),
    staleTime: 5 * 60_000,
    retry: 1,
  })
}

/** The strategy board, for the chains in scope: the key of Pro's (`earnersQuery`), so one cached answer for both. */
export function useStrategyBoard({ sort, held, chains }: BoardCut) {
  return useQuery({
    queryKey: ['earners', 'strategy', sort, 'default', true, chains ?? 'all', held ?? 'all', 'all', 'all', 50] as const,
    queryFn: () => idx.strategyBoard({ sort, people: true, chainIds: chains, exposure: held, limit: 50 }),
    staleTime: 60_000,
    retry: 1,
  })
}

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
 * Every strategy the catalogue holds, named in Lite's words (`liteName`, `plainName`'s sub) — Lite's own row first
 * where it has one. The board ranks whatever earns most today, which is mostly rows Lite does not
 * list (another debt, a venue below a floor): they still get words, never a ticker, and Copy only
 * where Lite carries the strategy (docs/lite-design-review.md §3.4).
 */
export function useBoardNames(): Map<string, { title: string; sub: string; s: Strategy }> {
  const L = useLiteMenu()
  const { b } = L
  return React.useMemo(() => {
    const m = new Map<string, { title: string; sub: string; s: Strategy }>()
    for (const s of [...b.overflow, ...b.hidden, ...b.all]) { const k = bookKeyOf(s); if (k) m.set(k.toLowerCase(), { title: liteName(s), sub: plainName(s).sub, s }) }
    for (const r of L.rows) { const k = bookKeyOf(r.s); if (k) m.set(k.toLowerCase(), { title: liteName(r.s, r.title), sub: r.sub, s: r.s }) }
    return m
  }, [b.all, b.hidden, b.overflow, L.rows])
}

/**
 * What a wallet HAD: its closed positions' keys (EVM only — the Solana index has no such route),
 * then each one's own record (the position drawer's query, so a tap opens it from cache), the
 * newest `shown`; `more` are the ones past that and `count` all of them. `enabled: false` reads the
 * keys alone (one request) and no record — You asks for those only once its fold is opened — and
 * `chainIds` keeps the list to the chains in scope.
 */
export function useClosedRecord(account: string | undefined, liteByKey: Map<string, { title: string }>, shown: number, { enabled = true, chainIds }: { enabled?: boolean; chainIds?: string[] } = {}) {
  const liteTitle = (k: string) => liteByKey.get(k.toLowerCase())?.title ?? null
  const closedQ = useClosedPositions(account)
  const scope = chainIds?.join(',')
  const all = React.useMemo(() => {
    const ids = scope ? new Set(scope.split(',')) : null
    return [...(closedQ.data ?? [])].filter((k) => !ids || ids.has(k.key.split('|')[0])).sort((a, b) => b.lastAt.localeCompare(a.lastAt))
  }, [closedQ.data, scope])
  const keys = React.useMemo(() => all.slice(0, shown), [all, shown])
  const series = useQueries({
    queries: keys.map((k) => ({
      enabled,
      queryKey: ['pos-series', account, k.key, 'USD'],
      queryFn: () => idx.positionSeries(account!, k.key, 'USD'),
      staleTime: 5 * 60_000,
      retry: (c: number, e: unknown) => c < 1 && !/→ 404$|no anchored position/.test((e as Error)?.message ?? ''),
    })),
  })
  const had = keys.flatMap((k, i) => { const r = series[i].data; const p = r && closedPosition(k, r, liteTitle); return p ? [p] : [] })
  return { had, count: all.length, more: Math.max(0, all.length - shown), isLoading: closedQ.isLoading || series.some((q) => q.isLoading), isError: closedQ.isError }
}

/**
 * What a wallet holds now (`heldPositions`): the index's positions — what Pro's profile lists —
 * with its PnL book's figures joined on where drawn. The book alone left most wallets empty: it
 * draws a figure for few of another wallet's positions. `me` (the connected wallet, on its own
 * board row) reads the book only: the index never serves the user's own positions (docs/apis.md).
 */
export function useHeldPositions(account: string | undefined, liteByKey: Map<string, LiteRow>, { me = false }: { me?: boolean } = {}) {
  const q = useAccountPnlBook(account)
  const pos = useIndexPositions(me ? undefined : account)
  const liteTitle = (k: string) => liteByKey.get(k.toLowerCase())?.title ?? null
  const open: HeldPosition[] = me ? (q.data ? boardPositions(q.data, liteTitle) : []) : heldPositions(pos.data, q.data ?? undefined, liteTitle)
  // the index's answer is enough to show; the figures fill in when the book lands. An index that
  // failed leaves the book alone, as before
  const isLoading = me ? q.isLoading : pos.isLoading || (!pos.data && q.isLoading)
  return { isLoading, open }
}

/**
 * A wallet's record on the board: what it runs (`open`, `useHeldPositions`) and what it HAD
 * (`useClosedRecord`), the newest `closedShown`; `moreClosed` are Pro's.
 */
export function useWalletRecord(account: string, liteByKey: Map<string, LiteRow>, closedShown: number, { me = false }: { me?: boolean } = {}) {
  const { isLoading, open } = useHeldPositions(account, liteByKey, { me })
  const { had, more } = useClosedRecord(account, liteByKey, closedShown)
  return { isLoading, open, had, moreClosed: more }
}
