import { describe, expect, it } from 'vitest'
import { closeSale } from './ticket'
import { closeNeedsAccount } from './strategies'

// quotes measured on allocator.api, 2026-11-26: the same position asked without and with `account`
describe('closeSale', () => {
  // Jupiter Lend sUSDai / USDC, 8.2×: $11,558.74 of equity
  const held = 84055.634874, owed = 83306.358768
  it('reads a full sale and a debt-sized sale of one position alike', () => {
    const whole = closeSale({ input: 84055.634874, output: 94503.527977 }, held, owed, 50)
    const cut = closeSale({ input: 74207.376748, output: 83431.362835 }, held, owed, 50)
    expect(whole.sized).toBe(false)
    expect(cut.sized).toBe(true)
    // read as "everything sold", the cut quote left 83431 − 83306 = $125 of $11,559: a 98.9 % loss
    expect(whole.full - owed).toBeCloseTo(11197.17, 0)
    expect(cut.full - owed).toBeCloseTo(11197.2, 0)
    expect(cut.covers).toBe(true)
    expect(cut.tight).toBe(false)
  })
  it('takes a sized route\'s own sale and surplus, and the keep margin\'s estimate otherwise', () => {
    const cut = closeSale({ input: 74207.376748, output: 83431.362835 }, held, owed, 50)
    expect(cut.sellKeep).toBe(74207.376748)
    expect(cut.leftover).toBeCloseTo(125.004, 2)
    const whole = closeSale({ input: 84055.634874, output: 94503.527977 }, held, owed, 50)
    expect(whole.sellKeep).toBeCloseTo((owed * 1.01) / whole.rate, 6)
    expect(whole.leftover).toBeCloseTo(owed * 0.01, 6)
  })
  it('counts the EVM skim as collateral that comes back, not as a loss', () => {
    // Aave V3 weETH / WETH, 12×: the quote sells 99.93 % of the balance
    const r = closeSale({ input: 77.70911227522596, output: 86.0203856297347 }, 77.76351953527063, 79.07706636550331, 50)
    expect(r.sized).toBe(false)
    expect(r.full).toBeCloseTo(86.0806, 3)
    expect(r.full).toBeGreaterThan(86.0203856297347)
  })
  it('covers a route that repays the debt to the unit (Inverse)', () => {
    const r = closeSale({ input: 55431.921662627654, output: 69270.98263549805 }, 66210.0561890295, 69270.98263549805, 50)
    expect(r.sized).toBe(true)
    expect(r.covers).toBe(true)
    expect(r.leftover).toBe(0)
  })
  it('is short when all of it does not repay the debt', () => {
    // sMON / WMON on Euler, 2026-09-29: 9,207 WMON for 8,281 sMON against 9,250 owed
    const r = closeSale({ input: 8281, output: 9207 }, 8281, 9250, 50)
    expect(r.covers).toBe(false)
  })
})

describe('closeNeedsAccount', () => {
  it('names the venues whose close answers nothing without an account', () => {
    for (const l of ['LLAMALEND_B536FEA3', 'RESUPPLY_1_0837E20D', 'INVERSE_79EF6D28', 'TWYNE_1_75029A47', 'CURVANCE_143_8A8602EB', 'FRAXLEND_1_8087346B', 'FLYING_TULIP', 'ALCHEMIX_1_EB83112D', 'FLEX_1_29E3962C', 'FLEX'])
      expect(closeNeedsAccount(l)).toBe(true)
    for (const l of ['AAVE_V3', 'MORPHO_BLUE_90EF0C5A', 'EULER_V2', 'JUPITER_LEND_main_101', 'KAMINO_DxXdAyU3', 'LOOPSCALE_EPjF_HnnG', 'FLEXIBLE', undefined])
      expect(closeNeedsAccount(l)).toBe(false)
  })
})
