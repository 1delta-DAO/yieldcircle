/**
 * Borrowing, holdings first (`#/borrow`, tickets/0010).
 *
 * The category pages' Borrow lists answer "where can I borrow?" with every lender, chain and dollar
 * — 212 rows for Ether. A borrower asks something else: "how much can I take out against what I
 * have, and what does it cost?" This page answers that, one card per asset the wallet holds that a
 * market lends against, and opens the ticket on the app's pick of lender (`bestOfferFor`); the
 * other places sit folded inside the ticket. With nothing held, the same cards show what is most
 * borrowed against. The categories follow, Stocks among them, for browsing.
 *
 * It is the Borrow tab (tickets/0011): Earn is "deposit and earn on it", Borrow is "put up what
 * you hold and take liquidity out". The money sheet's "Borrow cash", the Earn digest's "or borrow
 * up to" and a category's Borrow list all lead here too.
 *
 * Collateral already put up with nothing borrowed against it (5 ETH supplied on Aave) gets a card
 * of its own: the ticket opens on that market and borrows against it with nothing new to type.
 */
import React from 'react'
import { nameOf } from '../model/assets'
import { bestOfferFor, bordersFor, byOffer, depositsAsLoans, headlineOffers, maxBorrowUsd, offerFromHolding, outOf, owedOf, type BorrowOffer, type Out } from '../model/borrow'
import type { Holding } from '../model/positions'
import { chainLabel, useBorrowOffers } from '../sdk/queries'
import { go, useApp, type Route } from '../state/AppState'
import { useBook } from './useBook'
import { BorrowTicket } from './BorrowTicket'
import { BorrowCats, borrowRoom } from './BorrowList'
import { useAsideTop } from './AssetPage'
import { ChainChip } from './ChainPicker'
import { HealthPill, Sk, Tok, amt, pct, usd, usdShort } from './bits'

export function BorrowPage({ route }: { route: Route }) {
  const b = useBook()
  const { chainIds } = useApp()
  // a running loan opened from a link that owes a coin: its family is asked too, so it is managed from its own market
  const linked = route.h ? b.holdings.find((h) => h.key === route.h && h.kind === 'borrow') : undefined
  const out: Out = route.out ?? (linked?.debtAddress ? outOf({ chainId: linked.chainId, address: linked.debtAddress, symbol: linked.debtSymbol }) ?? 'USD' : 'USD')
  const bo = useBorrowOffers(chainIds, { out })
  const offers = bo.offers
  // ---- what the wallet holds that a market lends against, the most it could raise first
  const held = React.useMemo(() => {
    const assets = [...new Set(b.idlePerChain.filter((i) => i.usd >= 1).map((i) => i.asset))]
    return assets.flatMap((asset) => {
      const best = bestOfferFor(asset, offers, b.idlePerChain)
      if (!best) return []
      const idleUsd = b.idlePerChain.filter((i) => i.asset === asset).reduce((a, i) => a + i.usd, 0)
      const idleAmt = b.idlePerChain.filter((i) => i.asset === asset).reduce((a, i) => a + i.amount, 0)
      return [{ asset, best, room: borrowRoom(asset, b.idlePerChain, offers), idleUsd, idleAmt, n: offers.filter((o) => o.asset === asset).length }]
    // a balance that would raise a few dollars is dust here, not a card
    }).filter((x) => x.room >= 10).sort((x, y) => y.room - x.room || y.idleUsd - x.idleUsd)
  }, [offers, b.idlePerChain])
  // ---- what is already put up with nothing owed: a lending deposit in a market some offer lends against
  const deposits = React.useMemo(() => b.holdings.filter((h) => h.kind === 'simple' && !!h.marketUid && !h.paper), [b.holdings])
  const putUp = React.useMemo(() => deposits.flatMap((h) => {
    const m = h.marketUid!.toLowerCase()
    const best = offers.filter((o) => o.out === 'USD' && o.maxLtv > 0 && o.collateral.uid.toLowerCase() === m).sort(byOffer)[0]
    if (!best) return []
    const room = Math.min(maxBorrowUsd(best, h.valueUsd), h.valueUsd * best.liqLtv * (1 - bordersFor(best).safe))
    return room >= 10 ? [{ h, best, room }] : []
  }).sort((x, y) => y.room - x.room), [deposits, offers])
  // ---- nothing held (or not connected): what people borrow against most
  const popular = React.useMemo(() => {
    const by = new Map<string, BorrowOffer[]>()
    for (const o of headlineOffers(offers)) by.set(o.asset, [...(by.get(o.asset) ?? []), o])
    // a collateral market lends several dollars: its size counts once, not once per pair
    const sizeOf = (os: BorrowOffer[]) => [...new Map(os.map((o) => [o.collateral.uid, o.collateralUsd])).values()].reduce((a, v) => a + v, 0)
    const all = [...by.entries()].map(([asset, os]) => ({ asset, best: [...os].sort(byOffer)[0], size: sizeOf(os), ltv: Math.max(...os.map((o) => o.maxLtv)), n: os.length }))
      .filter((x) => !held.some((h) => h.asset === x.asset) && !putUp.some((p) => p.best.asset === x.asset)).sort((x, y) => y.size - x.size)
    // stocks are smaller than the coins by collateral, and the category the shelf leads with: the two biggest always show
    const stocks = all.filter((x) => x.best.assetClass).slice(0, 2)
    const max = held.length || putUp.length ? 4 : 8
    return [...all.filter((x) => !x.best.assetClass).slice(0, max - stocks.length), ...stocks]
  }, [offers, held, putUp])
  // ---- running loans
  const loans = b.holdings.filter((h) => h.kind === 'borrow')
  const sameLegs = (o: BorrowOffer, h: Holding) => !!h.collateralUid && !!h.debtUid && h.collateralUid.toLowerCase() === o.collateral.uid.toLowerCase() && h.debtUid.toLowerCase() === o.debt.uid.toLowerCase()
  const offerOf = (h: Holding): BorrowOffer | null => offers.find((o) => sameLegs(o, h)) ?? offerFromHolding(h)
  // ---- the ticket
  const loanHolding = route.h ? loans.find((h) => h.key === route.h) ?? null : null
  // `?u=<asset>` alone (the money sheet's "Or borrow against it"): the app's pick for that asset
  const sel: BorrowOffer | null = route.s?.startsWith('b:') ? offers.find((o) => o.id === route.s) ?? (loanHolding ? offerOf(loanHolding) : null)
    : loanHolding ? offerOf(loanHolding)
    : route.u && route.u !== 'all' ? bestOfferFor(route.u, offers, b.idlePerChain) ?? null : null
  // the loans on this pair, and what is already put up in its collateral market with nothing owed
  const heldOn = (o: BorrowOffer) => [...loans.filter((h) => sameLegs(o, h)), ...depositsAsLoans(o, deposits)]
  const choices = sel ? offers.filter((o) => o.asset === sel.asset && o.maxLtv > 0 && o.out === sel.out) : []
  const open = (o: BorrowOffer, h?: Holding, m?: 'add' | 'reduce') => go('borrow', { u: o.asset, s: o.id, h: h?.key, m, out: o.out === 'USD' ? undefined : o.out })
  const close = () => go('borrow', {})
  const ticketOpen = !!sel
  const aside = useAsideTop(ticketOpen)
  const busy = bo.isLoading && !offers.length
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
          <p className="t70 bp-intro">Put up something you hold and take dollars — or ether, bitcoin, another coin — out. You keep everything it does; you pay interest on what you take. If its price falls far enough, the lender sells part of it to repay — the ticket starts you well clear of that.</p>

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
            <div className="sec-h"><h2>{held.length || putUp.length ? 'Against what you hold' : 'What people borrow against'}</h2><span className="sub">{held.length || putUp.length ? 'the most you could take, held to the Safe zone' : b.account ? 'nothing you hold here is lent against yet' : 'connect a wallet to see what yours could raise'}</span></div>
            {busy ? <div className="bcards">{[0, 1, 2].map((i) => <div key={i} className="bcard"><Sk w={90} /><Sk w={120} h={20} /><Sk w={140} /></div>)}</div>
              : <div className="bcards">
                {putUp.map(({ h, best, room }) => (
                  <button key={h.key} type="button" className="bcard mine" aria-pressed={sel?.id === best.id} onClick={() => open(best, h)}>
                    <span className="bc-h"><Tok sym={h.symbol} logo={h.logo ?? best.collateral.logo} size={24} /><b>{nameOf(best.asset)}</b><span className="t50">{amt(h.asset, h.amount, h.valueUsd)}</span></span>
                    <span className="bc-v"><span className="t50">borrow up to </span>{usdShort(room)}</span>
                    <span className="bc-s"><span className="pill run">already put up</span> at {h.venue} · {chainLabel(h.chainId)} · from <b className="ok">{pct(best.borrowApr)}</b>, nothing to add</span>
                  </button>))}
                {held.map((x) => (
                  <button key={x.asset} type="button" className="bcard mine" aria-pressed={sel?.asset === x.asset && !putUp.some((p) => p.h.key === route.h)} onClick={() => open(x.best)}>
                    <span className="bc-h"><Tok sym={x.asset} logo={x.best.collateral.logo} size={24} /><b>{nameOf(x.asset)}</b><span className="t50">{amt(x.asset, x.idleAmt, x.idleUsd)}</span></span>
                    <span className="bc-v">{x.room >= 1 ? <><span className="t50">borrow up to </span>{usdShort(x.room)}</> : <span className="t50">a little to put up</span>}</span>
                    <span className="bc-s">from <b className="ok">{pct(x.best.borrowApr)}</b> at {x.best.venue} · {chainLabel(x.best.chainId)}{x.n > 1 ? ` · ${x.n - 1} other place${x.n === 2 ? '' : 's'}` : ''}</span>
                  </button>))}
                {popular.map((x) => (
                  <button key={x.asset} type="button" className="bcard" aria-pressed={sel?.asset === x.asset} onClick={() => open(bestOfferFor(x.asset, offers, b.idlePerChain) ?? x.best)}>
                    <span className="bc-h"><Tok sym={x.asset} logo={x.best.collateral.logo} size={24} /><b>{nameOf(x.asset)}</b>{nameOf(x.asset) !== x.best.collateral.symbol && <span className="t50 sym">{x.best.collateral.symbol}</span>}{x.best.assetClass && <span className="pill new">stock</span>}</span>
                    <span className="bc-v"><span className="t50">lends up to </span>{Math.round(x.ltv * 100)}%</span>
                    <span className="bc-s">from <b className="ok">{pct(x.best.borrowApr)}</b> · {usdShort(x.size)} put up by others</span>
                  </button>))}
              </div>}
            {held.length + putUp.length > 0 && popular.length > 0 && <div className="foot" style={{ marginTop: 8 }}>The lighter cards are what others borrow against most — you would need to hold some first; the ticket can get it for you.</div>}
          </section>

          <section className="sec">
            <div className="sec-h"><h2>Browse by category</h2><span className="sub">every place that lends, per shelf</span></div>
            <BorrowCats offers={offers} />
          </section>
        </div>
        <aside ref={aside} className={ticketOpen ? '' : 'closed'} id="aside">
          {sel && <BorrowTicket key={sel.id + (route.m ?? '') + (route.h ?? '')} o={sel} holdings={heldOn(sel).length ? heldOn(sel) : loanHolding ? [loanHolding] : []} idle={b.idlePerChain} pick={route.h} mode={route.m}
            alternatives={offers.filter((o) => o.chainId === sel.chainId && o.asset === sel.asset && o.debt.symbol === sel.debt.symbol)}
            choices={choices} onPick={(o) => open(o)}
            offMenu={!offers.some((o) => o.id === sel.id) ? 'This loan sits in a market the list does not show. It can be paid back here; borrowing more is for the venue itself.' : undefined} onClose={close} />}
        </aside>
      </div>
      {ticketOpen && <div className="scrim" onClick={close} />}
    </>
  )
}
