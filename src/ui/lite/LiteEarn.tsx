import React from 'react'
import { GROUPS } from '../../model/assets'
import { LITE_GROUPS } from '../../model/lite'
import { liteHref } from '../../state/AppState'
import { GroupIcon, Sk, pct, usdShort } from '../bits'
import { useLiteMenu } from './useLite'
import { LiteRowView } from './LiteBits'
import { LITE_NAME } from './LiteList'

/**
 * Lite's Earn (docs/lite.md §1): four categories — what you have in each and the best it pays —
 * then the highest steady rates across all of them, so the big numbers are one tap away whatever
 * category they sit in.
 */
export function LiteEarn() {
  const L = useLiteMenu()
  const { b } = L
  const groups = GROUPS.filter((g) => LITE_GROUPS.includes(g.id))
  // the best rows anywhere, low-to-medium risk: the high yields, without the riskiest of them
  const top = [...L.rows].filter((r) => r.s.risk <= 2).sort((x, y) => L.rank(y.s) - L.rank(x.s)).slice(0, 6)
  return (
    <div className="lite-page">
      <div className="feed-h"><h1>Earn</h1><span className="sp" /><span className="t50">best rates, in plain words</span></div>
      <div className="ltiles">
        {groups.map((g) => {
          const rows = L.rows.filter((r) => r.s.group === g.id)
          const best = rows.reduce((m, r) => Math.max(m, r.s.rate), 0)
          const mine = b.books.filter((x) => x.group === g.id).reduce((a, x) => a + x.totalUsd, 0)
          const name = LITE_NAME[g.id]
          return (
            <a key={g.id} className="ltile" href={liteHref(g.id)} style={{ '--gc': g.color } as React.CSSProperties}>
              <GroupIcon id={g.id} color={g.color} size={36} />
              <b>{name.name}</b>
              <span className="ltile-r">{b.isLoading && !rows.length ? <Sk w={70} h={20} /> : best > 0 ? <>up to <b className="ok">{pct(best)}</b></> : <span className="t40">—</span>}</span>
              <small className="t50">{mine >= 1 ? `you have ${usdShort(mine)}` : `${rows.length} way${rows.length === 1 ? '' : 's'} to earn`}</small>
            </a>
          )
        })}
      </div>
      <section className="sec lite-sec">
        <div className="sec-h"><h2>Highest steady rates</h2><span className="sub">across every category, the riskiest left out</span></div>
        <div className="lrows">
          {b.isLoading && !top.length ? [0, 1, 2].map((i) => <div key={i} className="lrow sk"><Sk w={28} h={28} /><span className="lrow-n"><Sk w={120} h={14} /></span></div>)
            : top.map((r) => <LiteRowView key={r.s.id} r={r} get={L.get} proof={L.proof(r.s)} />)}
        </div>
      </section>
    </div>
  )
}
