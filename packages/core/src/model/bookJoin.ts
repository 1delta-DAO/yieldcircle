/**
 * A wallet's PnL book (`/accounts/:a/pnl` → `positions[]`) joined onto its position cards
 * (`/positions/:a` → `groups[]`). Both are keyed by the index's netting key,
 * `chainId|account|posId|<risk set>` (pos-indexer docs/net-positions.md), so the join is by key
 * and nothing else: a card the book has no record for says so, and a record with no card (the
 * chain filter cut it) is handed back as an orphan, never dropped.
 */

/** The book's per-position figure, the fields read here (`PnlBookPosition`). */
export interface BookRecord {
  key: string
  pnlUsd: number | null
  pnlAprPct: number | null
  status: string
  queuePosition?: number | null
}

/**
 * The key as both routes spell it for comparing: lower-cased on an EVM account, as is on any
 * other — a Solana key is case-significant.
 */
export function bookKey(key: string): string {
  const account = key.split('|')[1] ?? ''
  return /^0x[0-9a-f]{40}$/i.test(account) ? key.toLowerCase() : key
}

export function joinBook<P extends BookRecord>(cardKeys: readonly string[], records: readonly P[] | undefined): { byKey: Map<string, P>; orphans: P[] } {
  const cards = new Set(cardKeys.map(bookKey))
  const byKey = new Map<string, P>()
  const orphans: P[] = []
  for (const p of records ?? []) {
    const k = bookKey(p.key)
    if (cards.has(k)) byKey.set(k, p)
    else orphans.push(p)
  }
  return { byKey, orphans }
}

/**
 * Where a card's figure stands: `ok` (drawn), `drawing` (in the index's requested queue),
 * `waiting` (not drawn yet), `unranked` (drawn, but the record is not reliable — its status says
 * why), `none` (the book does not carry the position: under the drawing floor, or not on the board
 * yet).
 */
export type CardPnlState = 'ok' | 'drawing' | 'waiting' | 'unranked' | 'none'
export function cardPnlState(p: BookRecord | null | undefined): CardPnlState {
  if (!p) return 'none'
  if (p.status === 'ok') return p.pnlUsd != null && Number.isFinite(p.pnlUsd) ? 'ok' : 'unranked'
  if (p.status === 'pending') return p.queuePosition != null ? 'drawing' : 'waiting'
  return 'unranked'
}

/** A lifetime APR worth printing: not past ±100 % a year, where a short span or a thin base has blown it up (`pnlLine`'s rule). */
export const showableApr = (a: number | null | undefined): a is number => a != null && Number.isFinite(a) && Math.abs(a) <= 100
