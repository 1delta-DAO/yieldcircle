/**
 * A wallet's lifetime PnL book (pos-indexer `GET /accounts/:account/pnl`,
 * its docs/lifetime-pnl.md "The wallet book"): every board position's
 * lifetime record summed into one line, the daily PnL / yield line, and the
 * same per strategy. Computed by the index from records it already stored —
 * the call is one cheap read. Both indexes answer it (the Solana one since
 * its PnL lane, docs/sol-lifetime-pnl.md), each for its own addresses.
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { indexForAddr } from '@yieldcircle/core/index/api'
import { isEvmAddr, isSolAddr } from '@yieldcircle/core/model/address'

export interface PnlBookPoint {
  t: string
  pnl: number
  yield: number
  nav: number
}
export interface PnlBookFigure {
  pnlUsd: number
  yieldUsd: number
  directionalUsd: number
  pnlAprPct: number | null
  yieldAprPct: number | null
  capitalDays: number
  /** the longest open span among the positions (days); absent on an older index */
  openDays?: number | null
  positions: number
}
export interface PnlBookStrategy extends PnlBookFigure {
  key: string
  kind: 'loop' | 'deposit' | 'position'
  protocol: string | null
  lenderKeys: string[]
  chains: string[]
  held: string[]
  debt: string[]
  /** the biggest held leg's market name (a curated vault's own name) */
  market?: string | null
  equityUsd: number
  since: string | null
  /** the strategy's own line (the index draws it for the biggest few only) */
  series: PnlBookPoint[] | null
}
export interface PnlBookPosition {
  key: string
  chainId: string
  strategyKey: string
  equityUsd: number | null
  pnlUsd: number | null
  yieldUsd: number | null
  pnlAprPct: number | null
  yieldAprPct: number | null
  since: string | null
  exact: boolean | null
  /** ok, or why it has no figure: `pending` = not drawn yet, else the record's status */
  status: string
  flags: string[]
  /** 1 = the index draws it next (its place among every wallet asked for); null/absent = not asked for, or drawn (EVM index, tickets/0093) */
  queuePosition?: number | null
}
/** A leg the wallet's last sync named that the index will never draw: its chain or its lender is not followed. */
export interface UnsupportedLeg {
  chainId: string
  lender: string
  marketUid: string | null
  /** `chain` = a chain the index does not follow; else why the lender is not followed */
  reason: string
}
export interface AccountPnlBook {
  account: string
  total: PnlBookFigure & { equityUsd: number }
  coverage: {
    positions: number
    withPnl: number
    /** of those, with a stored daily line; the rest are in the line's last point only */
    withLine?: number
    pending: number
    unranked: Record<string, number>
    equityShare: number | null
  }
  series: PnlBookPoint[]
  strategies: PnlBookStrategy[]
  positions: PnlBookPosition[]
  /** when this wallet's records were last asked for (`?request=1`, the sync); absent on an older index */
  requestedAt?: string | null
  /** what the last sync named that the index will never draw a record for; absent on an older index */
  unsupported?: UnsupportedLeg[]
}

export async function accountPnlBook(account: string, { request = false }: { request?: boolean } = {}): Promise<AccountPnlBook | null> {
  // `request=1`: someone is looking — either index draws this wallet's records ahead of its board (tickets/0093)
  const r = await fetch(`${indexForAddr(account)}/accounts/${account}/pnl${request ? '?request=1' : ''}`)
  // an index before the route: no book, not an error worth a red box
  if (r.status === 404) return null
  const j = (await r.json().catch(() => ({}))) as AccountPnlBook & { error?: string }
  if (!r.ok) throw new Error(j.error || `/accounts/${account}/pnl → ${r.status}`)
  return j
}

/** how long an own page re-reads a book that still has positions waiting to be drawn */
const PNL_POLL_FOR_MS = 5 * 60_000
const PNL_POLL_EVERY_MS = 20_000

/**
 * `own`: the connected wallet's own page. The book is asked for with
 * `request=1` (its records jump the index's queue) and re-read every 20 s
 * for five minutes while positions are still waiting to be drawn.
 */
export function useAccountPnlBook(account: string | undefined, { own = false }: { own?: boolean } = {}) {
  const [since] = useState(() => Date.now())
  return useQuery({
    enabled: !!account && (isEvmAddr(account) || isSolAddr(account)),
    // a base58 key is case-significant: only an EVM address is lower-cased
    queryKey: ['pnl-book', account && isEvmAddr(account) ? account.toLowerCase() : account],
    queryFn: () => accountPnlBook(isEvmAddr(account) ? account.toLowerCase() : account!, { request: own }),
    staleTime: 5 * 60_000,
    retry: 1,
    refetchInterval: (q) => (own && (q.state.data?.coverage.pending ?? 0) > 0 && Date.now() - since < PNL_POLL_FOR_MS ? PNL_POLL_EVERY_MS : false),
  })
}

/** A lender key as words, for a sentence: `SOLV` → Solv, `AAVE_V3` → Aave V3. */
export function venueName(lender: string): string {
  return lender
    .replace(/^vault\./, '')
    .split(/[_.]/)
    .filter(Boolean)
    .map((w) => (/^v\d+$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
}

/** "3 on venues the index does not follow (Solv, Lista)" — empty when there are none. */
export function unsupportedLine(b: AccountPnlBook): string {
  const w = pnlWaiting(b)
  if (!w.unsupported) return ''
  const names = w.venues.slice(0, 3).map(venueName).join(', ') + (w.venues.length > 3 ? ` +${w.venues.length - 3}` : '')
  return `${w.unsupported} on venue${w.unsupported === 1 ? '' : 's'} the index does not follow (${names})`
}

/**
 * Where the waiting stands, as counts: drawing now (in the index's requested
 * queue), waiting, and on venues the index will never draw (by lender).
 */
export function pnlWaiting(b: AccountPnlBook): { drawing: number; waiting: number; unsupported: number; venues: string[] } {
  let drawing = 0
  for (const p of b.positions) if (p.status === 'pending' && p.queuePosition != null) drawing++
  const un = b.unsupported ?? []
  return {
    drawing,
    waiting: Math.max(0, b.coverage.pending - drawing),
    unsupported: un.length,
    venues: [...new Set(un.map((u) => u.lender))],
  }
}

/**
 * "wstETH ↺ WETH", "USDC": what the strategy holds, and what it borrows
 * against it — or a curated vault's own name, where the symbol alone would
 * read the same for every USDC vault.
 */
export function strategyLabel(s: Pick<PnlBookStrategy, 'held' | 'debt' | 'market' | 'protocol'>): string {
  if (s.protocol?.startsWith('vault.') && s.market && !s.debt.length) return s.market
  const held = s.held.slice(0, 2).join(' + ') + (s.held.length > 2 ? ` +${s.held.length - 2}` : '')
  const debt = s.debt.slice(0, 2).join(' + ') + (s.debt.length > 2 ? ` +${s.debt.length - 2}` : '')
  return (held || '—') + (debt ? ` ↺ ${debt}` : '')
}
