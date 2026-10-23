import React from 'react'
import { go, liteHref, proHref, type Route } from '../../state/AppState'
import type { Group } from '../../model/assets'
import { LITE_LIST_ROWS, liteEligible } from '../../model/lite'
import { GroupIcon, Sk, pct, usd } from '../bits'
import { Ticket } from '../Ticket'
import { useAsideTop } from '../AssetPage'
import { useLiteMenu } from './useLite'
import { useSticky } from '../../state/sticky'
import { LiteRowView } from './LiteBits'

/** What Lite calls each category: the money, not the group code. */
export const LITE_NAME: Record<string, { name: string; line: string }> = {
  USD: { name: 'Dollars', line: 'Earn on dollars. Levered rows say ×, and the safest come first.' },
  ETH: { name: 'Ether', line: 'Earn on ether and staked ether, in ether.' },
  BTC: { name: 'Bitcoin', line: 'Earn on bitcoin, in bitcoin.' },
  MORE: { name: 'More', line: 'Other coins and currencies: BNB, AVAX, SOL, the euro, gold.' },
}

/**
 * One category, one list (docs/lite.md §4): deposits and loops mixed, one row per thing in words,
 * the safest first, and the ticket beside it (a sheet on a phone). A row Lite does not carry — a
 * Copy link to a fixed-term loop, a market below the floors — opens in Pro, where it lives.
 */
export function LiteList({ group, route }: { group: Group; route: Route }) {
  const L = useLiteMenu()
  const { b } = L
  const rows = L.rows.filter((r) => r.s.group === group.id)
  const sel = route.s ? b.all.find((s) => s.id === route.s) ?? b.hidden.find((s) => s.id === route.s) ?? b.overflow.find((s) => s.id === route.s) ?? null : null
  const settled = !b.isLoading && !b.isFetching
  const offLite = !!route.s && (sel ? !liteEligible(sel) && !L.holdingsOf(sel).length : settled)
  React.useEffect(() => {
    if (offLite) location.replace(location.pathname + location.search + proHref())
  }, [offLite])
  const ticketOpen = !!sel && !offLite
  const aside = useAsideTop(ticketOpen)
  const close = () => go(group.id)
  const name = LITE_NAME[group.id] ?? { name: group.name, line: group.desc }
  const yours = b.books.filter((x) => x.group === group.id)
  const work = yours.reduce((a, x) => a + x.atWorkUsd, 0), yearly = yours.reduce((a, x) => a + x.yearlyUsd, 0), idle = yours.reduce((a, x) => a + x.idleUsd, 0)
  // the best of the category on one screen; the rest behind one tap, kept for this tab (`useSticky`)
  const [allRows, setAllRows] = useSticky<boolean>(`lite:${group.id}:all`, false)
  const shown = allRows ? rows : rows.slice(0, LITE_LIST_ROWS)
  const valueOf = (id: string) => b.holdings.filter((h) => L.runs(h)?.id === id).reduce((a, h) => a + h.valueUsd, 0)
  return (
    <>
      <a className="crumb" href={liteHref('earn')}>‹ Earn</a>
      <div className={`asset lite-asset${ticketOpen ? '' : ' noticket'}`}>
        <div className="main">
          <div className="lite-hdr">
            <GroupIcon id={group.id} color={group.color} size={40} />
            <div><h1>{name.name}</h1><div className="t50">{name.line}</div></div>
          </div>
          {(work >= 1 || idle >= 1) && (
            <div className="note lite-yours">
              {work >= 1 ? <>Your {usd(work)} here earns about <b className="ok">{usd(yearly)}</b> a year{work ? ` (${pct(yearly / work * 100, 1)})` : ''}.</> : null}
              {idle >= 1 ? <> {usd(idle)} sits idle{rows[0] ? <> — the top row would pay <b className="ok">{pct(rows[0].s.rate)}</b></> : ''}.</> : null}
            </div>
          )}
          <div className="lrows">
            {b.isLoading && !rows.length
              ? [0, 1, 2, 3, 4].map((i) => <div key={i} className="lrow sk"><Sk w={28} h={28} /><span className="lrow-n"><Sk w={120} h={14} /><Sk w={180} h={10} /></span><Sk w={60} h={18} /></div>)
              : !rows.length ? <div className="empty">Nothing in {name.name.toLowerCase()} clears Lite’s bar on these chains right now. <a className="pri" href={proHref(`#/${group.id}`)}>See everything in Pro ›</a></div>
              : shown.map((r) => <LiteRowView key={r.s.id} r={r} get={L.get} proof={L.proof(r.s)} on={sel?.id === r.s.id} yoursUsd={r.yours ? valueOf(r.s.id) : undefined} />)}
            {rows.length > shown.length && <button type="button" className="lrow lite-showall" onClick={() => setAllRows(true)}>Show all {rows.length} ways to earn on {name.name.toLowerCase()}</button>}
          </div>
          {rows.length > 0 && <p className="t50 lite-foot">Rates are a year, before compounding. Each row is the best of its kind on the chains you use; <a href={proHref(`#/${group.id}`)}>Pro</a> lists every venue.</p>}
        </div>
        <aside ref={aside} className={ticketOpen ? '' : 'closed'} id="aside">
          {ticketOpen && <Ticket key={sel!.id + (route.m ?? '') + (route.h ?? '')} s={sel!} idle={b.idlePerChain} holdings={L.holdingsOf(sel!)} pick={route.h} mode={route.m} copy={route.copy} copyLev={route.lev} lite onClose={close} />}
        </aside>
      </div>
      {ticketOpen && <div className="scrim" onClick={close} />}
    </>
  )
}
