/**
 * The Borrow side of an asset page (tickets/0008): the dollar loans the asset can be put up for,
 * one row each — what you put up, what you take out, where, the rate and how far it lends. The
 * list decides WHERE; the ticket decides how much (`BorrowTicket`).
 *
 * Above it, the categories (`BorrowCats`): every group that can be borrowed against, Stocks among
 * them as a category of its own (tickets/0009) — so Borrow reads as one place across the shelves
 * rather than a fourth tab on each.
 */
import React from 'react'
import { GROUPS, nameOf, type GroupId } from '../model/assets'
import { DEEP_USD, bordersFor, headlineOffers, maxBorrowUsd, type BorrowOffer } from '../model/borrow'
import type { Holding, Idle } from '../model/positions'
import { chainLabel } from '../sdk/queries'
import { go } from '../state/AppState'
import { useViewport } from './useViewport'
import { GroupIcon, Sk, Toks, pct, usdShort } from './bits'

/** What a list row says about how far a market lends: `up to 73 %`, and its room in the zone's words. */
const lendsWord = (o: BorrowOffer) => `up to ${Math.round(o.maxLtv * 100)}%`

export function BorrowList({ offers, loading, groupId, u, selId, held, onPick }: {
  offers: BorrowOffer[]; loading: boolean; groupId: GroupId; u: string; selId?: string
  /** the wallet's running loans on these pairs, by offer id */
  held: Map<string, Holding[]>
  onPick: (o: BorrowOffer) => void
}) {
  const phone = useViewport() === 'phone'
  // what you take out: every dollar the list lends, the most offered first
  const debts = React.useMemo(() => {
    const n = new Map<string, number>()
    for (const o of offers) n.set(o.debt.symbol, (n.get(o.debt.symbol) ?? 0) + 1)
    return [...n].sort((a, b) => b[1] - a[1]).map(([s]) => s)
  }, [offers])
  const [debt, setDebt] = React.useState<string>('all')
  const list = debt === 'all' ? offers : offers.filter((o) => o.debt.symbol === debt)
  return (
    <>
      {debts.length > 1 && <div className="chips dchips" role="group" aria-label="Take out">
        <span className="t50" style={{ fontSize: 12, alignSelf: 'center' }}>Take out</span>
        <button className="chip" aria-pressed={debt === 'all'} onClick={() => setDebt('all')}>Any dollar</button>
        {debts.slice(0, 5).map((d) => <button key={d} className="chip" aria-pressed={debt === d} onClick={() => setDebt(d)}>{d}</button>)}
      </div>}
      {loading && !list.length ? (
        <div className="card"><table className="tbl strat-t"><tbody>{[0, 1, 2, 3].map((i) => <tr key={i}><td><Sk w={200} /></td><td className="r"><Sk w={60} /></td><td /></tr>)}</tbody></table></div>
      ) : !list.length ? (
        <div className="empty">Nothing lends dollars against {u === 'all' ? `this group` : nameOf(u)} on the chains you picked{debt !== 'all' ? ` in ${debt}` : ''}.</div>
      ) : phone ? (
        <div className="scards">{list.map((o) => { const hs = held.get(o.id); return (
          <div key={o.id} className="scard" role="button" tabIndex={0} aria-selected={selId === o.id} onClick={() => onPick(o)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(o) } }}>
            <div className="sc-top"><Toks a={o.collateral.symbol} b={o.debt.symbol} logoA={o.collateral.logo} logoB={o.debt.logo} /><b>{o.collateral.symbol}</b></div>
            <span className="sc-via">take {o.debt.symbol} · {o.venue}</span>
            <span className={`sc-rate ${o.borrowApr < 5 ? 'ok' : o.borrowApr > 15 ? 'bad' : ''}`}>{pct(o.borrowApr)}</span>
            <span className="sc-meta">{lendsWord(o)} · {chainLabel(o.chainId)}</span>
            <span className={`sc-meta ${o.liquidityUsd < DEEP_USD ? 'warn' : ''}`}>{usdShort(o.liquidityUsd)} free</span>
            <span className="sc-meta"><RiskOf o={o} /></span>
            {hs && <span className="sc-pills"><span className="pill run">your loan</span></span>}
          </div>) })}</div>
      ) : (
        <div className="card"><table className="tbl strat-t">
          <colgroup><col /><col className="c-rate" /><col className="c-tail" /></colgroup>
          <thead><tr><th>Put up · take out</th><th className="r">Borrow APR</th><th /></tr></thead>
          <tbody>{list.map((o) => { const hs = held.get(o.id); return (
            <tr key={o.id} aria-selected={selId === o.id} onClick={() => onPick(o)}>
              <td><div className="nm"><Toks a={o.collateral.symbol} b={o.debt.symbol} logoA={o.collateral.logo} logoB={o.debt.logo} /><span><b>{o.collateral.symbol}</b> <span className="t50">→ {o.debt.symbol} · {o.venue}</span></span>{hs && <span className="pill run">your loan</span>}</div>
                <small>{u === 'all' ? `${nameOf(o.asset)} · ` : ''}{chainLabel(o.chainId)} · <RiskOf o={o} /> · {lendsWord(o)} · <span className={o.liquidityUsd < DEEP_USD ? 'warn' : undefined}>{usdShort(o.liquidityUsd)} free to borrow</span>{o.utilization != null && o.utilization >= 0.95 ? <span className="warn"> · nearly all lent out</span> : ''}</small></td>
              <td className="r"><span className={o.borrowApr < 5 ? 'ok' : o.borrowApr > 15 ? 'bad' : ''}>{pct(o.borrowApr)}</span></td>
              <td className="r tail"><span className="t40">›</span></td>
            </tr>) })}</tbody>
        </table></div>
      )}
      <div className="note" style={{ marginTop: 12 }}><b>Borrowing</b> puts what you hold up as collateral and pays you dollars, without selling it. You pay the rate on what you take; if the price falls far enough, the lender sells part of it to repay. The ticket starts you in the Safe zone{groupId === 'STOCKS' ? ', which for a stock asks for more room than for a coin: it does not trade at night or at weekends' : ''}.</div>
    </>
  )
}

function RiskOf({ o }: { o: BorrowOffer }) {
  if (!o.rated) return <span className="risk r2"><i />unrated</span>
  return <span className={`risk r${o.risk}`}><i />{o.riskLabel.toLowerCase()} risk</span>
}

/**
 * Borrow, across the shelves: one chip per group that can be borrowed against, with how far its
 * best market lends and its cheapest rate. Stocks is a category like the others — and the one
 * this list leads people to.
 */
export function BorrowCats({ offers, current }: { offers: BorrowOffer[]; current: GroupId }) {
  const by = React.useMemo(() => {
    const m = new Map<GroupId, { n: number; ltv: number; apr: number }>()
    for (const g of GROUPS) for (const o of headlineOffers(offers.filter((x) => x.group === g.id))) {
      const c = m.get(o.group) ?? { n: 0, ltv: 0, apr: Infinity }
      c.n++; c.ltv = Math.max(c.ltv, o.maxLtv); c.apr = Math.min(c.apr, o.borrowApr)
      m.set(o.group, c)
    }
    return m
  }, [offers])
  const groups = GROUPS.filter((g) => by.has(g.id) || g.id === current)
  if (groups.length < 2) return null
  return (
    <nav className="bcats" aria-label="Borrow against">
      {groups.map((g) => { const c = by.get(g.id); return (
        <button key={g.id} type="button" className={`bcat${g.id === 'STOCKS' ? ' hot' : ''}`} aria-pressed={g.id === current} onClick={() => go(g.id, { k: 'borrow' })} style={{ '--gc': g.color } as React.CSSProperties}>
          <GroupIcon id={g.id} color={g.color} size={18} /><span className="bn">{g.id === 'MORE' ? 'More' : g.name}</span>
          {c ? <small>up to {Math.round(c.ltv * 100)}% · from {pct(c.apr, c.apr < 1 ? 2 : 1)}</small> : <small>nothing to borrow</small>}
        </button>) })}
    </nav>
  )
}

/**
 * The most a wallet could take out against `asset` right now: its idle balance on each chain
 * against the best market there, held to the Safe zone. 0 when nothing lends against it.
 */
export function borrowRoom(asset: string, idle: Idle[], offers: BorrowOffer[]): number {
  let best = 0
  for (const i of idle) {
    if (i.asset !== asset || !(i.usd > 0)) continue
    for (const o of offers) {
      if (o.asset !== asset || o.chainId !== i.chainId || o.liquidityUsd < DEEP_USD) continue
      const safe = Math.max(0, i.usd * o.liqLtv * (1 - bordersFor(o).safe))
      best = Math.max(best, Math.min(maxBorrowUsd(o, i.usd), safe))
    }
  }
  return best
}
