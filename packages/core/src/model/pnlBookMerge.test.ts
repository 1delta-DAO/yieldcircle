import { describe, expect, it } from 'vitest'
import type { AccountPnlBook, PnlBookPoint, PnlBookStrategy } from '../index/types'
import { mergeBooks, sumSeries } from './pnlBookMerge'

const pt = (t: string, pnl: number, y = 0, nav = 100): PnlBookPoint => ({ t: `${t}T00:00:00.000Z`, pnl, yield: y, nav })
const strat = (key: string, pnlUsd: number): PnlBookStrategy => ({
  key, kind: 'loop', protocol: null, lenderKeys: [], chains: [], held: [], debt: [], equityUsd: 10, since: null, series: [pt('2026-10-01', pnlUsd)],
  pnlUsd, yieldUsd: 0, directionalUsd: pnlUsd, pnlAprPct: null, yieldAprPct: null, capitalDays: 0, positions: 1,
})
const book = (account: string, pnlUsd: number, capitalDays: number, series: PnlBookPoint[], more: Partial<AccountPnlBook> = {}): AccountPnlBook => ({
  account,
  total: { pnlUsd, yieldUsd: pnlUsd / 2, directionalUsd: pnlUsd / 2, pnlAprPct: (pnlUsd / capitalDays) * 36500, yieldAprPct: null, capitalDays, openDays: 30, positions: 2, equityUsd: 1000 },
  coverage: { positions: 3, withPnl: 2, withLine: 2, pending: 1, unranked: { stale: 1 }, equityShare: 0.9 },
  series, strategies: [], positions: [], requestedAt: null, unsupported: [],
  ...more,
})

describe('mergeBooks', () => {
  it('leaves one book as it is', () => {
    const b = book('0xa', -31, 54_054, [])
    expect(mergeBooks([b])).toBe(b)
    expect(mergeBooks([])).toBeNull()
  })

  it('sums the figures and weighs the APR by capital, not by book', () => {
    // −$31 on $54k capital-days, +$10 on $1k: a mean of the two APRs would be wildly wrong
    const m = mergeBooks([book('0xa', -31, 54_054, []), book('Sol1', 10, 1_000, [], { coverage: { positions: 1, withPnl: 1, pending: 0, unranked: { stale: 2 }, equityShare: 0.5 } })])!
    expect(m.total.pnlUsd).toBe(-21)
    expect(m.total.pnlAprPct).toBeCloseTo((-21 / 55_054) * 36500, 6)
    expect(m.coverage).toMatchObject({ positions: 4, withPnl: 3, pending: 1, unranked: { stale: 3 }, withLine: undefined, equityShare: 0.7 })
  })

  it('re-ranks the strategies and keeps every line drawn', () => {
    const many = (pre: string, n: number) => Array.from({ length: n }, (_, i) => strat(`${pre}${i}`, (i + 1) * (pre === 'e' ? 1 : -10)))
    const m = mergeBooks([book('0xa', 0, 1, [], { strategies: many('e', 6) }), book('Sol1', 0, 1, [], { strategies: many('s', 6) })])!
    expect(m.strategies.map((s) => s.key).slice(0, 3)).toEqual(['s5', 's4', 's3'])
    expect(m.strategies.filter((s) => s.series).length).toBe(12)
  })
})

describe('sumSeries', () => {
  it('holds a line at 0 before it starts and at its last value after it ends', () => {
    const a = [pt('2026-10-01', 1), pt('2026-10-03', 3)]
    const b = [pt('2026-10-02', 10), pt('2026-10-04', 20)]
    expect(sumSeries([a, b]).map((p) => [p.t.slice(0, 10), p.pnl])).toEqual([
      ['2026-10-01', 1], ['2026-10-02', 11], ['2026-10-03', 13], ['2026-10-04', 23],
    ])
  })
  it('ignores an empty line', () => {
    const a = [pt('2026-10-01', 1)]
    expect(sumSeries([a, []])).toBe(a)
  })
})
