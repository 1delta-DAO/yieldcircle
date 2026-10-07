import { useIsFetching, useQueries, useQuery, useQueryClient, type Query } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { hintLegs } from '../sdk/queries'
import type { EarnPositionsResponse } from '../sdk/types'
import { isEvmAddr, isSolAddr, normAddr } from '../model/address'
import * as api from './api'
import type { RecentQuery } from './api'
import type { TxBundle } from './types'

const MIN = 60_000
/** a 404 is an answer (the route does not exist on that index), not a hiccup worth three retries */
const retry404 = (n: number, e: unknown) => n < 3 && !/\u2192 404$/.test((e as Error)?.message ?? '')

/**
 * The feed. The index answers newest-first and has no cursor, so "load more"
 * is a growing `limit` — at feed sizes (40 → 200 rows) that is one small
 * request, and it means a refetch never duplicates or drops a row across a
 * page boundary the way a `since` window would.
 *
 * `inMarkets` narrows it to a set of markets, on the index (`recentTxsIn`).
 */
export function useFeedPage(q: RecentQuery, limit: number, enabled = true, inMarkets?: { uids: string[]; sig: string }) {
  return useQuery<api.MenuFeed>({
    enabled,
    // the set is keyed by its signature, never by its 24 kB of uids
    queryKey: ['feed1', q, limit, inMarkets?.sig ?? null],
    queryFn: ({ signal }) => (inMarkets ? api.recentTxsIn({ ...q, limit }, inMarkets.uids, signal) : api.recentTxs({ ...q, limit }, signal)),
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
    retry: retry404,
  })
}
export function useAccountFlows(account: string | undefined, days = 30, chainId?: string) {
  return useQuery({
    enabled: !!account,
    queryKey: ['acct-flows', account, days, chainId],
    queryFn: () => api.accountFlows(account!, { days, chainId }),
    staleTime: 5 * MIN,
    retry: retry404,
  })
}
/** One position's PnL record (`api.positionSeries`); `key` = a `groups[].key`, `unit` = the money it is valued in. */
export function usePositionSeries(account: string | undefined, key: string | undefined, unit = 'USD') {
  return useQuery({
    enabled: !!account && !!key,
    queryKey: ['pos-series', account, key, unit],
    queryFn: () => api.positionSeries(account!, key!, unit),
    staleTime: 5 * MIN,
    retry: retry404,
  })
}
export function useIndexPositions(account: string | undefined, chainId?: string) {
  return useQuery({
    enabled: !!account,
    queryKey: ['idx-positions', account, chainId],
    queryFn: () => api.accountPositions(account!, { chainId }),
    staleTime: MIN,
    retry: retry404,
  })
}
/**
 * The connected wallet, synced before its own page shows the index (pos-indexer tickets/0071):
 * the live read the header chip already made (`earn-positions` in the cache) goes along as hints,
 * the index reads whatever it is missing and answers once those reads have landed, and the
 * positions query is refetched on the synced state. Up to ~20 s for a wallet with gaps; seconds
 * once it is in sync.
 *
 * It REUSES the chip's read, never makes its own: it starts once the chip's `earn-positions`
 * buckets for this account have settled, so the hints are complete. Sent earlier it would carry
 * none, and the chip's own hint post would land inside the index's per-account cooldown and be
 * reported, not read. After 8 s with no live read (the chip failed or is off) it syncs on the
 * ledger alone.
 */
export function useAccountSync(account: string | undefined) {
  const qc = useQueryClient()
  const live = (q: Query) => q.queryKey[0] === 'earn-positions' && normAddr(String(q.queryKey[1])) === account
  const fetching = useIsFetching({ predicate: live })
  const answered = qc.getQueryCache().findAll({ predicate: live }).some((q) => q.state.dataUpdatedAt > 0 || q.state.status === 'error')
  const [gaveUp, setGaveUp] = useState(false)
  useEffect(() => {
    setGaveUp(false)
    if (!account) return
    const t = setTimeout(() => setGaveUp(true), 8_000)
    return () => clearTimeout(t)
  }, [account])
  return useQuery({
    enabled: !!account && isEvmAddr(account) && ((answered && fetching === 0) || gaveUp),
    queryKey: ['idx-sync', account],
    queryFn: async ({ signal }) => {
      const items = qc
        .getQueriesData<EarnPositionsResponse>({ predicate: live })
        .flatMap(([, d]) => d?.items ?? [])
      const r = await api.syncAccount(account!, hintLegs(items), 20_000, signal)
      await qc.invalidateQueries({ queryKey: ['idx-positions', account] })
      return r
    },
    staleTime: 5 * MIN,
    retry: false,
  })
}
/**
 * Is this address a vault, and what does it pay? One call, answered from the
 * vault book by the share token. An address that is not a vault answers an
 * empty list, which is the same shape as "not a vault" and needs no second
 * question.
 */
export function useVaultsAt(address: string | undefined) {
  return useQuery({
    enabled: !!address,
    queryKey: ['vaults-at', address],
    queryFn: () => api.vaultsAt(address!),
    staleTime: 5 * MIN,
    retry: false,
  })
}
export function useMarket(uid: string | undefined) {
  return useQuery({ enabled: !!uid, queryKey: ['market', uid], queryFn: () => api.market(uid!), staleTime: 10 * MIN, retry: false })
}
export function useMarketTxs(uid: string | undefined, limit = 50, f: api.MarketTapeQuery = {}) {
  return useQuery({
    enabled: !!uid,
    queryKey: ['market-txs', uid, limit, f],
    queryFn: ({ signal }) => api.marketTxs(uid!, limit, f, signal),
    staleTime: 30_000,
    // changing a filter keeps the old rows up (dimmed) instead of flashing a skeleton
    placeholderData: (prev, q) => (q?.queryKey[1] === uid ? prev : undefined),
  })
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
export function useHot(
  window: '1h' | '6h' | '24h' | '7d',
  chainIds?: string,
  limit = 24,
  protocols?: string,
  issuers?: string,
  issuerMatch?: api.IssuerMatch,
  curator?: string,
  assetGroups?: string,
) {
  return useQuery({
    queryKey: ['hot', window, chainIds ?? 'all', protocols ?? 'all', issuers ?? 'all', issuerMatch ?? 'any', curator ?? 'all', assetGroups ?? 'all', limit],
    queryFn: () => api.hot({ window, chainIds, protocols, issuers, issuerMatch, curator, assetGroups, limit }),
    staleTime: 2 * MIN,
    refetchInterval: 2 * MIN,
    placeholderData: (prev) => prev,
  })
}

/**
 * The filter facets take the index 1.5–6 s to count (measured 2026-09-25,
 * `/issuers?window=7d` the slowest), and a chip bar that arrives that late
 * shoves the list under it down. The last answer is kept in localStorage and
 * shown at once as a placeholder while the fresh one loads — the venues with
 * activity barely change between visits — and a window switch keeps the
 * previous chips up instead of blanking them.
 */
const lastKey = (key: readonly unknown[]) => 'facet:' + JSON.stringify(key)
function readLast<T>(key: readonly unknown[]): T | undefined {
  try { const v = localStorage.getItem(lastKey(key)); return v ? (JSON.parse(v) as T) : undefined } catch { return undefined }
}
function keepLast<T>(key: readonly unknown[], v: T): T {
  try { localStorage.setItem(lastKey(key), JSON.stringify(v)) } catch { /* private mode, quota: the chips still load, just not instantly */ }
  return v
}
/** Which protocols a filter should offer, for the current window and chain scope. */
export function useProtocols(window: '1h' | '6h' | '24h' | '7d', chainIds?: string) {
  const key = ['protocols', window, chainIds ?? 'all'] as const
  type R = Awaited<ReturnType<typeof api.protocols>>
  return useQuery({
    queryKey: key,
    queryFn: async () => keepLast(key, await api.protocols({ window, chainIds, limit: 40 })),
    staleTime: 5 * MIN,
    placeholderData: (prev: R | undefined) => prev ?? readLast<R>(key),
  })
}

/** Which desks a filter should offer, for the current window and chain scope. */
export function useIssuers(window: '1h' | '6h' | '24h' | '7d', chainIds?: string) {
  const key = ['issuers', window, chainIds ?? 'all'] as const
  type R = Awaited<ReturnType<typeof api.issuers>>
  return useQuery({
    queryKey: key,
    queryFn: async () => keepLast(key, await api.issuers({ window, chainIds, limit: 40 })),
    staleTime: 5 * MIN,
    placeholderData: (prev: R | undefined) => prev ?? readLast<R>(key),
  })
}

// ---------------------------------------------------------------- curators

/** The desk book, ranked by AUM — a measured quantity, never a score. */
export function useCurators(chainIds?: string, limit = 60) {
  return useQuery({
    queryKey: ['curators', chainIds ?? 'all', limit],
    queryFn: () => api.curators({ win: '30d', chainIds, limit }),
    staleTime: 10 * MIN,
  })
}
export function useCurator(id: string | undefined) {
  return useQuery({ enabled: !!id, queryKey: ['curator', id], queryFn: () => api.curator(id!), staleTime: 5 * MIN, retry: false })
}
export function useCuratorAllocation(id: string | undefined) {
  return useQuery({ enabled: !!id, queryKey: ['curator-alloc', id], queryFn: () => api.curatorAllocation(id!), staleTime: 5 * MIN, retry: false })
}
export function useCuratorTxs(id: string | undefined, limit = 40) {
  return useQuery({ enabled: !!id, queryKey: ['curator-txs', id, limit], queryFn: () => api.curatorTxs(id!, limit), staleTime: 60_000, retry: false })
}
export function useCuratorHolders(id: string | undefined, limit = 12) {
  return useQuery({ enabled: !!id, queryKey: ['curator-holders', id, limit], queryFn: () => api.curatorHolders(id!, limit), staleTime: 5 * MIN, retry: false })
}
/**
 * Which of these addresses are desks. Batched for a whole view, so a feed
 * page costs one request — and a wallet that is really a manager stops
 * rendering as a whale with a generated name.
 */
export function useCuratorsByAccount(addresses: string[]) {
  // `0x` goes to the EVM index and base58 (verbatim, never lower-cased) to the Solana one — `api.curatorsByAccount` splits the batch
  const want = [...new Set(addresses.map((a) => normAddr(a)).filter((a) => isEvmAddr(a) || isSolAddr(a)))].sort()
  const q = useQuery({
    enabled: want.length > 0,
    queryKey: ['curators-by-account', want.join(',')],
    queryFn: () => api.curatorsByAccount(want),
    staleTime: 10 * MIN,
    retry: false,
  })
  const map = q.data?.curators ?? {}
  return { curatorOf: (a: string | undefined) => (a ? (map[normAddr(a)] ?? null) : null), isLoading: q.isLoading }
}

// ---------------------------------------------------------------- assets (pos-indexer tickets/0026)

/** The asset book: every group with lending activity, biggest first. */
export function useAssetBook(chainIds?: string, q?: string, limit = 200) {
  return useQuery({
    queryKey: ['asset-book', chainIds ?? 'all', q ?? '', limit],
    queryFn: ({ signal }) => api.assets({ chainIds, q: q || undefined, limit }, signal),
    staleTime: 5 * MIN,
    retry: false,
    placeholderData: (prev) => prev,
  })
}
export function useAsset(group: string | undefined, chainIds?: string) {
  return useQuery({
    enabled: !!group,
    queryKey: ['asset', group, chainIds ?? 'all'],
    queryFn: () => api.asset(group!, chainIds),
    staleTime: 5 * MIN,
    retry: false,
  })
}
export function useAssetHistory(group: string | undefined, days = 90, chainIds?: string) {
  return useQuery({
    enabled: !!group,
    queryKey: ['asset-history', group, days, chainIds ?? 'all'],
    queryFn: () => api.assetHistory(group!, days, chainIds),
    staleTime: 10 * MIN,
    retry: false,
  })
}
export function useAssetHolders(group: string | undefined, limit = 20, chainIds?: string) {
  return useQuery({
    enabled: !!group,
    queryKey: ['asset-holders', group, limit, chainIds ?? 'all'],
    queryFn: () => api.assetHolders(group!, limit, chainIds),
    staleTime: 5 * MIN,
    retry: false,
  })
}

/**
 * What the LEDGER sees happening to these markets. Kept apart from what
 * wallets SAY about them on purpose: an incident needs a claim and a fact,
 * and this is the fact.
 */
export function useStress(markets: string[]) {
  const want = [...new Set(markets.filter(Boolean))].sort()
  const q = useQuery({
    enabled: want.length > 0,
    queryKey: ['stress', want.join(',')],
    queryFn: () => api.stress(want),
    staleTime: 2 * MIN,
    retry: false,
  })
  return {
    stressOf: (uid: string | undefined) => (uid ? (q.data?.stress?.[uid] ?? null) : null),
    thresholds: q.data?.thresholds,
    isLoading: q.isLoading,
  }
}

/**
 * The earners board, as query OPTIONS: the Board page composes them (it also
 * prefetches the sibling views, and wants `placeholderData` of its own) and
 * the Start page asks plainly through `useEarners`. One factory so both build
 * byte-identical URLs — the index pre-warms the default board URLs, and a
 * second spelling of the same question would always be a cold query.
 */
export interface EarnersKey {
  by: 'position' | 'wallet'
  sort: 'perDay' | 'apr'
  /** 'all' lifts the default preset that hides flagged positions */
  preset?: 'all'
  people: boolean
  chainIds?: string
  /** the money of the supply side (pos-indexer tickets/0072); absent = every position */
  exposure?: api.ExposureChip
  limit?: number
}
export function earnersQuery(k: EarnersKey) {
  const p: api.EarnersQuery = { sort: k.sort, preset: k.preset, people: k.people, chainIds: k.chainIds, exposure: k.exposure, limit: k.limit ?? 50 }
  return {
    queryKey: ['earners', k.by, k.sort, k.preset ?? 'default', k.people, k.chainIds ?? 'all', k.exposure ?? 'all', k.limit ?? 50] as const,
    queryFn: (): Promise<api.EarnersResponse | api.WalletEarnersResponse> =>
      k.by === 'wallet' ? api.walletEarners(p) : api.earners(p),
    staleTime: MIN,
    retry: false,
  }
}
export function useEarners(k: EarnersKey, enabled = true) {
  return useQuery({ ...earnersQuery(k), enabled })
}

/** The podium now (and the latest reigns), overall and per chain. `account` narrows both to one wallet. */
export function useCrowns(account?: string) {
  const a = account && isEvmAddr(account) ? normAddr(account) : undefined
  return useQuery({
    queryKey: ['crowns', a ?? 'all'],
    queryFn: () => api.crowns(a),
    enabled: !account || !!a,
    staleTime: 2 * MIN,
    retry: false,
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
