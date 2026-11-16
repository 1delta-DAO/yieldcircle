import { describe, expect, it } from 'vitest'
import { depositAtSize } from './leverage'

// a kinked market: lenders earn borrowRate × utilisation
const points = [0, 0.5, 0.9, 1].map((u) => { const b = u <= 0.9 ? u * 10 : 9 + (u - 0.9) * 500; return { utilization: u, borrowRate: b, depositRate: b * u } })
const curve = { points, currentUtilization: 0.9, totalDepositsUsd: '1000000', totalLiquidityUsd: '100000' }

describe('depositAtSize', () => {
  it('a deposit that is a real share of the pool earns less than the listed rate', () => {
    // $900k lent of $1m, then of $2m: utilisation 0.9 → 0.45, the lenders’ side 8.1 → 2.25 (read between the 0 and 50 % points)
    expect(depositAtSize(8.1, 1_000_000, curve)).toBeCloseTo(2.25, 6)
    expect(depositAtSize(8.1, 100, curve)).toBeCloseTo(8.1, 2)
  })
  it('keeps what the headline carries on top of the curve, and never reads below it', () => {
    expect(depositAtSize(8.1 + 3, 1_000_000, curve)).toBeCloseTo(2.25 + 3, 6)
    expect(depositAtSize(5, 1e12, curve)).toBeGreaterThanOrEqual(5 - 8.1)
  })
  it('a withdrawal raises it', () => {
    expect(depositAtSize(8.1, -50_000, curve)).toBeGreaterThan(8.1)
  })
  it('no curve, or one with no lenders’ side, leaves the listed rate', () => {
    expect(depositAtSize(4, 1e6, null)).toBe(4)
    expect(depositAtSize(4, 1e6, { ...curve, points: points.map(({ utilization, borrowRate }) => ({ utilization, borrowRate })) })).toBe(4)
    expect(depositAtSize(4, 1e6, { ...curve, totalDepositsUsd: undefined, totalLiquidityUsd: undefined })).toBe(4)
  })
})
