import { describe, expect, it } from 'vitest'
import type { OptimizerRowRaw } from '../sdk/types'
import { CRYPTO_BORDERS, EQUITY_BORDERS, MIN_HEALTH, loansByOffer, yoursOf, bestOfferFor, byOffer, collateralFor, debtAtDrop, defaultBorrow, depositsAsLoans, dropOf, headlineOffers, healthOf, liquidationPrice, maxBorrowUsd, monthlyCost, offerFromHolding, offerFromRow, offersFrom, owedOf, zoneAmounts, zoneOf } from './borrow'
import type { Holding } from './positions'
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
  it('reads a dollar loan as `out: USD`', () => {
    expect(offerFromRow(row({ coll: TSLA }))!.out).toBe('USD')
  })
  it('lends ether against a stock (tickets/0011)', () => {
    const r = row({ coll: TSLA })
    r.underlyingInfoShort = { asset: { chainId: '8453', address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', decimals: 18 } as never }
    const o = offerFromRow(r)!
    expect(o.out).toBe('ETH')
    expect(o.debt.decimals).toBe(18)
    expect(o.pegged).toBe(false)
    // a headline quotes dollar loans only: an ether rate is a different number
    expect(headlineOffers([{ ...o, liquidityUsd: 1e7, collateralUsd: 1e7, borrowApr: 2 }])).toEqual([])
  })
  it('leaves a same-money pair to the loops (WETH against WETH, cbBTC against WBTC)', () => {
    const weth = { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH' }
    const r = row({ coll: weth })
    r.underlyingInfoShort = { asset: { chainId: '8453', ...weth, decimals: 18 } as never }
    expect(offerFromRow(r)).toBeNull()
    const b = row({ coll: { address: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', symbol: 'cbBTC', decimals: 8 } })
    b.underlyingInfoShort = { asset: { chainId: '8453', address: '0x0555e30da8f98308edb960aa94c0db47230d2b9c', symbol: 'WBTC', decimals: 8 } as never }
    expect(offerFromRow(b)).toBeNull()
  })
  it('reads Circle wrapped bitcoin on Arc as bitcoin, both as collateral and as a take-out', () => {
    // as token-lists names it since 2026-10-15: `denomination: BTC`, issuer circle
    const cir = { chainId: '5042', address: '0x171a4217b86a807a64eb94757db6849fb4bdbaa0', symbol: 'CIRBTC', decimals: 8, props: { denomination: 'BTC', issuer: { id: 'circle', name: 'Circle', kind: 'institution' } } }
    const arcUsdc = { chainId: '5042', address: '0x3600000000000000000000000000000000000000', symbol: 'USDC', decimals: 6, props: { stablecoin: { base: 'USD' }, issuer: { id: 'circle' } } }
    const r = row({ coll: cir, chainId: '5042', lender: 'MORPHO_BLUE_C2DB', marketLongUid: `MORPHO_BLUE_C2DB:5042:${cir.address}`, marketShortUid: `MORPHO_BLUE_C2DB:5042:${arcUsdc.address}` })
    r.underlyingInfoShort = { asset: arcUsdc as never, prices: { priceUsd: 1 } }
    const o = offerFromRow(r)!
    expect(o).toBeTruthy()
    expect(o.asset).toBe('cirBTC')
    expect(o.group).toBe('BTC')
    expect(o.out).toBe('USD')
    // and lent out against ether: a bitcoin take-out
    const t = row({ coll: { chainId: '5042', address: '0x128cc466b61f542da60c70e3aa11c10e19b84edb', symbol: 'WETH', props: { denomination: 'ETH' } }, chainId: '5042' })
    t.underlyingInfoShort = { asset: cir as never }
    expect(offerFromRow(t)!.out).toBe('BTC')
    // even with no props (an older answer): the symbol alone names it
    expect(keyOfToken({ chainId: '5042', address: cir.address, symbol: 'CIRBTC' })).toBe('cirBTC')
  })
  it('refuses a debt in nothing it can name', () => {
    const r = row({ coll: TSLA })
    r.underlyingInfoShort = { asset: { chainId: '8453', address: '0x00000000000000000000000000000000000000ab', symbol: 'ZZZ', decimals: 18 } as never }
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
    const mk = (id: string, chainId: string, borrowApr: number) => ({ id, chainId, asset: 'ETH', out: 'USD', borrowApr, liquidityUsd: 5e6, collateralUsd: 5e6, risk: 2 as const, maxLtv: 0.8 })
    const offers = [mk('base', '8453', 4), mk('eth', '1', 2), mk('none', '1', 1)].map((o, i) => (i === 2 ? { ...o, maxLtv: 0 } : o))
    expect(bestOfferFor('ETH', offers as never)?.id).toBe('eth')
    expect(bestOfferFor('ETH', offers as never, [{ asset: 'ETH', chainId: '8453', usd: 900 }])?.id).toBe('base')
    expect(bestOfferFor('BTC', offers as never)).toBeUndefined()
  })
})

describe('collateral already in (tickets/0011)', () => {
  const offer = offerFromRow(row({ coll: { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH' }, price: 4000 }))!
  const deposit = {
    key: 'p:0:m', chainId: '8453', group: 'ETH', asset: 'ETH', kind: 'simple', label: 'WETH · Lend on Aave', venue: 'Aave', valueUsd: 20_000,
    amount: 5, symbol: 'WETH', decimals: 18, assetAddress: '0x4200000000000000000000000000000000000006', marketUid: offer.collateral.uid.toUpperCase(), lender: 'AAVE_V4_X',
  } as Holding
  it('reads a deposit in the offer’s own collateral market as a loan of $0', () => {
    const [h] = depositsAsLoans(offer, [deposit])
    expect(h).toBeTruthy()
    expect(h.kind).toBe('borrow')
    expect(h.putUp).toBe(true)
    expect(h.collateralUid).toBe(deposit.marketUid)
    expect(h.debtUid).toBe(offer.debt.uid)
    expect(h.debtDecimals).toBe(6)
    expect(h.collateralUsd).toBe(20_000)
    expect(owedOf(h)).toBe(0)
  })
  it('leaves out a deposit elsewhere, a vault share and a paper deposit', () => {
    expect(depositsAsLoans(offer, [{ ...deposit, marketUid: 'AAVE_V4_X:8453:0xother' }])).toEqual([])
    expect(depositsAsLoans(offer, [{ ...deposit, marketUid: undefined }])).toEqual([])
    expect(depositsAsLoans(offer, [{ ...deposit, paper: true }])).toEqual([])
  })
  it('counts every collateral leg in what an account owes', () => {
    // $10k ETH + $5k wstETH up, $9k equity: $6k owed — not the $1k the ETH leg alone said
    const h = { collateralUsd: 10_000, valueUsd: 9000, others: [{ side: 'collateral' as const, symbol: 'wstETH', amount: 1.2, usd: 5000 }] }
    expect(owedOf(h)).toBe(6000)
    expect(owedOf({ collateralUsd: 10_000, valueUsd: 12_000 })).toBe(0)
  })
  it('keeps the debt’s own decimals when an offer is rebuilt from a loan', () => {
    const o = offerFromHolding({ chainId: '56', asset: 'ETH', group: 'ETH', venue: 'Venus', symbol: 'ETH', decimals: 18, amount: 1, collateralUid: 'V:56:0xc', debtUid: 'V:56:0xd', collateralAddress: '0xc', debtAddress: '0x55d398326f99059ff775485246999027b3197955', debtSymbol: 'USDT', debtDecimals: 18, debtAmount: 1000, collateralUsd: 4000, valueUsd: 3000 })!
    expect(o.debt.decimals).toBe(18)
  })
})

describe('by amount (tickets/0011)', () => {
  const o = { maxLtv: 0.8, liqLtv: 0.83 }
  it('puts up enough that the loan starts in Safe, at the Safe chip’s depth', () => {
    const coll = collateralFor(o, CRYPTO_BORDERS, 500)
    expect(zoneOf(dropOf(coll, 500, o.liqLtv), CRYPTO_BORDERS)).toBe('safe')
    // the Safe chip sits a quarter of the way into the zone: the same depth from this side
    expect(dropOf(coll, 500, o.liqLtv)).toBeCloseTo(0.4 + 0.6 * 0.25, 6)
    expect(maxBorrowUsd({ ...o, liquidityUsd: 1e9 }, coll)).toBeGreaterThanOrEqual(500)
  })
  it('adds only what is missing on top of what is already in, and nothing when it is enough', () => {
    const all = collateralFor(o, CRYPTO_BORDERS, 2000, 0, 1000)
    expect(collateralFor(o, CRYPTO_BORDERS, 2000, 3000, 1000)).toBeCloseTo(all - 3000, 6)
    expect(collateralFor(o, CRYPTO_BORDERS, 100, 100_000)).toBe(0)
    expect(collateralFor(o, CRYPTO_BORDERS, 0)).toBe(0)
  })
  it('opens the ticket on the family asked for', () => {
    const mk = (id: string, out: string) => ({ id, chainId: '1', asset: 'TSLA', out, borrowApr: 2, liquidityUsd: 5e6, collateralUsd: 5e6, risk: 2 as const, maxLtv: 0.7 })
    const offers = [mk('usd', 'USD'), mk('eth', 'ETH')]
    expect(bestOfferFor('TSLA', offers as never)?.id).toBe('usd')
    expect(bestOfferFor('TSLA', offers as never, [], 'ETH')?.id).toBe('eth')
  })
})

describe('against what you hold (tickets/0011)', () => {
  const weth = { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH' }
  const offer = offerFromRow(row({ coll: weth, price: 4000 }))!
  const other = { ...offer, id: 'b:other|x', chainId: '1', collateral: { ...offer.collateral, uid: 'AAVE_V3:1:0xc02a' } }
  const deposit = { key: 'p:0:m', chainId: '8453', group: 'ETH', asset: 'ETH', kind: 'simple', label: '', venue: 'Aave', valueUsd: 8000, amount: 2, symbol: 'WETH', decimals: 18, assetAddress: weth.address, marketUid: offer.collateral.uid } as Holding
  it('files a deposit under every offer on its market, and nowhere else', () => {
    const m = loansByOffer([offer, other], [deposit])
    expect(m.get(offer.id)?.[0].putUp).toBe(true)
    expect(m.has(other.id)).toBe(false)
  })
  it('says what the wallet has per offer: idle on that chain, or already put up', () => {
    const idle = [{ asset: 'ETH', chainId: '1', usd: 4000, amount: 1, symbol: 'ETH' }, { asset: 'ETH', chainId: '8453', usd: 0.5, amount: 0.0001, symbol: 'ETH' }]
    const y = yoursOf([offer, other], idle, loansByOffer([offer, other], [deposit]))
    // Base: dust idle is not counted, the $8k deposit is
    expect(y.get(offer.id)).toMatchObject({ idleUsd: 0, putUpUsd: 8000, loan: false })
    expect(y.get(offer.id)!.room).toBeGreaterThan(0)
    // Ethereum: the idle ether
    expect(y.get(other.id)).toMatchObject({ idleUsd: 4000, idleAmount: 1, symbol: 'ETH', putUpUsd: 0 })
    expect(yoursOf([offer], [], new Map()).size).toBe(0)
  })
})
