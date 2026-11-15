import { describe, expect, it } from 'vitest'
import MECHANISMS from '../data/mechanisms.json'
import { isLendingVault, mechanismOfDesk, mechanismOfGroup, MECHANISM_IDS, MECHANISM_WORDS } from './mechanism'

describe('mechanisms', () => {
  it('every id token-lists ships has a word here', () => {
    const unknown = [...new Set(Object.values(MECHANISMS as Record<string, string>))].filter((m) => !(m in MECHANISM_WORDS))
    expect(unknown).toEqual([])
    expect(Object.keys(MECHANISM_WORDS).sort()).toEqual([...MECHANISM_IDS].sort())
  })
  it('is per token, not per issuer', () => {
    expect(mechanismOfGroup('SUSDE')).toBe('basis-trade')
    expect(mechanismOfGroup('WSTETH')).toBe('staking')
    expect(mechanismOfGroup('SYRUPUSDC')).toBe('private-credit')
    // Sky's two savings tokens are both entries of their own
    expect(mechanismOfGroup('sUSDS::SUSDS')).toBe('lending')
    expect(mechanismOfGroup('Staked USDS::stUSDS')).toBe('lending')
    // a coin that earns nothing itself has none
    expect(mechanismOfGroup('USDC')).toBeUndefined()
    expect(mechanismOfGroup(undefined)).toBeUndefined()
  })
  it('an issuer answers only where it has one line of business', () => {
    expect(mechanismOfDesk('USD', 'ethena')).toBe('basis-trade')
    expect(mechanismOfDesk('ETH', 'lido')).toBe('staking')
    expect(mechanismOfDesk('USD', 'midas')).toBeUndefined()
    // the same desk id in another money is another business
    expect(mechanismOfDesk('BTC', 'coinbase')).toBeUndefined()
  })
  it('knows which vault platforms lend', () => {
    expect(isLendingVault('vault.morpho')).toBe(true)
    expect(isLendingVault('vault.upshift')).toBe(false)
    expect(isLendingVault('AAVE_V3')).toBe(false)
  })
})
