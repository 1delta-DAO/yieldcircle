import { describe, expect, it } from 'vitest'
import { marksAt, nearestPoint, paperChartMarks, paperChartPoints, paperChartRange, paperChartScale } from './paperChart'
import type { PaperDay, PaperHour, PaperOpRow } from '../social/paperApi'

const DAY = 86_400_000
const at = (s: string) => Date.parse(s)
const day = (d: string, pnlUsd: number, priceUsd?: number | null): PaperDay => ({ day: d, navUsd: 10_000 + pnlUsd, pnlUsd, putInUsd: 10_000, returnPct: 0, priceUsd })
const hour = (t: string, pnlUsd: number, priceUsd: number): PaperHour => ({ t, navUsd: 10_000 + pnlUsd, pnlUsd, priceUsd, putInUsd: 10_000 })
const op = (t: string, o: unknown): PaperOpRow => ({ id: 1, kind: 'x', op: o as PaperOpRow['op'], prices: {}, at: t })

describe('paperChartPoints', () => {
  const now = at('2026-11-06T10:30:00Z')
  it('days run up to the first hour, then the hours, then now', () => {
    const p = paperChartPoints(
      [day('2026-11-04', 1), day('2026-11-05', 2), day('2026-11-06', 9)],
      [hour('2026-11-06T09:00:00Z', 3, 1), hour('2026-11-06T10:00:00Z', 4, 1)],
      now, { pnlUsd: 5, navUsd: 10_005, priceUsd: 2 },
    )
    expect(p.map((x) => x.pnlUsd)).toEqual([1, 2, 3, 4, 5])
    expect(p.map((x) => x.priceUsd)).toEqual([null, null, 1, 1, 2])
  })
  it('a missing day stays missing: time, not position, spaces the line', () => {
    const p = paperChartPoints([day('2026-11-01', 1), day('2026-11-04', 2)], [], now)
    expect(p[1].t - p[0].t).toBe(3 * DAY)
  })
  it('today, read before the day is over, is not dated in the future', () => {
    const p = paperChartPoints([day('2026-11-06', 1)], [], now)
    expect(p[0].t).toBe(now)
  })
  it('starts at zero at the account\'s start', () => {
    const p = paperChartPoints([day('2026-11-04', -6)], [], now, null, at('2026-11-04T08:00:00Z'))
    expect(p.map((x) => x.pnlUsd)).toEqual([0, -6])
    expect(p[0].navUsd).toBe(10_000)
  })
  it('a new account with nothing stored draws nothing', () => {
    expect(paperChartPoints([], [], now, null, now - DAY)).toEqual([])
  })
})

describe('paperChartRange', () => {
  const now = at('2026-11-06T10:00:00Z')
  const pts = [20, 6, 1, 0].map((d, i) => ({ t: now - d * DAY, pnlUsd: i, navUsd: 0, priceUsd: null }))
  it('keeps the window, and always something to draw', () => {
    expect(paperChartRange(pts, 7, now)).toHaveLength(3)
    expect(paperChartRange(pts, null, now)).toHaveLength(4)
    expect(paperChartRange(pts.slice(0, 2), 1, now)).toHaveLength(2)
  })
})

describe('paperChartMarks', () => {
  it('names a position on every later move, and leaves out what moves no money', () => {
    const m = paperChartMarks([
      op('2026-11-05T00:00:00Z', { t: 'reduce', id: 'l1', all: true }),
      op('2026-11-04T00:00:00Z', { t: 'lever', id: 'l1' }),
      op('2026-11-03T00:00:00Z', { t: 'open', id: 'l1', snap: { label: 'apyUSD / USDC loop' } }),
      op('2026-11-02T00:00:00Z', { t: 'swap' }),
      op('2026-11-01T00:00:00Z', { t: 'genesis' }),
    ])
    expect(m.map((x) => x.label)).toEqual(['Swapped', 'Opened apyUSD / USDC loop', 'Levered up apyUSD / USDC loop', 'Closed apyUSD / USDC loop'])
    expect(m.map((x) => x.tone)).toEqual(['move', 'in', 'in', 'out'])
  })
  it('a move older than the history it has still reads', () => {
    expect(paperChartMarks([op('2026-11-05T00:00:00Z', { t: 'withdraw', id: 'gone' })])[0].label).toBe('Withdrew from a position')
  })
})

describe('the scale', () => {
  const pts = [{ t: 0, pnlUsd: 10 }, { t: 100, pnlUsd: 30 }, { t: 400, pnlUsd: 20 }].map((p) => ({ ...p, navUsd: 0, priceUsd: null }))
  it('holds zero even on a line entirely above it, and scales x by time', () => {
    const s = paperChartScale(pts, 400, 100, 0, 0)
    expect(s.y(0)).toBe(100)
    expect(s.y(30)).toBe(0)
    expect(s.x(100)).toBe(100)
    expect(s.at(100)).toBe(100)
  })
  it('a flat zero line still scales', () => {
    const s = paperChartScale(pts.map((p) => ({ ...p, pnlUsd: 0 })), 400, 100)
    expect(Number.isFinite(s.y(0))).toBe(true)
  })
  it('hovering finds the nearest point and the moves into it', () => {
    expect(nearestPoint(pts, 240)).toBe(1)
    const marks = [{ t: 50, label: 'a', tone: 'in' as const }, { t: 150, label: 'b', tone: 'out' as const }]
    expect(marksAt(marks, pts, 1).map((m) => m.label)).toEqual(['a'])
    expect(marksAt(marks, pts, 2).map((m) => m.label)).toEqual(['b'])
  })
})
