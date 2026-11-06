import type { PaperDay, PaperHour, PaperOpRow } from '../social/paperApi'

/**
 * A paper account's PnL chart, on both apps (pos-indexer docs/paper.md "Charts"): the points, the
 * marks and the scale, so the web's SVG and the phone's draw the same line. The history is the
 * server's own valuations: one a day from `paper.book_daily`, one an hour from `paper.book_hourly`
 * where those exist, and the book as it stands now at the end. A day the server could not value
 * is absent, so the time axis is real time and a gap reads as a straight run, never a jump.
 */
export interface PaperChartPoint {
  t: number
  pnlUsd: number
  navUsd: number
  /** the part of `pnlUsd` that is price; null on points from before the server kept the split */
  priceUsd: number | null
}
export interface PaperChartMark { t: number; label: string; tone: 'in' | 'out' | 'move' }
export type PaperChartLive = Pick<PaperChartPoint, 'pnlUsd' | 'navUsd' | 'priceUsd'>

const DAY = 86_400_000

/** Days up to the first hour, then the hours, then now. `since` starts the line at zero, where the account did. */
export function paperChartPoints(days: PaperDay[], hours: PaperHour[], now: number, live?: PaperChartLive | null, since?: number): PaperChartPoint[] {
  const first = hours.length ? Date.parse(hours[0].t) : Infinity
  const out: PaperChartPoint[] = []
  for (const d of days) {
    const t = Math.min(Date.parse(`${d.day}T23:59:59Z`), now)
    if (t < first) out.push({ t, pnlUsd: d.pnlUsd, navUsd: d.navUsd, priceUsd: d.priceUsd ?? null })
  }
  for (const h of hours) out.push({ t: Date.parse(h.t), pnlUsd: h.pnlUsd, navUsd: h.navUsd, priceUsd: h.priceUsd ?? null })
  if (since != null && out.length && since < out[0].t) out.unshift({ t: since, pnlUsd: 0, navUsd: days[0]?.putInUsd ?? hours[0]?.putInUsd ?? out[0].navUsd, priceUsd: null })
  if (live && (!out.length || now > out[out.length - 1].t)) out.push({ t: now, pnlUsd: live.pnlUsd, navUsd: live.navUsd, priceUsd: live.priceUsd })
  return out
}

/** The last `days` of a line, or all of it. Never fewer than the two points a line needs. */
export function paperChartRange(points: PaperChartPoint[], days: number | null, now: number): PaperChartPoint[] {
  if (days == null) return points
  const inside = points.filter((p) => p.t >= now - days * DAY)
  return inside.length < 2 ? points.slice(-2) : inside
}

/** What the account did, for ticks on the line, oldest first. `ops` as the route answers: newest first. */
export function paperChartMarks(ops: PaperOpRow[]): PaperChartMark[] {
  const names = new Map<string, string>()
  const out: PaperChartMark[] = []
  for (const row of [...ops].reverse()) {
    const o = row.op, t = Date.parse(row.at)
    const name = (id: string) => names.get(id) ?? 'a position'
    if (o.t === 'open' || o.t === 'borrow') {
      if (!o.into) names.set(o.id, o.snap.label)
      const label = o.into ? name(o.into) : o.snap.label
      out.push({ t, label: `${o.into ? 'Added to' : o.t === 'borrow' ? 'Borrowed:' : 'Opened'} ${label}`, tone: 'in' })
    } else if (o.t === 'lever') out.push({ t, label: `Levered up ${name(o.id)}`, tone: 'in' })
    else if (o.t === 'withdraw') out.push({ t, label: `Withdrew from ${name(o.id)}`, tone: 'out' })
    else if (o.t === 'reduce') out.push({ t, label: `${o.all ? 'Closed' : 'Reduced'} ${name(o.id)}`, tone: 'out' })
    else if (o.t === 'repay') out.push({ t, label: `Repaid ${name(o.id)}`, tone: 'out' })
    else if (o.t === 'swap') out.push({ t, label: 'Swapped', tone: 'move' })
    else if (o.t === 'bridge') out.push({ t, label: 'Bridged', tone: 'move' })
  }
  return out
}

/** The point nearest a moment. */
export function nearestPoint(points: PaperChartPoint[], t: number): number {
  let best = 0
  points.forEach((p, i) => { if (Math.abs(p.t - t) < Math.abs(points[best].t - t)) best = i })
  return best
}

/** The moves that happened on the way into a point: since the point before it. */
export const marksAt = (marks: PaperChartMark[], points: PaperChartPoint[], i: number): PaperChartMark[] =>
  marks.filter((m) => m.t <= points[i].t && (i === 0 ? m.t >= points[0].t : m.t > points[i - 1].t))

/** The scale and the paths, with zero always on it. */
export function paperChartScale(points: PaperChartPoint[], W: number, H: number, padX = 8, padY = 10) {
  const t0 = points[0].t, t1 = points[points.length - 1].t
  const vs = points.map((p) => p.pnlUsd)
  const lo = Math.min(0, ...vs)
  let hi = Math.max(0, ...vs)
  if (hi - lo < 1e-9) hi = lo + 1
  const x = (t: number) => padX + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * padX)
  const y = (v: number) => padY + ((hi - v) / (hi - lo)) * (H - 2 * padY)
  const at = (px: number) => t0 + ((px - padX) / (W - 2 * padX)) * (t1 - t0)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.pnlUsd).toFixed(1)}`).join('')
  const z = y(0).toFixed(1)
  const area = `M${x(t0).toFixed(1)},${z}${line.replace(/M/, 'L')}L${x(t1).toFixed(1)},${z}Z`
  return { x, y, at, line, area, lo, hi, t0, t1 }
}
