/**
 * Every call to the position index, one function each. Reads only: the index
 * has no writes and no key, so there is no boundary to vendor here — but the
 * same discipline as `sdk/api.ts` applies, the wire naming is translated once
 * and nowhere else.
 */
import { INDEX_BASE_URL } from '../config/backend'
import type { AccountKind, FlowsResponse, Following, Holder, LedgerEvent, MarketRow, PositionsResponse, TrendingMarket, TxBundle } from './types'

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
  chainId?: string
  kind?: string
  limit?: number
  since?: string
  follower?: string
  follow?: 'wallets' | 'markets' | 'all'
  accounts?: string
  markets?: string
}
export const recentTxs = (q: RecentQuery, signal?: AbortSignal) =>
  get<{ txs: TxBundle[]; following: Following | null }>('/events/recent', { ...q, group: 'tx' }, signal)
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
export const marketTxs = (uid: string, limit = 50) =>
  get<{ marketUid: string; txs: TxBundle[] }>(`/markets/${encodeURIComponent(uid)}/events`, { limit, group: 'tx' })
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
}
export const hot = (p: { window?: '1h' | '6h' | '24h' | '7d'; chainId?: string; chainIds?: string; protocols?: string; limit?: number } = {}) =>
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

export const health = () => get<{ ok: boolean; chains?: string[] }>('/health')
