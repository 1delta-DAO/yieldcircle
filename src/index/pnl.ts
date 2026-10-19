/**
 * A wallet's lifetime PnL book (pos-indexer `GET /accounts/:account/pnl`,
 * its docs/lifetime-pnl.md "The wallet book"): every board position's
 * lifetime record summed into one line, the daily PnL / yield line, and the
 * same per strategy. Computed by the index from records it already stored —
 * the call is one cheap read. Both indexes answer it (the Solana one since
 * its PnL lane, docs/sol-lifetime-pnl.md), each for its own addresses.
 */
import { useQuery } from '@tanstack/react-query'
import { indexForAddr } from './api'
import { isEvmAddr, isSolAddr } from '../model/address'

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
}

export async function accountPnlBook(account: string): Promise<AccountPnlBook | null> {
  const r = await fetch(`${indexForAddr(account)}/accounts/${account}/pnl`)
  // an index before the route: no book, not an error worth a red box
  if (r.status === 404) return null
  const j = (await r.json().catch(() => ({}))) as AccountPnlBook & { error?: string }
  if (!r.ok) throw new Error(j.error || `/accounts/${account}/pnl → ${r.status}`)
  return j
}

export function useAccountPnlBook(account: string | undefined) {
  return useQuery({
    enabled: !!account && (isEvmAddr(account) || isSolAddr(account)),
    // a base58 key is case-significant: only an EVM address is lower-cased
    queryKey: ['pnl-book', account && isEvmAddr(account) ? account.toLowerCase() : account],
    queryFn: () => accountPnlBook(isEvmAddr(account) ? account.toLowerCase() : account!),
    staleTime: 5 * 60_000,
    retry: 1,
  })
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
