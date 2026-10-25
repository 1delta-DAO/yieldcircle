import { describe, expect, it } from 'vitest'
import type { LendingBook, OptimizerRowRaw } from '../sdk/types'
import { clampRate, debtAheadAt, isUserSetRow, rateToWad, recommendedOf, userSetOfBook, userSetOfRow } from './userSetRate'
import { offerFromRow, offersFrom } from './borrow'

const picks = [
  { id: 'cheapest' as const, apr: 2.61, debtAhead: 1.3e6, share: 0.1, upfrontFeePct: 0.066 },
  { id: 'balanced' as const, apr: 2.81, debtAhead: 4.2e6, share: 0.33, upfrontFeePct: 0.066 },
  { id: 'protected' as const, apr: 3.01, debtAhead: 6.7e6, share: 0.52, upfrontFeePct: 0.066 },
]
const queue = { min: 0.5, max: 250, totalDebt: 12.86e6, picks, recommended: 'balanced' as const, pressure: { driver: 'below-peg' as const, signal: 0.998, level: 'elevated' as const } }

describe('userSetOfRow', () => {
  it('reads a Liquity row: WAD bounds, the queue picks, the cooldown', () => {
    const u = userSetOfRow({ liquityShort: { minAnnualInterestRate: '5000000000000000', maxAnnualInterestRate: '2500000000000000000', interestRateAdjCooldownSeconds: '604800', queue } })!
    expect(u.min).toBe(0.5)
    expect(u.max).toBe(250)
    expect(u.picks).toHaveLength(3)
    expect(recommendedOf(u)?.apr).toBe(2.81)
    expect(u.cooldownSecs).toBe(604800)
  })
  it('reads Flex number fractions (2.5 = 250 %) when no queue is there', () => {
    const u = userSetOfRow({ flexShort: { minAnnualInterestRate: 0.001, maxAnnualInterestRate: 2.5 } })!
    expect(u.min).toBeCloseTo(0.1)
    expect(u.max).toBeCloseTo(250)
    expect(u.picks).toEqual([])
  })
  it('a shut-down branch has no picks', () => {
    expect(userSetOfRow({ liquityShort: { minAnnualInterestRate: '5000000000000000', maxAnnualInterestRate: '2500000000000000000', shutdown: true, queue } })!.picks).toEqual([])
  })
})

describe('the queue book', () => {
  const book: LendingBook = {
    lender: 'LIQUITY_V2_1_0', chainId: '1', side: 'borrow', pricing: 'queue',
    levels: [{ aprPct: 0.5, assets: 0.32e6, cumulativeAssets: 0.32e6 }, { aprPct: 2.6, assets: 1e6, cumulativeAssets: 1.32e6 }, { aprPct: 3, assets: 2e6, cumulativeAssets: 3.32e6 }],
    range: { min: 0.5, max: 250 }, totalDebt: 3.32e6, picks, recommended: 'balanced',
  }
  it('debt ahead counts every level at or below the rate', () => {
    expect(debtAheadAt(book, 0.49)).toBe(0)
    expect(debtAheadAt(book, 0.5)).toBe(0.32e6)
    expect(debtAheadAt(book, 2.95)).toBe(1.32e6)
    expect(debtAheadAt(book, 10)).toBe(3.32e6)
  })
  it('userSetOfBook ignores a book that is not a queue', () => {
    expect(userSetOfBook({ ...book, pricing: 'marginal' })).toBeNull()
    expect(userSetOfBook(book)!.recommended).toBe('balanced')
  })
  it('rates go out as WAD fractions on the bp grid, inside the range', () => {
    expect(rateToWad(2.81)).toBe('28100000000000000')
    expect(rateToWad(5)).toBe('50000000000000000')
    const u = userSetOfBook(book)!
    expect(clampRate(u, 0.1)).toBe(0.5)
    expect(clampRate(u, 2.8149)).toBe(2.81)
  })
})

describe('offers', () => {
  const base = {
    chainId: '1', lender: 'LIQUITY_V2_1_0', marketLongUid: 'LIQUITY_V2_1_0:1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', marketShortUid: 'LIQUITY_V2_1_0:1:0x6440f144b7e50d6a8439336510312d2f54beb01d',
    marketNameLong: '', marketNameShort: '', maxLeverage: '11', ltv: '0.9', collateralFactorLong: '0.909', depositAprLong: '0', borrowAprShort: '2.876',
    aprBase: '0', aprTotal: '0', borrowLiquidityUsdShort: '50000000', totalDepositsUsdLong: '30000000',
    underlyingInfoLong: { asset: { chainId: '1', address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', symbol: 'WETH', decimals: 18 } as never, prices: { priceUsd: 2500 } },
    underlyingInfoShort: { asset: { chainId: '1', address: '0x6440f144b7e50d6a8439336510312d2f54beb01d', symbol: 'BOLD', decimals: 18, props: { stablecoin: { base: 'USD' } } } as never, prices: { priceUsd: 1 } },
    risk: { maxTokenScore: 2, breakdown: [{ category: 'config', score: 2 }] },
  } as unknown as OptimizerRowRaw
  it('a user-set row WITH picks is offered and carries them', () => {
    const r = { ...base, rateModelShort: 'userSet', liquityShort: { minAnnualInterestRate: '5000000000000000', maxAnnualInterestRate: '2500000000000000000', queue } }
    expect(isUserSetRow(r)).toBe(true)
    const o = offerFromRow(r)!
    expect(o.needsInput).toBeUndefined()
    expect(o.userSet?.recommended).toBe('balanced')
    expect(offersFrom([r])).toHaveLength(1)
  })
  it('a user-set row WITHOUT picks is still held back (nothing to pick from)', () => {
    const o = offerFromRow({ ...base, rateModelShort: 'userSet' })!
    expect(o.needsInput).toBe('trove')
    expect(offersFrom([{ ...base, rateModelShort: 'userSet' }])).toHaveLength(0)
  })
  it('falls back to the key when the row predates rateModelShort (USDAF and FLEX included)', () => {
    expect(isUserSetRow({ lender: 'USDAF_1_0' })).toBe(true)
    expect(isUserSetRow({ lender: 'FLEX_1_8EE7' })).toBe(true)
    expect(isUserSetRow({ lender: 'AAVE_V3', rateModelShort: null })).toBe(false)
  })
})
