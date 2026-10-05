/**
 * Every call to the position index, one function each. Reads only: the index
 * has no writes and no key, so there is no boundary to vendor here — but the
 * same discipline as `sdk/api.ts` applies, the wire naming is translated once
 * and nowhere else.
 *
 * TWO indexes since docs/solana.md: the EVM one (`INDEX_BASE_URL`) and the
 * Solana one (`SOL_INDEX_BASE_URL`), a separate service until the merge. The
 * split lives HERE and nowhere above it (plan decision 1):
 *
 *   - wallet, market and holders calls go to exactly ONE index, chosen by the
 *     address shape or the uid's chain segment;
 *   - the feed, Hot and trending FAN OUT to both when the chain scope spans
 *     both VMs ("all chains" means both indexes, not "omit chainIds"), and
 *     merge by time or by rank;
 *   - the filter facets (`/protocols`, `/issuers`, `/curators`,
 *     `/curators/by-account`) fan out the same way and merge by key; the
 *     Solana side answering 404 (not deployed yet) costs its chips only;
 *   - a curator's own page goes to the index that knows the id;
 *   - everything else (board, assets, stress, find, balances) is EVM-only
 *     until those routes exist on Solana.
 *
 * The Solana index must answer the EVM index's shapes — this file does NOT
 * adapt them (plan decision 2). A route of it that still answers its old
 * `{ok, data}` snake_case envelope reads as an EMPTY page here (`safeTxs` and
 * friends), so nothing renders garbage while pos-indexer item 2 lands, and
 * one index failing never takes the other's rows down with it.
 */
import { INDEX_BASE_URL, SOL_INDEX_BASE_URL } from '../config/backend'
import { isEvmChain, isSolAddr, isSvmChain } from '../model/address'
import { isSolGroup } from '../model/assetGroup'
import type { AccountIdentity, AccountKind, AssetBookRow, IndexBalances, AssetDetail, AssetHistory, AssetHolders, FlowsResponse, Following, Holder, ImpairedCount, LedgerEvent, MarketRow, PositionsResponse, TrendingMarket, TxBundle, VaultRow } from './types'

/** `any` consults all three facts, `direct` only the token's own contract, `exposure` only the credit behind it. */
export type IssuerMatch = 'any' | 'direct' | 'exposure'

export type Params = Record<string, string | number | boolean | undefined | null>
function qs(p: Params): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (v != null && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? '?' + s : ''
}
async function get<T>(path: string, p: Params = {}, signal?: AbortSignal, base = INDEX_BASE_URL): Promise<T> {
  const r = await fetch(base + path + qs(p), { signal })
  const j = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new Error(j.error || `${path} → ${r.status}`)
  return j
}

/** Which index serves a chain / an address / a uid. One call, one index — never both. */
export const indexFor = (chainId: string | undefined) => (isSvmChain(chainId) ? SOL_INDEX_BASE_URL : INDEX_BASE_URL)
export const indexForAddr = (a: string) => (isSolAddr(a) ? SOL_INDEX_BASE_URL : INDEX_BASE_URL)
export const indexForUid = (uid: string) => indexFor(uid.split(':')[1])

/**
 * The fan-out plan for a chain scope. `evm` is the chainIds CSV for the EVM
 * index (`undefined` = all of its chains, `null` = do not ask it); `sol` says
 * whether the Solana index is in scope. No `chainIds` at all means EVERY
 * chain, which since Solana means both indexes.
 */
function splitScope(chainIds?: string | null): { evm: string | undefined | null; sol: boolean } {
  if (!chainIds) return { evm: undefined, sol: true }
  const ids = String(chainIds).split(',').filter(Boolean)
  const evm = ids.filter((id) => isEvmChain(id))
  return { evm: evm.length ? evm.join(',') : null, sol: ids.some((id) => isSvmChain(id)) }
}
/** A Solana-index answer that is not yet in the EVM shape reads as an empty page, never as garbage. */
const safeTxs = (j: { txs?: unknown; following?: Following | null } | null): { txs: TxBundle[]; following: Following | null } =>
  j && Array.isArray(j.txs) ? (j as { txs: TxBundle[]; following: Following | null }) : { txs: [], following: j?.following ?? null }
const EMPTY_TXS = { txs: [] as TxBundle[], following: null }
/** Both indexes resolve the follow graph on their own ledger; the counts add. Null only when neither answered one. */
const sumFollowing = (a: Following | null | undefined, b: Following | null | undefined): Following | null =>
  !a ? (b ?? null) : !b ? a : { source: a.source ?? b.source, accounts: (a.accounts ?? 0) + (b.accounts ?? 0), markets: (a.markets ?? 0) + (b.markets ?? 0) }
/** A curator id that only one index can know: `cand:solana:<base58>` is Solana's, `cand:<evm chain>:0x…` the EVM one's. */
const solCurator = (id: string | undefined) => !!id && id.startsWith('cand:solana:')
const evmCandidate = (id: string | undefined) => !!id && id.startsWith('cand:') && !solCurator(id)
/** `splitScope`, narrowed by a curator filter that names a desk only one index has — the other would answer an empty page anyway. */
function feedScope(chainIds: string | null | undefined, curator: string | undefined) {
  const sc = splitScope(chainIds)
  if (solCurator(curator)) sc.evm = null
  if (evmCandidate(curator)) sc.sol = false
  return sc
}
/** newest first; both lists are already sorted so this is one pass of interleaving */
const byTime = (a: TxBundle[], b: TxBundle[], limit?: number) =>
  [...a, ...b].sort((x, y) => Date.parse(y.blockTs) - Date.parse(x.blockTs)).slice(0, limit)

/** The feed. `follower` resolves the follow graph in SQL server-side; a wallet that follows nobody gets an EMPTY feed, never the global one. */
export interface RecentQuery extends Params {
  /** several chains, comma-joined — the selector is multi-select */
  chainIds?: string
  /** protocol keys from the `/protocols` facet, comma-joined */
  protocols?: string
  /** issuer ids from the `/issuers` facet, comma-joined — always OR-ed */
  issuers?: string
  /** which of the three facts to consult; `any` is the default and is a UNION, not a sum */
  issuerMatch?: IssuerMatch
  chainId?: string
  kind?: string
  limit?: number
  since?: string
  follower?: string
  follow?: 'wallets' | 'markets' | 'all'
  accounts?: string
  markets?: string
  /** one desk's vaults, resolved server-side to their addresses (pos-indexer tickets/0013) */
  curator?: string
  /** asset groups, comma-joined (pos-indexer tickets/0026) — an unknown group answers an EMPTY page */
  assetGroups?: string
}
/** The feed, from both indexes when the scope spans both VMs, merged by time. */
export async function recentTxs(q: RecentQuery, signal?: AbortSignal): Promise<{ txs: TxBundle[]; following: Following | null }> {
  const { evm, sol } = feedScope(q.chainIds, q.curator)
  const ask = (base: string, chainIds: string | undefined) =>
    get<{ txs: TxBundle[]; following: Following | null }>('/events/recent', { ...q, chainIds, group: 'tx' }, signal, base)
  const [e, s] = await Promise.all([
    // the EVM index's errors still throw (no silent regression); the Solana
    // one degrading — down, or still on its old shapes — costs its rows only
    evm !== null ? ask(INDEX_BASE_URL, evm) : Promise.resolve(null),
    sol ? ask(SOL_INDEX_BASE_URL, undefined).then(safeTxs).catch(() => EMPTY_TXS) : Promise.resolve(null),
  ])
  if (!s) return e ?? EMPTY_TXS
  if (!e) return { txs: s.txs.slice(0, limitOf(q)), following: s.following }
  return { txs: byTime(e.txs, s.txs, limitOf(q)), following: sumFollowing(e.following, s.following) }
}
const limitOf = (q: { limit?: number }) => (q.limit == null ? undefined : Number(q.limit))
/** What the menu feed answers: `outside` counts the moves a client-side filter dropped (the fallback only). */
export type MenuFeed = { txs: TxBundle[]; following: Following | null; outside?: number }
/** set once an index answers the POST 404/405: it predates it, so the session stops asking — PER index (plan §C) */
const postUnsupported = new Map<string, boolean>()
/** the fallback's window: the newest 200 hold ~26 menu moves, where 40 held 2 (measured 2026-09-29) */
const FALLBACK_SCAN = 200
/**
 * The feed narrowed to a SET of markets — "only what this app can open".
 *
 * The set is the catalogue's ~300 uids, 24 kB, which a GET answers 431, so it
 * rides in a POST body (pos-indexer `POST /events/recent`, `inMarkets`) and
 * the index answers the newest `limit` transactions with a leg in it. That is
 * one request; filtering the unfiltered tape here matched 2 of the newest 40
 * and had to dig 40 → 120 → 200 before it had a page.
 *
 * An index that predates the route answers 404, and then the tape is read
 * wide once and filtered here, as before — one request of 200 rather than
 * three that dig for them. Each index keeps its own uids and its own
 * fallback: a 404 from the Solana index must not switch the POST off for the
 * EVM one.
 */
export async function recentTxsIn(q: RecentQuery, uids: string[], signal?: AbortSignal): Promise<MenuFeed> {
  const { evm, sol } = feedScope(q.chainIds, q.curator)
  const one = async (base: string, chainIds: string | undefined, set: string[]): Promise<MenuFeed> => {
    if (!set.length) return EMPTY_TXS
    if (!postUnsupported.get(base)) {
      const r = await fetch(base + '/events/recent' + qs({ ...q, chainIds, group: 'tx' }), {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ inMarkets: set }), signal,
      })
      if (r.status !== 404 && r.status !== 405) {
        const j = (await r.json().catch(() => ({}))) as MenuFeed & { error?: string }
        if (!r.ok) throw new Error(j.error || `/events/recent → ${r.status}`)
        return { ...safeTxs(j), outside: j.outside }
      }
      postUnsupported.set(base, true)
    }
    const limit = Number(q.limit ?? 40)
    const all = safeTxs(await get<{ txs: TxBundle[]; following: Following | null }>('/events/recent', { ...q, chainIds, group: 'tx', limit: Math.max(limit, FALLBACK_SCAN) }, signal, base))
    const want = new Set(set)
    const hit = all.txs.filter((t) => t.legs.some((l) => l.marketUid && want.has(l.marketUid)))
    return { txs: hit, following: all.following, outside: all.txs.length - hit.length }
  }
  const [e, s] = await Promise.all([
    evm !== null ? one(INDEX_BASE_URL, evm, uids.filter((u) => !isSvmChain(u.split(':')[1]))) : Promise.resolve(null),
    sol ? one(SOL_INDEX_BASE_URL, undefined, uids.filter((u) => isSvmChain(u.split(':')[1]))).catch(() => EMPTY_TXS as MenuFeed) : Promise.resolve(null),
  ])
  if (!s) return e ?? EMPTY_TXS
  if (!e) return s
  const outside = e.outside != null || s.outside != null ? (e.outside ?? 0) + (s.outside ?? 0) : undefined
  return { txs: byTime(e.txs, s.txs, limitOf(q)), following: sumFollowing(e.following, s.following), outside }
}
export async function recentEvents(q: RecentQuery, signal?: AbortSignal): Promise<{ events: LedgerEvent[]; following: Following | null }> {
  const { evm, sol } = feedScope(q.chainIds, q.curator)
  const ask = (base: string, chainIds: string | undefined) =>
    get<{ events: LedgerEvent[]; following: Following | null }>('/events/recent', { ...q, chainIds }, signal, base)
  const safe = (j: { events?: unknown; following?: Following | null } | null) =>
    j && Array.isArray(j.events) ? (j as { events: LedgerEvent[]; following: Following | null }) : { events: [] as LedgerEvent[], following: null }
  const [e, s] = await Promise.all([
    evm !== null ? ask(INDEX_BASE_URL, evm) : Promise.resolve(null),
    sol ? ask(SOL_INDEX_BASE_URL, undefined).then(safe).catch(() => safe(null)) : Promise.resolve(null),
  ])
  if (!s) return e ?? safe(null)
  if (!e) return s
  const events = [...e.events, ...s.events].sort((x, y) => Date.parse(y.blockTs) - Date.parse(x.blockTs)).slice(0, limitOf(q))
  return { events, following: sumFollowing(e.following, s.following) }
}

export const accountTxs = async (account: string, p: { chainId?: string; limit?: number } = {}) => {
  const j = await get<{ account: string; identity?: AccountIdentity | null; txs: TxBundle[] }>(`/accounts/${account}/events`, { ...p, group: 'tx' }, undefined, indexForAddr(account))
  return Array.isArray(j.txs) ? j : { account, identity: null, txs: [] }
}
export const accountFlows = async (account: string, p: { chainId?: string; days?: number } = {}) => {
  const j = await get<FlowsResponse>(`/accounts/${account}/flows`, p, undefined, indexForAddr(account))
  return Array.isArray(j.flows) ? j : { account, days: p.days ?? 30, flows: [], totals: { depositedUsd: 0, withdrawnUsd: 0, borrowedUsd: 0, repaidUsd: 0, netSupplyUsd: 0, netBorrowUsd: 0, nEvents: 0, unpriced: 0 } }
}
/** Another wallet's positions. NEVER called for the connected user — that is the live allocator path. */
export const accountPositions = async (account: string, p: { chainId?: string } = {}) => {
  const j = await get<PositionsResponse>(`/positions/${account}`, p, undefined, indexForAddr(account))
  return Array.isArray(j.positions) ? j : { account, identity: null, positions: [], totals: { depositsUsd: 0, debtUsd: 0, navUsd: 0 }, asOf: null }
}

/**
 * The PnL line of ONE position (pos-indexer tickets/0061, docs/pnl-series.md):
 * every UTC midnight since it opened — or since the ledger starts — its value,
 * the money put in by then, and the difference. `key` is a `groups[].key` of
 * `accountPositions` (`chain|account|posId|riskKey`). History, not the live
 * position: fine for any wallet, the connected one included.
 */
export interface SeriesPoint {
  t: string
  navUsd: number | null
  contribUsd: number
  pnlUsd: number | null
  /** in the position's own money, when every leg is one asset group */
  navAsset: number | null
  /** per leg, in that leg's asset */
  legs: (number | null)[]
}
export interface SeriesEvent {
  t: string
  block: number
  txHash: string
  /** index into `legs` */
  leg: number
  kind: string
  side: string
  amount: number | null
  amountUsd: number | null
  /** + put in, − taken out, 0 = not the holder's choice (liquidation, redemption) */
  flowUsd: number
}
export interface SeriesLeg {
  marketUid: string
  side: string
  symbol: string | null
  assetGroup: string | null
  lenderKey: string
  unitKind: string
  walk: 'units' | 'amount'
  indexSource: 'log' | 'cache' | 'none'
  openedInRange: boolean
  openResidual: number
  exact: boolean
  flags: string[]
  rows: number
}
export interface PositionSeries {
  key: string
  chainId: string
  account: string
  posId: string
  riskKey: string
  start: string | null
  /** the line starts at the ledger's floor: the position is older than that */
  since: string | null
  exact: boolean
  points: SeriesPoint[]
  events: SeriesEvent[]
  legs: SeriesLeg[]
  unpriced: number
  assetSymbol: string | null
  unanchored: { marketUid: string; side: string; rows: number }[]
}
export const positionSeries = (account: string, key: string, from?: string) =>
  get<PositionSeries>(`/accounts/${account}/series`, { key, ...(from ? { from } : {}) }, undefined, indexForAddr(account))

export const market = (uid: string) => get<MarketRow>(`/markets/${encodeURIComponent(uid)}`, {}, undefined, indexForUid(uid))
/**
 * A market's tape. Any filter makes it a 30-day window where `limit` counts
 * transactions; each one still comes back whole (every leg in this market).
 */
export interface MarketTapeQuery extends Params {
  /** a row of the transaction worth at least this; unpriced rows never pass */
  minUsd?: number
  /** ledger kinds, comma-joined: deposit, withdraw, borrow, repay, liquidated */
  kinds?: string
  /** only the wallets this address follows — resolved by the index; following nobody is an empty tape */
  follower?: string
}
export const marketTxs = async (uid: string, limit = 50, f: MarketTapeQuery = {}, signal?: AbortSignal) => {
  const j = await get<{ marketUid: string; txs: TxBundle[] }>(`/markets/${encodeURIComponent(uid)}/events`, { ...f, limit, group: 'tx' }, signal, indexForUid(uid))
  return Array.isArray(j.txs) ? j : { marketUid: uid, txs: [] }
}
export const marketHolders = async (uid: string, p: { side?: string; limit?: number } = {}) => {
  const j = await get<{ marketUid: string; holders: Holder[] }>(`/markets/${encodeURIComponent(uid)}/holders`, p, undefined, indexForUid(uid))
  return Array.isArray(j.holders) ? j : { marketUid: uid, holders: [] }
}
/** Rows are per (side, bucket) and carry the rollup's own snake_case field names. */
export interface FlowBucket {
  side: string
  ts: string
  inflow_usd: number
  outflow_usd: number
  n_events: number
  n_wallets: number
}
export const marketFlow = async (uid: string, p: { hours?: number; bucket?: 'hour' | 'day' } = {}) => {
  const j = await get<{ marketUid: string; bucket: string; hours: number; flow: FlowBucket[] }>(
    `/markets/${encodeURIComponent(uid)}/flow`, p, undefined, indexForUid(uid),
  )
  return Array.isArray(j.flow) ? j : { marketUid: uid, bucket: p.bucket ?? 'day', hours: p.hours ?? 0, flow: [] }
}
/**
 * The vault rows for ONE share token, across every chain that carries it.
 * What a wallet page asks when the address it was opened on is a vault: the
 * rate it pays depositors lives on the token, not on the positions it holds.
 */
export const vaultsAt = async (address: string) => {
  const j = await get<{ vaults: VaultRow[] }>('/vaults', { address, limit: 10 }, undefined, indexForAddr(address))
  return Array.isArray(j.vaults) ? j : { vaults: [] }
}
/** Trending: one index when a chain is named, both (merged; the hook re-sorts by `netUsd`) when none is. */
export async function trending(p: { window?: '1h' | '24h' | '7d'; chainId?: string; side?: string; limit?: number } = {}): Promise<{ window: string; markets: TrendingMarket[] }> {
  const safe = (j: { window?: string; markets?: unknown } | null) =>
    j && Array.isArray(j.markets) ? (j as { window: string; markets: TrendingMarket[] }) : { window: p.window ?? '24h', markets: [] as TrendingMarket[] }
  if (p.chainId) {
    const j = await get<{ window: string; markets: TrendingMarket[] }>('/trending', p, undefined, indexFor(p.chainId))
    return safe(j)
  }
  const [e, s] = await Promise.all([
    get<{ window: string; markets: TrendingMarket[] }>('/trending', p),
    get<{ window: string; markets: TrendingMarket[] }>('/trending', p, undefined, SOL_INDEX_BASE_URL).then(safe).catch(() => safe(null)),
  ])
  return { window: e.window, markets: [...e.markets, ...s.markets] }
}
/**
 * The earners board (pos-indexer tickets/0036, 0057): what POSITIONS earn now
 * — `netPositions`' carry on equity at today's rates — and, with
 * `by: 'wallet'`, what whole WALLETS earn: Σ annual / Σ equity, i.e. every
 * position's APR weighted by its NAV. Each position row also carries its
 * wallet's total (`wallet`), so a 100 % loop inside a $1 m wallet earning 25 %
 * says so on the row. Answers 404 on a deploy whose `position-carry` job has
 * not run; the caller says so rather than showing an empty board.
 */
export interface EarnerLeg {
  marketUid: string
  marketName?: string | null
  side: string
  amountUsd: number | null
  aprNow: number | null
  intrinsicApr: number | null
  intrinsicSource?: string | null
  aprEffective: number | null
  symbol: string | null
  assetGroup: string | null
  valueStatus?: string | null
  faceUsd?: number | null
}
/** A wallet's total beside one of its positions: the preset's figure. */
export interface WalletTotal {
  navUsd: number
  netAprPct: number | null
  apr24hPct: number | null
  positions: number
  exact: boolean
}
export interface EarnerRow {
  key: string
  chainId: string
  account: string
  posId: string
  riskKey: string
  lenderKey: string
  marketUids: string[]
  supplyUsd: number
  debtUsd: number
  equityUsd: number
  leverage: number | null
  annualUsd: number | null
  perDayUsd: number | null
  netAprPct: number | null
  apr24hPct: number | null
  exact: boolean
  since: string | null
  risk: string[]
  riskDetail: Record<string, unknown> | null
  legs: EarnerLeg[]
  wallet: WalletTotal | null
  accountKind?: AccountKind
  accountLabel?: string | null
  accountLabelSource?: string | null
}
export interface WalletEarnerRow {
  account: string
  chains: string[]
  nPositions: number
  /** the positions this figure counts — all of them, or the plain ones under the default preset */
  nCounted: number
  navUsd: number
  annualUsd: number | null
  perDayUsd: number | null
  /** Σ annual / Σ equity: each position's APR weighted by its NAV */
  netAprPct: number | null
  apr24hPct: number | null
  exact: boolean
  /** equity behind positions the preset leaves out of the figure */
  flaggedNavUsd: number
  risk: string[]
  topKey: string | null
  best: { key: string; aprPct: number | null; marketName: string | null } | null
  /** realized POOL yield over 7 d — a token's own appreciation (PT, LST, savings) is in its price, not here */
  poolRealized7dUsd: number | null
  accountKind?: AccountKind
  accountLabel?: string | null
  accountLabelSource?: string | null
}
interface EarnersEnvelope {
  sort: string
  window: string
  direction: string
  exclude: string[]
  /** positions: what the preset hid, per flag. wallets: wallets whose figure leaves out a position with that flag */
  hidden: Record<string, number>
  ratingFlags: { status: 'ok' | 'stale' | 'unavailable'; computedAt: string | null; nSubjects: number | null }
  computedAt: string | null
}
export interface EarnersResponse extends EarnersEnvelope { by: 'position'; rows: EarnerRow[] }
export interface WalletEarnersResponse extends EarnersEnvelope { by: 'wallet'; rows: WalletEarnerRow[] }
export interface EarnersQuery {
  sort?: 'perDay' | 'apr'
  preset?: 'all'
  people?: boolean
  chainIds?: string
  limit?: number
}
/**
 * The URL is the server's cache key, and the index PRE-WARMS the app's default
 * board URLs after every tick (pos-indexer `EARNERS_PREWARM_URLS`) — so the
 * parameters are written in ONE fixed order: by, sort, preset, people,
 * chainIds, limit. Reordering them here silently turns every pre-warmed hit
 * into a cold query.
 */
const earnersParams = (by: 'wallet' | undefined, p: EarnersQuery): Params => ({
  by,
  sort: p.sort,
  preset: p.preset,
  people: p.people ? '1' : undefined,
  chainIds: p.chainIds,
  limit: p.limit,
})
/**
 * The board over BOTH indexes (pos-indexer tickets/0036 + the Solana twin in
 * `apps/sol-indexer/src/api/earners.ts`, the same shape): each answers its
 * own top `limit` for the scope `splitScope` plans, and the two ranked lists
 * merge by the key the servers sort on — $/day by `annualUsd`, APR by the 24 h
 * figure — so the merged top `limit` is exact. `hidden` adds up. The EVM half
 * keeps its URL byte for byte (the index pre-warms the default one); a
 * Solana half that fails or predates `/earners` reads as no rows, never as an
 * error over the EVM board.
 */
async function bothBoards<R extends { annualUsd: number | null; apr24hPct: number | null }>(
  by: 'wallet' | undefined,
  p: EarnersQuery,
): Promise<EarnersEnvelope & { rows: R[] }> {
  const { evm, sol } = splitScope(p.chainIds)
  type Resp = EarnersEnvelope & { rows: R[] }
  const [a, b] = await Promise.all([
    evm !== null ? get<Resp>('/earners', earnersParams(by, { ...p, chainIds: evm })) : Promise.resolve(null),
    sol
      ? get<Resp>('/earners', earnersParams(by, { ...p, chainIds: undefined }), undefined, SOL_INDEX_BASE_URL).catch(() => null)
      : Promise.resolve(null),
  ])
  const halves = [a, b].filter((x): x is Resp => !!x && Array.isArray(x.rows))
  // only the Solana index in scope and it has no board yet: say so, as the EVM one would
  if (!halves.length) throw new Error('no earners board for this chain selection yet')
  if (halves.length === 1) return halves[0]
  const key = (r: R) => (p.sort === 'apr' ? r.apr24hPct : r.annualUsd)
  const rows = [...a!.rows, ...b!.rows]
    .sort((x, y) => {
      const kx = key(x), ky = key(y)
      if (kx === null) return ky === null ? 0 : 1
      if (ky === null) return -1
      return ky - kx
    })
    .slice(0, p.limit ?? 50)
  const hidden: Record<string, number> = { ...a!.hidden }
  for (const [k, n] of Object.entries(b!.hidden)) hidden[k] = (hidden[k] ?? 0) + n
  return {
    ...a!,
    rows,
    hidden,
    // the older of the two: the merged board is no fresher than its stalest half
    computedAt: [a!.computedAt, b!.computedAt].filter((x): x is string => !!x).sort()[0] ?? null,
  }
}
export const earners = (p: EarnersQuery = {}) =>
  bothBoards<EarnerRow>(undefined, p).then((r) => ({ ...r, by: 'position' as const }))
export const walletEarners = (p: EarnersQuery = {}) =>
  bothBoards<WalletEarnerRow>('wallet', p).then((r) => ({ ...r, by: 'wallet' as const }))

/**
 * What is HOT: the markets people are acting in, ranked on frequency AND size
 * together. Either alone lies — volume alone crowns whichever market one whale
 * passed through, frequency alone crowns a spray of dust — so the score is the
 * geometric mean of each market's percentile on both. Every component comes
 * back with it, because a ranking nobody can check is an opinion.
 */
export interface HotMarket {
  marketUid: string
  volumeUsd: number
  netUsd: number
  nEvents: number
  nWallets: number
  nNewWallets: number
  nLiquidations: number
  heat: number
  /** 0..1 — how this market's size compares with every other market's */
  pVolume: number
  /** 0..1 — the same for how often people acted in it */
  pEvents: number
  /**
   * What the market is, from the index's own book — optional because an older
   * index answers without them, and a card that only has the uid says so
   * rather than inventing a name.
   */
  name?: string | null
  lenderKey?: string | null
  symbol?: string | null
  assetLogo?: string | null
  collateralSymbol?: string | null
  collateralLogo?: string | null
  lenderName?: string | null
  lenderLogo?: string | null
}
export async function hot(p: { window?: '1h' | '6h' | '24h' | '7d'; chainId?: string; chainIds?: string; protocols?: string; issuers?: string; issuerMatch?: IssuerMatch; curator?: string; assetGroups?: string; limit?: number } = {}): Promise<{ window: string; hours: number; method: string; markets: HotMarket[] }> {
  type Hot = { window: string; hours: number; method: string; markets: HotMarket[] }
  const { evm, sol } = feedScope(p.chainIds ?? p.chainId, p.curator)
  const ask = (base: string, chainIds: string | undefined) => get<Hot>('/hot', { ...p, chainId: undefined, chainIds }, undefined, base)
  const safe = (j: Hot | null) => (j && Array.isArray(j.markets) ? j : null)
  const [e, s] = await Promise.all([
    evm !== null ? ask(INDEX_BASE_URL, evm) : Promise.resolve(null),
    sol ? ask(SOL_INDEX_BASE_URL, undefined).then(safe).catch(() => null) : Promise.resolve(null),
  ])
  if (!s) return e ?? { window: p.window ?? '24h', hours: 0, method: '', markets: [] }
  if (!e) return { ...s, markets: s.markets.slice(0, p.limit) }
  // the two heat scores are percentiles over DIFFERENT populations and do not
  // compare — interleave by rank (plan "Open decisions") until the ledgers
  // merge and can score jointly
  const markets: HotMarket[] = []
  for (let i = 0; i < Math.max(e.markets.length, s.markets.length); i++) {
    if (e.markets[i]) markets.push(e.markets[i])
    if (s.markets[i]) markets.push(s.markets[i])
  }
  return { ...e, markets: p.limit ? markets.slice(0, p.limit) : markets }
}

/**
 * The protocols worth offering as a filter: the ones with activity in the
 * window, with the counts that justify each choice. `protocol` is the key to
 * send back as `protocols=`.
 */
export interface ProtocolFacet {
  protocol: string
  name: string | null
  logoUri: string | null
  chains: string[]
  rows: number
  wallets: number
  markets: number
}
type FacetQuery = { window?: '1h' | '6h' | '24h' | '7d'; chainIds?: string; limit?: number }
/**
 * Ask both indexes for a facet when the scope spans both VMs. The EVM side
 * throws as before; the Solana side reads as `null` when it is down, 404s
 * (route not deployed yet) or answers another shape — EVM-only, silently.
 */
async function fanFacet<T>(path: string, p: { chainIds?: string }, ok: (j: T | null) => boolean): Promise<[T | null, T | null]> {
  const { evm, sol } = splitScope(p.chainIds)
  return Promise.all([
    evm !== null ? get<T>(path, { ...p, chainIds: evm }) : Promise.resolve(null),
    sol ? get<T>(path, { ...p, chainIds: undefined }, undefined, SOL_INDEX_BASE_URL).then((j) => (ok(j) ? j : null)).catch(() => null) : Promise.resolve(null),
  ])
}
const union = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])]

export async function protocols(p: FacetQuery = {}): Promise<{ window: string; hours: number; protocols: ProtocolFacet[] }> {
  type R = { window: string; hours: number; protocols: ProtocolFacet[] }
  const [e, s] = await fanFacet<R>('/protocols', p, (j) => !!j && Array.isArray(j.protocols))
  if (!e || !s) return e ?? s ?? { window: p.window ?? '7d', hours: 0, protocols: [] }
  // keys are global (`AAVE_V3`, `KAMINO`): one that both answer is one chip
  const by = new Map<string, ProtocolFacet>()
  for (const f of [...e.protocols, ...s.protocols]) {
    const cur = by.get(f.protocol)
    by.set(f.protocol, !cur ? f : {
      ...cur, name: cur.name ?? f.name, logoUri: cur.logoUri ?? f.logoUri, chains: union(cur.chains, f.chains),
      rows: cur.rows + f.rows, wallets: cur.wallets + f.wallets, markets: cur.markets + f.markets,
    })
  }
  return { ...e, protocols: [...by.values()].sort((a, b) => b.rows - a.rows).slice(0, p.limit) }
}

/**
 * The desks worth offering as a filter — the mirror of `/protocols`, and the
 * question it cannot answer: `/protocols` says WHERE a row sits, this says
 * WHOSE credit it is. Only desks with rows in the window, with the counts
 * that justify each chip.
 *
 * `via` is the rows that reach the desk ONLY indirectly (a PT-sUSDe row is
 * Pendle directly and Ethena via). A (row, desk) pair counts once however
 * many paths reach it, so these reconcile with `issuers=` by construction.
 */
export interface IssuerFacet {
  issuer: string
  name: string
  rows: number
  via: number
  wallets: number
  markets: number
  chains: string[]
}
export async function issuers(p: FacetQuery = {}): Promise<{ window: string; hours: number; issuers: IssuerFacet[] }> {
  type R = { window: string; hours: number; issuers: IssuerFacet[] }
  const [e, s] = await fanFacet<R>('/issuers', p, (j) => !!j && Array.isArray(j.issuers))
  if (!e || !s) return e ?? s ?? { window: p.window ?? '7d', hours: 0, issuers: [] }
  // a desk slug (`circle`) is the same desk on both VMs; rows / via / markets
  // are disjoint ledgers and add, wallets may be one person twice, so bounded
  const by = new Map<string, IssuerFacet>()
  for (const f of [...e.issuers, ...s.issuers]) {
    const cur = by.get(f.issuer)
    by.set(f.issuer, !cur ? f : {
      ...cur, name: cur.name || f.name, chains: union(cur.chains, f.chains),
      rows: cur.rows + f.rows, via: cur.via + f.via, markets: cur.markets + f.markets, wallets: Math.max(cur.wallets, f.wallets),
    })
  }
  return { ...e, issuers: [...by.values()].sort((a, b) => b.rows - a.rows).slice(0, p.limit) }
}

/**
 * Curators — WHO decides where a curated vault's money goes.
 *
 * The fifth axis, and the one a depositor in a managed vault is actually
 * exposed to: `/protocols` says where a dollar sits, `/issuers` says whose
 * credit it is, and neither can say who picked the market. A curator is an
 * ADDRESS SET the index proves from `owner()` / `curator()` on chain, names
 * from Morpho's registry or a checked-in override, and never guesses.
 *
 * **`verified` means exactly "listed in a curator registry we read", and its
 * absence is not a warning.** Most desks are unnamed candidates — a fact
 * about the registry, not about them — and they get the same page.
 */
export interface CuratorRow {
  curatorId: string
  /** an unnamed desk, identified by the address that controls its vaults */
  candidate: boolean
  name: string | null
  logoUri: string | null
  description?: string | null
  socials?: { type?: string; url?: string }[] | null
  verified: boolean
  source: string
  aumUpstream: number | null
  nVaults?: number
  nChains?: number
  chains?: string[]
  aumUsd?: number | null
  nHolders?: number | null
  nMoves?: number | null
  /** AUM-weighted growth of its vaults' SHARE INDEX — what a depositor earned, net of fees */
  depositorReturnPct?: number | null
  /** false = a vault had no index sample at the window's start and is left OUT of the number */
  returnExact?: boolean
  worstDrawdownBps?: number | null
  hhi?: number | null
}
export interface CuratorStats {
  win: string
  nVaults: number
  nChains: number
  aumUsd: number | null
  inflowUsd: number | null
  outflowUsd: number | null
  nHolders: number | null
  nMoves: number | null
  nMarketsTouched: number | null
  nLenders: number | null
  depositorReturnPct: number | null
  returnExact: boolean
  nVaultsReturned: number | null
  worstDrawdownBps: number | null
  nLiquidations: number | null
  hhi: number | null
  /** a 30 d window over a 3 d ledger answers about 3 days, and says so here */
  windowCoveredFrom: string | null
  computedAt: string
}
export interface CuratorProfile extends CuratorRow {
  verifiedMeaning: string
  addresses: { chainId: string; address: string; role: string | null; source: string }[]
  vaults: {
    marketUid: string
    chainId: string
    address: string
    name: string | null
    symbol: string | null
    provider: string | null
    aumUsd: number | null
    /** chain-role | registry | manual | name-match */
    arm: string
    /** proved | stated | guessed — a name match is not a proof and must not read like one */
    confidence: string
  }[]
  stats: Record<string, CuratorStats>
  window: string
}
export interface AllocationSlice { key: string; name: string | null; logo: string | null; usd: number; pct: number | null }
export interface CuratorAllocation {
  curatorId: string
  totalUsd: number
  markets: {
    marketUid: string
    marketName: string | null
    chainId: string
    protocol: string
    assetGroup: string | null
    symbol: string | null
    usd: number
    pct: number | null
    exposureStatus: string
    legs: { id: string; name?: string; weightPct?: number }[] | null
  }[]
  byProtocol: AllocationSlice[]
  byAssetGroup: AllocationSlice[]
  byIssuer: AllocationSlice[]
  unattributedUsd: number
  unattributedPct: number | null
  hhi: number | null
}
/** `GET /curators/by-account` — is this address a desk, and which one? */
export interface AccountCurator {
  curatorId: string
  name: string | null
  logoUri: string | null
  verified: boolean
  role: string | null
  /** `direct` = an address the desk controls; `vault` = the address IS one of its vaults */
  via: 'direct' | 'vault'
  chainId: string
  nVaults: number
  aumUsd: number | null
}

/** How much a row says: the richer of two rows for one desk is kept, its counts summed with the other's. */
const filled = (c: CuratorRow) => Object.values(c).filter((v) => v != null).length + (c.name ? 2 : 0) + (c.candidate ? 0 : 1)
const addNull = (a: number | null | undefined, b: number | null | undefined) => (a == null && b == null ? (a ?? b) : (a ?? 0) + (b ?? 0))
export async function curators(p: { win?: string; limit?: number; chainIds?: string } = {}): Promise<{ win: string; curators: CuratorRow[] }> {
  type R = { win: string; curators: CuratorRow[] }
  const [e, s] = await fanFacet<R>('/curators', p, (j) => !!j && Array.isArray(j.curators))
  if (!e || !s) return e ?? s ?? { win: p.win ?? '30d', curators: [] }
  const by = new Map<string, CuratorRow>()
  for (const c of [...e.curators, ...s.curators]) {
    const cur = by.get(c.curatorId)
    if (!cur) { by.set(c.curatorId, c); continue }
    const [rich, other] = filled(c) > filled(cur) ? [c, cur] : [cur, c]
    const chains = rich.chains || other.chains ? union(rich.chains, other.chains) : undefined
    by.set(c.curatorId, {
      ...rich,
      aumUsd: addNull(rich.aumUsd, other.aumUsd),
      nVaults: addNull(rich.nVaults, other.nVaults) ?? undefined,
      ...(chains ? { chains, nChains: chains.length } : {}),
    })
  }
  // the book is ranked by AUM; a desk with none read sinks, in its index's order
  const list = [...by.values()].sort((a, b) => (b.aumUsd ?? -1) - (a.aumUsd ?? -1))
  return { ...e, curators: p.limit ? list.slice(0, p.limit) : list }
}
/**
 * One desk's page, from the index that knows it: a Solana candidate goes
 * straight there, an EVM candidate only to the EVM index, and a slug is
 * asked of the EVM index first and of the Solana one when that refuses it
 * (the EVM error is the one reported if both do).
 */
async function curatorGet<T>(id: string, sub: string, p: Params = {}, ok: (j: T) => boolean = () => true): Promise<T> {
  const path = `/curators/${encodeURIComponent(id)}${sub}`
  if (solCurator(id)) return get<T>(path, p, undefined, SOL_INDEX_BASE_URL)
  try {
    return await get<T>(path, p)
  } catch (err) {
    if (evmCandidate(id)) throw err
    const j = await get<T>(path, p, undefined, SOL_INDEX_BASE_URL).catch(() => null)
    if (j && ok(j)) return j
    throw err
  }
}
export const curator = (id: string, win = '30d') =>
  curatorGet<CuratorProfile>(id, '', { win }, (j) => !!j.curatorId)
export const curatorAllocation = (id: string) =>
  curatorGet<CuratorAllocation>(id, '/allocation', {}, (j) => Array.isArray(j.markets))
export const curatorTxs = async (id: string, limit = 50) => {
  const j = await curatorGet<{ curatorId: string; vaults: number; txs: TxBundle[] }>(id, '/events', { limit }, (j) => Array.isArray(j.txs))
  return Array.isArray(j.txs) ? j : { curatorId: id, vaults: 0, txs: [] }
}
export const curatorHolders = async (id: string, limit = 20) => {
  const j = await curatorGet<{ curatorId: string; holders: { account: string; amountUsd: number; vaults: number; since: string | null; accountKind?: AccountKind; accountLabel?: string | null }[]; impaired?: ImpairedCount }>(
    id, '/holders', { limit }, (j) => Array.isArray(j.holders),
  )
  return Array.isArray(j.holders) ? j : { curatorId: id, holders: [] }
}
/**
 * Batch: which of these addresses are desks. What lets a row know it is looking at a manager, not a whale.
 * `0x` addresses go to the EVM index, base58 ones (kept verbatim) to the Solana index — a base58 address
 * in the EVM index's CSV 400s the whole batch. The Solana side failing costs its entries only.
 */
export async function curatorsByAccount(addresses: string[]): Promise<{ curators: Record<string, AccountCurator> }> {
  type R = { curators: Record<string, AccountCurator> }
  const evm = addresses.filter((a) => !isSolAddr(a))
  const sol = addresses.filter((a) => isSolAddr(a))
  const [e, s] = await Promise.all([
    evm.length ? get<R>('/curators/by-account', { addresses: evm.join(',') }) : Promise.resolve(null),
    sol.length
      ? get<R>('/curators/by-account', { addresses: sol.join(',') }, undefined, SOL_INDEX_BASE_URL).then((j) => (j && j.curators && typeof j.curators === 'object' ? j : null)).catch(() => null)
      : Promise.resolve(null),
  ])
  if (!s) return e ?? { curators: {} }
  if (!e) return s
  return { ...e, curators: { ...e.curators, ...s.curators } }
}

/**
 * The ledger's own witness (pos-indexer tickets/0012 §9): what the index can
 * SEE happening to a market, computed for every market regardless of what
 * anyone claimed about it. The other half of an incident: a claim and a fact
 * are different things, and this app keeps them apart on the page.
 *
 * `outflowRatio` is NULL where the market has no baseline to be unusual
 * against — no baseline, no claim.
 */
export interface StressRow {
  outflow6hUsd: number | null
  inflow6hUsd: number | null
  outflowRatio: number | null
  liquidations24h: number | null
  /** a SUPPLY index that fell: a loss socialised onto depositors */
  indexDropBps: number | null
  depegBps: number | null
  flags: string[]
  computedAt: string
}
export const stress = (markets: string[]) =>
  get<{ thresholds: Record<string, number>; stress: Record<string, StressRow> }>('/stress', { markets: markets.join(',') })

// ---------------------------------------------------------------- assets (pos-indexer tickets/0026)

/**
 * An asset is keyed by its GROUP — yield-tracer's cross-chain price key
 * (`USDC`, `WSTETH`, `Lista Staked BNB::slisBNB`, `1-0xabc…`). Case-significant
 * and always encoded in a path. The server also resolves a lower-case key or a
 * bare symbol and answers with the canonical `group`.
 */
const g = (group: string) => `/assets/${encodeURIComponent(group)}`
/**
 * A Solana-only key (`model/assetGroup.ts`) goes to the Solana index, which has
 * no asset routes yet (its 404 is the page's "not on Solana yet"); every other
 * key to the EVM index, which does not count Solana members until the two merge.
 */
export const indexForGroup = (group: string) => (isSolGroup(group) ? SOL_INDEX_BASE_URL : INDEX_BASE_URL)
export const assets = (p: { chainIds?: string; q?: string; limit?: number; minUsd?: number } = {}, signal?: AbortSignal) =>
  get<{ assets: AssetBookRow[]; asOf: string | null }>('/assets', p, signal)
export const asset = (group: string, chainIds?: string) => get<AssetDetail>(g(group), { chainIds }, undefined, indexForGroup(group))
export const assetHistory = (group: string, days = 90, chainIds?: string) =>
  get<AssetHistory>(`${g(group)}/history`, { days, chainIds }, undefined, indexForGroup(group))
export const assetHolders = (group: string, limit = 20, chainIds?: string) =>
  get<AssetHolders>(`${g(group)}/holders`, { limit, chainIds }, undefined, indexForGroup(group))

export const health = () => get<{ ok: boolean; chains?: string[] }>('/health')

/**
 * A wallet's idle balances from the index (pos-indexer tickets/0044): every chain in ONE request, the
 * asset list per chain in the body (60 addresses × 15 chains does not fit a URL). A wallet the index
 * has never seen is enrolled by asking and seeded within seconds; until then its chains answer
 * `unknown` / `seeding` and the caller reads them live.
 */
export async function indexBalances(account: string, assets: Record<string, string[]>, signal?: AbortSignal): Promise<IndexBalances> {
  const r = await fetch(`${INDEX_BASE_URL}/balances/${account}/query`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assets }), signal,
  })
  const j = (await r.json().catch(() => ({}))) as IndexBalances & { error?: string }
  if (!r.ok) throw new Error(j.error || `/balances → ${r.status}`)
  return j
}

/**
 * One search over everything the index names (pos-indexer tickets/0053 → docs/search.md).
 *
 * `find` answers wallets, vaults, curators, protocols, assets, markets and issuers in ONE ranked
 * request, grouped by kind with a count per kind (capped: `count >= 100` reads "99+"). `remote:
 * 'pending'` = the index is asking Blockscout about this name right now; ask once more in a second.
 * `findCatalog` is the browse kinds whole (protocols, named desks, vaults ≥ $10k, the asset book,
 * issuers) for the box to search in the browser on every keystroke; `findClick` counts what was
 * opened (a doc id, nothing else) — a small popularity prior.
 */
export type FindKind = 'wallet' | 'vault' | 'curator' | 'protocol' | 'asset' | 'market' | 'issuer'
export interface FindHit {
  docId: string
  kind: FindKind
  key: string
  title: string
  subtitle: string | null
  icon: string | null
  chainIds: string[]
  weightUsd: number
  flags: Record<string, unknown>
  /** the term that answered as its source spells it, and the CLAIM it is (seed / tag / primary / signed / x / …) */
  match: { term: string; source: string; exact: boolean; typo: boolean }
  score: number
}
export interface FindAnswer {
  q: string
  type: 'empty' | 'address' | 'tx' | 'uid' | 'text'
  best: FindHit | null
  groups: { kind: FindKind; count: number; hits: FindHit[] }[]
  fuzzy: boolean
  remote: 'off' | 'cached' | 'asked' | 'pending' | 'throttled'
  ms: number
}
export interface FindCatalogDoc {
  kind: FindKind
  key: string
  title: string
  subtitle: string | null
  icon: string | null
  chainIds: string[]
  weightUsd: number
  flags: Record<string, unknown>
  /** [term as spelled, its claim, is the doc's own name]; the title is implied */
  terms: [string, string, boolean][]
}
export const find = (p: { q: string; kinds?: string; chainIds?: string; per?: number }, signal?: AbortSignal) =>
  get<FindAnswer>('/find', p, signal)
export const findCatalog = () => get<{ generation: string; docs: FindCatalogDoc[] }>('/find/catalog')
export function findClick(docId: string): void {
  void fetch(`${INDEX_BASE_URL}/find/click`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ docId }), keepalive: true,
  }).catch(() => {})
}
