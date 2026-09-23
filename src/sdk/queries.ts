import { useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { bridgeStatus, fetchChains, fetchEarn, fetchEarnPositions, fetchLoopPayAssets, fetchOptimizerPairs, fetchTokenBalances, fetchVaults, loopOpen, type OptimizerQuery } from './api'
import { capPerAsset, dedupe, loopFromRow, simpleFromEarn, type LoopStrategy, type SimpleStrategy } from '../model/strategies'
import type { VaultListing } from './types'
import { toRaw } from '../model/leverage'

const HOUR = 3600_000
/**
 * The chains this app works on — the ones the index follows, which is also
 * the scope of the feed, the hot board, a wallet and a market page.
 *
 * It was briefly two lists, on the theory that the ten added on 2026-09-23
 * had no strategies to fetch. They do: measured against the API the same day,
 * `/v1/data/earn` answers 57 rows on Monad, 54 on HyperEVM, 19 on Optimism and
 * Plasma, 14 on Robinhood, 9 on Plume, 7 on Arc, and the optimizer pairs 33
 * loops on Monad and 24 on Plasma. Only Tempo and Stable answer nothing, and
 * they are here because a position on them is still a position — an empty
 * listing says that honestly, a missing chain does not.
 *
 * The cost is real and worth knowing: each entry is one earn query, one vault
 * registry and three optimizer archetypes per refresh, all cached ten minutes.
 */
export const CHAINS: { id: string; label: string }[] = [
  { id: '1', label: 'Ethereum' },
  { id: '8453', label: 'Base' },
  { id: '42161', label: 'Arbitrum' },
  { id: '56', label: 'BNB' },
  { id: '43114', label: 'Avalanche' },
  { id: '10', label: 'Optimism' },
  { id: '999', label: 'HyperEVM' },
  { id: '143', label: 'Monad' },
  { id: '9745', label: 'Plasma' },
  { id: '137', label: 'Polygon' },
  { id: '5042', label: 'Arc' },
  { id: '4663', label: 'Robinhood' },
  { id: '4217', label: 'Tempo' },
  { id: '988', label: 'Stable' },
  { id: '98866', label: 'Plume' },
]
/**
 * Names and logos from the API's own chain directory, keyed by id — one
 * request for every chain, cached for a day, and a failure is simply no
 * decoration (`CHAINS` above still names them and `ChainMark` still draws
 * them). It is what makes a chain wear the same mark here as everywhere else
 * in 1delta.
 */
export const chainsQuery = {
  queryKey: ['chain-directory'],
  queryFn: async () => {
    const r = await fetchChains()
    const out: Record<string, { name: string; logo?: string }> = {}
    for (const c of r.items ?? []) out[String(c.chainId)] = { name: c.name, logo: c.logoURI || undefined }
    return out
  },
  staleTime: 24 * HOUR,
  gcTime: 24 * HOUR,
  retry: 1,
}
export function useChainMeta(): Record<string, { name: string; logo?: string }> {
  return useQuery(chainsQuery).data ?? EMPTY_CHAIN_META
}
const EMPTY_CHAIN_META: Record<string, { name: string; logo?: string }> = {}
export const chainLabel = (id: string) => CHAINS.find((c) => c.id === id)?.label ?? id

/**
 * Same-denomination carry archetypes: the collateral and the debt are the same
 * money, so this is carry, not a price bet.
 *
 * `rwa` joined them on 2026-09-23. A tokenised credit fund borrowed against in
 * dollars is the same trade as sUSDe borrowed in dollars — the app simply
 * never asked for it, and the API had it all along: measured that day,
 * `collateralTags=rwa&debtTags=stablecoin` answers 34 pairs on Ethereum, 34 on
 * BNB, 4 on Monad and 3 on Plasma, none of which any archetype here matched.
 *
 * It does NOT fix Plume, whose two RWA markets are borrowed in `pUSD` — an
 * asset the upstream feed leaves with `tags: []` where the same chain's USDC
 * carries `['stablecoin','usdc']` and its own collateral carries `['rwa']`.
 * With no debt tag they appear (nOPAL/pUSD at +28 %, nALPHA/pUSD at −35 %),
 * and so does every genuine price bet, so the fix is the tag, upstream.
 */
const LOOP_ARCHETYPES: Pick<OptimizerQuery, 'collateralTags' | 'debtTags' | 'includeExpired'>[] = [
  { collateralTags: ['lst', 'lrt'], debtTags: ['wnative'] },
  { collateralTags: ['stablecoin', 'savings', 'pendle'], debtTags: ['stablecoin'], includeExpired: false },
  { collateralTags: ['btc'], debtTags: ['btc'] },
  { collateralTags: ['rwa'], debtTags: ['stablecoin'] },
]

/**
 * The vault registry for one chain, keyed by vault address — the share token's
 * symbol, name and curator, none of which the earn listing carries (see
 * `VaultListing`). Cached under its own key and shared by every earn query, so
 * it costs one request per chain per hour; an empty map on failure, because a
 * decoration must never take the listing down with it.
 */
export type VaultIndex = Record<string, VaultListing>
const vaultQuery = (chainId: string) => ({
  queryKey: ['vaults', chainId],
  queryFn: async (): Promise<VaultIndex> => {
    const r = await fetchVaults(chainId)
    return Object.fromEntries(r.items.map((v) => [v.vaultAddress.toLowerCase(), v]))
  },
  staleTime: HOUR,
})
/** One chain's registry, from the shared cache — `{}` on failure, never a rejection. */
export const vaultIndex = (chainId: string, qc: QueryClient): Promise<VaultIndex> => qc.ensureQueryData(vaultQuery(chainId)).catch(() => ({}) as VaultIndex)
/** The same registries for several chains, keyed `chainId:address`, for the holdings side. */
export function useVaultIndex(chainIds: string[]): VaultIndex {
  const qs = useQueries({ queries: chainIds.map(vaultQuery) })
  const data = qs.map((q) => q.data)
  return useMemo(() => {
    const out: VaultIndex = {}
    data.forEach((d, i) => { for (const [a, v] of Object.entries(d ?? {})) out[`${chainIds[i]}:${a}`] = v })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainIds.join(','), ...data])
}

/** Both listings for the selected chains, normalised and curated. Chains load in parallel and merge as they land. */
export function useCatalog(chainIds: string[]) {
  const qc = useQueryClient()
  const earn = useQueries({
    queries: chainIds.map((chainId) => ({
      queryKey: ['earn', chainId],
      queryFn: async () => {
        const [vaults, r] = await Promise.all([vaultIndex(chainId, qc), fetchEarn({ chainId, count: 800, maxRiskScore: 4, minTvlUsd: 1_000_000 })])
        return r.items.map((m) => simpleFromEarn(m, vaults[String(m.ref).toLowerCase()])).filter((x): x is SimpleStrategy => !!x)
      },
      staleTime: 10 * 60_000,
    })),
  })
  const loops = useQueries({
    queries: chainIds.flatMap((chainId) => LOOP_ARCHETYPES.map((a, i) => ({
      queryKey: ['loops', chainId, i],
      queryFn: async () => { const r = await fetchOptimizerPairs({ chainId, ...a, collateralAmountUsd: 10_000, maxConfigRiskScore: 4, maxTokenRiskScore: 4, minBorrowLiquidityUsd: 100_000, count: 100 }); return r.items.map(loopFromRow).filter((x): x is LoopStrategy => !!x) },
      staleTime: 10 * 60_000,
    }))),
  })
  const simple = capPerAsset(dedupe(earn.flatMap((q) => q.data ?? [])))
  const loopRows = capPerAsset(dedupe(loops.flatMap((q) => q.data ?? [])))
  return {
    simple, loops: loopRows,
    isLoading: earn.some((q) => q.isLoading) || loops.some((q) => q.isLoading),
    anyData: earn.some((q) => q.data) || loops.some((q) => q.data),
    errors: [...earn, ...loops].map((q) => q.error).filter((e): e is Error => !!e),
  }
}

/** Idle balances: one request per chain for the addresses the catalogue knows (native always at the zero address). */
export function useBalances(account: string | undefined, chainId: string, addresses: string[]) {
  const assets = [...new Set(['0x0000000000000000000000000000000000000000', ...addresses.filter(Boolean).map((a) => a.toLowerCase())])].sort()
  return useQuery({
    enabled: !!account && assets.length > 0,
    queryKey: ['balances', account, chainId, assets.join(',')],
    queryFn: () => fetchTokenBalances(account!, chainId, assets),
    staleTime: 30_000,
  })
}
export function useBalancesPerChain(account: string | undefined, chains: { chainId: string; addresses: string[] }[]) {
  return useQueries({
    queries: chains.map(({ chainId, addresses }) => {
      const assets = [...new Set(['0x0000000000000000000000000000000000000000', ...addresses.filter(Boolean).map((a) => a.toLowerCase())])].sort()
      return { enabled: !!account, queryKey: ['balances', account, chainId, assets.join(',')], queryFn: () => fetchTokenBalances(account!, chainId, assets), staleTime: 30_000 }
    }),
  })
}
export function useEarnPositions(account: string | undefined, chainIds: string[]) {
  return useQuery({
    enabled: !!account,
    queryKey: ['earn-positions', account, chainIds.join(',')],
    queryFn: () => fetchEarnPositions(account!, chainIds),
    staleTime: 60_000,
  })
}

function useDebounced<T>(v: T, ms: number): T { const [d, setD] = useState(v); useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms]); return d }
/** Quote-only loop (no account): the API's projected economics and simulated health for the ticket. */
export function useLoopQuote(l: LoopStrategy | null, equityUsd: number, leverageLive: number, account?: string, slippageBp = 50) {
  const leverage = useDebounced(leverageLive, 500)
  const equity = useDebounced(equityUsd, 500)
  const debtUsd = equity * (leverage - 1)
  const debtTokens = l?.priceShort ? debtUsd / l.priceShort : 0
  return useQuery({
    enabled: !!l && debtTokens > 0,
    queryKey: ['loopq', l?.id, Math.round(debtTokens * 1e6), leverage, slippageBp, account ?? ''],
    staleTime: 20_000,
    retry: false,
    // some lenders (LlamaLend) only quote with an account; passing it costs nothing — nothing is signed here
    queryFn: () => loopOpen({ collateralMarketUid: l!.marketLongUid, debtMarketUid: l!.marketShortUid, debtAmountRaw: toRaw(debtTokens, l!.decimalsShort), slippageBp, leverage, account }),
  })
}
export function useLoopPayAssets(l: LoopStrategy | null) {
  return useQuery({
    enabled: !!l,
    queryKey: ['pay-assets', l?.marketLongUid, l?.marketShortUid],
    staleTime: HOUR,
    retry: false,
    queryFn: () => fetchLoopPayAssets({ collateralMarketUid: l!.marketLongUid, debtMarketUid: l!.marketShortUid }),
  })
}

const TERMINAL = new Set(['DONE', 'FAILED', 'TRANSFER_REFUNDED', 'INVALID'])
/** Polls the bridge every 10 s until terminal; NOT_FOUND right after submission is indexing lag, keep polling. */
export function useBridgeStatus(p: { bridge?: string; fromChainId?: string; toChainId?: string; txHash?: string; tokenIn?: string; tokenOut?: string }) {
  return useQuery({
    enabled: !!p.bridge && !!p.fromChainId && !!p.toChainId && !!p.txHash,
    queryKey: ['bridge', p.bridge, p.fromChainId, p.txHash],
    refetchInterval: (q) => (TERMINAL.has(q.state.data?.status ?? '') ? false : 10_000),
    queryFn: () => bridgeStatus({ bridge: p.bridge!, fromChainId: p.fromChainId!, toChainId: p.toChainId!, txHash: p.txHash!, tokenIn: p.tokenIn, tokenOut: p.tokenOut }),
  })
}
