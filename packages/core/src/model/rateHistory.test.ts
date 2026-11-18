import { describe, expect, it } from 'vitest'
import { steadyRate, usualRate, type RateHistoryItem } from './rateHistory'
import type { Strategy } from './strategies'

// a deposit and its month in bps: 28 days at 4 %, then `tail`
const row = (rate: number) => ({ kind: 'simple', earnUid: 'u', rate }) as unknown as Strategy
const month = (tail: number[]): RateHistoryItem => {
  const base = [...Array(30 - tail.length).fill(400), ...tail]
  return { base, rewards: null, avg30: base.reduce((a, b) => a + b, 0) / base.length / 100, avg30Base: null, coverage30: 1 } as unknown as RateHistoryItem
}
const get = (it: RateHistoryItem) => (uid: string) => (uid === 'u' ? it : undefined)

describe('steadyRate', () => {
  it('ranks an ordinary rate on itself', () => {
    expect(steadyRate(row(4.2), get(month([400, 420])))).toBe(4.2)
    expect(usualRate(row(4.2), get(month([400, 420])))).toBeNull()
    expect(steadyRate(row(12), undefined)).toBe(12)
  })
  it('ranks a one-night spike on the month, and says the month', () => {
    const it = month([400, 1200])
    expect(steadyRate(row(12), get(it))).toBeCloseTo(it.avg30!, 10)
    expect(usualRate(row(12), get(it))).toBeCloseTo(it.avg30!, 10)
  })
  it('ranks a spike that has held two days on the level it held, still saying the month', () => {
    const it = month([1100, 1200])
    expect(steadyRate(row(12), get(it))).toBe(11)
    expect(steadyRate(row(10), get(it))).toBe(10)
    expect(usualRate(row(12), get(it))).toBeCloseTo(it.avg30!, 10)
  })
  it('does not count a day with no sample as held', () => {
    const it = month([1100, 1200])
    it.base![28] = null
    expect(steadyRate(row(12), get(it))).toBeCloseTo(it.avg30!, 10)
  })
})
