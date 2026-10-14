import { describe, expect, it } from 'vitest'
import type { OptimizerRowRaw } from '../sdk/types'
import { CRYPTO_BORDERS, EQUITY_BORDERS, MIN_HEALTH, bestOfferFor, byOffer, debtAtDrop, defaultBorrow, dropOf, healthOf, liquidationPrice, maxBorrowUsd, monthlyCost, offerFromRow, offersFrom, zoneAmounts, zoneOf } from './borrow'
import { groupOf, stockOfToken } from './assets'
import { keyOfToken } from './desk'

const USDC = { chainId: '8453', address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', decimals: 6 }
/** A pairs row as `/pairs/optimize` answers it (2026-10-14, trimmed to what the model reads). */
function row(o: Partial<OptimizerRowRaw> & { coll: Record<string, unknown>; price?: number }): OptimizerRowRaw {
  const { coll, price, ...rest } = o
  return {
    chainId: '8453', lender: 'AAVE_V4_17905DB0E4A35144675399', marketLongUid: `AAVE_V4_X:8453:${coll.address}`, marketShortUid: `AAVE_V4_X:8453:${USDC.address}`,
    marketNameLong: '', marketNameShort: '', maxLeverage: '4', ltv: '0.79', collateralFactorLong: '0.79', depositAprLong: '0', borrowAprShort: '1.873',
    aprBase: '0', aprTotal: '0', borrowLiquidityUsdShort: '3051220', totalDepositsUsdLong: '6000000',
    underlyingInfoLong: { asset: { chainId: '8453', decimals: 18, ...coll } as never, prices: { priceUsd: price } },
    underlyingInfoShort: { asset: { ...USDC, props: { stablecoin: { base: 'USD' }, issuer: { id: 'circle' } } } as never, prices: { priceUsd: 1 } },
    risk: { maxTokenScore: 2, breakdown: [{ category: 'config', score: 3 }] },
    ...rest,
  } as OptimizerRowRaw
}
const TSLA = { address: '0xaaaa000000000000000000000000000000000001', symbol: 'TSLAC', props: { rwa: { type: 'equity', subType: 'stock', underlying: 'TSLA', issuer: 'coinbase' } } }

describe('offerFromRow', () => {
  it('reads a stock against dollars as a TSLA loan in the Stocks group', () => {
    const o = offerFromRow(row({ coll: TSLA, price: 394, collateralAssetClass: 'stock', collateralUnderlyingTicker: 'TSLA' }))!
    expect(o).toBeTruthy()
    expect(o.asset).toBe('TSLA')
    expect(o.group).toBe('STOCKS')
    expect(o.assetClass).toBe('stock')
    expect(o.ticker).toBe('TSLA')
    expect(o.pegged).toBe(false)
    expect(o.maxLtv).toBeCloseTo(0.79)
    // the token now resolves to its ticker everywhere: a wallet balance, a position
    expect(stockOfToken('8453', TSLA.address.toUpperCase().replace('0X', '0x'))).toBe('TSLA')
    expect(keyOfToken({ chainId: '8453', address: TSLA.address, symbol: 'TSLAC' })).toBe('TSLA')
    expect(groupOf('TSLA')).toBe('STOCKS')
  })
  it('folds a debt borrow factor into both limits (Kamino 1.66)', () => {
    const o = offerFromRow(row({ coll: { ...TSLA, address: '0xaaaa000000000000000000000000000000000002' }, ltv: '0.1807', borrowCollateralFactorLong: '0.3', collateralFactorLong: '0.4', borrowFactorShort: '1.66' }))!
    expect(o.maxLtv).toBeCloseTo(0.1807, 3)
    expect(o.liqLtv).toBeCloseTo(0.4 / 1.66, 4)
  })
  it('refuses a debt that is not a dollar', () => {
    const r = row({ coll: TSLA })
    r.underlyingInfoShort = { asset: { chainId: '8453', address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 } as never }
    expect(offerFromRow(r)).toBeNull()
  })
  it('flags a venue that needs a term, and offersFrom leaves it out', () => {
    const r = row({ coll: TSLA, lender: 'TELLER_45AC', fixedTerm: { model: 'teller' } })
    expect(offerFromRow(r)!.needsInput).toBe('term')
    expect(offersFrom([r])).toEqual([])
  })
  it('leaves out a broken rate and an empty market', () => {
    expect(offersFrom([row({ coll: TSLA, borrowAprShort: '300' })])).toEqual([])
    expect(offersFrom([row({ coll: TSLA, borrowLiquidityUsdShort: '3' })])).toEqual([])
  })
})

describe('the zones', () => {
  it('say how far the price can fall', () => {
    // $10k of ETH at 80 % liquidation, $4k owed: liquidated at $5k, a 50 % fall
    expect(dropOf(10_000, 4000, 0.8)).toBeCloseTo(0.5)
    expect(healthOf(10_000, 4000, 0.8)).toBeCloseTo(2)
    expect(zoneOf(0.5, CRYPTO_BORDERS)).toBe('safe')
    expect(zoneOf(0.5, EQUITY_BORDERS)).toBe('safe')
    expect(zoneOf(0.45, EQUITY_BORDERS)).toBe('watch')
    expect(zoneOf(0.1, CRYPTO_BORDERS)).toBe('spicy')
    expect(dropOf(10_000, 0, 0.8)).toBe(1)
    expect(debtAtDrop(10_000, 0.8, 0.5)).toBeCloseTo(4000)
  })
  it('puts the liquidation line in the collateral’s own price', () => {
    // 2 TSLA, $400 owed, 73 % threshold: liquidated under $273.97
    expect(liquidationPrice(400, 2, 0.73)).toBeCloseTo(273.97, 1)
    expect(monthlyCost(400, 7.3)).toBeCloseTo(2.43, 2)
  })
  it('never offers past the venue limit, the health floor or the free liquidity', () => {
    const o = { maxLtv: 0.79, liqLtv: 0.79, liquidityUsd: 1e9 }
    // limit = liquidation here (Aave's stock hub): the floor is what binds
    expect(maxBorrowUsd(o, 10_000)).toBeCloseTo(10_000 * 0.79 / MIN_HEALTH)
    expect(maxBorrowUsd({ ...o, liquidityUsd: 500 }, 10_000)).toBe(500)
    expect(maxBorrowUsd(o, 10_000, 9000)).toBe(0)
  })
  it('lands each chip inside its zone and starts on Safe', () => {
    const o = { maxLtv: 0.73, liqLtv: 0.78, liquidityUsd: 1e9 }
    const z = zoneAmounts(o, EQUITY_BORDERS, 10_000)
    for (const [k, v] of Object.entries(z)) {
      expect(v).not.toBeNull()
      expect(zoneOf(dropOf(10_000, v!, o.liqLtv), EQUITY_BORDERS)).toBe(k)
    }
    expect(defaultBorrow(z)).toBe(z.safe)
    // with $3k already owed, every chip is what to ADD
    const z2 = zoneAmounts(o, EQUITY_BORDERS, 10_000, 3000)
    expect(z2.safe).toBeNull()
    expect(zoneOf(dropOf(10_000, 3000 + z2.watch!, o.liqLtv), EQUITY_BORDERS)).toBe('watch')
  })
  it('ranks offers that can fill a loan first, then the rate', () => {
    const base = { risk: 2 as const, maxLtv: 0.7, collateralUsd: 5e6 }
    const tiny = { ...base, liquidityUsd: 100, borrowApr: 0.02 }, deep = { ...base, liquidityUsd: 5e6, borrowApr: 6 }, cheap = { ...base, liquidityUsd: 5e6, borrowApr: 2 }
    expect([tiny, deep, cheap].sort(byOffer as never)).toEqual([cheap, deep, tiny])
    // an empty vault at 0 % does not lead a market people use
    const empty = { ...cheap, borrowApr: 0, collateralUsd: 2000 }
    expect([empty, deep].sort(byOffer as never)).toEqual([deep, empty])
  })
  it('opens the ticket where the wallet holds the asset, else on the best offer', () => {
    const mk = (id: string, chainId: string, borrowApr: number) => ({ id, chainId, asset: 'ETH', borrowApr, liquidityUsd: 5e6, collateralUsd: 5e6, risk: 2 as const, maxLtv: 0.8 })
    const offers = [mk('base', '8453', 4), mk('eth', '1', 2), mk('none', '1', 1)].map((o, i) => (i === 2 ? { ...o, maxLtv: 0 } : o))
    expect(bestOfferFor('ETH', offers as never)?.id).toBe('eth')
    expect(bestOfferFor('ETH', offers as never, [{ asset: 'ETH', chainId: '8453', usd: 900 }])?.id).toBe('base')
    expect(bestOfferFor('BTC', offers as never)).toBeUndefined()
  })
})
