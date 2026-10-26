/**
 * A wallet's lifetime PnL book (pos-indexer `GET /accounts/:account/pnl`,
 * its docs/lifetime-pnl.md "The wallet book"): every board position's
 * lifetime record summed into one line, the daily PnL / yield line, and the
 * same per strategy. Computed by the index from records it already stored —
 * the call is one cheap read. Both indexes answer it (the Solana one since
 * its PnL lane, docs/sol-lifetime-pnl.md), each for its own addresses.
 */
import { useState } from 'react'
import type { AccountPnlBook, PnlBookPosition, PnlBookStrategy } from '@yieldcircle/core/index/types'
import { useQuery } from '@tanstack/react-query'
import { indexForAddr } from '@yieldcircle/core/index/api'
import type { Holding } from '@yieldcircle/core/model/positions'
import { pnlOfHolding } from '@yieldcircle/core/model/holdingPnl'
import { useSession } from '../session'
import { accountsOf, type Accounts } from '../book'
import { mergeBooks } from '@yieldcircle/core/model/pnlBookMerge'
import { isEvmAddr, isSolAddr } from '@yieldcircle/core/model/address'

export type { AccountPnlBook, PnlBookFigure, PnlBookPoint, PnlBookPosition, PnlBookStrategy, UnsupportedLeg } from '@yieldcircle/core/index/types'

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

/**
 * What several wallets made, as one book (tickets/0018): each wallet's book from its own index
 * (`useAccountPnlBook`, same cache and polling), folded by `mergeBooks`. Loading while any is;
 * a wallet whose book failed is named in `failed` and left out — never a silent partial.
 */
export function useAccountsPnlBook(accounts: Accounts, { own = false }: { own?: boolean } = {}) {
  const e = useAccountPnlBook(accounts.evm, { own })
  const s = useAccountPnlBook(accounts.sol, { own })
  const qs = [e, s]
  const got = qs.map((q) => q.data).filter((b): b is AccountPnlBook => !!b)
  const failed = [accounts.evm && e.isError ? accounts.evm : null, accounts.sol && s.isError ? accounts.sol : null].filter((a): a is string => !!a)
  const asked = [accounts.evm, accounts.sol].filter(Boolean).length
  return {
    data: got.length ? mergeBooks(got) : asked && qs.every((q) => !q.isLoading) ? null : undefined,
    isLoading: qs.some((q) => q.isLoading),
    isError: asked > 0 && failed.length === asked,
    failed,
  }
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

/**
 * One live position's own PnL from its wallet's book (`pnlOfHolding`): what it made since it was
 * opened, and that a year on what was in. The book is the one of the holding's own VM — a Solana
 * position is in the Solana wallet's book on the Solana index (tickets/0018) — and the one You
 * reads (one query, cached).
 */
export function useHoldingPnl(h: Holding | null | undefined): PnlBookPosition | null {
  const accounts = accountsOf(useSession())
  const account = h && !h.key.startsWith('paper:') ? (h.chainId === 'solana' ? accounts.sol : accounts.evm) : undefined
  const q = useAccountPnlBook(account)
  return h ? pnlOfHolding(q.data?.positions, h) : null
}
