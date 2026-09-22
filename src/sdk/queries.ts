import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { bridgeStatus, fetchEarn, fetchEarnPositions, fetchLoopPayAssets, fetchOptimizerPairs, fetchTokenBalances, loopOpen, type OptimizerQuery } from './api'
import { capPerAsset, dedupe, loopFromRow, simpleFromEarn, type LoopStrategy, type SimpleStrategy } from '../model/strategies'
import { toRaw } from '../model/leverage'

const HOUR = 3600_000
export const CHAINS: { id: string; label: string }[] = [
  { id: '1', label: 'Ethereum' },
  { id: '8453', label: 'Base' },
  { id: '42161', label: 'Arbitrum' },
  { id: '56', label: 'BNB' },
]
export const chainLabel = (id: string) => CHAINS.find((c) => c.id === id)?.label ?? id

/** Same-denomination carry archetypes: the collateral and the debt are the same money, so this is carry, not a price bet. */
const LOOP_ARCHETYPES: Pick<OptimizerQuery, 'collateralTags' | 'debtTags' | 'includeExpired'>[] = [
  { collateralTags: ['lst', 'lrt'], debtTags: ['wnative'] },
  { collateralTags: ['stablecoin', 'savings', 'pendle'], debtTags: ['stablecoin'], includeExpired: false },
  { collateralTags: ['btc'], debtTags: ['btc'] },
]

/** Both listings for the selected chains, normalised and curated. Chains load in parallel and merge as they land. */
export function useCatalog(chainIds: string[]) {
  const earn = useQueries({
    queries: chainIds.map((chainId) => ({
      queryKey: ['earn', chainId],
      queryFn: async () => { const r = await fetchEarn({ chainId, count: 800, maxRiskScore: 4, minTvlUsd: 1_000_000 }); return r.items.map(simpleFromEarn).filter((x): x is SimpleStrategy => !!x) },
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
