import { describe, expect, it } from 'vitest'
import MECHANISMS from '../data/mechanisms.json'
import { isLendingVault, mechanismOfDesk, mechanismOfGroup, mechanismSubjectOfGroup, mechanismDetail, mechanismWords, MECHANISM_DETAIL, MECHANISM_IDS, MECHANISM_WORDS } from './mechanism'

describe('mechanisms', () => {
  it('every id token-lists ships has a word here', () => {
    const unknown = [...new Set(Object.values(MECHANISMS as Record<string, string>))].filter((m) => !(m in MECHANISM_WORDS))
    expect(unknown).toEqual([])
    expect(Object.keys(MECHANISM_WORDS).sort()).toEqual([...MECHANISM_IDS].sort())
  })
  it('spells every word out', () => {
    expect(Object.keys(MECHANISM_DETAIL).sort()).toEqual([...MECHANISM_IDS].sort())
    for (const d of Object.values(MECHANISM_DETAIL)) for (const t of [d.name, d.how, d.risk]) expect(t.length).toBeGreaterThan(5)
    expect(mechanismDetail('hedged-trading').name).toBe('Market-neutral trading')
    expect(mechanismOfGroup('Jupiter Perps::JLP::solana')).toBe('perp-lp')
    expect(mechanismOfGroup('Staked avUSD::savUSD')).toBe('mixed')
    expect(mechanismDetail('dividends', 'STRC').name).toBe('STRC dividends')
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
  it('says what pays it only where the token names one thing', () => {
    expect(mechanismSubjectOfGroup('Saturn sUSDat::SUSDAT')).toBe('STRC')
    expect(mechanismWords('dividends', 'STRC')).toEqual({ word: 'STRC dividends', mid: 'STRC dividends' })
    // Apyx's basket is mostly STRC (the rest SATA), and its peg follows STRC: named for it too
    expect(mechanismSubjectOfGroup('apyUSD::APYUSD')).toBe('STRC')
    // a token with a mechanism and no one payer keeps the bare word
    expect(mechanismOfGroup('Astherus Staked USDF::asUSDF')).toBeDefined()
    expect(mechanismSubjectOfGroup('Astherus Staked USDF::asUSDF')).toBeUndefined()
    expect(mechanismWords('dividends')).toEqual({ word: 'Dividends', mid: 'dividends' })
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
