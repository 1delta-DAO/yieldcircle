import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { fetchChains, fetchEarn, fetchEarnPositions, fetchIrm, fetchLoopPayAssets, fetchOptimizerPairs, fetchTokenBalances, fetchVaults, loopClose, loopOpen, type LoopCloseParams, type OptimizerQuery } from './api'
import { capPerAsset, classifyEarn, classifyPair, dedupe, rowKey, type Candidate, type LoopStrategy, type SimpleStrategy, type Strategy } from '../model/strategies'
import { softHide, type HideCode } from '../model/visibility'
import { useSettings, type Settings } from '../state/Settings'
import type { OptimizerResponse, TokenBalance, VaultListing } from './types'
import { indexBalances } from '../index/api'
import type { IndexBalanceItem } from '../index/types'
import { useLiveChains } from './liveBalances'
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
 * How the selected chains are grouped into requests. The big five go alone —
 * they carry most of the rows and the slowest answers, and one of them must
 * never hold up the rest — and every other chain rides in one bundle.
 *
 * This is what keeps a page load inside the 500-a-minute limit. Measured
 * 2026-09-25 with every chain on, one load of Explore was 141 requests
 * (15 earn, 15 vault registries, 60 optimizer, 49 balance reads, positions,
 * the chain directory), so three reloads in a minute — a dev server's HMR does
 * that on its own — ran into `RATE_LIMIT_EXCEEDED`. Bundled it is 6 earn and
 * 24 optimizer requests instead of 15 and 60.
 */
const SOLO_CHAINS = new Set(['1', '8453', '42161', '56', '43114'])
export function chainBuckets(chainIds: string[]): string[][] {
  const solo = chainIds.filter((c) => SOLO_CHAINS.has(c)).map((c) => [c])
  const rest = chainIds.filter((c) => !SOLO_CHAINS.has(c))
  return rest.length ? [...solo, rest] : solo
}

/**
 * The optimizer, paged. One chain keeps the old single page of 100 (sorted by
 * APR, the tail is not shown anyway); a bundle may page up to 300, so ten small
 * chains share a budget no smaller than one used to get — the stable archetype
 * answers 87 rows across them.
 */
async function optimizerPages(q: OptimizerQuery): Promise<OptimizerResponse['items']> {
  const pages = q.chainIds.length > 1 ? 3 : 1
  const items: OptimizerResponse['items'] = []
  for (let i = 0; i < pages; i++) {
    const r = await fetchOptimizerPairs({ ...q, count: 100, start: items.length || undefined })
    items.push(...r.items)
    if (!r.hasMore || !r.items.length) break
  }
  return items
}

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
 * Plume's RWA markets are borrowed in `pUSD`, which upstream still leaves
 * untagged (re-measured 2026-09-27: `tags: null, props: null`), so the tagged
 * request answers nothing there. The small-chain bundle therefore asks for
 * `rwa` collateral against ANY debt (`anyDebtInBundle`): 15 rows against 9,
 * the extra ones nOPAL/pUSD, nALPHA/pUSD and a few gold price bets that
 * `cross-denom` rejects anyway. The big chains keep the tag — BNB answers 159
 * rows untagged against 69, and the price bets would fill its one page.
 */
type Archetype = Pick<OptimizerQuery, 'collateralTags' | 'debtTags' | 'includeExpired'> & { anyDebtInBundle?: boolean }
const LOOP_ARCHETYPES: Archetype[] = [
  { collateralTags: ['lst', 'lrt'], debtTags: ['wnative'] },
  { collateralTags: ['stablecoin', 'savings', 'pendle'], debtTags: ['stablecoin'], includeExpired: false },
  { collateralTags: ['btc'], debtTags: ['btc'] },
  { collateralTags: ['rwa'], debtTags: ['stablecoin'], anyDebtInBundle: true },
]
const archetypeQuery = ({ anyDebtInBundle, ...a }: Archetype, ids: string[]) =>
  anyDebtInBundle && !ids.some((c) => SOLO_CHAINS.has(c)) ? { ...a, debtTags: undefined } : a

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
 * `VaultListing`). Cached under its own key and joined onto the listing once
 * both are in hand, so it costs one request per chain per hour and never
 * holds the listing up; a failure is simply no decoration.
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
  const { st } = useSettings()
  const buckets = chainBuckets(chainIds)
  /**
   * The listing alone. The vault registry is a DECORATION (a share token's
   * symbol, name and curator) and is joined below, when both are in hand: it
   * used to be awaited inside this request, so Ethereum's 2.1 MB registry
   * (3.7–7.8 s cold, measured 2026-09-29) held up Ethereum's listing, which
   * held up `isLoading`, which held up the home feed. A row now arrives with
   * the listing and is renamed when the registry lands (a re-classify is ~5 ms).
   */
  const earn = useQueries({
    queries: buckets.map((ids) => ({
      queryKey: ['earn-rows', ids.join(','), st.minTvlUsd],
      queryFn: async () => (await fetchEarn({ chainIds: ids, count: 1000, maxRiskScore: 5, minTvlUsd: st.minTvlUsd })).items,
      staleTime: 10 * 60_000,
    })),
  })
  const vaults = useQueries({ queries: chainIds.map(vaultQuery) })
  const loops = useQueries({
    queries: buckets.flatMap((ids) => [
      ...LOOP_ARCHETYPES.map((a, i) => ({
        queryKey: ['loops', ids.join(','), i],
        queryFn: async () => sortOut((await optimizerPages({ chainIds: ids, ...archetypeQuery(a, ids), collateralAmountUsd: 10_000, minBorrowLiquidityUsd: 0 })).map(classifyPair), 'loop'),
        staleTime: 10 * 60_000,
      })),
      ...(st.wideNet ? WIDE_DEBT_TAGS.map((t) => ({
        queryKey: ['loops-wide', ids.join(','), t],
        queryFn: async () => sortOut((await optimizerPages({ chainIds: ids, debtTags: [t], collateralAmountUsd: 10_000, minBorrowLiquidityUsd: 0 })).map(classifyPair), 'loop'),
        staleTime: 10 * 60_000,
      })) : []),
    ]),
  })
  // one stamp for "any answer changed": this hook runs in the header, the
  // feed and Hot at once, and every catalogue query landing re-renders all three
  const stamp = [chainIds.join(','), ...[...earn, ...vaults, ...loops].map((q) => q.dataUpdatedAt)].join('|')
  const earnSorted = useMemo(() => {
    const reg: Record<string, VaultIndex | undefined> = Object.fromEntries(chainIds.map((c, i) => [c, vaults[i]?.data]))
    return earn.map((q) => (q.data ? sortOut(q.data.map((m) => classifyEarn(m, reg[m.chainId]?.[String(m.ref).toLowerCase()])), 'simple') : undefined))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp])
  const derived = useMemo(() => {
    const earnRows = earnSorted.flatMap((d) => d?.rows ?? [])
    const loopRows = loops.flatMap((q) => q.data?.rows ?? [])
    // every base-asset address the chain answered, shown or held back by a floor,
    // so moving a floor never changes what the balance read asks for
    const addresses: Record<string, string[]> = {}
    for (const r of [...earnRows, ...loopRows]) (addresses[r.chainId] ??= []).push(...(r.kind === 'simple' ? [r.assetAddress] : [r.collateralAddress, r.debtAddress]))
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
    const structural = mergeStructural([...earnSorted, ...loops.map((q) => q.data)].flatMap((d) => (d ? [{ structural: d.structural, kind: d.kind }] : [])))
    return { simple, loops: loopRowsOut, hidden, structural, addresses }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earnSorted, stamp, st])
  // A chain is SETTLED once every request covering it has answered (or failed):
  // only then is its list of token addresses final, and only then is its
  // balance read worth sending (see `useBalancesPerChain`). The registry is not
  // one of them — it names rows, it does not add any.
  const perBucket = loops.length / (buckets.length || 1)
  const settled = new Set(buckets.flatMap((ids, j) => (earn[j]?.isFetched && loops.slice(j * perBucket, (j + 1) * perBucket).every((q) => q.isFetched) ? ids : [])))
  return {
    ...derived, settled,
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

/** The asset list a balance read sends: native always (the zero address), then the catalogue's, sorted so the key is stable. */
const balanceAssets = (addresses: string[]) => [...new Set(['0x0000000000000000000000000000000000000000', ...addresses.filter(Boolean).map((a) => a.toLowerCase())])].sort().slice(0, 60)
/** Idle balances: one request per chain for the addresses the catalogue knows (native always at the zero address). */
export function useBalances(account: string | undefined, chainId: string, addresses: string[]) {
  const assets = balanceAssets(addresses)
  return useQuery({
    enabled: !!account && assets.length > 0,
    queryKey: ['balances', account, chainId, assets.join(',')],
    queryFn: () => fetchTokenBalances(account!, chainId, assets),
    staleTime: 30_000,
  })
}
/** An index row as the balance route's item: the rest of the app reads one shape. */
function fromIndex(i: IndexBalanceItem): TokenBalance | null {
  if (i.decimals == null || i.balance == null) return null
  return { address: i.address, symbol: i.symbol ?? '', decimals: i.decimals, balanceRaw: i.balanceRaw, balance: i.balance, priceUSD: i.priceUsd ?? undefined, balanceUSD: i.balanceUSD ?? undefined }
}

/**
 * Idle balances per chain: the INDEX first (pos-indexer tickets/0044), the live route only where
 * the index cannot vouch.
 *
 * One POST answers every settled chain from the index's snapshots. A chain is taken from it when
 * its `state` is `complete` — every asked asset of the lending set that is not listed is zero —
 * and nothing marks it live (`liveBalances.ts`: an open ticket, or our own transaction in the last
 * three minutes). Such a chain reads live ONLY the assets the index does not read
 * (`unknownAssets`, and a held token it has no decimals for); a chain the index cannot answer
 * (`seeding` / `stale` / `unknown` — a wallet it has never seen is enrolled by this very request
 * and complete seconds later — or the index failing) is read live whole, as before. A reload
 * that used to be fifteen live requests is now one.
 *
 * Still one live read per chain, sent once that chain's catalogue has SETTLED (its list is final);
 * `placeholderData` keeps the last answer on screen while a key changes.
 */
export function useBalancesPerChain(account: string | undefined, chains: { chainId: string; addresses: string[]; ready: boolean }[]) {
  const live = useLiveChains()
  const settled = chains.filter((c) => c.ready)
  const asked = Object.fromEntries(settled.map((c) => [c.chainId, balanceAssets(c.addresses)]))
  const idx = useQuery({
    enabled: !!account && settled.length > 0,
    queryKey: ['balances-index', account, JSON.stringify(asked)],
    queryFn: ({ signal }) => indexBalances(account!, asked, signal),
    staleTime: 15_000,
    refetchInterval: 60_000,
    retry: 1,
    placeholderData: keepPreviousData,
  })
  const plans = chains.map(({ chainId, addresses, ready }) => {
    const all = balanceAssets(addresses)
    const c = idx.data?.chains.find((x) => x.chainId === chainId)
    const fromIdx = !!c && c.state === 'complete' && !live.has(chainId) && !idx.isError
    const indexItems: TokenBalance[] = []
    const liveAssets = new Set<string>(fromIdx ? c!.unknownAssets ?? [] : all)
    if (fromIdx) for (const i of c!.items) { const b = fromIndex(i); if (b) indexItems.push(b); else liveAssets.add(i.address.toLowerCase()) }
    // wait for the index's answer before reading live (one request instead of fifteen); while a
    // new key is in flight, the previous answer decides for the chains it already carries
    const decided = ready && (!account || idx.isError || (!!idx.data && (!idx.isPlaceholderData || !!c)))
    return { chainId, ready, fromIdx, indexItems, liveAssets: [...liveAssets].sort(), decided }
  })
  const liveQs = useQueries({
    queries: plans.map((p) => ({
      enabled: !!account && p.decided && p.liveAssets.length > 0,
      queryKey: ['balances', account, p.chainId, p.liveAssets.join(',')],
      queryFn: () => fetchTokenBalances(account!, p.chainId, p.liveAssets),
      staleTime: 30_000,
      placeholderData: keepPreviousData,
    })),
  })
  return plans.map((p, i) => {
    const q = liveQs[i]
    const needLive = p.liveAssets.length > 0
    // the index's rows first; a live row fills what the index did not answer (the live route
    // always adds the native coin, which the index already carries on a complete chain)
    const have = new Set(p.indexItems.map((b) => b.address.toLowerCase()))
    const items = [...p.indexItems, ...(q.data?.items ?? []).filter((b) => !have.has(b.address.toLowerCase()))]
    const done = p.decided && (!needLive || !!q.data || q.isError)
    return {
      data: done || p.indexItems.length ? { items } : undefined,
      isLoading: !!account && p.ready && !done,
      isFetched: done,
      fetchStatus: (idx.fetchStatus === 'fetching' || q.fetchStatus === 'fetching' ? 'fetching' : 'idle') as 'fetching' | 'idle',
      source: p.fromIdx ? (needLive ? 'index+live' : 'index') : 'live',
    }
  })
}
/**
 * Positions, in the same buckets as the catalogue: the big chains alone, the
 * rest in one request. One request for every chain was the slowest answer on
 * the page (a single slow chain held up all of them); fifteen would spend the
 * rate limit. Buckets land as they come, so the big chains show first.
 */
export function useEarnPositions(account: string | undefined, chainIds: string[]) {
  const qs = useQueries({
    queries: chainBuckets(chainIds).map((ids) => ({
      enabled: !!account,
      queryKey: ['earn-positions', account, ids.join(',')],
      queryFn: () => fetchEarnPositions(account!, ids),
      staleTime: 60_000,
    })),
  })
  const data = qs.map((q) => q.data)
  const items = useMemo(() => data.flatMap((d) => d?.items ?? []), data) // eslint-disable-line react-hooks/exhaustive-deps
  return {
    items,
    anyData: qs.some((q) => q.data),
    isLoading: qs.some((q) => q.isLoading),
    // one bucket failing is a partial answer, not a failed page: only report an error when nothing came back
    error: qs.every((q) => q.error || !q.data) ? (qs.find((q) => q.error)?.error ?? null) : null,
  }
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
export function useLoopQuote(l: LoopStrategy | null, equityUsd: number, leverageLive: number, account?: string, slippageBp = 50, termId?: string) {
  const leverage = useDebounced(leverageLive, 500)
  const equity = useDebounced(equityUsd, 500)
  const debtUsd = equity * (leverage - 1)
  const debtTokens = l?.priceShort ? debtUsd / l.priceShort : 0
  return useQuery({
    enabled: !!l && debtTokens > 0,
    queryKey: ['loopq', l?.id, Math.round(debtTokens * 1e6), leverage, slippageBp, account ?? '', termId ?? ''],
    staleTime: 20_000,
    retry: false,
    // some lenders (LlamaLend) only quote with an account; passing it costs nothing — nothing is signed here
    queryFn: () => loopOpen({ collateralMarketUid: l!.marketLongUid, debtMarketUid: l!.marketShortUid, debtAmountRaw: toRaw(debtTokens, l!.decimalsShort), slippageBp, leverage, account, termId }),
  })
}
/**
 * What selling ALL of a loop's collateral fetches on the market right now: the best route's
 * `tradeOutput` (debt tokens) for `tradeInput` (collateral tokens). A full close is only as good as
 * that sale — the position feed values collateral at the lender's oracle, and an LST the oracle
 * prices at its redemption rate can sell for less than it owes (sMON/WMON on Euler, 2026-09-29:
 * $31 of equity on the feed, 9,207 WMON for 8,281 sMON against 9,250 owed). `null` = no route.
 */
export function useCloseQuote(p: Omit<LoopCloseParams, 'account' | 'slippageBp' | 'isAll'> | null) {
  return useQuery({
    enabled: !!p && p.amountRaw !== '0',
    queryKey: ['closeq', p?.collateralMarketUid, p?.debtMarketUid, p?.amountRaw, p?.accountId ?? '', p?.loanId ?? ''],
    staleTime: 20_000,
    retry: false,
    // quote-only: without `account` the API sizes the sale and builds nothing
    queryFn: async () => {
      const env = await loopClose({ ...p!, account: undefined, slippageBp: 50, isAll: true })
      const best = (env.data?.quotes ?? []).map((q) => q.deltas).filter((d) => d && (d.tradeOutput ?? 0) > 0 && (d.tradeInput ?? 0) > 0)
        .sort((a, b) => b!.tradeOutput! - a!.tradeOutput!)[0]
      return best ? { input: best.tradeInput!, output: best.tradeOutput!, via: best.aggregator, exitCostUsd: env.data?.economics?.exitCostUsd?.total } : null
    },
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
