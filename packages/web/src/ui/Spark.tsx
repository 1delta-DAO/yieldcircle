import { useSyncExternalStore } from 'react'
import { avgLast, isSpike, seriesFor, type HistoryGet, type RateSeries } from '../model/rateHistory'
import type { Strategy } from '../model/strategies'
import { pct } from './bits'

/**
 * A row's 30-day rate line, inline SVG (no chart library for 30 points).
 *
 * The vertical range spans at least `MIN_SPAN` percentage points PER TURN OF
 * LEVERAGE, so a market that paid 3.5–3.6 % all month draws flat instead of as
 * a seismograph — the line's job is to say "steady" or "one-off", and per-row
 * autoscaling turns every rounding wobble into a cliff. The floor scales with
 * the series' leverage because a loop's series is `dep·L − bor·(L−1)`: at 25×
 * the same rounding wobble is 25 points wide, and with a flat 1-point floor
 * every loop drew as a mountain range filling the box.
 *
 * The range itself is set by the body of the month, not its wildest day: it is
 * fenced past the 10th/90th percentile, and a day beyond the fence draws
 * pinned to the edge — still visibly an outlier, no longer the owner of the
 * scale. A day with no sample is a break in the line, never interpolated; the
 * dashed line is the 30-day mean.
 */
const MIN_SPAN = 1

function geometry(ser: RateSeries, w: number, h: number, pad: number) {
  const vals = ser.points.filter((p): p is number => p !== null)
  if (vals.length < 2) return null
  const sorted = [...vals].sort((a, b) => a - b)
  const at = (t: number) => sorted[Math.round(t * (sorted.length - 1))]
  const fence = 1.5 * (at(0.9) - at(0.1))
  let lo = Math.max(sorted[0], at(0.1) - fence)
  let hi = Math.min(sorted[sorted.length - 1], at(0.9) + fence)
  if (ser.avg !== null) { lo = Math.min(lo, ser.avg); hi = Math.max(hi, ser.avg) }
  const span = MIN_SPAN * Math.max(1, ser.leverage ?? 1)
  if (hi - lo < span) { const mid = (hi + lo) / 2; lo = mid - span / 2; hi = mid + span / 2 }
  const n = ser.points.length
  const x = (i: number) => pad + (i * (w - 2 * pad)) / Math.max(1, n - 1)
  const y = (v: number) => pad + ((hi - Math.min(hi, Math.max(lo, v))) * (h - 2 * pad)) / (hi - lo)
  const runs: string[] = []
  let cur = ''
  ser.points.forEach((p, i) => {
    if (p === null) { if (cur) runs.push(cur); cur = ''; return }
    cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`
  })
  if (cur) runs.push(cur)
  let last = n - 1
  while (last >= 0 && ser.points[last] === null) last--
  return { x, y, runs, last, lo, hi }
}

export function Spark({ ser, w = 64, h = 20, className }: { ser: RateSeries; w?: number; h?: number; className?: string }) {
  const g = geometry(ser, w, h, 2)
  if (!g) return null
  return (
    <svg className={`spark${className ? ` ${className}` : ''}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {ser.avg !== null && <line className="spark-avg" x1={2} x2={w - 2} y1={g.y(ser.avg)} y2={g.y(ser.avg)} />}
      {g.runs.map((d, i) => <path key={i} className="spark-line" d={d} />)}
      {g.last >= 0 && <circle className="spark-dot" cx={g.x(g.last)} cy={g.y(ser.points[g.last]!)} r={1.8} />}
    </svg>
  )
}

const partialOf = (ser: RateSeries) => ser.coverage !== null && ser.coverage < 0.8

function trendTitle(ser: RateSeries, now: number, spike: boolean) {
  return `Daily rate over the last 30 days (time-weighted, one point per day). ` +
    `30-day average ${pct(ser.avg)}${partialOf(ser) ? `, from ${Math.round((ser.coverage ?? 0) * 100)} % of the window` : ''}. ` +
    (spike ? `Today's ${pct(now)} is well above it: a recent spike, not what this has paid.` : '')
}

/** The line plus its words, for a list's rate cell: "30d 3.92%" under it, and a hover saying what both are. */
export function RateTrend({ ser, now, spike }: { ser: RateSeries; now: number; spike: boolean }) {
  return (
    <span className={`trend${spike ? ' spike' : ''}`} title={trendTitle(ser, now, spike)}>
      <Spark ser={ser} />
      <small className="trend-avg">30d {pct(ser.avg)}{partialOf(ser) ? '*' : ''}</small>
    </span>
  )
}

/**
 * The 30-day mean as words alone — "30d 3.92%" — for places with no room for a
 * line (Hot cards, the market header, search, the Earn digest). Amber when
 * today's rate is a spike against it. Renders nothing without history.
 */
export function Avg30({ s, get, className, prefix = '30d ' }: { s: Strategy; get: HistoryGet; className?: string; prefix?: string }) {
  const [withRewards] = useSparkRewards()
  const ser = seriesFor(s, get, withRewards)
  if (!ser || ser.avg === null) return null
  const spike = isSpike(s.rate, ser)
  return <span className={`avg30${spike ? ' spike' : ''}${className ? ` ${className}` : ''}`} title={trendTitle(ser, s.rate, spike)}>{prefix}{pct(ser.avg)}{partialOf(ser) ? '*' : ''}</span>
}

/**
 * The ticket's history block: a wider line with the 7- and 30-day means and the
 * rewards switch. For a loop `L` is the ticket's leverage (tier or slider), so
 * the line moves with it — the history of the position being built, not of the
 * list's Balanced default.
 */
export function RateHistoryPanel({ s, get, L, now }: { s: Strategy; get: HistoryGet; L?: number; now: number }) {
  const [withRewards, setWithRewards] = useSparkRewards()
  const ser = seriesFor(s, get, withRewards, L)
  const hasRewards = s.kind === 'simple' ? !!get(s.earnUid)?.rewards : !!(get(s.marketLongUid)?.rewards || get(s.marketShortUid)?.borrowRewards)
  if (!ser) return null
  const spike = isSpike(now, ser), a7 = avgLast(ser)
  const W = 300, H = 64
  const g = geometry(ser, W, H, 4)
  return (
    <div className="rhist">
      <div className="rhist-h">
        <span className="lbl" style={{ margin: 0 }}>Last 30 days{s.kind === 'loop' && L ? ` at ${L.toFixed(2)}×` : ''}</span>
        {hasRewards && <button className="rw-toggle" aria-pressed={withRewards} onClick={() => setWithRewards(!withRewards)}>{withRewards ? '+rewards' : 'no rewards'}</button>}
      </div>
      {g && (
        <svg className="spark rhist-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label={`30-day average ${pct(ser.avg)}`}>
          {ser.avg !== null && <line className="spark-avg" x1={4} x2={W - 4} y1={g.y(ser.avg)} y2={g.y(ser.avg)} vectorEffect="non-scaling-stroke" />}
          {g.runs.map((d, i) => <path key={i} className="spark-line" d={d} vectorEffect="non-scaling-stroke" />)}
          {g.last >= 0 && <circle className="spark-dot" cx={g.x(g.last)} cy={g.y(ser.points[g.last]!)} r={2.4} />}
        </svg>
      )}
      <div className="rhist-n">
        <span><span className="t50">7d</span> {pct(a7)}</span>
        <span className={spike ? 'warn' : ''}><span className="t50">30d</span> {pct(ser.avg)}{partialOf(ser) ? <span className="t40"> · {Math.round((ser.coverage ?? 0) * 100)}% of the window</span> : ''}</span>
        <span><span className="t50">now</span> {pct(now)}</span>
      </div>
      {spike && <div className="rhist-note warn">Today's rate is well above what this has paid over the month — read it as a spike, not the yield to expect.</div>}
    </div>
  )
}

/**
 * Whether history lines count reward streams. A display choice, not a floor,
 * so it is not in `Settings` (which counts every change as widening the menu).
 * One switch for every surface — flipping it in the ticket redraws the list —
 * remembered per browser.
 */
const RW_KEY = 'yieldcircle.spark-rewards:v1'
let rw: boolean = (() => { try { return localStorage.getItem(RW_KEY) !== '0' } catch { return true } })()
const rwListeners = new Set<() => void>()
const setRw = (x: boolean) => { rw = x; try { localStorage.setItem(RW_KEY, x ? '1' : '0') } catch { /* private mode */ } rwListeners.forEach((l) => l()) }
export function useSparkRewards(): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore((l) => { rwListeners.add(l); return () => { rwListeners.delete(l) } }, () => rw, () => true)
  return [v, setRw]
}

