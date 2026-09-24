import { useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { bridgeStatus, fetchChains, fetchEarn, fetchEarnPositions, fetchIrm, fetchLoopPayAssets, fetchOptimizerPairs, fetchTokenBalances, fetchVaults, loopOpen, type OptimizerQuery } from './api'
import { capPerAsset, classifyEarn, classifyPair, dedupe, rowKey, type Candidate, type LoopStrategy, type SimpleStrategy, type Strategy } from '../model/strategies'
import { softHide, type HideCode } from '../model/visibility'
import { useSettings, type Settings } from '../state/Settings'
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
 * The wide net (`Settings.wideNet`): the same archetypes with the COLLATERAL
 * tag dropped, one request per denomination.
 *
 * An archetype can only return what upstream has tagged, and a token with
 * `props: null` is invisible to every one of them however good it is.
 * Measured on HyperEVM 2026-09-24: `stablecoin,savings,pendle -> stablecoin`
 * answers three pairs, while `debtTags=stablecoin` alone answers 36 — among
 * them `sUSDp/USDC` (9.08 % against 5.70 %) and `syzUSD/USDC` (7.23 % against
 * 5.68 %), two real carries whose collateral carries no props at all. It is
 * the same gap `queries.ts` already documents for Plume's `pUSD`, and the fix
 * is the tag, upstream; this is what the app can do until then.
 *
 * The DEBT tag stays because it is what keeps the request a carry search:
 * everything that comes back with a debt in another money is structurally
 * rejected anyway (`cross-denom`), so dropping it too would only pay for rows
 * nobody can be shown. Cost is one request per chain per denomination
 * (190-600 kB each), which is why it is off by default.
 */
const WIDE_DEBT_TAGS = ['stablecoin', 'wnative', 'btc']

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

/**
 * What a chain answered, split into what can be shown and what cannot.
 *
 * `rows` are built strategies (visible or merely below a floor); `structural`
 * counts the rows there is no strategy for at all, with a few names, so a list
 * that is empty can say what it is empty OF.
 */
interface Sorted<T extends Strategy> { rows: T[]; structural: Partial<Record<HideCode, { n: number; examples: string[] }>>; kind: 'simple' | 'loop' }
function sortOut<T extends Strategy>(cands: Candidate<T>[], kind: 'simple' | 'loop'): Sorted<T> {
  const rows: T[] = []
  const structural: Sorted<T>['structural'] = {}
  for (const c of cands) {
    if (c.s) { rows.push(c.s); continue }
    if (!c.hide) continue
    const cur = (structural[c.hide] ??= { n: 0, examples: [] })
    cur.n++
    if (cur.examples.length < 4 && !cur.examples.includes(c.label)) cur.examples.push(c.label)
  }
  return { rows, structural, kind }
}
export interface StructuralCount { code: HideCode; kind: 'simple' | 'loop'; n: number; examples: string[] }
function mergeStructural(parts: { structural: Sorted<Strategy>['structural']; kind: 'simple' | 'loop' }[]): StructuralCount[] {
  const out = new Map<string, StructuralCount>()
  for (const p of parts) for (const [code, v] of Object.entries(p.structural) as [HideCode, { n: number; examples: string[] }][]) {
    const k = `${p.kind}|${code}`
    const cur = out.get(k) ?? { code, kind: p.kind, n: 0, examples: [] }
    cur.n += v.n
    for (const e of v.examples) if (cur.examples.length < 4 && !cur.examples.includes(e)) cur.examples.push(e)
    out.set(k, cur)
  }
  return [...out.values()]
}

/** A row that a floor is holding back, carrying the code that says which one. */
export type HiddenRow = Strategy & { hide: HideCode }

/**
 * Both listings for the selected chains, normalised and curated. Chains load in
 * parallel and merge as they land.
 *
 * Two of the floors are part of the REQUEST — `minTvlUsd` is the earn
 * listing's own filter (asking for everything costs 3.8 MB on Ethereum against
 * 2.6 MB, measured 2026-09-24) and `wideNet` adds optimizer requests — so they
 * are in the query keys and moving them refetches. Every other floor is
 * applied HERE, to rows already in hand, so the list can count what it is
 * holding back and let it in without a round trip. That is why the optimizer
 * is asked with no risk cap and no liquidity floor: both cost nothing extra
 * upstream (measured: identical row counts) and both become instant switches.
 */
export function useCatalog(chainIds: string[]) {
  const qc = useQueryClient()
  const { st } = useSettings()
  const earn = useQueries({
    queries: chainIds.map((chainId) => ({
      queryKey: ['earn', chainId, st.minTvlUsd],
      queryFn: async () => {
        const [vaults, r] = await Promise.all([vaultIndex(chainId, qc), fetchEarn({ chainId, count: 800, maxRiskScore: 5, minTvlUsd: st.minTvlUsd })])
        return sortOut(r.items.map((m) => classifyEarn(m, vaults[String(m.ref).toLowerCase()])), 'simple')
      },
      staleTime: 10 * 60_000,
    })),
  })
  const loops = useQueries({
    queries: chainIds.flatMap((chainId) => [
      ...LOOP_ARCHETYPES.map((a, i) => ({
        queryKey: ['loops', chainId, i],
        queryFn: async () => {
          const r = await fetchOptimizerPairs({ chainId, ...a, collateralAmountUsd: 10_000, minBorrowLiquidityUsd: 0, count: 100 })
          return sortOut(r.items.map(classifyPair), 'loop')
        },
        staleTime: 10 * 60_000,
      })),
      ...(st.wideNet ? WIDE_DEBT_TAGS.map((t) => ({
        queryKey: ['loops-wide', chainId, t],
        queryFn: async () => {
          const r = await fetchOptimizerPairs({ chainId, debtTags: [t], collateralAmountUsd: 10_000, minBorrowLiquidityUsd: 0, count: 100 })
          return sortOut(r.items.map(classifyPair), 'loop')
        },
        staleTime: 10 * 60_000,
      })) : []),
    ]),
  })
  const earnRows = earn.flatMap((q) => q.data?.rows ?? [])
  const loopRows = loops.flatMap((q) => q.data?.rows ?? [])
  const { show: simpleShow, hide: simpleHide } = split(earnRows, st)
  const { show: loopShow, hide: loopHide } = split(loopRows, st)
  const simple = capPerAsset(dedupe(simpleShow))
  const loopRowsOut = capPerAsset(dedupe(loopShow))
  // a hidden row that is another spelling of a visible one is noise: the same
  // market on the same venue, kept out by `dedupe` and then handed back by the
  // `+` as a duplicate
  const shown = new Set([...simple, ...loopRowsOut].map(rowKey))
  const hidden: HiddenRow[] = [
    ...capPerAsset(dedupe(simpleHide.filter((r) => !shown.has(rowKey(r)))), 25),
    ...capPerAsset(dedupe(loopHide.filter((r) => !shown.has(rowKey(r)))), 25),
  ]
  const structural = mergeStructural([...earn, ...loops].flatMap((q) => (q.data ? [{ structural: q.data.structural, kind: q.data.kind }] : [])))
  return {
    simple, loops: loopRowsOut, hidden, structural,
    isLoading: earn.some((q) => q.isLoading) || loops.some((q) => q.isLoading),
    isFetching: earn.some((q) => q.isFetching) || loops.some((q) => q.isFetching),
    anyData: earn.some((q) => q.data) || loops.some((q) => q.data),
    errors: [...earn, ...loops].map((q) => q.error).filter((e): e is Error => !!e),
  }
}
/** The floors, applied to rows already in hand. A hidden row is a COPY carrying the code that hid it. */
function split<T extends Strategy>(rows: T[], st: Settings): { show: T[]; hide: (T & { hide: HideCode })[] } {
  const show: T[] = [], hide: (T & { hide: HideCode })[] = []
  for (const r of rows) {
    const h = softHide(r, st)
    if (h) hide.push({ ...r, hide: h })
    else show.push(r)
  }
  return { show, hide }
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

/**
 * One market's rate curve, fetched only once someone opens it.
 *
 * `enabled` is the whole design: the curve is a second request per market and
 * nobody needs it to decide whether to read the row, so it is asked for when
 * the popover opens and cached for five minutes after. A market with no curve
 * (a vault, or one of the fourteen families that do not price off utilisation)
 * resolves to `null` — an answer, not an error, so the popover can say so in
 * words instead of rendering a spinner that never stops.
 */
export function useIrm(marketUid: string | null | undefined, enabled = true) {
  return useQuery({
    enabled: enabled && !!marketUid,
    queryKey: ['irm', marketUid],
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const r = await fetchIrm([marketUid!])
      return r.items?.find((x) => x.marketUid === marketUid) ?? null
    },
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
