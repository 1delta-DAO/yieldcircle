import { describe, expect, it } from 'vitest'
import { baseOfCollateral, baseOfSymbol, deskOf, denomOf, groupOf } from './assets'

describe('ftUSD (Flying Tulip USD) is a dollar', () => {
  it('resolves either spelling (Ethereum lists FTUSD, Sonic ftUSD) to the USD group', () => {
    for (const s of ['ftUSD', 'FTUSD']) {
      expect(baseOfSymbol(s)).toBe('ftUSD')
      expect(groupOf(baseOfSymbol(s)!)).toBe('USD')
      expect(denomOf(baseOfSymbol(s)!)).toBe('usd')
    }
    expect(deskOf('ftUSD')?.id).toBe('flying-tulip')
  })
  it('a sUSDe loop borrowing ftUSD is a dollar carry, not cross-denom', () => {
    const base = baseOfCollateral({ symbol: 'sUSDe', props: { savings: { base: 'USD', underlying: 'USDe' } } }, 'ftUSD')
    expect(denomOf(base!)).toBe(denomOf(baseOfSymbol('ftUSD')!))
  })
})
