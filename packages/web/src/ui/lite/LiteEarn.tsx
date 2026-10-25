import React from 'react'
import { GROUPS, type Group } from '../../model/assets'
import { LITE_GROUPS, LITE_LIST_ROWS, liteEligible } from '../../model/lite'
import { go, liteHref, proHref, type Route } from '../../state/AppState'
import { useSticky } from '../../state/sticky'
import { GroupIcon, Sk, pct, usd, usdShort } from '../bits'
import { Ticket } from '../Ticket'
import { useAsideTop } from '../AssetPage'
import { useLiteMenu } from './useLite'
import { LiteRowView } from './LiteBits'

/** What Lite calls each category: the money, not the group code. */
export const LITE_NAME: Record<string, { name: string; line: string }> = {
  USD: { name: 'Dollars', line: 'Earn on dollars. Levered rows say ×, and the safest come first.' },
  ETH: { name: 'Ether', line: 'Earn on ether and staked ether, in ether.' },
  BTC: { name: 'Bitcoin', line: 'Earn on bitcoin, in bitcoin.' },
  MORE: { name: 'More', line: 'Other coins and currencies: BNB, AVAX, SOL, the euro, gold.' },
}
/** How many of the best rows Earn shows before a category is picked. */
const TOP_ROWS = 10

/**
 * Lite's Earn (docs/lite.md §1, §4): one page. The four money tiles stay where they are; below them
 * the list is either the highest steady rates across every category or, with a tile picked, that
 * category's rows — deposits and loops mixed, one row per thing in words, the safest first — and
 * the ticket beside it (a sheet on a phone). The same frame at the same width whichever is
 * showing, so picking a category changes the list in place rather than opening another page.
 * `#/lite/earn` and `#/lite/USD?s=…` are the two states.
 */
export function LiteEarn({ group, route }: { group?: Group; route: Route }) {
  const L = useLiteMenu()
  const { b } = L
  const groups = GROUPS.filter((g) => LITE_GROUPS.includes(g.id))
  const inGroup = group ? L.rows.filter((r) => r.s.group === group.id) : []
  // the best rows anywhere, low-to-medium risk: the high yields, without the riskiest of them
  const top = React.useMemo(() => [...L.rows].filter((r) => r.s.risk <= 2).sort((x, y) => L.rank(y.s) - L.rank(x.s)).slice(0, TOP_ROWS), [L.rows, L.rank])
  // the ticket: a row of this category, or a running position's row wherever the catalogue holds it
  const sel = group && route.s ? b.all.find((s) => s.id === route.s) ?? b.hidden.find((s) => s.id === route.s) ?? b.overflow.find((s) => s.id === route.s) ?? null : null
  const settled = !b.isLoading && !b.isFetching
  const offLite = !!group && !!route.s && (sel ? !liteEligible(sel) && !L.holdingsOf(sel).length : settled)
  React.useEffect(() => {
    if (offLite) location.replace(location.pathname + location.search + proHref())
  }, [offLite])
  const ticketOpen = !!sel && !offLite
  const aside = useAsideTop(ticketOpen)
  const close = () => go(group!.id)
  // the best of a category on one screen; the rest behind one tap, kept for this tab (`useSticky`)
  const [allRows, setAllRows] = useSticky<boolean>(`lite:${group?.id ?? 'all'}:all`, false)
  const rows = group ? inGroup : top
  const shown = group && !allRows ? rows.slice(0, LITE_LIST_ROWS) : rows
  const valueOf = (id: string) => b.holdings.filter((h) => L.runs(h)?.id === id).reduce((a, h) => a + h.valueUsd, 0)
  const name = group ? LITE_NAME[group.id] ?? { name: group.name, line: group.desc } : null
  const yours = group ? b.books.filter((x) => x.group === group.id) : []
  const work = yours.reduce((a, x) => a + x.atWorkUsd, 0), yearly = yours.reduce((a, x) => a + x.yearlyUsd, 0), idle = yours.reduce((a, x) => a + x.idleUsd, 0)
  return (
    <>
      <div className={`lite-earn${ticketOpen ? ' withticket' : ''}`}>
        <div className="main">
          <div className="feed-h"><h1>Earn</h1><span className="sp" /><span className="t50 hide-m">best rates, in plain words</span></div>
          <div className={`ltiles${group ? ' picked' : ''}`} role="tablist" aria-label="Which money">
            {groups.map((g) => {
              const gr = L.rows.filter((r) => r.s.group === g.id)
              const best = gr.reduce((m, r) => Math.max(m, r.s.rate), 0)
              const mine = b.books.filter((x) => x.group === g.id).reduce((a, x) => a + x.totalUsd, 0)
              const on = group?.id === g.id
              return (
                <a key={g.id} role="tab" aria-selected={on} className={`ltile${on ? ' on' : ''}`} href={on ? liteHref('earn') : liteHref(g.id)} style={{ '--gc': g.color } as React.CSSProperties} title={on ? 'Back to every category' : LITE_NAME[g.id].line}>
                  <GroupIcon id={g.id} color={g.color} size={on ? 40 : 36} />
                  <b>{LITE_NAME[g.id].name}</b>
                  <span className="ltile-r">{b.isLoading && !gr.length ? <Sk w={70} h={20} /> : best > 0 ? <>up to <b className="ok">{pct(best)}</b></> : <span className="t40">—</span>}</span>
                  <small className="t50">{mine >= 1 ? `you have ${usdShort(mine)}` : `${gr.length} way${gr.length === 1 ? '' : 's'} to earn`}</small>
                </a>
              )
            })}
          </div>

          <section className="sec lite-sec lite-earn-list" aria-live="polite">
            <div className="sec-h">
              <h2>{name ? name.name : 'Highest steady rates'}</h2>
              <span className="sub">{name ? name.line : 'across every category, the riskiest left out'}</span>
              {group && <a className="linklike t50 lite-earn-all" href={liteHref('earn')}>every category ›</a>}
            </div>
            {group && (work >= 1 || idle >= 1) && (
              <div className="note lite-yours">
                {work >= 1 ? <>Your {usd(work)} here earns about <b className="ok">{usd(yearly)}</b> a year{work ? ` (${pct(yearly / work * 100, 1)})` : ''}.</> : null}
                {idle >= 1 ? <> {usd(idle)} sits idle{rows[0] ? <> — the top row would pay <b className="ok">{pct(rows[0].s.rate)}</b></> : ''}.</> : null}
              </div>
            )}
            <div className="lrows">
              {b.isLoading && !rows.length
                ? [0, 1, 2, 3, 4].map((i) => <div key={i} className="lrow sk"><Sk w={28} h={28} /><span className="lrow-n"><Sk w={120} h={14} /><Sk w={180} h={10} /></span><Sk w={60} h={18} /></div>)
                : !rows.length ? <div className="empty">Nothing {name ? `in ${name.name.toLowerCase()} ` : ''}clears Lite’s bar on these chains right now.{group && <> <a className="pri" href={proHref(`#/${group.id}`)}>See everything in Pro ›</a></>}</div>
                : shown.map((r) => <LiteRowView key={r.s.id} r={r} get={L.get} proof={L.proof(r.s)} on={sel?.id === r.s.id} yoursUsd={r.yours ? valueOf(r.s.id) : undefined} />)}
              {rows.length > shown.length && <button type="button" className="lrow lite-showall" onClick={() => setAllRows(true)}>Show all {rows.length} ways to earn on {name!.name.toLowerCase()}</button>}
            </div>
            {rows.length > 0 && <p className="t50 lite-foot">Rates are a year, before compounding. Each row is the best of its kind on the chains you use; <a href={proHref(group ? `#/${group.id}` : '#/earn')}>Pro</a> lists every venue.</p>}
          </section>
        </div>
        <aside ref={aside} className={ticketOpen ? '' : 'closed'} id="aside">
          {ticketOpen && <Ticket key={sel!.id + (route.m ?? '') + (route.h ?? '')} s={sel!} idle={b.idlePerChain} holdings={L.holdingsOf(sel!)} pick={route.h} mode={route.m} copy={route.copy} copyLev={route.lev} lite onClose={close} />}
        </aside>
      </div>
      {ticketOpen && <div className="scrim" onClick={close} />}
    </>
  )
}
