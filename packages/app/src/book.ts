import React from 'react'
import { useSession, type Session } from './session'
import { isEvmAddr, isSolAddr } from '@yieldcircle/core/model/address'
import { useBalancesPerChain, useCatalog, useEarnPositions, useFixedRateCatalog } from './sdk/queries'
import { books, holdingsFrom, idleFrom, mergeIdle, type AssetBook, type Holding, type Idle } from '@yieldcircle/core/model/positions'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { sharedCache, useSame } from './shared'

// one list for every reader of the book: what is keyed on it (the rate history's uids, Lite's menu) holds still
const allOf = sharedCache()
const NONE: string[] = []

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
 *
 * Under a `BookProvider` it is the provider's book, read from context; without one the caller
 * reads its own. Either is fixed for a mounted component, so the hooks below it never change order.
 */
export function useBook(): Book {
  const shared = React.useContext(Ctx)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return shared ?? useOwnBook()
}
export type Book = ReturnType<typeof useOwnBook>
const Ctx = React.createContext<Book | null>(null)
/**
 * One book for everything under it (the phone's root, `mobile/app/_layout.tsx`). `useBook` holds
 * some hundred query observers — a page of the catalogue, a balance read per chain — and it is
 * called by the header, every tab and every sheet: each copy woke on every answer, and each wake
 * was a render of its page (docs/mobile-perf.md). Here the hook runs once and the rest read its
 * answer, which is the same object until something in it changes. Under the `SessionProvider`
 * whose book it is; a page that shows another session's book must not sit under it.
 */
export function BookProvider({ children }: { children: React.ReactNode }) {
  return React.createElement(Ctx.Provider, { value: useOwnBook() }, children)
}

function useOwnBook() {
  const session = useSession()
  const { chainIds, account, viewAs, paper } = session
  // a paper account's money is its ledger (tickets/0006): nothing is read from the chain for it,
  // and nothing about it is sent to the index — every screen below gets the same shapes
  const onPaper = !!paper?.active && !viewAs
  const accounts = useSame(accountsOf(session))
  const cat = useCatalog(chainIds)
  const all: Strategy[] = allOf([cat.simple, cat.loops], () => [...cat.simple, ...cat.loops])
  // one balance read per selected chain, for every address the catalogue knows there, sent once that chain has settled
  const bals = useBalancesPerChain(accounts, chainIds.map((c) => ({ chainId: c, addresses: cat.addresses[c] ?? NONE, extra: cat.extraAddresses[c], ready: cat.settled.has(c) })))
  // worked out on every render, as before (what a token is can be learned between two of them) —
  // but handed on as the same object while it says the same (`useSame`), like the holdings and books below
  const idle: Idle[] = useSame(onPaper ? paper!.idle(chainIds) : bals.flatMap((b, i) => (b.data ? idleFrom(b.data.items, chainIds[i]) : [])))
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
  const holdings: Holding[] = useSame((onPaper ? paper!.holdings.filter((h) => chainIds.includes(h.chainId)) : pos.anyData ? holdingsFrom(pos.items) : []).map(dated))
  const bk: AssetBook[] = useSame(books(holdings, idleMerged))
  const positionsLoading = onPaper ? !paper!.ledger : !!(accounts.evm || accounts.sol) && (pos.isLoading || bals.some((b) => b.isLoading || (!b.data && b.fetchStatus === 'idle' && !b.isFetched)))
  const positionsError = onPaper ? null : pos.error as Error | null
  // the same object until a part of it changes: a reader re-renders for news, not for every answer that said nothing new
  return React.useMemo(() => ({
    ...cat, all, fixed, idle, idlePerChain: idle, books: bk, holdings,
    positionsLoading,
    positionsError,
    account,
    /** the wallets read, one per VM (`accountsOf`) */
    accounts,
    /** the book on screen is the paper account's (tickets/0006) */
    paper: onPaper,
  }), [cat, all, fixed, idle, bk, holdings, positionsLoading, positionsError, account, accounts, onPaper])
}
