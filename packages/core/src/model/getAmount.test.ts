import { describe, expect, it } from 'vitest'
import { unitsOf } from './amount'
import { GET_FLOOR_USD, NO_AMOUNT, prefill } from './getAmount'

const usdc = { amount: 500, raw: '500000000', price: 1, decimals: 6 }

describe('Get: the amount it starts with (docs/tx-feedback-plan.md §2.1)', () => {
  it('is empty with no shortfall: an empty ticket, or a wallet that already covers it', () => {
    expect(prefill(0, usdc, 1, true)).toBe(NO_AMOUNT)
    expect(prefill(0, usdc, 1, false)).toBe(NO_AMOUNT)
    expect(unitsOf(NO_AMOUNT)).toBe(0)
  })
  it('is empty without a price on either side', () => {
    expect(prefill(10, { ...usdc, price: 0 }, 1, true)).toBe(NO_AMOUNT)
    expect(prefill(10, usdc, 0, true)).toBe(NO_AMOUNT)
  })
  it('covers the shortfall, with room for the route', () => {
    expect(unitsOf(prefill(100, usdc, 1, true))).toBeCloseTo(101.05, 6)
    expect(unitsOf(prefill(0.01, { ...usdc, price: 2000, decimals: 18, raw: undefined }, 2000, false))).toBeCloseTo(0.010125, 6)
  })
  it('raises a shortfall of cents to the floor across chains, not on the same chain', () => {
    expect(unitsOf(prefill(0.02, usdc, 1, true))).toBe(GET_FLOOR_USD)
    expect(unitsOf(prefill(0.02, usdc, 1, false))).toBeCloseTo(0.0702, 6)
  })
  it('is Max, by reference, when the shortfall is more than the balance', () => {
    expect(prefill(1000, usdc, 1, true)).toEqual({ text: '500', pct: 100 })
  })
})
