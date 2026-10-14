/**
 * The Borrow side of an asset page (tickets/0008): the loans the asset can be put up for, one row
 * each — what you put up, what you take out, where, the rate and how far it lends. The list
 * decides WHERE; the ticket decides how much (`BorrowTicket`).
 *
 * What comes out is picked from one dropdown (tickets/0011): any dollar or one of them, and — asked
 * from the API only once picked — ether, bitcoin or another chain's coin.
 *
 * Above it, the categories (`BorrowCats`): every group that can be borrowed against, Stocks among
 * them as a category of its own (tickets/0009) — so Borrow reads as one place across the shelves
 * rather than a fourth tab on each.
 */
import React from 'react'
import { GROUPS, nameOf, type GroupId } from '../model/assets'
import { DEEP_USD, OUTS, bordersFor, headlineOffers, maxBorrowUsd, owedOf, type BorrowOffer, type Out } from '../model/borrow'
import type { Holding, Idle } from '../model/positions'
import { chainLabel } from '../sdk/queries'
import { go } from '../state/AppState'
import { useViewport } from './useViewport'
import { GroupIcon, Sk, Toks, pct, usdShort } from './bits'

/** What a list row says about how far a market lends: `up to 73 %`, and its room in the zone's words. */
const lendsWord = (o: BorrowOffer) => `up to ${Math.round(o.maxLtv * 100)}%`

export function BorrowList({ offers, loading, groupId, u, selId, held, out, onOut, onPick }: {
  offers: BorrowOffer[]; loading: boolean; groupId: GroupId; u: string; selId?: string
  /** the wallet's running loans on these pairs — and collateral already put up there — by offer id */
  held: Map<string, Holding[]>
  /** what comes out, and how to move it (the route's `out=`: a family not yet asked is fetched then) */
  out: Out; onOut: (o: Out) => void
  onPick: (o: BorrowOffer) => void
}) {
  const phone = useViewport() === 'phone'
  // what you take out: every token each family lends here, the most offered first
  const debts = React.useMemo(() => {
    const n = new Map<string, { out: Out; n: number }>()
    for (const o of offers) { const c = n.get(o.debt.symbol); n.set(o.debt.symbol, { out: o.out, n: (c?.n ?? 0) + 1 }) }
    return [...n].sort((a, b) => b[1].n - a[1].n)
  }, [offers])
  const [debt, setDebt] = React.useState<string>('all')
  const list = offers.filter((o) => o.out === out && (debt === 'all' || o.debt.symbol === debt))
  const fam = OUTS.find((f) => f.id === out)!
  const word = out === 'USD' ? 'dollars' : fam.name.toLowerCase()
  return (
    <>
      <div className="dpick">
        <label htmlFor="bl-out" className="t50">Take out</label>
        <select id="bl-out" className="dsel" value={`${out}:${debt}`} onChange={(e) => { const [f, sym] = e.target.value.split(':') as [Out, string]; setDebt(sym); if (f !== out) onOut(f) }}>
          {OUTS.map((f) => <optgroup key={f.id} label={f.name}>
            <option value={`${f.id}:all`}>{f.any}</option>
            {debts.filter(([, d]) => d.out === f.id).slice(0, 8).map(([sym]) => <option key={sym} value={`${f.id}:${sym}`}>{sym}</option>)}
          </optgroup>)}
        </select>
        {out !== 'USD' && <span className="t50 hide-m">{loading && !list.length ? `asking which markets lend ${word}…` : 'the cost is still shown in dollars'}</span>}
      </div>
      {loading && !list.length ? (
        <div className="card"><table className="tbl strat-t"><tbody>{[0, 1, 2, 3].map((i) => <tr key={i}><td><Sk w={200} /></td><td className="r"><Sk w={60} /></td><td /></tr>)}</tbody></table></div>
      ) : !list.length ? (
        <div className="empty">Nothing lends {debt !== 'all' ? debt : word} against {u === 'all' ? `this group` : nameOf(u)} on the chains you picked.</div>
      ) : phone ? (
        <div className="scards">{list.map((o) => { const hs = held.get(o.id); return (
          <div key={o.id} className="scard" role="button" tabIndex={0} aria-selected={selId === o.id} onClick={() => onPick(o)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(o) } }}>
            <div className="sc-top"><Toks a={o.collateral.symbol} b={o.debt.symbol} logoA={o.collateral.logo} logoB={o.debt.logo} /><b>{o.collateral.symbol}</b></div>
            <span className="sc-via">take {o.debt.symbol} · {o.venue}</span>
            <span className={`sc-rate ${o.borrowApr < 5 ? 'ok' : o.borrowApr > 15 ? 'bad' : ''}`}>{pct(o.borrowApr)}</span>
            <span className="sc-meta">{lendsWord(o)} · {chainLabel(o.chainId)}</span>
            <span className={`sc-meta ${o.liquidityUsd < DEEP_USD ? 'warn' : ''}`}>{usdShort(o.liquidityUsd)} free</span>
            <span className="sc-meta"><RiskOf o={o} /></span>
            {hs && <span className="sc-pills"><HeldPill hs={hs} /></span>}
          </div>) })}</div>
      ) : (
        <div className="card"><table className="tbl strat-t">
          <colgroup><col /><col className="c-rate" /><col className="c-tail" /></colgroup>
          <thead><tr><th>Put up · take out</th><th className="r">Borrow APR</th><th /></tr></thead>
          <tbody>{list.map((o) => { const hs = held.get(o.id); return (
            <tr key={o.id} aria-selected={selId === o.id} onClick={() => onPick(o)}>
              <td><div className="nm"><Toks a={o.collateral.symbol} b={o.debt.symbol} logoA={o.collateral.logo} logoB={o.debt.logo} /><span><b>{o.collateral.symbol}</b> <span className="t50">→ {o.debt.symbol} · {o.venue}</span></span>{hs && <HeldPill hs={hs} />}</div>
                <small>{u === 'all' ? `${nameOf(o.asset)} · ` : ''}{chainLabel(o.chainId)} · <RiskOf o={o} /> · {lendsWord(o)} · <span className={o.liquidityUsd < DEEP_USD ? 'warn' : undefined}>{usdShort(o.liquidityUsd)} free to borrow</span>{o.utilization != null && o.utilization >= 0.95 ? <span className="warn"> · nearly all lent out</span> : ''}</small></td>
              <td className="r"><span className={o.borrowApr < 5 ? 'ok' : o.borrowApr > 15 ? 'bad' : ''}>{pct(o.borrowApr)}</span></td>
              <td className="r tail"><span className="t40">›</span></td>
            </tr>) })}</tbody>
        </table></div>
      )}
      <div className="note" style={{ marginTop: 12 }}><b>Borrowing</b> puts what you hold up as collateral and pays you {out === 'USD' ? 'dollars' : `${word} — owed in ${word}, so the line moves with both prices`}, without selling it. You pay the rate on what you take; if the price falls far enough, the lender sells part of it to repay. The ticket starts you in the Safe zone{groupId === 'STOCKS' ? ', which for a stock asks for more room than for a coin: it does not trade at night or at weekends' : ''}.</div>
    </>
  )
}

/** A running loan says so; collateral already put up there with nothing borrowed says that instead. */
function HeldPill({ hs }: { hs: Holding[] }) {
  return hs.some((h) => owedOf(h) > 0.005) ? <span className="pill run">your loan</span> : <span className="pill run">already put up</span>
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
export function BorrowCats({ offers, current }: { offers: BorrowOffer[]; current?: GroupId }) {
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
  if (groups.length < (current ? 2 : 1)) return null
  return (
    <nav className="bcats" aria-label="Borrow against">
      {current && <a className="bcat yours" href="#/borrow"><span className="bn">Against what you hold</span><small>your assets, best place each ›</small></a>}
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
      if (o.asset !== asset || o.chainId !== i.chainId || o.out !== 'USD' || o.liquidityUsd < DEEP_USD) continue
      const safe = Math.max(0, i.usd * o.liqLtv * (1 - bordersFor(o).safe))
      best = Math.max(best, Math.min(maxBorrowUsd(o, i.usd), safe))
    }
  }
  return best
}
