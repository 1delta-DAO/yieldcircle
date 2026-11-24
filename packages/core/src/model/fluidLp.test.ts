import { describe, expect, it } from 'vitest'
import { correlatedLp, fluidLpLegs, lpLabel } from './fluidLp'
import { dedupe, heldLabel, rowKey, type LoopStrategy } from './strategies'

const LBTC = '0x8236a87084f8b84306f72007f36f2618a5634494'
const CBBTC = '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf'
const INST = '0x6f40d4a6237c257fff2db00fa0510deeecd303eb'

describe('Fluid LP collateral', () => {
  it('offers a T2 whose legs are one money, with both legs in the vault order', () => {
    const legs = correlatedLp('1', 'FLUID_1_97', { chainId: '1', address: LBTC, symbol: 'LBTC' })
    expect(legs?.map((l) => l.symbol)).toEqual(['LBTC', 'cbBTC'])
    expect(lpLabel(legs!)).toBe('LBTC + cbBTC')
    // entered from the other leg, the same pool
    expect(correlatedLp('1', 'FLUID_1_97', { chainId: '1', address: CBBTC.toUpperCase(), symbol: 'cbBTC' })).toEqual(legs)
  })
  it('refuses a pool of two monies, a token that is no leg, and any vault the snapshot does not list', () => {
    expect(fluidLpLegs('1', 'FLUID_1_76')).toBeDefined()
    expect(correlatedLp('1', 'FLUID_1_76', { chainId: '1', address: INST, symbol: 'INST' })).toBeUndefined()
    expect(correlatedLp('1', 'FLUID_1_97', { chainId: '1', address: INST, symbol: 'INST' })).toBeUndefined()
    // FLUID_1_34 is a T4 (an LP on the debt side too): never in the snapshot
    expect(fluidLpLegs('1', 'FLUID_1_34')).toBeUndefined()
  })
  it('lists the vault once, entered with the leg that yields of its own', () => {
    const legs = fluidLpLegs('1', 'FLUID_1_97')!
    const row = (holds: string, intrinsicLong?: number) => ({ id: holds, kind: 'loop', chainId: '1', asset: 'BTC', holds, venue: 'Fluid', lender: 'FLUID_1_97', debt: 'WBTC', rate: 23.6, lp: legs, intrinsicLong }) as unknown as LoopStrategy
    const a = row('cbBTC'), b = row('LBTC', 0.4)
    expect(rowKey(a)).toBe(rowKey(b))
    expect(dedupe([a, b]).map((r) => r.holds)).toEqual(['LBTC'])
    expect(dedupe([b, a]).map((r) => r.holds)).toEqual(['LBTC'])
    expect(heldLabel(b)).toBe('LBTC + cbBTC')
  })
})
