/**
 * The Borrow tab (`#/borrow`, tickets/0010–0011): Earn is "deposit and earn on it", Borrow is "put
 * up what you hold and take liquidity out".
 *
 * It is the same list a category's Borrow segment shows (`BorrowList` under `BorrowCats`), across
 * every shelf: one UX for borrowing, wherever it is opened. "Against what you hold" is the first
 * pill of that row — a filter on this list, on by default when the wallet holds something a market
 * lends against — not a page or a set of cards of its own (that was tried, 2026-10-14, and read as
 * a second flow). Each row the wallet can use says so: what it holds there, collateral already put
 * up (5 ETH supplied on Aave), a loan running, and how much it could take.
 *
 * The money sheet's "Borrow cash", the Earn digest's "or borrow up to" and the idle pills all lead
 * here; `?u=<asset>` alone opens the ticket on the app's pick for that asset (`bestOfferFor`).
 */
import React from 'react'
import { bestOfferFor, loansByOffer, offerFromHolding, outOf, owedOf, yoursOf, type BorrowOffer, type Out } from '../model/borrow'
import type { Holding } from '../model/positions'
import { chainLabel, useBorrowOffers } from '../sdk/queries'
import { go, useApp, type Route } from '../state/AppState'
import { useBook } from './useBook'
import { BorrowTicket } from './BorrowTicket'
import { BorrowCats, BorrowList, mineSummary } from './BorrowList'
import { useAsideTop } from './AssetPage'
import { ChainChip } from './ChainPicker'
import { HealthPill, Tok, usd } from './bits'

export function BorrowPage({ route }: { route: Route }) {
  const b = useBook()
  const { chainIds } = useApp()
  // a running loan opened from a link that owes a coin: its family is asked too, so it is managed from its own market
  const linked = route.h ? b.holdings.find((h) => h.key === route.h && h.kind === 'borrow') : undefined
  const out: Out = route.out ?? (linked?.debtAddress ? outOf({ chainId: linked.chainId, address: linked.debtAddress, symbol: linked.debtSymbol }) ?? 'USD' : 'USD')
  const outQ = out === 'USD' ? undefined : out
  const bo = useBorrowOffers(chainIds, { out })
  const offers = bo.offers
  // ---- the wallet's loans and collateral already put up, by offer; and what it holds per offer
  const held = React.useMemo(() => loansByOffer(offers, b.holdings), [offers, b.holdings])
  const yours = React.useMemo(() => yoursOf(offers.filter((o) => o.out === out), b.idlePerChain, held), [offers, out, b.idlePerChain, held])
  const sum = mineSummary(offers, yours)
  const mineOn = !!b.account && (route.hold === '1' || (route.hold !== '0' && yours.size > 0))
  const keep = { out: outQ, hold: route.hold, debt: route.debt }
  const setMine = (on: boolean) => go('borrow', { ...keep, hold: on ? '1' : '0', u: route.u, s: route.s, h: route.h, m: route.m })
  // ---- running loans
  const loans = b.holdings.filter((h) => h.kind === 'borrow')
  const sameLegs = (o: BorrowOffer, h: Holding) => !!h.collateralUid && !!h.debtUid && h.collateralUid.toLowerCase() === o.collateral.uid.toLowerCase() && h.debtUid.toLowerCase() === o.debt.uid.toLowerCase()
  const offerOf = (h: Holding): BorrowOffer | null => offers.find((o) => sameLegs(o, h)) ?? offerFromHolding(h)
  // ---- the ticket
  const loanHolding = route.h ? loans.find((h) => h.key === route.h) ?? null : null
  // `?u=<asset>` alone (the money sheet's "Or borrow against it"): the app's pick for that asset
  const sel: BorrowOffer | null = route.s?.startsWith('b:') ? offers.find((o) => o.id === route.s) ?? (loanHolding ? offerOf(loanHolding) : null)
    : loanHolding ? offerOf(loanHolding)
    : route.u && route.u !== 'all' ? bestOfferFor(route.u, offers, b.idlePerChain, out) ?? null : null
  const choices = sel ? offers.filter((o) => o.asset === sel.asset && o.maxLtv > 0 && o.out === sel.out) : []
  const open = (o: BorrowOffer, h?: Holding, m?: 'add' | 'reduce') => go('borrow', { ...keep, u: o.asset, s: o.id, h: h?.key, m, out: o.out === 'USD' ? undefined : o.out })
  const close = () => go('borrow', keep)
  const ticketOpen = !!sel
  const aside = useAsideTop(ticketOpen)
  return (
    <>
      <div className={`asset${ticketOpen ? '' : ' noticket'}`}>
        <div className="main">
          <div className="feed-h earn-h">
            <h1>Borrow</h1>
            <span className="sub t50 hide-m">put up what you hold and take liquidity out, without selling</span>
            <span className="sp" />
            <ChainChip />
          </div>

          {loans.length > 0 && <section className="sec">
            <div className="sec-h"><h2>Your loans</h2><span className="sub">{usd(loans.reduce((a, h) => a + owedOf(h), 0))} owed</span></div>
            <div className="card"><table className="tbl slim"><tbody>{loans.map((h) => { const o = offerOf(h); const owed = owedOf(h); return (
              <tr key={h.key} aria-selected={loanHolding?.key === h.key} onClick={() => o && open(o, h, 'reduce')}>
                <td><div className="nm"><Tok sym={h.symbol} logo={h.logo} />{h.label}{h.paper && <span className="pill paper">paper</span>}</div><small>{h.venue} · {chainLabel(h.chainId)}</small></td>
                <td className="r"><span>owes {usd(owed)}</span><small>{h.health != null ? <HealthPill h={h.health} /> : `${usd(h.collateralUsd ?? 0)} put up`}</small></td>
                <td className="r t40" style={{ width: 20 }}>›</td>
              </tr>) })}</tbody></table></div>
          </section>}

          <section className="sec">
            <BorrowCats offers={offers} current="all" keep={keep} mine={b.account ? { on: mineOn, ...sum, set: setMine, busy: b.positionsLoading || bo.isLoading } : undefined} />
            <p className="t70 bp-intro hide-m">{mineOn ? 'Where what you hold can be put up, and what it could take there, held to the Safe zone.' : 'Every place that lends against what people hold.'} You keep everything it does and pay interest on what you take; if its price falls far enough, the lender sells part of it to repay.</p>
            <BorrowList key={`${out}:${mineOn}`} offers={offers} loading={bo.isLoading} groupId="all" u="all" selId={sel?.id} held={held} mine={{ on: mineOn, yours, set: setMine }} out={out}
              onOut={(f) => go('borrow', { ...keep, out: f === 'USD' ? undefined : f, debt: undefined })} debt={route.debt} onDebt={(d) => go('borrow', { ...keep, debt: d })} onPick={(o) => open(o)} />
          </section>
        </div>
        <aside ref={aside} className={ticketOpen ? '' : 'closed'} id="aside">
          {sel && <BorrowTicket key={sel.id + (route.m ?? '') + (route.h ?? '')} o={sel} holdings={held.get(sel.id) ?? (loanHolding ? [loanHolding] : [])} idle={b.idlePerChain} pick={route.h} mode={route.m}
            alternatives={offers.filter((o) => o.chainId === sel.chainId && o.asset === sel.asset && o.debt.symbol === sel.debt.symbol)}
            choices={choices} onPick={(o) => open(o)}
            offMenu={!offers.some((o) => o.id === sel.id) ? 'This loan sits in a market the list does not show. It can be paid back here; borrowing more is for the venue itself.' : undefined} onClose={close} />}
        </aside>
      </div>
      {ticketOpen && <div className="scrim" onClick={close} />}
    </>
  )
}
