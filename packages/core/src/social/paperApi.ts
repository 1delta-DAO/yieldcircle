/**
 * The paper ledger on the social service (tickets/0006 §I; pos-indexer tickets/0076): one signed
 * op at a time, applied by the server with the same `model/paper.ts` this app runs, so the book it
 * answers is the truth and the local one is its cache.
 */
import { SOCIAL_BASE_URL } from '../config/backend'
import { SocialError } from './api'
import type { PaperBook, PaperLedger } from '../model/paper'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(SOCIAL_BASE_URL + path, { cache: 'no-store', ...init })
  const j = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new SocialError(j.error || `${path} → ${r.status}`, r.status)
  return j
}
export interface PaperOpEnvelope { primaryType: 'PaperOp'; message: { author: string; op: string; nonce: string; signedAt: number }; signature: string }
export interface PaperOpResult { ok: true; seq: number; ledger: PaperLedger; book: PaperBook; replayed?: boolean }
export const postPaperOp = (e: PaperOpEnvelope) =>
  call<PaperOpResult>('/paper/ops', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(e) })
export const paperBook = (account: string) =>
  call<{ ledger: PaperLedger; book: PaperBook; computedAt: string }>(`/paper/book/${encodeURIComponent(account.toLowerCase())}`)
/** `priceUsd`: the part of `pnlUsd` that is price; absent or null on a day from before the server kept it */
export interface PaperDay { day: string; navUsd: number; pnlUsd: number; putInUsd: number; returnPct: number; priceUsd?: number | null }
/** One hour's valuation (`paper.book_hourly`) */
export interface PaperHour { t: string; navUsd: number; pnlUsd: number; priceUsd: number; putInUsd: number }
export const paperDaily = (account: string, days = 90) =>
  call<{ days: PaperDay[] }>(`/paper/book/${encodeURIComponent(account.toLowerCase())}/daily?days=${days}`)
export const paperHourly = (account: string, days = 14) =>
  call<{ points: PaperHour[] }>(`/paper/book/${encodeURIComponent(account.toLowerCase())}/hourly?days=${days}`)
export interface PaperBoardRow {
  account: string; sol: string | null; handle: string | null; displayName: string | null; tags: string[]
  navUsd: number; pnlUsd: number; returnPct: number; netAprPct: number | null; annualUsd: number; deployedUsd: number
  positions: number; chains: string[]; worstHealth: number | null; since: string; warming: boolean
  /** what getting money to work has cost, USD (tickets/0007 D); absent from a server before it */
  frictionUsd?: number
}
export const paperBoard = (sort: 'return' | 'apr', limit = 50) =>
  call<{ rows: PaperBoardRow[]; computedAt: string | null; sort: string }>(`/paper/board?sort=${sort}&limit=${limit}`)
/** The paper bank's prices from the paper service's shared cache — `<chainId>:<token>` → usd (null: the feed has none). */
export async function paperPrices(keys: string[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {}
  const uniq = [...new Set(keys)]
  for (let i = 0; i < uniq.length; i += 100) {
    const r = await call<{ prices: Record<string, number | null> }>(`/paper/prices?t=${encodeURIComponent(uniq.slice(i, i + 100).join(','))}`, { cache: 'default' })
    Object.assign(out, r.prices)
  }
  return out
}
/** One signed op as the server applied it, with the prices it was judged at (`<chain>:<token>` → usd). */
/** `frictionUsd`: what the op cost — fees, slippage, the bridge's cut (tickets/0007 D); null for ops from before it was booked. */
export interface PaperOpRow { id: number; kind: string; op: import('../model/paper').PaperOp; prices: Record<string, number | null>; at: string; frictionUsd?: number | null }
export const paperOps = (account: string, limit = 200) =>
  call<{ ops: PaperOpRow[] }>(`/paper/book/${encodeURIComponent(account.toLowerCase())}/ops?limit=${limit}`)
