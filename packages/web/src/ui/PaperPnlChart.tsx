import React from 'react'
import { bookOf, type PaperLedger, type PriceFn } from '@yieldcircle/core/model/paper'
import { marksAt, nearestPoint, paperChartMarks, paperChartPoints, paperChartRange, paperChartScale } from '@yieldcircle/core/model/paperChart'
import { signedMoney } from '@yieldcircle/core/model/lite'
import { usePaperDaily, usePaperHourly, usePaperOps } from '../social/queries'
import { usd, usdShort } from './bits'
import { yLabels } from './PnlDrawer'

const RANGES: [string, number | null][] = [['7d', 7], ['30d', 30], ['All', null]]
const when = (t: number, hours: boolean) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', ...(hours ? { hour: 'numeric' } : {}) })

/**
 * What a paper account's strategies earned over time, on the real PnL record's chart: the server's
 * valuations (`model/paperChart.ts`) on a real time axis, the moves as ticks, and the book as it
 * stands now at the end. Real time only: the paper clock's preview draws nothing here, and someone
 * else's book, which this page cannot fully price, ends at the server's last point.
 */
export function PaperPnlChart({ account, ledger, price, compact }: { account: string; ledger: PaperLedger | null; price: PriceFn; compact?: boolean }) {
  const daily = usePaperDaily(account, 365)
  const hourly = usePaperHourly(account)
  const ops = usePaperOps(account)
  const [range, setRange] = React.useState<number | null>(null)
  const [hover, setHover] = React.useState<number | null>(null)
  const gid = React.useId().replace(/:/g, '')
  const now = Date.now()
  const book = ledger ? bookOf(ledger, now, price) : null
  const all = paperChartPoints(daily.data?.days ?? [], hourly.data?.points ?? [], now, book?.priced ? book : null, ledger?.createdAt)
  const pts = paperChartRange(all, range, now)
  if (pts.length < 2) return <p className="t50 pnl-why">{daily.isLoading ? '' : 'The line starts at the next hourly valuation.'}</p>

  const W = 640, H = compact ? 120 : 200
  const s = paperChartScale(pts, W, H)
  const marks = paperChartMarks(ops.data?.ops ?? []).filter((m) => m.t >= s.t0 && m.t <= s.t1)
  const dir = pts[pts.length - 1].pnlUsd >= 0 ? 'up' : 'down'
  const onMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    setHover(nearestPoint(pts, s.at(((ev.clientX - r.left) / r.width) * W)))
  }
  const i = hover != null && hover < pts.length ? hover : pts.length - 1
  const p = pts[i]
  const moved = marksAt(marks, pts, i)
  const showHours = s.t1 - s.t0 < 2 * 86_400_000 || p.t > (hourly.data?.points[0] ? Date.parse(hourly.data.points[0].t) : Infinity)
  return (
    <div className="pnl-chart paper-chart">
      <div className="pnl-read">
        <b className={`pnl-big ${p.pnlUsd < 0 ? 'bad' : 'ok'}`}>{signedMoney(p.pnlUsd)}</b>
        <span className="pnl-read-m">
          <span className="t70 pnl-one"><span className="mono">{when(p.t, showHours)}</span> · account value <b>{usd(p.navUsd)}</b></span>
          <span className="t50 pnl-one">{moved.length ? moved.map((m) => m.label).join(' · ') : p.priceUsd != null ? `farming ${signedMoney(p.pnlUsd - p.priceUsd)} · price ${signedMoney(p.priceUsd)}` : ' '}</span>
        </span>
      </div>
      <div className="pnl-rwrap">
        <svg viewBox={`0 0 ${W} ${H}`} className={`pnl-svg${compact ? ' paper-sm' : ''}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)} preserveAspectRatio="none" role="img" aria-label={`what the strategies earned, ${signedMoney(pts[pts.length - 1].pnlUsd)} over ${pts.length} valuations`}>
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" className={`pnl-gs0 ${dir}`} />
              <stop offset="1" className={`pnl-gs1 ${dir}`} />
            </linearGradient>
          </defs>
          <path className="pnl-area" fill={`url(#${gid})`} d={s.area} />
          <line className="pnl-zero" x1={8} x2={W - 8} y1={s.y(0)} y2={s.y(0)} />
          {marks.map((m, k) => <line key={k} className={`pnl-tick ${m.tone}`} x1={s.x(m.t)} x2={s.x(m.t)} y1={H - 12} y2={H - 3}><title>{m.label}</title></line>)}
          <path className={`pnl-line ${dir}`} d={s.line} />
          <line className={`pnl-dot ${dir}`} x1={s.x(p.t)} x2={s.x(p.t)} y1={s.y(p.pnlUsd)} y2={s.y(p.pnlUsd)} />
          {hover != null && <line className="pnl-hover" x1={s.x(p.t)} x2={s.x(p.t)} y1={4} y2={H - 4} />}
        </svg>
        {yLabels([s.hi, s.lo, 0], s.y, H, (v) => (v === 0 ? '$0' : `${v > 0 ? '+' : '−'}${usdShort(Math.abs(v))}`))}
      </div>
      <div className="pnl-legend t50">
        {marks.some((m) => m.tone === 'in') && <span><i className="sw tin" /> in</span>}
        {marks.some((m) => m.tone === 'out') && <span><i className="sw tout" /> out</span>}
        <span className="mono">{when(s.t0, false)} → {when(s.t1, false)}</span>
        <span className="sp" />
        <div className="seg sm" role="group" aria-label="how far back">
          {RANGES.map(([k, d]) => <button key={k} aria-pressed={range === d} onClick={() => { setRange(d); setHover(null) }}>{k}</button>)}
        </div>
      </div>
    </div>
  )
}
