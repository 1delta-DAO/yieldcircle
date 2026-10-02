/**
 * Every call to the position index, one function each. Reads only: the index
 * has no writes and no key, so there is no boundary to vendor here — but the
 * same discipline as `sdk/api.ts` applies, the wire naming is translated once
 * and nowhere else.
 */
import { INDEX_BASE_URL } from '../config/backend'
import type { AccountKind, AssetBookRow, IndexBalances, AssetDetail, AssetHistory, AssetHolders, FlowsResponse, Following, Holder, ImpairedCount, LedgerEvent, MarketRow, PositionsResponse, TrendingMarket, TxBundle, VaultRow } from './types'

/** `any` consults all three facts, `direct` only the token's own contract, `exposure` only the credit behind it. */
export type IssuerMatch = 'any' | 'direct' | 'exposure'

export type Params = Record<string, string | number | boolean | undefined | null>
function qs(p: Params): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (v != null && v !== '') q.set(k, String(v))
  const s = q.toString()
  return s ? '?' + s : ''
}
async function get<T>(path: string, p: Params = {}, signal?: AbortSignal): Promise<T> {
  const r = await fetch(INDEX_BASE_URL + path + qs(p), { signal })
  const j = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new Error(j.error || `${path} → ${r.status}`)
  return j
}

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
export const recentTxs = (q: RecentQuery, signal?: AbortSignal) =>
  get<{ txs: TxBundle[]; following: Following | null }>('/events/recent', { ...q, group: 'tx' }, signal)
/** What the menu feed answers: `outside` counts the moves a client-side filter dropped (the fallback only). */
export type MenuFeed = { txs: TxBundle[]; following: Following | null; outside?: number }
/** set once an index answers the POST 404/405: it predates it, so the session stops asking */
let postUnsupported = false
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
 * three that dig for them.
 */
export async function recentTxsIn(q: RecentQuery, uids: string[], signal?: AbortSignal): Promise<MenuFeed> {
  if (!postUnsupported) {
    const r = await fetch(INDEX_BASE_URL + '/events/recent' + qs({ ...q, group: 'tx' }), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ inMarkets: uids }), signal,
    })
    if (r.status !== 404 && r.status !== 405) {
      const j = (await r.json().catch(() => ({}))) as MenuFeed & { error?: string }
      if (!r.ok) throw new Error(j.error || `/events/recent → ${r.status}`)
      return j
    }
    postUnsupported = true
  }
  const limit = Number(q.limit ?? 40)
  const all = await recentTxs({ ...q, limit: Math.max(limit, FALLBACK_SCAN) }, signal)
  const set = new Set(uids)
  const hit = all.txs.filter((t) => t.legs.some((l) => l.marketUid && set.has(l.marketUid)))
  return { txs: hit, following: all.following, outside: all.txs.length - hit.length }
}
export const recentEvents = (q: RecentQuery, signal?: AbortSignal) =>
  get<{ events: LedgerEvent[]; following: Following | null }>('/events/recent', q, signal)

export const accountTxs = (account: string, p: { chainId?: string; limit?: number } = {}) =>
  get<{ account: string; txs: TxBundle[] }>(`/accounts/${account}/events`, { ...p, group: 'tx' })
export const accountFlows = (account: string, p: { chainId?: string; days?: number } = {}) =>
  get<FlowsResponse>(`/accounts/${account}/flows`, p)
/** Another wallet's positions. NEVER called for the connected user — that is the live allocator path. */
export const accountPositions = (account: string, p: { chainId?: string } = {}) =>
  get<PositionsResponse>(`/positions/${account}`, p)

export const market = (uid: string) => get<MarketRow>(`/markets/${encodeURIComponent(uid)}`)
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
export const marketTxs = (uid: string, limit = 50, f: MarketTapeQuery = {}, signal?: AbortSignal) =>
  get<{ marketUid: string; txs: TxBundle[] }>(`/markets/${encodeURIComponent(uid)}/events`, { ...f, limit, group: 'tx' }, signal)
export const marketHolders = (uid: string, p: { side?: string; limit?: number } = {}) =>
  get<{ marketUid: string; holders: Holder[] }>(`/markets/${encodeURIComponent(uid)}/holders`, p)
/** Rows are per (side, bucket) and carry the rollup's own snake_case field names. */
export interface FlowBucket {
  side: string
  ts: string
  inflow_usd: number
  outflow_usd: number
  n_events: number
  n_wallets: number
}
export const marketFlow = (uid: string, p: { hours?: number; bucket?: 'hour' | 'day' } = {}) =>
  get<{ marketUid: string; bucket: string; hours: number; flow: FlowBucket[] }>(
    `/markets/${encodeURIComponent(uid)}/flow`, p,
  )
/**
 * The vault rows for ONE share token, across every chain that carries it.
 * What a wallet page asks when the address it was opened on is a vault: the
 * rate it pays depositors lives on the token, not on the positions it holds.
 */
export const vaultsAt = (address: string) =>
  get<{ vaults: VaultRow[] }>('/vaults', { address, limit: 10 })
export const trending = (p: { window?: '1h' | '24h' | '7d'; chainId?: string; side?: string; limit?: number } = {}) =>
  get<{ window: string; markets: TrendingMarket[] }>('/trending', p)
/**
 * Realized yield per wallet over a window: `units × Δindex`, valued — the
 * number the index can actually prove, as opposed to a screenshot. Answers 404
 * on a deploy that has no rollup yet, and every caller falls back rather than
 * showing an empty board.
 */
export interface BoardRow {
  account: string
  realizedUsd: number
  avgPositionUsd?: number | null
  ratePct?: number | null
  nPositions?: number
  exact?: boolean
  accountKind?: AccountKind
  accountLabel?: string | null
}
export const leaderboard = (p: { window?: '24h' | '7d' | '30d' | 'all'; limit?: number; chainId?: string } = {}) =>
  get<{ window: string; rows: BoardRow[]; method?: string; asOf?: string }>('/leaderboard', p)

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
export const hot = (p: { window?: '1h' | '6h' | '24h' | '7d'; chainId?: string; chainIds?: string; protocols?: string; issuers?: string; issuerMatch?: IssuerMatch; curator?: string; assetGroups?: string; limit?: number } = {}) =>
  get<{ window: string; hours: number; method: string; markets: HotMarket[] }>('/hot', p)

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
export const protocols = (p: { window?: '1h' | '6h' | '24h' | '7d'; chainIds?: string; limit?: number } = {}) =>
  get<{ window: string; hours: number; protocols: ProtocolFacet[] }>('/protocols', p)

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
export const issuers = (p: { window?: '1h' | '6h' | '24h' | '7d'; chainIds?: string; limit?: number } = {}) =>
  get<{ window: string; hours: number; issuers: IssuerFacet[] }>('/issuers', p)

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

export const curators = (p: { win?: string; limit?: number; chainIds?: string } = {}) =>
  get<{ win: string; curators: CuratorRow[] }>('/curators', p)
export const curator = (id: string, win = '30d') =>
  get<CuratorProfile>(`/curators/${encodeURIComponent(id)}`, { win })
export const curatorAllocation = (id: string) =>
  get<CuratorAllocation>(`/curators/${encodeURIComponent(id)}/allocation`)
export const curatorTxs = (id: string, limit = 50) =>
  get<{ curatorId: string; vaults: number; txs: TxBundle[] }>(`/curators/${encodeURIComponent(id)}/events`, { limit })
export const curatorHolders = (id: string, limit = 20) =>
  get<{ curatorId: string; holders: { account: string; amountUsd: number; vaults: number; since: string | null; accountKind?: AccountKind; accountLabel?: string | null }[]; impaired?: ImpairedCount }>(
    `/curators/${encodeURIComponent(id)}/holders`, { limit },
  )
/** Batch: which of these addresses are desks. What lets a row know it is looking at a manager, not a whale. */
export const curatorsByAccount = (addresses: string[]) =>
  get<{ curators: Record<string, AccountCurator> }>('/curators/by-account', { addresses: addresses.join(',') })

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
export const assets = (p: { chainIds?: string; q?: string; limit?: number; minUsd?: number } = {}, signal?: AbortSignal) =>
  get<{ assets: AssetBookRow[]; asOf: string | null }>('/assets', p, signal)
export const asset = (group: string, chainIds?: string) => get<AssetDetail>(g(group), { chainIds })
export const assetHistory = (group: string, days = 90, chainIds?: string) =>
  get<AssetHistory>(`${g(group)}/history`, { days, chainIds })
export const assetHolders = (group: string, limit = 20, chainIds?: string) =>
  get<AssetHolders>(`${g(group)}/holders`, { limit, chainIds })

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
