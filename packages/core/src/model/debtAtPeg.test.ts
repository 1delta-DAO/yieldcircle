import { describe, expect, it } from 'vitest'
import { AUTO_SLIPPAGE_BP, DEFAULTS, debtAtPeg, slippageFor } from './settings'

describe('debtAtPeg', () => {
  it('reads a dollar debt off its peg as floating (alUSD 0.956)', () => {
    expect(debtAtPeg({ group: 'USD', priceShort: 0.956 })).toBe(false)
    expect(slippageFor({ ...DEFAULTS, slippageBp: null }, debtAtPeg({ group: 'USD', priceShort: 0.956 }))).toBe(AUTO_SLIPPAGE_BP.floating)
  })
  it('keeps a dollar debt at its peg pegged', () => {
    expect(debtAtPeg({ group: 'USD', priceShort: 0.9997 })).toBe(true)
  })
  it('does not judge a price it cannot', () => {
    expect(debtAtPeg({ group: 'USD' })).toBe(true)
    expect(debtAtPeg({ group: 'ETH', priceShort: 2247 })).toBe(true)
  })
})
