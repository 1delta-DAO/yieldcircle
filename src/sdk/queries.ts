import { keepPreviousData, useQueries, useQuery, type QueryClient, type QueryFunctionContext } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { fetchChains, fetchEarn, fetchEarnPositions, fetchIrm, fetchLendingBook, fetchLoopPayAssets, fetchOptimizerPairs, fetchTokenBalances, loopClose, loopDepthShort, loopOpen, type LoopCloseParams, type OptimizerQuery } from './api'
import { capPerAsset, classifyEarn, classifyPair, dedupe, foldDates, rowKey, type Candidate, type LoopStrategy, type LoopTenor, type SimpleStrategy, type Strategy } from '../model/strategies'
import { HIDES, hideDetail, softHide, type HideCode } from '../model/visibility'
import { parseUid } from '../model/uid'
import { EXPOSURE_ASSETS, FIAT_FLOOR, FIAT_REQUESTS, fiatOf } from '../model/assets'
import { useSettings, type Settings } from '../state/Settings'
import type { EarnPositionsResponse, LendingBook, OptimizerResponse, TokenBalance } from './types'
import { byOffer, offersFrom, type BorrowOffer, type Out } from '../model/borrow'
import { indexBalances, syncHints, type SyncHintLeg } from '../index/api'
import type { IndexBalanceItem } from '../index/types'
import { useLiveChains } from './liveBalances'
import { isEvmAddr, isEvmChain, isSolAddr, isSvmChain, normAddr } from '../model/address'
import { toRaw } from '../model/leverage'
import { historyUids, type HistoryGet } from '../model/rateHistory'
import { useHistoryFor } from './rateHistoryStore'

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
 * The cost is real and worth knowing: each entry is one earn query and one
 * vault registry per refresh, all cached ten minutes; the optimizer is asked
 * for every chain at once, so a chain adds pages, not requests.
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
  // the one non-EVM chain: a string id, no wagmi entry (docs/solana.md §B).
  // `EVM_CHAINS` below is what wallet code may iterate; everything read-only
  // treats `solana` like any other id.
  { id: 'solana', label: 'Solana' },
]
/** The chains wagmi knows — switchChain, receipt watchers, balance fallbacks. Never hand `solana` to these. */
export const EVM_CHAINS = CHAINS.filter((c) => isEvmChain(c.id))
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
 * that on its own — ran into `RATE_LIMIT_EXCEEDED`. Bundled it is 6 earn
 * requests instead of 15. The optimizer no longer uses the buckets at all: it
 * takes every chain in one query (`optimizerPages`).
 */
const SOLO_CHAINS = new Set(['1', '8453', '42161', '56', '43114'])
export function chainBuckets(chainIds: string[]): string[][] {
  const solo = chainIds.filter((c) => SOLO_CHAINS.has(c)).map((c) => [c])
  const rest = chainIds.filter((c) => !SOLO_CHAINS.has(c))
  return rest.length ? [...solo, rest] : solo
}

/**
 * The optimizer, every chain in ONE query, paged in parallel.
 *
 * The endpoint takes `chainIds` and answers a page of at most 100 (asking
 * `count=1000` still answers 100, measured 2026-10-13) with `total`, so a
 * request is the first page, then every remaining page at once. Measured that
 * day across all 16 chains: the stable archetype is 740 rows (8 pages, ~2.2 s
 * each, in parallel), LST/LRT 168, BTC 27, RWA 158 — 13 requests for the four
 * archetypes against the 24 the per-bucket fan-out used, and MORE rows: a
 * chain asked alone was cut at its first page (Ethereum has 219 stable pairs,
 * Solana 263; both used to be read at 100).
 *
 * `MAX_PAGES` bounds the wide net, which is thousands of rows (`debtTags=
 * stablecoin` alone is 2 647): sorted by APR, the tail is what nobody opens.
 */
const MAX_PAGES = 10
/**
 * One page, with one more try for anything but a 429 (which `http.ts` has
 * already waited out and retried). A cold origin page can time out or fail
 * while its siblings answer; retrying the page, not the whole query, is what
 * keeps one bad page from re-reading all eight (measured 2026-10-15: a failed
 * stable page re-ran the archetype and added 6 s to the home page).
 */
async function optimizerPage(q: OptimizerQuery): Promise<OptimizerResponse> {
  try {
    return await fetchOptimizerPairs(q)
  } catch (e) {
    if ((e as { status?: number })?.status === 429) throw e
    return fetchOptimizerPairs(q)
  }
}
/**
 * One page as its own cached query, keyed by the exact request. A book is the
 * pages it reads through the cache, so a book asked again because a page was
 * missing (`BOOK_FRESHNESS`, every 30 s) sends ONLY the missing pages — it used
 * to re-read all of them, eight stable pages a turn while one kept failing,
 * which is what ran the budget (500 / 15 min) into 429s. Failed pages are not
 * cached; `optimizerPage` has already retried once.
 */
const pageQuery = (q: OptimizerQuery) => ({ queryKey: ['opt-page', q], queryFn: () => optimizerPage(q), staleTime: 10 * 60_000, retry: false })
/** A book's rows; `partial` when a page after the first failed twice and is missing (see `useCatalog`'s refetch). */
type Paged = OptimizerResponse['items'] & { partial?: true }
async function optimizerPages(client: QueryClient, q: OptimizerQuery, maxPages = MAX_PAGES): Promise<Paged> {
  const MAX_PAGES = maxPages
  const page = (start?: number) => client.fetchQuery(pageQuery({ ...q, count: 100, start }))
  const first = await page()
  const items: Paged = [...first.items]
  if (!first.hasMore || !first.items.length) return items
  const per = first.items.length
  const total = Number(first.total)
  // no usable `total`: walk the pages one by one on `hasMore`
  if (!Number.isFinite(total) || total <= per) {
    for (let i = 1; i < MAX_PAGES; i++) {
      const r = await page(items.length).catch(() => null)
      if (!r) { items.partial = true; break }
      items.push(...r.items)
      if (!r.hasMore || !r.items.length) break
    }
    return items
  }
  const pages = Math.min(MAX_PAGES, Math.ceil(total / per))
  // what answered is kept: rows sorted by APR, a missing tail page costs the least
  const rest = await Promise.allSettled(Array.from({ length: pages - 1 }, (_, i) => page((i + 1) * per)))
  for (const r of rest) if (r.status === 'fulfilled') items.push(...r.value.items); else items.partial = true
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
 * `rwa` collateral against ANY debt (`anyDebtOnSmallChains`): 15 rows against 9,
 * the extra ones nOPAL/pUSD, nALPHA/pUSD and a few gold price bets that
 * `cross-denom` rejects anyway. The big chains keep the tag — BNB answers 159
 * rows untagged against 69, pages of price bets paid for nothing.
 */
type Archetype = Pick<OptimizerQuery, 'collateralTags' | 'debtTags' | 'includeExpired'> & { anyDebtOnSmallChains?: boolean }
const LOOP_ARCHETYPES: Archetype[] = [
  { collateralTags: ['lst', 'lrt'], debtTags: ['wnative'] },
  { collateralTags: ['stablecoin', 'savings', 'pendle'], debtTags: ['stablecoin'], includeExpired: false },
  { collateralTags: ['btc'], debtTags: ['btc'] },
  { collateralTags: ['rwa'], debtTags: ['stablecoin'], anyDebtOnSmallChains: true },
]
/**
 * The optimizer requests for the selected chains: one per archetype over every
 * chain at once, plus the untagged-debt variant over the small chains where an
 * archetype asks for it (`anyDebtOnSmallChains`, see the RWA note above). Each
 * carries the chains it covers so a chain can be called settled.
 */
function loopRequests(chainIds: string[], wideNet: boolean): { key: string; chainIds: string[]; q: Omit<OptimizerQuery, 'chainIds'> }[] {
  const small = chainIds.filter((c) => !SOLO_CHAINS.has(c))
  return [
    ...LOOP_ARCHETYPES.flatMap(({ anyDebtOnSmallChains, ...a }, i) => [
      { key: `${i}`, chainIds, q: a },
      ...(anyDebtOnSmallChains && small.length ? [{ key: `${i}-any`, chainIds: small, q: { ...a, debtTags: undefined } }] : []),
    ]),
    ...(wideNet ? WIDE_DEBT_TAGS.map((t) => ({ key: `wide-${t}`, chainIds, q: { debtTags: [t] } })) : []),
  ]
}

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
 * nobody can be shown. Cost is up to `MAX_PAGES` requests per denomination
 * (~600 kB each), which is why it is off by default.
 */
const WIDE_DEBT_TAGS = ['stablecoin', 'wnative', 'btc']

/**
 * What a chain answered, split into what can be shown and what cannot.
 *
 * `rows` are built strategies (visible or merely below a floor); `structural`
 * counts the rows there is no strategy for at all, with a few names, so a list
 * that is empty can say what it is empty OF.
 */
interface Sorted<T extends Strategy> { rows: T[]; structural: Partial<Record<HideCode, { n: number; examples: string[] }>>; kind: 'simple' | 'loop'; partial?: boolean }
function sortOut<T extends Strategy>(cands: Candidate<T>[], kind: 'simple' | 'loop', partial?: boolean): Sorted<T> {
  const rows: T[] = []
  const structural: Sorted<T>['structural'] = {}
  for (const c of cands) {
    if (c.s) { rows.push(c.s); continue }
    if (!c.hide) continue
    const cur = (structural[c.hide] ??= { n: 0, examples: [] })
    cur.n++
    if (cur.examples.length < 4 && !cur.examples.includes(c.label)) cur.examples.push(c.label)
  }
  return { rows, structural, kind, ...(partial ? { partial } : {}) }
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

/**
 * Dollar loans against what people hold (tickets/0008), as offers (`model/borrow.ts`): one
 * request per collateral family over every chain at once, each paged like the loops.
 *
 * Asked by the biggest collateral market first (`totalDepositsUsdLong`), not by the loop's net
 * yield, which says nothing about a loan; at least $1k free to borrow (a stock market is asked
 * with no floor — Robinhood's are small and are said to be). Measured 2026-10-14 over all
 * chains: stocks 261 pairs, wrapped native 166, BTC 316, LST/LRT 548; ether (2026-10-15) 171,
 * most of them the wrapped-native rows again (they fold by offer id). The crypto families are
 * capped at three pages each: the tail is markets nobody has put anything into.
 *
 * The STOCK request is also the catalogue's (`useCatalog`): every stock token it names is noted
 * as a stock (`noteStock`) and its address joins the balance read, so a wallet's TSLAx shows up.
 */
const STOCK_BORROW: Omit<OptimizerQuery, 'chainIds'> = { collateralAssetClasses: ['stocks'], debtTags: ['stablecoin'], sortBy: 'totalDepositsUsdLong', sortDir: 'DESC', minBorrowLiquidityUsd: 0, maxConfigRiskScore: 5 }
const CRYPTO_BORROW: { key: string; q: Omit<OptimizerQuery, 'chainIds'> }[] = [
  { key: 'native', q: { collateralTags: ['wnative'], debtTags: ['stablecoin'] } },
  { key: 'btc', q: { collateralTags: ['btc'], debtTags: ['stablecoin'] } },
  // ether where it is not the gas coin (bridged ETH on BNB, Avalanche, Monad, Polygon, Plasma, Arc):
  // `wnative` names only the wrapped gas coin, so these were in no request — 62 pairs with $1k+ to lend
  // (2026-10-15), Aave V4's WETH → USDC on Arc ($35m free) among them
  { key: 'eth', q: { collateralTags: ['eth'], debtTags: ['stablecoin'] } },
  { key: 'lst', q: { collateralTags: ['lst', 'lrt'], debtTags: ['stablecoin'] } },
].map((x) => ({ ...x, q: { ...x.q, sortBy: 'totalDepositsUsdLong', sortDir: 'DESC', minBorrowLiquidityUsd: 1000 } as Omit<OptimizerQuery, 'chainIds'> }))
/**
 * What a non-dollar take-out asks the pairs route for (tickets/0011): the debt tags of each family.
 * `eth` / `btc` are the canonical coins only, so the staked forms are asked by name; `wnative` is
 * every chain's wrapped gas coin (WBNB, WAVAX, SOL…), WETH among them — the duplicate folds by id.
 */
const OUT_DEBT_TAGS: Record<Exclude<Out, 'USD'>, string[]> = { ETH: ['eth', 'lst', 'lrt'], BTC: ['btc'], MORE: ['wnative'] }
const STOCK_PAGES = 5
const CRYPTO_PAGES = 3
/**
 * A borrow family in two queries: page 1 on its own (its `pageQuery`), and the whole book, which reads
 * every page through the cache (page 1 never twice) and then the pages its `total` calls for. The list shows page 1
 * while the rest load — rows by the biggest collateral market first, so the category pills and the
 * top of the list are already the final ones. Measured 2026-10-15 over all chains, warm: every page
 * 1 in 0.3–1.4 s, the pages after it 2–3.5 s more (a later page is cold more often), so the pills
 * waited ~3 s on the slowest page of the fastest family; now on its first page.
 */
const borrowBook = (key: string[], q: OptimizerQuery, pages: number, enabled: boolean) => {
  return {
    first: { ...pageQuery({ ...q, count: 100, start: undefined }), enabled, select: firstOffers },
    book: {
      queryKey: key,
      queryFn: async ({ client }: QueryFunctionContext) => offersFrom(await optimizerPages(client, q, pages)),
      staleTime: 10 * 60_000,
      enabled,
    },
  }
}
const firstOffers = (r: OptimizerResponse) => offersFrom(r.items)
const stockBook = (chainIds: string[]) => borrowBook(['borrow-offers', 'stocks', chainIds.join(',')], { chainIds, ...STOCK_BORROW }, STOCK_PAGES, chainIds.length > 0)
/**
 * Every dollar loan on the selected chains. `crypto: false` asks only the stocks (which the
 * catalogue holds anyway): a page that shows stock offers alone need not pay for the rest.
 *
 * `out` (tickets/0011) adds the loans that pay out in another family — ether, bitcoin, a native
 * coin — asked only once a "Take out" picker names it: the same four collateral families against
 * that family's debt tags, two pages each (these markets are thinner than the dollar ones). The
 * dollar offers are always there: every headline, room and pick is a dollar figure.
 */
export function useBorrowOffers(chainIds: string[], o: { crypto?: boolean; out?: Out } = {}) {
  const crypto = o.crypto ?? true
  const out = o.out && o.out !== 'USD' ? o.out : null
  const families = [
    stockBook(chainIds),
    ...CRYPTO_BORROW.map((r) => borrowBook(['borrow-offers', r.key, chainIds.join(',')], { chainIds, ...r.q }, CRYPTO_PAGES, crypto && chainIds.length > 0)),
    ...[...CRYPTO_BORROW, { key: 'stocks', q: STOCK_BORROW }].map((r) => borrowBook(['borrow-offers', r.key, `out:${out ?? '-'}`, chainIds.join(',')], { chainIds, ...r.q, debtTags: OUT_DEBT_TAGS[out!] }, 2, !!out && chainIds.length > 0 && (crypto || r.key === 'stocks'))),
  ]
  const books = useQueries({ queries: families.map((f) => f.book) })
  const firsts = useQueries({ queries: families.map((f) => f.first) })
  // each family's whole book once it is in, its first page until then
  const got = books.map((q, i) => q.data ?? firsts[i].data)
  const stamp = [...books, ...firsts].map((q) => q.dataUpdatedAt).join('|')
  const offers = useMemo(() => {
    const by = new Map<string, BorrowOffer>()
    for (const o of got.flatMap((d) => d ?? [])) if (!by.has(o.id)) by.set(o.id, o)
    return [...by.values()].sort(byOffer)
  }, [stamp]) // eslint-disable-line react-hooks/exhaustive-deps
  return {
    offers,
    // until every book is whole: a list empty on the first pages may still fill from a later one.
    // (a disabled query is never `isLoading` in v5: the families nobody asked for do not hold the list)
    isLoading: books.some((q) => q.isLoading),
    error: books.find((q) => q.error)?.error ?? null,
  }
}

/**
 * A book with a page missing (`optimizerPages`' `partial`) is shown, and asked
 * again in 30 s, rather than kept as the answer for ten minutes.
 */
type Freshness = { state: { data?: { partial?: boolean } } }
const BOOK_FRESHNESS = {
  staleTime: (q: Freshness) => (q.state.data?.partial ? 0 : 10 * 60_000),
  refetchInterval: (q: Freshness) => (q.state.data?.partial ? 30_000 : false as const),
}
const loopBook = async (client: QueryClient, q: OptimizerQuery) => { const r = await optimizerPages(client, q); return sortOut(r.map(classifyPair), 'loop', r.partial) }
/** The catalogue's loop requests, as asked (worker-api pre-warms these: `prewarmBooks`). */
const loopQuery = (r: ReturnType<typeof loopRequests>[number]): OptimizerQuery => ({ chainIds: r.chainIds, ...r.q, collateralAmountUsd: 10_000, minBorrowLiquidityUsd: 0 })
const exposureLoopQuery = (e: (typeof EXPOSURE_ASSETS)[number]): OptimizerQuery => ({ chainIds: [e.chainId], collaterals: [e.address], debtTags: ['stablecoin'], collateralAmountUsd: 10_000, minBorrowLiquidityUsd: 0 })
/**
 * Every pair-book request a first visit makes at the defaults (all chains,
 * wide net off), with its page cap: the catalogue's loops, the exposure
 * asset's loops and the dollar loans. worker-api's cron pre-warms exactly
 * these (`scheduled/prewarmListings.ts`, `PREWARM_PAGED`), so its cache is
 * warm when a visitor arrives; `pnpm prewarm-check` prints them to diff.
 */
export function prewarmBooks(chainIds = CHAINS.map((c) => c.id)): { q: OptimizerQuery; pages: number }[] {
  return [
    ...loopRequests(chainIds, false).map((r) => ({ q: loopQuery(r), pages: MAX_PAGES })),
    ...EXPOSURE_ASSETS.filter((e) => chainIds.includes(e.chainId)).map((e) => ({ q: exposureLoopQuery(e), pages: MAX_PAGES })),
    { q: { chainIds, ...STOCK_BORROW }, pages: STOCK_PAGES },
    ...CRYPTO_BORROW.map((r) => ({ q: { chainIds, ...r.q }, pages: CRYPTO_PAGES })),
  ]
}

/** A row that a floor is holding back, carrying the code that says which one. */
export type HiddenRow = Strategy & { hide: HideCode }

/**
 * Both listings for the selected chains, normalised and curated. Chains load in
 * parallel and merge as they land.
 *
 * Three of the floors are part of the REQUEST — `minTvlUsd` is the earn
 * listing's own filter (asking for everything costs 3.8 MB on Ethereum against
 * 2.6 MB, measured 2026-09-24), `showCollateral` adds its passthrough rows and
 * `wideNet` adds optimizer requests — so they
 * are in the query keys and moving them refetches. Every other floor is
 * applied HERE, to rows already in hand, so the list can count what it is
 * holding back and let it in without a round trip. That is why the optimizer
 * is asked with no risk cap and no liquidity floor: both cost nothing extra
 * upstream (measured: identical row counts) and both become instant switches.
 */
export function useCatalog(chainIds: string[]) {
  const { st } = useSettings()
  const buckets = chainBuckets(chainIds)
  const earn = useQueries({
    queries: buckets.map((ids) => ({
      queryKey: ['earn-rows', ids.join(','), st.minTvlUsd, st.showCollateral],
      queryFn: async () => (await fetchEarn({ chainIds: ids, count: 1000, maxRiskScore: 5, minTvlUsd: st.minTvlUsd, passthrough: st.showCollateral })).items,
      staleTime: 10 * 60_000,
    })),
  })
  const loopReqs = loopRequests(chainIds, st.wideNet)
  const loops = useQueries({
    queries: loopReqs.map((r) => ({
      queryKey: ['loops', r.chainIds.join(','), r.key],
      queryFn: ({ client }: QueryFunctionContext) => loopBook(client, loopQuery(r)),
      ...BOOK_FRESHNESS,
    })),
  })
  /**
   * The exposure assets (`EXPOSURE` in assets.ts — JLP), asked for by name on their home chain.
   * No archetype finds them: JLP carries no tag, and its deposits pay only the token's own yield,
   * which the listing leaves out by default. Two narrow requests per asset: its deposits (the 1×)
   * and its loops against every stablecoin debt (`classifyPair` keeps the monies it allows).
   */
  const exposed = EXPOSURE_ASSETS.filter((e) => chainIds.includes(e.chainId))
  const exposure = useQueries({
    queries: exposed.flatMap((e) => [
      {
        queryKey: ['exposure-earn', e.chainId, e.sym, st.minTvlUsd],
        queryFn: async () => sortOut((await fetchEarn({ chainIds: [e.chainId], count: 1000, maxRiskScore: 5, minTvlUsd: st.minTvlUsd, assetSymbol: e.sym, passthrough: true })).items.map(classifyEarn), 'simple') as Sorted<Strategy>,
        staleTime: 10 * 60_000,
      },
      {
        queryKey: ['exposure-loops', e.chainId, e.sym],
        queryFn: async ({ client }: QueryFunctionContext) => (await loopBook(client, exposureLoopQuery(e))) as Sorted<Strategy>,
        ...BOOK_FRESHNESS,
      },
    ]),
  })
  /**
   * Exponent's PTs (Solana), as loop collateral. Upstream tags them with none of the archetypes'
   * flags — `props.exponent`, no `pendle` — so the stable archetype never returns them, and
   * `collateralTags=exponent` answers nothing (measured 2026-10-06). The earn listing names every
   * one (`vault.exponent`, `ref` = the PT mint; not depositable there, the PT is bought inside the
   * loop), so ask for exactly those mints: one request per chain, 9 pairs on Solana that day —
   * PT-ONyc on Loopscale, PT-eUSX / PT-USX on Kamino, two SOL PTs.
   */
  const earnStamp = earn.map((q) => q.dataUpdatedAt).join('|')
  const ptMints = useMemo(() => {
    const by: Record<string, string[]> = {}
    for (const q of earn) for (const m of q.data ?? []) if (m.venue === 'vault.exponent') (by[m.chainId] ??= []).push(m.ref)
    return Object.entries(by).map(([chainId, refs]) => ({ chainId, refs: [...new Set(refs)].sort() }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earnStamp])
  const ptLoops = useQueries({
    queries: ptMints.map(({ chainId, refs }) => ({
      queryKey: ['pt-loops', chainId, refs.join(',')],
      queryFn: async ({ client }: QueryFunctionContext) => (await loopBook(client, { chainIds: [chainId], collaterals: refs, debtTags: ['stablecoin', 'wnative'], collateralAmountUsd: 10_000, minBorrowLiquidityUsd: 0 })) as Sorted<Strategy>,
      ...BOOK_FRESHNESS,
    })),
  })
  /**
   * The euro, franc and pound below the menu's size floor, down to their own (`FIAT_FLOOR`): asked
   * by issuer, every chain in one request, and kept only where the API names one of those monies.
   * What the main listing already holds (at or over its floor) is left to it. 2026-10-19 this added
   * ZCHF's two smaller savings vaults, VCHF on Base, and a dozen EURC / EURCV markets.
   */
  const fiatReqs = st.minTvlUsd > FIAT_FLOOR && chainIds.length ? FIAT_REQUESTS : []
  const fiat = useQueries({
    queries: fiatReqs.map((q) => ({
      queryKey: ['fiat-earn', chainIds.join(','), q.key, st.minTvlUsd, st.showCollateral],
      queryFn: async () => {
        const r = await fetchEarn({ chainIds, count: 1000, maxPages: 1, maxRiskScore: 5, minTvlUsd: FIAT_FLOOR, issuers: q.issuers, issuerMatch: q.issuerMatch, assetSymbol: q.assetSymbol, passthrough: st.showCollateral })
        return sortOut(r.items.filter((m) => fiatOf(m.asset.denomination) && (m.tvl?.usd ?? 0) < st.minTvlUsd).map(classifyEarn), 'simple') as Sorted<Strategy>
      },
      staleTime: 10 * 60_000,
    })),
  })
  const extra = [...exposure, ...ptLoops, ...fiat]
  // the stock loans (tickets/0009): the request that teaches the app which tokens are stocks
  // (`noteStock`, run as the offers are read) — so it lands before anything is classified by it
  const stocks = useQuery(stockBook(chainIds).book)
  // one stamp for "any answer changed": this hook runs in the header, the
  // feed and Hot at once, and every catalogue query landing re-renders all three
  const stamp = [chainIds.join(','), stocks.dataUpdatedAt, ...[...earn, ...loops, ...extra].map((q) => q.dataUpdatedAt)].join('|')
  const earnSorted = useMemo(() => {
    return earn.map((q) => (q.data ? sortOut(q.data.map((m) => classifyEarn(m)), 'simple') : undefined))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp])
  const derived = useMemo(() => {
    const exposureRows = extra.flatMap((q) => q.data?.rows ?? [])
    const earnRows = [...earnSorted.flatMap((d) => d?.rows ?? []), ...exposureRows.filter((r): r is SimpleStrategy => r.kind === 'simple')]
    const loopRows = [...loops.flatMap((q) => q.data?.rows ?? []), ...exposureRows.filter((r): r is LoopStrategy => r.kind === 'loop')]
    // every base-asset address the chain answered, shown or held back by a floor,
    // so moving a floor never changes what the balance read asks for
    const addresses: Record<string, string[]> = {}
    for (const r of [...earnRows, ...loopRows]) (addresses[r.chainId] ??= []).push(...(r.kind === 'simple' ? [r.assetAddress] : [r.collateralAddress, r.debtAddress]))
    // stock tokens a market lends against: held in a wallet, they are what a loan is taken against.
    // Kept apart: an EVM read is capped at 60 assets, and they only fill what the catalogue leaves
    const extraAddresses: Record<string, string[]> = {}
    for (const o of stocks.data ?? []) (extraAddresses[o.chainId] ??= []).push(o.collateral.address)
    const { show: simpleShow, hide: simpleHide } = split(earnRows, st)
    const { show: loopShow, hide: loopHide } = split(loopRows, st)
    const simple = capPerAsset(dedupe(simpleShow))
    // a dated pair's maturities fold into one row with a date picker (`foldDates`)
    const folded = foldDates(dedupe(loopShow))
    const loopRowsOut = capPerAsset(folded.rows)
    // a hidden row that is another spelling of a visible one is noise: the same
    // market on the same venue, kept out by `dedupe` and then handed back by the
    // `+` as a duplicate
    const shown = new Set([...simple, ...loopRowsOut].map(rowKey))
    /**
     * The rows the per-asset cap dropped. The menu never shows them — the cap
     * keeps the 30 highest rates per asset, which is right for browsing — but
     * a ticket must still OPEN one: a profile's Copy button copies what that
     * wallet holds, and a blue-chip vault at 4 % is exactly what a rate-ranked
     * cap cuts first (pos-indexer tickets/0057 §F). Never rendered as a list.
     */
    const overflow: Strategy[] = [
      ...dedupe(simpleShow).filter((r) => !shown.has(rowKey(r))),
      ...folded.rows.filter((r) => !shown.has(rowKey(r))),
      ...folded.rest,
    ]
    const hidden: HiddenRow[] = [
      ...capPerAsset(dedupe(simpleHide.filter((r) => !shown.has(rowKey(r)))), 25),
      ...capPerAsset(dedupe(loopHide.filter((r) => !shown.has(rowKey(r)))), 25),
    ]
    const structural = mergeStructural([...earnSorted, ...loops.map((q) => q.data), ...extra.map((q) => q.data)].flatMap((d) => (d ? [{ structural: d.structural, kind: d.kind }] : [])))
    /**
     * Every deposit row the listing answered, before `dedupe` keeps one per venue and asset: the
     * Stocks shelf's lend side is a particular market (Kamino's xStocks USDC), and on a venue with
     * twenty USDC markets the one-per-venue row is rarely it. Never rendered as the menu.
     */
    const earnAll = earnRows
    return { simple, loops: loopRowsOut, hidden, overflow, structural, addresses, extraAddresses, earnAll }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earnSorted, stamp, st])
  // A chain is SETTLED once every request covering it has answered (or failed):
  // only then is its list of token addresses final, and only then is its
  // balance read worth sending (see `useBalancesPerChain`). The registry is not
  // one of them — it names rows, it does not add any.
  const exposurePending = new Set(exposed.filter((_, i) => !exposure[2 * i]?.isFetched || !exposure[2 * i + 1]?.isFetched).map((e) => e.chainId))
  ptMints.forEach((m, i) => { if (!ptLoops[i]?.isFetched) exposurePending.add(m.chainId) })
  if (fiat.some((q) => !q.isFetched)) for (const c of chainIds) exposurePending.add(c)
  const loopsPending = new Set(loopReqs.flatMap((r, i) => (loops[i]?.isFetched ? [] : r.chainIds)))
  // a chain is not settled before the stock request answers: its balance read would miss the stock tokens
  const depositsIn = new Set(buckets.flatMap((ids, j) => (earn[j]?.isFetched ? ids : [])))
  const settled = new Set([...depositsIn].filter((c) => !exposurePending.has(c) && !loopsPending.has(c) && (stocks.isFetched || !stocks.isFetching)))
  /**
   * The same, per kind of row, for a page that can show one kind before the
   * others (Start's bands): the deposit listing, the loop archetypes, and the
   * PT loops (asked only once the deposit listing has named the PTs).
   */
  const ptPending = new Set(ptMints.flatMap((m, i) => (ptLoops[i]?.isFetched ? [] : [m.chainId])))
  const phases = {
    deposits: depositsIn,
    loops: new Set(chainIds.filter((c) => !loopsPending.has(c))),
    pts: new Set([...depositsIn].filter((c) => !ptPending.has(c))),
  }
  return {
    ...derived, settled, phases,
    isLoading: earn.some((q) => q.isLoading) || loops.some((q) => q.isLoading),
    isFetching: earn.some((q) => q.isFetching) || loops.some((q) => q.isFetching) || extra.some((q) => q.isFetching),
    anyData: earn.some((q) => q.data) || loops.some((q) => q.data),
    errors: [...earn, ...loops, ...extra].map((q) => q.error).filter((e): e is Error => !!e),
  }
}
/**
 * Everything the API can do with ONE token, for its asset page (docs/asset-info-plan.md 2.3).
 *
 * The page used to filter the Earn menu (`useCatalog`), which only holds what the menu's
 * requests happened to ask for: loops by archetype tag, deposits without the passthrough
 * ones, the chains in scope. So a token's page missed every row the menu never fetched.
 * This asks about the token itself, on every chain it lives on:
 *
 *   - one `/v1/data/earn?assetGroup=<group>&passthrough=include` — its lending and collateral
 *     deposits, the ones paying only its own yield included;
 *   - one `/v1/data/earn?shareGroup=<group>` — the vaults that mint it (Nest's savings vault
 *     for nOPAL), by the `shareToken` the API stamps from the token lists;
 *   - one `pairs/optimize?collaterals=<its addresses>&includeIlliquid=true&maxConfigRiskScore=5`
 *     per chain — every loop with it as collateral, tagged or not, any debt, an empty one and a
 *     score-5 one too (`classifyPair` still refuses a price bet; `softHide` marks the empty one
 *     `thin-borrow` and the score-5 one `risky`; the API's default ceiling is 4).
 *
 * No floor cuts a row here: a row the menu would hold back comes with `held` (the code that
 * would hide it), so the page can show it muted with its reason. Rows that cannot be a
 * strategy at all (`closed`, `unmapped`, `cross-denom` …) are counted in `structural`.
 * `members`: the token's (chain, address) pairs from the index's asset answer.
 */
export function useAssetStrategies(group: string | undefined, members: { chainId: string; address: string }[] | undefined, scope?: string[]) {
  const { st } = useSettings()
  const known = new Set(CHAINS.map((c) => c.id))
  const inScope = (c: string) => known.has(c) && (!scope || scope.includes(c))
  const byChain: Record<string, string[]> = {}
  for (const m of members ?? []) if (inScope(m.chainId)) (byChain[m.chainId] ??= []).push(m.address)
  const chains = Object.keys(byChain).sort()
  // no members (the index could not answer): ask the deposits on every chain in scope, no loops
  const earnChains = chains.length ? chains : CHAINS.map((c) => c.id).filter(inScope)
  const earn = useQuery({
    enabled: !!group && earnChains.length > 0,
    queryKey: ['asset-earn', group, earnChains.join(',')],
    queryFn: async () => sortOut((await fetchEarn({ chainIds: earnChains, count: 1000, maxRiskScore: 5, minTvlUsd: 0, assetGroup: group, passthrough: true })).items.map(classifyEarn), 'simple'),
    staleTime: 10 * 60_000,
  })
  // the vaults that MINT it: deposit USDC, hold nOPAL. Every chain in scope, not only the token's
  // known members: a share chain the index has not seen yet still counts. An API that predates
  // `shareGroup=` ignores it and answers the whole listing — so ONE page of 200, never the four
  // pages a full read would take, and only rows whose share IS the group stay.
  const minted = useQuery({
    enabled: !!group,
    queryKey: ['asset-minted', group, scope?.join(',') ?? 'all'],
    queryFn: async () => sortOut((await fetchEarn({ chainIds: CHAINS.map((c) => c.id).filter(inScope), count: 200, maxPages: 1, maxRiskScore: 5, minTvlUsd: 0, shareGroup: group }))
      .items.filter((m) => m.shareToken?.assetGroup === group).map(classifyEarn), 'simple'),
    staleTime: 10 * 60_000,
  })
  const loops = useQueries({
    queries: chains.map((chainId) => ({
      queryKey: ['asset-loops', chainId, [...byChain[chainId]].sort().join(',')],
      queryFn: async ({ client }: QueryFunctionContext) => sortOut((await optimizerPages(client, { chainIds: [chainId], collaterals: byChain[chainId], collateralAmountUsd: 10_000, minBorrowLiquidityUsd: 0, includeIlliquid: true, maxConfigRiskScore: 5 })).map(classifyPair), 'loop'),
      staleTime: 10 * 60_000,
    })),
  })
  const stamp = [earn.dataUpdatedAt, minted.dataUpdatedAt, ...loops.map((q) => q.dataUpdatedAt)].join('|')
  const out = useMemo(() => {
    const simple = dedupe([...(earn.data?.rows ?? []), ...(minted.data?.rows ?? [])])
    const folded = foldDates(dedupe(loops.flatMap((q) => q.data?.rows ?? [])))
    const rows: Strategy[] = [...simple, ...folded.rows]
    const held = new Map<string, HideCode>()
    for (const r of rows) { const h = softHide(r, st); if (h) held.set(r.id, h) }
    const structural = mergeStructural([earn.data, minted.data, ...loops.map((q) => q.data)].flatMap((d) => (d ? [{ structural: d.structural, kind: d.kind }] : [])))
    return { rows, held, structural }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, st])
  return {
    ...out,
    isLoading: earn.isLoading || minted.isLoading || loops.some((q) => q.isLoading),
    errors: [earn, minted, ...loops].map((q) => q.error).filter((e): e is Error => !!e),
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

/**
 * The asset list a balance read sends: native always (the zero address on EVM;
 * the Solana route answers the native row unasked), then the catalogue's,
 * sorted so the key is stable. Base58 keeps its case.
 */
const balanceAssets = (addresses: string[], chainId?: string, extra: string[] = []) => {
  const base = [...new Set([...(isSvmChain(chainId) ? [] : ['0x0000000000000000000000000000000000000000']), ...addresses.filter(Boolean).map((a) => normAddr(a))])].sort()
  // `extra` (stock tokens, tickets/0009) only takes the room the catalogue leaves under the cap
  const more = [...new Set(extra.filter(Boolean).map((a) => normAddr(a)))].filter((a) => !base.includes(a)).sort()
  const all = isSvmChain(chainId) ? [...base, ...more].sort() : [...base, ...more.slice(0, Math.max(0, 60 - base.length))].sort()
  // the 60 cap is an EVM bound (`eth_call` cannot enumerate; the route caps `assets`). On Solana the
  // list is only a FILTER over the owner's own token accounts, and a sorted base58 cut dropped every
  // mint past the 60th — wSOL and every lower-case mint (mSOL, …) on a 94-mint catalogue.
  return isSvmChain(chainId) ? all : all.slice(0, 60)
}
/** The Solana balance read's whole-wallet ask: no `assets` filter (see `useBalancesPerChain`). */
const SVM_ALL = '*'
/** Can this account sign / hold on this chain? One account per VM (docs/solana.md §5). */
const accountFits = (account: string | undefined, chainId: string) =>
  !!account && (isSvmChain(chainId) ? isSolAddr(account) : isEvmAddr(account))
/**
 * The account per VM. `useApp().account` is ONE address — the EVM wallet when both are connected —
 * so passing it alone read nothing on Solana for a user holding both wallets.
 */
export interface VmAccounts { evm?: string; sol?: string }
export const accountOn = (a: VmAccounts, chainId: string): string | undefined => (isSvmChain(chainId) ? a.sol : a.evm)
/** Idle balances: one request per chain for the addresses the catalogue knows (native always at the zero address). */
export function useBalances(account: string | undefined, chainId: string, addresses: string[]) {
  const assets = balanceAssets(addresses, chainId)
  return useQuery({
    enabled: accountFits(account, chainId) && assets.length > 0,
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
const isZeroRaw = (raw: string | null | undefined) => !!raw && /^0+$/.test(raw)

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
 *
 * Settling waits on the slowest pair book (ten pages: 2–6 s), so a FIRST look goes out at once,
 * before any list: the same POST with no asset list per chain answers every token the index holds
 * for the wallet there (`held`). A complete chain shows those rows straight away; the settled read
 * then adds what the index does not read (live) and takes over every row it answers. What only the
 * first look names stays — a held token in no catalogue row is still held. A chain marked live
 * (`liveBalances.ts`) never takes it: right after a transaction the index may be behind.
 */
export function useBalancesPerChain(accounts: VmAccounts, chains: { chainId: string; addresses: string[]; extra?: string[]; ready: boolean }[]) {
  const live = useLiveChains()
  const account = accounts.evm
  // a chain whose VM the account cannot hold on reads nothing: an EVM wallet
  // has no Solana balances and the routes reject the address shape
  const settled = chains.filter((c) => c.ready && accountFits(accountOn(accounts, c.chainId), c.chainId))
  // the index's balance POST is the EVM index's; Solana reads live only
  const asked = Object.fromEntries(settled.filter((c) => isEvmChain(c.chainId)).map((c) => [c.chainId, balanceAssets(c.addresses, c.chainId, c.extra)]))
  const idx = useQuery({
    enabled: !!account && Object.keys(asked).length > 0,
    queryKey: ['balances-index', account, JSON.stringify(asked)],
    queryFn: ({ signal }) => indexBalances(account!, asked, signal),
    staleTime: 15_000,
    refetchInterval: 60_000,
    retry: 1,
    placeholderData: keepPreviousData,
  })
  const evmChains = chains.filter((c) => isEvmChain(c.chainId) && accountFits(account, c.chainId)).map((c) => c.chainId)
  const held = useQuery({
    enabled: !!account && evmChains.length > 0,
    queryKey: ['balances-index-held', account, evmChains.join(',')],
    queryFn: ({ signal }) => indexBalances(account!, Object.fromEntries(evmChains.map((c) => [c, []])), signal),
    staleTime: 15_000,
    refetchInterval: 60_000,
    retry: 1,
    placeholderData: keepPreviousData,
  })
  const plans = chains.map(({ chainId, addresses, extra, ready: catReady }) => {
    const acct = accountOn(accounts, chainId)
    const fits = accountFits(acct, chainId)
    // Solana's route lists the owner's own token accounts, so it needs no asset list — and asked
    // without one it need not wait for the catalogue: `solana` rides the bundle of every small
    // chain, whose optimizer pages held its balances (a loop's residual collateral) back for
    // seconds. `idleFrom` keeps only whitelisted mints, as the catalogue filter did.
    const svm = isSvmChain(chainId)
    const ready = svm || catReady
    const all = fits ? (svm ? [SVM_ALL] : balanceAssets(addresses, chainId, extra)) : []
    const c = idx.data?.chains.find((x) => x.chainId === chainId)
    const fromIdx = !!c && c.state === 'complete' && !live.has(chainId) && !idx.isError
    const indexItems: TokenBalance[] = []
    const liveAssets = new Set<string>(fromIdx ? c!.unknownAssets ?? [] : all)
    // a row the index answers ZERO for needs no decimals: nothing is held, so nothing is read live
    // (2026-10-15: every chain listed a few `0` rows without decimals, and each sent its chain live)
    if (fromIdx) for (const i of c!.items) { const b = fromIndex(i); if (b) indexItems.push(b); else if (!isZeroRaw(i.balanceRaw)) liveAssets.add(normAddr(i.address)) }
    // wait for the index's answer before reading live (one request instead of fifteen); while a
    // new key is in flight, the previous answer decides for the chains it already carries.
    // Solana is never in the POST, so it never waits on it.
    const decided = ready && (!acct || !fits || isSvmChain(chainId) || idx.isError || (!!idx.data && (!idx.isPlaceholderData || !!c)))
    const h = held.data?.chains.find((x) => x.chainId === chainId)
    const heldItems = h && h.state === 'complete' && !live.has(chainId) && !held.isError ? h.items.map(fromIndex).filter((b): b is TokenBalance => !!b) : []
    return { chainId, acct, ready, fromIdx, indexItems, heldItems, liveAssets: [...liveAssets].sort(), decided }
  })
  const liveQs = useQueries({
    queries: plans.map((p) => ({
      enabled: !!p.acct && p.decided && p.liveAssets.length > 0,
      queryKey: ['balances', p.acct, p.chainId, p.liveAssets.join(',')],
      // a chain read live is read for the chain's truth: never the browser's 15 s copy
      queryFn: () => fetchTokenBalances(p.acct!, p.chainId, p.liveAssets.filter((a) => a !== SVM_ALL), live.has(p.chainId)),
      staleTime: 30_000,
      placeholderData: keepPreviousData,
    })),
  })
  return plans.map((p, i) => {
    const q = liveQs[i]
    const needLive = p.liveAssets.length > 0
    // the index's rows first; a live row fills what the index did not answer (the live route
    // always adds the native coin, which the index already carries on a complete chain)
    const have = new Set(p.indexItems.map((b) => normAddr(b.address)))
    const items = [...p.indexItems, ...(q.data?.items ?? []).filter((b) => !have.has(normAddr(b.address)))]
    // the first look fills what the settled read has not answered (all of it, before that read)
    for (const b of items) have.add(normAddr(b.address))
    items.push(...p.heldItems.filter((b) => !have.has(normAddr(b.address))))
    const done = p.decided && (!needLive || !!q.data || q.isError)
    return {
      data: done || items.length ? { items } : undefined,
      isLoading: !!p.acct && p.ready && !done,
      isFetched: done,
      fetchStatus: (idx.fetchStatus === 'fetching' || q.fetchStatus === 'fetching' ? 'fetching' : 'idle') as 'fetching' | 'idle',
      source: p.fromIdx ? (needLive ? 'index+live' : 'index') : 'live',
    }
  })
}
/**
 * `/v1/data/earn/positions` for `solana` (UNIFIED_API_PLAN §4.2, phase 5c):
 * worker-api serves a base58 account since 2026-10-02 — the lending half
 * through `/lending/user-positions`' Solana branch, the vault half from the
 * owner's share-token balances (jl tokens, eUSX / strcUSX, Huma PST, LSTs,
 * Exponent PTs). Not served there: Loopscale vault LP and exit requests in
 * flight. The hard rule holds: what the user acts on is read live.
 */
export const SOL_POSITIONS_READY = true
/**
 * What the live read found, as the index's sync hints (pos-indexer tickets/0071): each lending leg
 * by its lender + market uid, each vault by its `vault.*` uid. A leg holding nothing is left out.
 */
export function hintLegs(items: EarnPositionsResponse['items']): SyncHintLeg[] {
  const out: SyncHintLeg[] = []
  for (const p of items) {
    if (!isEvmChain(p.chainId)) continue
    if (p.venueKind === 'vault') {
      if (p.earnUid?.startsWith('vault.')) out.push({ chainId: p.chainId, lender: p.earnUid.split(':')[0], marketUid: p.earnUid })
      continue
    }
    for (const l of [...p.legs, ...p.subAccounts.flatMap((a) => a.legs)])
      if (l.marketUid && (l.depositsUsd > 0 || l.debtUsd > 0 || l.deposits !== '0' || l.debt !== '0')) out.push({ chainId: p.chainId, lender: p.lender, marketUid: l.marketUid })
  }
  return out
}
/**
 * Another wallet's live read, for the index and never shown: its legs go to the index as sync
 * hints (`useAccountSync` with this `source`), so a position the ledger never saw gets read and
 * lands on the wallet's page from the index like the rest. The buckets of `useEarnPositions`, but
 * no hint post per bucket: the index takes one write per account per five minutes, so every
 * bucket's legs go in one post.
 */
export const LIVE_HINTS = 'live-hints'
export function useLiveHintReads(account: string | undefined, chainIds: string[]) {
  useQueries({
    queries: chainBuckets(chainIds.filter(isEvmChain)).map((ids) => ({
      enabled: !!account && isEvmAddr(account),
      queryKey: [LIVE_HINTS, account, ids.join(',')],
      queryFn: () => fetchEarnPositions(account!, ids),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  })
}
/**
 * Positions, in the same buckets as the catalogue: the big chains alone, the
 * rest in one request. One request for every chain was the slowest answer on
 * the page (a single slow chain held up all of them); fifteen would spend the
 * rate limit. Buckets land as they come, so the big chains show first.
 */
export function useEarnPositions(accounts: VmAccounts, chainIds: string[]) {
  // one account per VM: the EVM account is asked about the EVM chains, the
  // Solana one about `solana` — the route rejects the other shape. Separate
  // buckets per VM, since one request carries one account.
  const evm = chainIds.filter((id) => isEvmChain(id) && accountFits(accounts.evm, id))
  const sol = SOL_POSITIONS_READY ? chainIds.filter((id) => isSvmChain(id) && accountFits(accounts.sol, id)) : []
  const reqs = [...chainBuckets(evm).map((ids) => ({ account: accounts.evm!, ids })), ...(sol.length ? [{ account: accounts.sol!, ids: sol }] : [])]
  const qs = useQueries({
    queries: reqs.map(({ account, ids }) => ({
      enabled: !!account && ids.length > 0,
      queryKey: ['earn-positions', account, ids.join(',')],
      queryFn: async () => {
        // past the browser cache (`max-age=15`): a reload right after a transaction would
        // otherwise be handed the answer from before it
        const r = await fetchEarnPositions(account, ids, {}, true)
        if (isEvmAddr(account)) syncHints(account, hintLegs(r.items))
        return r
      },
      staleTime: 60_000,
    })),
  })
  // one stamp, never the answers themselves as deps: their count changes when a wallet connects
  // (none → one per bucket), and React compares only the shorter list — from no buckets that is
  // nothing, so the memo kept its empty list for good. A Solana wallet reconnecting after the first
  // render never showed a position, the one a transaction had just opened included.
  const stamp = reqs.map((r, i) => `${r.account}:${r.ids.join(',')}:${qs[i]?.dataUpdatedAt ?? 0}`).join('|')
  const items = useMemo(() => qs.flatMap((q) => q.data?.items ?? []), [stamp]) // eslint-disable-line react-hooks/exhaustive-deps
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
/**
 * A row the menu does not hold, asked for on its own — so a position can be
 * copied (or added to) although the catalogue never listed it.
 *
 * The catalogue asks the optimizer at `collateralAmountUsd: 10_000`, which
 * DROPS a pair that cannot fill that size (a Jupiter Lend vault with $36 of
 * USDC left to borrow simply is not in the answer), pages by rate, and asks
 * only by tag. The narrow request here asks by the collateral's address with no
 * size and no floor; a deposit is asked by its token's symbol. Either way the
 * row goes through the same `classify*`: what it cannot build (a price bet, a
 * basket, a fixed-term debt) stays unbuilt, and says why.
 *
 * `by` is what the request is narrowed by: the collateral token's address for
 * a loop (`l:<long>|<short>`), the token's symbol for a deposit (`s:<earnUid>`).
 */
export interface OffMenuRef { id: string; by: string }
export type OffMenuRow = Candidate<Strategy> | null
const sameUid = (a: string, b: string) => a === b || (isEvmChain(parseUid(a)?.chainId ?? '') && a.toLowerCase() === b.toLowerCase())
export async function fetchOffMenu({ id, by }: OffMenuRef): Promise<OffMenuRow> {
  if (id.startsWith('l:')) {
    const [long, short] = id.slice(2).split('|')
    const chainId = parseUid(long)?.chainId
    if (!chainId || !short) return null
    // one named pair, so no floor may cut it: the API's own default config-risk ceiling is 4 and
    // drops every score-5 market (Morpho PT-apxUSD-5NOV2026 / apxUSD at 94.5 % LLTV answered
    // nothing, 2026-10-12); the ticket's off-menu warning and `softHide` carry the risk instead
    const r = await fetchOptimizerPairs({ chainIds: [chainId], collaterals: [by], minBorrowLiquidityUsd: 0, maxConfigRiskScore: 5, includeIlliquid: true, includeExpired: true, count: 100 })
    const row = r.items.find((x) => sameUid(x.marketLongUid, long) && sameUid(x.marketShortUid, short))
    return row ? classifyPair(row) : null
  }
  const earnUid = id.slice(2)
  const chainId = parseUid(earnUid)?.chainId
  if (!chainId) return null
  const r = await fetchEarn({ chainIds: [chainId], count: 500, maxRiskScore: 5, minTvlUsd: 0, assetSymbol: by, passthrough: true })
  // a profile names the MARKET uid, a reloaded ticket its own id (`s:<earnUid>`): either finds it
  const m = r.items.find((x) => sameUid(x.earnUid, earnUid) || (!!x.refs?.marketUid && sameUid(x.refs.marketUid, earnUid)))
  return m ? classifyEarn(m) : null
}
export const offMenuQuery = (ref: OffMenuRef) => ({ queryKey: ['off-menu', ref.id, ref.by], queryFn: () => fetchOffMenu(ref), staleTime: 10 * 60_000, retry: false })
export function useOffMenu(ref: OffMenuRef | null) {
  return useQuery({ ...offMenuQuery(ref ?? { id: '', by: '' }), enabled: !!ref })
}
/**
 * Why an off-menu row is off the menu, in one sentence for its ticket: the
 * floor it fails under the current settings, or — when it passes every floor —
 * that the catalogue's own request never returned it.
 */
export function offMenuWhy(s: Strategy, st: Settings): string {
  const code = softHide(s, st)
  if (code) { const d = hideDetail(s, code); return `${HIDES[code].word[0].toUpperCase()}${HIDES[code].word.slice(1)}${d ? ` (${d})` : ''}: ${HIDES[code].why}` }
  return s.kind === 'loop'
    ? 'The menu asks for loops at a $10k size, and this one did not come back: usually too little left to borrow to fill that.'
    : 'The menu’s own listing did not return it.'
}

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

/**
 * The 30-day rate history of `rows` (a loop contributes both legs), as a lookup
 * over the shared per-uid cache (`rateHistoryStore.ts`): only uids not already
 * held are fetched, every surface asking at once costs one request. `settled`
 * holds the ask back while a list is still growing as chain buckets land.
 */
export function useRateHistory(rows: Strategy[], settled = true): HistoryGet {
  const uids = useMemo(() => [...new Set(rows.flatMap(historyUids))].sort(), [rows])
  return useHistoryFor(uids, settled)
}

function useDebounced<T>(v: T, ms: number): T { const [d, setD] = useState(v); useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms]); return d }
/** Quote-only loop (no account): the API's projected economics and simulated health for the ticket. */
export function useLoopQuote(l: LoopStrategy | null, equityUsd: number, leverageLive: number, account?: string, slippageBp = 50, termId?: string, tenor?: LoopTenor) {
  const leverage = useDebounced(leverageLive, 500)
  const equity = useDebounced(equityUsd, 500)
  return useQuery(loopQuoteOpts(l, equity, leverage, account, slippageBp, termId, tenor))
}
function loopQuoteOpts(l: LoopStrategy | null, equity: number, leverage: number, account: string | undefined, slippageBp: number, termId?: string, tenor?: LoopTenor) {
  const debtUsd = equity * (leverage - 1)
  const debtTokens = l?.priceShort ? debtUsd / l.priceShort : 0
  return {
    // a Loopscale loop is not quoted without its tenor: the API refuses (`MISSING_PARAM`)
    enabled: !!l && debtTokens > 0 && (!l.tenors || !!tenor),
    queryKey: ['loopq', l?.id, Math.round(debtTokens * 1e6), leverage, slippageBp, account ?? '', termId ?? '', tenor?.id ?? ''],
    staleTime: 20_000,
    retry: false,
    // some lenders (LlamaLend) only quote with an account; passing it costs nothing — nothing is signed here
    queryFn: () => loopOpen({ collateralMarketUid: l!.marketLongUid, debtMarketUid: l!.marketShortUid, debtAmountRaw: toRaw(debtTokens, l!.decimalsShort), slippageBp, leverage, account, termId, tenor }),
  }
}
/**
 * The borrow books of dated markets (Midnight), one request per market — a pair has a handful of
 * maturities. `bookAprAt` turns one into the rate a size actually pays.
 */
export function useLendingBooks(debtMarketUids: string[]) {
  const qs = useQueries({ queries: debtMarketUids.map((uid) => ({ queryKey: ['book', uid], queryFn: () => fetchLendingBook(uid), staleTime: 30_000, retry: 1 })) })
  return debtMarketUids.map((uid, i) => ({ uid, book: qs[i].data ?? null, pending: qs[i].isPending }))
}
/**
 * What borrowing `amount` debt tokens costs on this book: the assets-weighted APR of the levels it
 * walks (marginal), or the level that covers it (uniform). `null` when the book cannot fill it.
 */
export function bookAprAt(book: LendingBook | null, amount: number): number | null {
  if (!book?.levels.length) return null
  if (!(amount > 0)) return book.levels[0].aprPct
  if (book.pricing === 'uniform') return book.levels.find((l) => l.cumulativeAssets >= amount)?.aprPct ?? null
  let left = amount, cost = 0
  for (const l of book.levels) {
    const take = Math.min(left, l.assets)
    cost += take * l.aprPct; left -= take
    if (left <= 1e-9) return cost / amount
  }
  return null
}
/**
 * One quote per Loopscale tenor at the ticket's size — the only place a tenor's rate exists (the
 * feed carries the cheapest as `borrowAprShort` and nothing per tenor; each tenor is its own book,
 * priced at size). The selected tenor's entry is the SAME query as the ticket's `useLoopQuote`, so
 * four requests, not five. `null` per tenor = nobody offers it at this size (`NO_OFFER`).
 */
export function useTenorQuotes(l: LoopStrategy, equityUsd: number, leverageLive: number, account?: string, slippageBp = 50) {
  const leverage = useDebounced(leverageLive, 500)
  const equity = useDebounced(equityUsd, 500)
  const tenors = l.tenors ?? []
  const qs = useQueries({ queries: tenors.map((t) => loopQuoteOpts(l, equity, leverage, account, slippageBp, undefined, t)) })
  const debtTokens = l.priceShort ? (equity * (leverage - 1)) / l.priceShort : 0
  return tenors.map((t, i) => {
    const o = qs[i].data?.data?.offer
    // the quote at this size when the build answers; else the feed's book for the tenor, if it fills
    // this size. A build that cannot quote (`PRICE_UNAVAILABLE` on srONyc, 2026-10-07) is not "no lender"
    const feed = t.apr != null && (t.fillable == null || debtTokens <= t.fillable) ? { apr: t.apr, ltv: 0, lqt: 0, depth: t.fillable ?? 0 } : null
    // ...but a build that says no lender holds this size (`INSUFFICIENT_DEPTH`) overrules the feed's book
    const short = loopDepthShort(qs[i].error)
    const pending = qs[i].isPending && qs[i].fetchStatus !== 'idle'
    return { tenor: t, pending: pending && !feed, short, offer: o ? { apr: o.apy / 1e4, ltv: o.ltv / 1e6, lqt: o.lqt / 1e6, depth: o.amount } : short ? null : feed }
  })
}
/**
 * What selling ALL of a loop's collateral fetches on the market right now: the best route's
 * `tradeOutput` (debt tokens) for `tradeInput` (collateral tokens). A full close is only as good as
 * that sale — the position feed values collateral at the lender's oracle, and an LST the oracle
 * prices at its redemption rate can sell for less than it owes (sMON/WMON on Euler, 2026-09-29:
 * $31 of equity on the feed, 9,207 WMON for 8,281 sMON against 9,250 owed). `null` = no route.
 */
/**
 * What selling `amountRaw` of a loop's collateral into its debt fetches, quote-only: without
 * `account` the API sizes the sale and builds nothing. `isAll` sizes a full close; a paper
 * deleverage asks for the part (tickets/0006). Null when no route answers.
 */
export async function quoteClose(p: Omit<LoopCloseParams, 'account' | 'slippageBp' | 'isAll'>, slippageBp = 50, isAll = true) {
  const env = await loopClose({ ...p, account: undefined, slippageBp, isAll })
  const best = (env.data?.quotes ?? []).map((q) => q.deltas).filter((d) => d && (d.tradeOutput ?? 0) > 0 && (d.tradeInput ?? 0) > 0)
    .sort((a, b) => b!.tradeOutput! - a!.tradeOutput!)[0]
  return best ? { input: best.tradeInput!, output: best.tradeOutput!, via: best.aggregator, exitCostUsd: env.data?.economics?.exitCostUsd?.total } : null
}
export function useCloseQuote(p: Omit<LoopCloseParams, 'account' | 'slippageBp' | 'isAll'> | null, slippageBp = 50) {
  return useQuery({
    enabled: !!p && p.amountRaw !== '0',
    queryKey: ['closeq', p?.collateralMarketUid, p?.debtMarketUid, p?.amountRaw, p?.accountId ?? '', p?.loanId ?? '', slippageBp],
    staleTime: 20_000,
    retry: false,
    queryFn: () => quoteClose(p!, slippageBp, true),
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

