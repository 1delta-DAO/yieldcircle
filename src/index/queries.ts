import { useQueries, useQuery } from '@tanstack/react-query'
import * as api from './api'
import type { RecentQuery } from './api'
import type { TxBundle } from './types'

const MIN = 60_000

/**
 * The feed. The index answers newest-first and has no cursor, so "load more"
 * is a growing `limit` — at feed sizes (40 → 200 rows) that is one small
 * request, and it means a refetch never duplicates or drops a row across a
 * page boundary the way a `since` window would.
 */
export function useFeedPage(q: RecentQuery, limit: number, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['feed1', q, limit],
    queryFn: ({ signal }) => api.recentTxs({ ...q, limit }, signal),
    staleTime: 15_000,
    refetchInterval: 20_000,
    placeholderData: (prev) => prev,
  })
}

export function useAccountTxs(account: string | undefined, chainId?: string, limit = 60) {
  return useQuery({
    enabled: !!account,
    queryKey: ['acct-txs', account, chainId, limit],
    queryFn: () => api.accountTxs(account!, { chainId, limit }),
    staleTime: 30_000,
  })
}
export function useAccountFlows(account: string | undefined, days = 30) {
  return useQuery({
    enabled: !!account,
    queryKey: ['acct-flows', account, days],
    queryFn: () => api.accountFlows(account!, { days }),
    staleTime: 5 * MIN,
  })
}
export function useIndexPositions(account: string | undefined) {
  return useQuery({
    enabled: !!account,
    queryKey: ['idx-positions', account],
    queryFn: () => api.accountPositions(account!),
    staleTime: MIN,
  })
}
export function useMarket(uid: string | undefined) {
  return useQuery({ enabled: !!uid, queryKey: ['market', uid], queryFn: () => api.market(uid!), staleTime: 10 * MIN, retry: false })
}
export function useMarketTxs(uid: string | undefined, limit = 50) {
  return useQuery({ enabled: !!uid, queryKey: ['market-txs', uid, limit], queryFn: () => api.marketTxs(uid!, limit), staleTime: 30_000 })
}
export function useHolders(uid: string | undefined, side?: string, limit = 12) {
  return useQuery({ enabled: !!uid, queryKey: ['holders', uid, side, limit], queryFn: () => api.marketHolders(uid!, { side, limit }), staleTime: 5 * MIN, retry: false })
}
export function useMarketFlow(uid: string | undefined, hours = 168) {
  return useQuery({ enabled: !!uid, queryKey: ['market-flow', uid, hours], queryFn: () => api.marketFlow(uid!, { hours, bucket: 'day' }), staleTime: 5 * MIN, retry: false })
}
export function useTrending(window: '1h' | '24h' | '7d' = '24h', chainIds: string[] = []) {
  const qs = useQueries({
    queries: (chainIds.length ? chainIds : [undefined]).map((chainId) => ({
      queryKey: ['trending', window, chainId ?? 'all'],
      queryFn: () => api.trending({ window, chainId, limit: 50 }),
      staleTime: 2 * MIN,
    })),
  })
  return {
    markets: qs.flatMap((q) => q.data?.markets ?? []).sort((a, b) => b.netUsd - a.netUsd),
    isLoading: qs.some((q) => q.isLoading),
  }
}

/** The hot list for one window; the chain and protocol filters are the app's own. */
export function useHot(window: '1h' | '6h' | '24h' | '7d', chainIds?: string, limit = 24, protocols?: string) {
  return useQuery({
    queryKey: ['hot', window, chainIds ?? 'all', protocols ?? 'all', limit],
    queryFn: () => api.hot({ window, chainIds, protocols, limit }),
    staleTime: 2 * MIN,
    refetchInterval: 2 * MIN,
    placeholderData: (prev) => prev,
  })
}

/** Which protocols a filter should offer, for the current window and chain scope. */
export function useProtocols(window: '1h' | '6h' | '24h' | '7d', chainIds?: string) {
  return useQuery({
    queryKey: ['protocols', window, chainIds ?? 'all'],
    queryFn: () => api.protocols({ window, chainIds, limit: 40 }),
    staleTime: 5 * MIN,
  })
}

/** Is the index up, and does it answer for this build at all? One call, cached for the session. */
export function useIndexHealth() {
  return useQuery({ queryKey: ['index-health'], queryFn: api.health, staleTime: 10 * MIN, retry: false })
}

/** newest first, deduped by tx hash — several sources (feed + account) can be merged safely */
export const mergeTxs = (...lists: (TxBundle[] | undefined)[]): TxBundle[] => {
  const by = new Map<string, TxBundle>()
  for (const l of lists) for (const t of l ?? []) by.set(`${t.chainId}:${t.txHash}`, t)
  return [...by.values()].sort((a, b) => Date.parse(b.blockTs) - Date.parse(a.blockTs))
}
