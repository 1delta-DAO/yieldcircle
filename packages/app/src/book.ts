import { useSession, type Session } from './session'
import { isEvmAddr, isSolAddr } from '@yieldcircle/core/model/address'
import { useBalancesPerChain, useCatalog, useEarnPositions, useFixedRateCatalog } from './sdk/queries'
import { books, holdingsFrom, idleFrom, mergeIdle, type AssetBook, type Holding, type Idle } from '@yieldcircle/core/model/positions'
import type { Strategy } from '@yieldcircle/core/model/strategies'

/** The wallets whose money the screens show, one address per VM. */
export interface Accounts { evm?: string; sol?: string }
/**
 * Whose book it is: `account` is the EVM wallet when both are connected, so Solana reads the
 * Solana wallet — unless the page is viewing someone else, whose other VM we do not know. The one
 * rule for the positions (`useBook`) and for what they made (`useAccountsPnlBook`, tickets/0018).
 * A paper account reads nothing from the chain: no wallets.
 */
export function accountsOf(s: Pick<Session, 'account' | 'solSigner' | 'viewAs' | 'paper'>): Accounts {
  if (s.paper?.active && !s.viewAs) return {}
  return { evm: isEvmAddr(s.account) ? s.account : undefined, sol: isSolAddr(s.account) ? s.account : s.viewAs ? undefined : s.solSigner }
}

/**
 * Everything a screen needs in one hook: the curated catalogue, the account's holdings and idle
 * balances (per selected chain), and the per-asset books that combine them.
 */
export function useBook() {
  const session = useSession()
  const { chainIds, account, viewAs, paper } = session
  // a paper account's money is its ledger (tickets/0006): nothing is read from the chain for it,
  // and nothing about it is sent to the index — every screen below gets the same shapes
  const onPaper = !!paper?.active && !viewAs
  const accounts = accountsOf(session)
  const cat = useCatalog(chainIds)
  const all: Strategy[] = [...cat.simple, ...cat.loops]
  // one balance read per selected chain, for every address the catalogue knows there, sent once that chain has settled
  const bals = useBalancesPerChain(accounts, chainIds.map((c) => ({ chainId: c, addresses: cat.addresses[c] ?? [], extra: cat.extraAddresses[c], ready: cat.settled.has(c) })))
  const idle: Idle[] = onPaper ? paper!.idle(chainIds) : bals.flatMap((b, i) => (b.data ? idleFrom(b.data.items, chainIds[i]) : []))
  const idleMerged = mergeIdle(idle)
  const pos = useEarnPositions(accounts, chainIds)
  // the Fixed rate shelf (tickets/0013) — its own request; its rows also date the book loans the wallet holds
  const fixed = useFixedRateCatalog(chainIds)
  const books0 = new Map(fixed.all.map((s) => [s.earnUid.toLowerCase(), s]))
  // the same rows date a Midnight DEBT: the lend row of a maturity is that market's loan-token side, the uid a loop owes in
  const owed0 = new Map(fixed.all.map((s) => [(s.marketUid ?? s.earnUid).toLowerCase(), s]))
  const dated = (h: Holding): Holding => {
    if (h.kind !== 'simple') { const d = h.debtUid ? owed0.get(h.debtUid.toLowerCase()) : undefined; return d?.maturity ? { ...h, dueAt: d.maturity } : h }
    const s = h.earnUid ? books0.get(h.earnUid.toLowerCase()) : undefined
    return s?.maturity ? { ...h, maturity: s.maturity, bookLoan: true } : h
  }
  const holdings: Holding[] = (onPaper ? paper!.holdings.filter((h) => chainIds.includes(h.chainId)) : pos.anyData ? holdingsFrom(pos.items) : []).map(dated)
  const bk: AssetBook[] = books(holdings, idleMerged)
  return {
    ...cat, all, fixed, idle, idlePerChain: idle, books: bk, holdings,
    positionsLoading: onPaper ? !paper!.ledger : !!(accounts.evm || accounts.sol) && (pos.isLoading || bals.some((b) => b.isLoading || (!b.data && b.fetchStatus === 'idle' && !b.isFetched))),
    positionsError: onPaper ? null : pos.error as Error | null,
    account,
    /** the wallets read, one per VM (`accountsOf`) */
    accounts,
    /** the book on screen is the paper account's (tickets/0006) */
    paper: onPaper,
  }
}
