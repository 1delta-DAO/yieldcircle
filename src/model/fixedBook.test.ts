import { describe, expect, it } from 'vitest'
import type { EarnMarket } from '../sdk/types'
import { bookOpen, bookTerms, classifyEarn, exitTerms, foldBookDates, type SimpleStrategy } from './strategies'

// rows as `/v1/data/earn?includeFixedTerm=true&protocol=MORPHO_MIDNIGHT,TERM_FINANCE` served them (2026-10-20)
const USDC_BASE = { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', decimals: 6 }
const USDC_ETH = { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC', decimals: 6 }
const row = (venue: string, chainId: string, name: string, rate: number, maturity: number, asset = chainId === '1' ? USDC_ETH : USDC_BASE): EarnMarket => ({
  earnUid: `${venue}:${chainId}:${asset.address}`, chainId, venue, venueKind: 'lending', brand: venue.startsWith('TERM') ? 'Term Finance' : 'Morpho Midnight',
  protocol: { key: venue.split('_').slice(0, 2).join('_'), name: venue.startsWith('TERM') ? 'Term Finance' : 'Morpho Midnight' }, name, ref: asset.address, asset,
  rate: { total: rate, base: rate, kind: 'fixed-term', source: 'chain' }, tvl: { usd: 300 }, liquidity: { usd: 24_740_468 }, utilization: 0,
  refs: { marketUid: `${venue}:${chainId}:${asset.address}` }, exit: { mode: 'instant-capped' },
  maturity: { kind: 'fixed-date', maturity, secondsToMaturity: 5709596 }, availability: { canDeposit: true, canWithdraw: true },
  risk: { score: 2 }, capabilities: [{ action: 'deposit', acceptsNative: false }, { action: 'withdraw', acceptsNative: false }],
  termSheet: { supply: { headline: `Variable ${rate}% until … · exit by selling on the market`, description: 'You earn …, floating with utilization.' } },
} as unknown as EarnMarket)
const DEC25 = 1798210800, JUL31 = 1785510000, DEC10 = 1796918400, NOV12 = 1794499200
const NOW = Date.UTC(2026, 9, 20) / 1000
const mid = row('MORPHO_MIDNIGHT_9593C3A6DBA45B6106AF8DC8B45BA8C505D90D3D68A3D33F7C278DD921B637DA', '8453', 'cbBTC-USDC 86 2026-12-25', 3.62, DEC25)

describe('fixed-rate book rows', () => {
  it('reads a Midnight lending row as a book loan, not a floating market', () => {
    const { s, hide } = classifyEarn(mid)
    expect(hide).toBeNull()
    expect(s).toMatchObject({ source: 'fixed-book', holds: 'USDC', group: 'USD', maturity: DEC25, exitWord: 'At maturity', via: 'Fixed on Midnight · against cbBTC · 25 Dec 2026', market: 'cbBTC 86' })
    expect(s!.book).toEqual({ family: 'midnight', lender: mid.venue, earlyExit: true, collateral: 'cbBTC', lltv: 86 })
    // the digest's "floating with utilization" is the API's mistake for a filled offer; the other side's depth is not a lender's liquidity
    expect(s!.headline).toBeUndefined()
    expect(s!.description).toBeUndefined()
    expect(s!.liquidityUsd).toBeUndefined()
    expect(s!.utilization).toBeUndefined()
  })
  it('says the exit is a sale before maturity on Midnight and a lock on Term', () => {
    const s = classifyEarn(mid).s!
    expect(exitTerms(s, NOW)).toMatchObject({ when: 'repaid on 25 Dec 2026 · or sell to the book', short: 'repaid in 67d' })
    const t = classifyEarn(row('TERM_FINANCE_7E0521C8068C45A6EE796909A5CADD78C8ADBCAB561EF649235D683D21547687', '1', 'USDC / PT-reUSD-10DEC2026 — 2026-12-10', 9, DEC10)).s!
    expect(t.book).toMatchObject({ family: 'term', earlyExit: false, collateral: 'PT-reUSD-10DEC2026' })
    expect(exitTerms(t, NOW)).toMatchObject({ when: 'repaid on 10 Dec 2026 · no exit before', short: 'locked 52d' })
    expect(exitTerms(s, DEC25 + 60).word).toBe('Matured')
  })
  it('keeps an empty or matured book out of what can be lent into, but still classifies it for a holder', () => {
    const matured = classifyEarn(row('MORPHO_MIDNIGHT_0664C52B', '8453', 'cbBTC-USDC 92 2026-07-31', 0, JUL31)).s!
    expect(matured.source).toBe('fixed-book')
    expect(bookOpen(matured, NOW)).toBe(false)
    expect(bookOpen(classifyEarn(row('MORPHO_MIDNIGHT_AA', '8453', 'cbBTC-USDC 86 2026-12-25', 0, DEC25)).s!, NOW)).toBe(false)
    expect(bookOpen(classifyEarn(mid).s!, NOW)).toBe(true)
    // a day before its date is too late to lend into
    expect(bookOpen(classifyEarn(mid).s!, DEC25 - 3600)).toBe(false)
  })
  it('leaves a Pendle PT a PT, whatever its rate kind says', () => {
    const pt = { ...mid, venue: 'vault.pendle', venueKind: 'vault', name: 'PT-sUSDe-27NOV2025', protocol: { key: 'vault.pendle', name: 'Pendle' }, capabilities: [{ action: 'deposit', requires: ['slippage'] }, { action: 'withdraw', requires: ['slippage'] }] } as unknown as EarnMarket
    const { s } = classifyEarn(pt)
    expect(s?.source).toBe('fixed')
    expect(s?.book).toBeUndefined()
  })
  it('leaves a fixed-term lending row of a family it cannot build (Teller) as it was', () => {
    const { s } = classifyEarn(row('TELLER_9C182F8611316498CDC99738087E96F4FB53E929', '1', 'WXDC / USDC', 45, DEC25))
    expect(s?.source).toBe('lending')
    expect(s?.book).toBeUndefined()
  })
  it('folds the maturities of one book, and never two unnamed markets', () => {
    const a = classifyEarn(row('TERM_FINANCE_21E43F15', '1', 'USDC / USD3 — 2026-12-10', 7.75, DEC10)).s!
    const b = classifyEarn(row('TERM_FINANCE_3EB66A64', '1', 'USDC / USD3 — 2026-11-12', 7.25, NOV12)).s!
    const u1 = classifyEarn(row('MORPHO_MIDNIGHT_6CB9', '8453', 'USDC · 0x6CB9', 4.13, 1795791600)).s!
    const u2 = classifyEarn(row('MORPHO_MIDNIGHT_6284', '8453', 'USDC · 0x6284', 3.67, 1795791600)).s!
    // the earn uid differs per maturity: the fixtures above share an asset address, so give each its own
    const fix = (s: SimpleStrategy, k: string): SimpleStrategy => ({ ...s, earnUid: `${s.earnUid}#${k}`, id: `${s.id}#${k}` })
    const { rows, rest } = foldBookDates([fix(a, 'a'), fix(b, 'b'), fix(u1, '1'), fix(u2, '2')])
    expect(rows).toHaveLength(3)
    const usd3 = rows.find((r) => r.book?.collateral === 'USD3')!
    expect(usd3.rate).toBe(7.75)
    expect(usd3.dates?.map((d) => d.maturity)).toEqual([NOV12, DEC10])
    expect(rest.map((r) => r.maturity)).toEqual([NOV12])
  })
  it('reads what the borrowers put up from either venue’s market name', () => {
    expect(bookTerms('wstETH-WETH 95 2026-08-28', 'WETH')).toEqual({ collateral: 'wstETH', lltv: 95, tag: 'wstETH 95' })
    expect(bookTerms('PT-sUSDS-26NOV2026-USDT 92 2026-11-26', 'USDT')).toMatchObject({ collateral: 'PT-sUSDS-26NOV2026', lltv: 92 })
    expect(bookTerms('USDC / PT-strUSD-26NOV2026 — 2026-11-26', 'USDC')).toEqual({ collateral: 'PT-strUSD-26NOV2026', tag: 'PT-strUSD-26NOV2026' })
    expect(bookTerms('USDC · 0xAD8C', 'USDC')).toEqual({ tag: '0xAD8C' })
  })
})
