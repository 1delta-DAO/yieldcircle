import { describe, expect, it } from 'vitest'
import { borrowCapLtv, customRange } from './leverage'

/** Worst-case LTV of a loop at L once its debt fills at the slippage floor. */
const ltvAtFloor = (L: number, slipBp: number) => {
  const x = (L - 1) / L, s = slipBp / 10_000
  return x / (1 - x * s)
}

describe('customRange', () => {
  it('keeps 98 % of the range when no slippage is given', () => {
    expect(customRange(10)).toEqual([1.1, 9.82])
  })

  it('holds the top where the loop fits at its slippage floor', () => {
    // Alchemix alUSD on Optimism (2026-11-03): max ×7.16 off 90 % × 0.956
    const maxLev = 1 / (1 - 0.9 * 0.956)
    const cap = borrowCapLtv(maxLev)
    const [, hi] = customRange(maxLev, 50)
    expect(hi).toBeLessThan(1 + 0.98 * (maxLev - 1))
    expect(ltvAtFloor(hi, 50)).toBeLessThan(cap)
    // ...and not far under it: the margin is impact past the quote, not a second buffer
    expect(ltvAtFloor(hi + 0.1, 50)).toBeGreaterThan(cap * 0.998)
  })

  it('never drops below the floor of the range', () => {
    expect(customRange(1.05, 300)).toEqual([1.1, 1.1])
  })
})
