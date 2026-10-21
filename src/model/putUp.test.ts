import { describe, expect, it } from 'vitest'
import { holdingsFrom, type Holding } from './positions'
import type { EarnLendingPosition } from '../sdk/types'
import type { LoopStrategy } from './strategies'
import { cannotLeverInPlace, depositsAsLoops, needsCollateralOn } from './putUp'

const YOUSD = '0x0000000f2eb9f69274678c76222b35eec7588a65', USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
/** the YOUSD / USDC loop on xLend, Base — only what `depositsAsLoops` reads */
const loop = {
  kind: 'loop', id: 'l:x', chainId: '8453', lender: 'XLEND', holds: 'YOUSD', debt: 'USDC',
  marketLongUid: `XLEND:8453:${YOUSD.toUpperCase().replace('0X', '0x')}`, marketShortUid: `XLEND:8453:${USDC}`,
  collateralAddress: YOUSD, debtAddress: USDC, decimalsLong: 6, decimalsShort: 6,
} as unknown as LoopStrategy
/** the 0.616 YOUSD on xLend, as `holdingsFrom` reads an account with supply and no debt */
const deposit: Holding = {
  key: 'pos:0:XLEND:8453:' + YOUSD, chainId: '8453', group: 'USD', asset: 'USD', kind: 'simple', label: 'YOUSD · Lend on xLend', venue: 'xLend',
  valueUsd: 0.66, amount: 0.616, amountRaw: '616000', symbol: 'YOUSD', decimals: 6, assetAddress: YOUSD, marketUid: `XLEND:8453:${YOUSD}`,
  accountKey: 'pos:0', lender: 'XLEND', collateralEnabled: true,
}

describe('depositsAsLoops', () => {
  it('reads a deposit in the loop’s collateral market as a 1× loop owing nothing, whatever the uid’s case', () => {
    const { lever, beside } = depositsAsLoops(loop, [deposit])
    expect(beside).toEqual([])
    expect(lever).toHaveLength(1)
    const [h] = lever
    expect(h).toMatchObject({ kind: 'loop', putUp: true, leverage: 1, debtAmount: 0, key: deposit.key, collateralUid: deposit.marketUid, debtUid: loop.marketShortUid, debtSymbol: 'USDC', debtDecimals: 6, collateralUsd: 0.66 })
    expect(h.others).toBeUndefined()
  })
  it('leaves out another market, another chain, dust, a paper deposit and a running loop', () => {
    expect(depositsAsLoops(loop, [{ ...deposit, marketUid: 'XLEND:8453:0xother' }]).lever).toEqual([])
    expect(depositsAsLoops(loop, [{ ...deposit, chainId: '10' }]).lever).toEqual([])
    expect(depositsAsLoops(loop, [{ ...deposit, valueUsd: 0.2 }]).lever).toEqual([])
    expect(depositsAsLoops(loop, [{ ...deposit, paper: true }]).lever).toEqual([])
    expect(depositsAsLoops(loop, [{ ...deposit, kind: 'loop', collateralUid: deposit.marketUid }]).lever).toEqual([])
  })
  it('keeps each sub-account apart, with its own id', () => {
    const subs = [{ ...deposit, key: 'a', accountKey: 'p:0' }, { ...deposit, key: 'b', accountKey: 'p:3', accountId: '3', subAccount: { id: '3', label: 'Sub-account 3', count: 2 } }]
    const { lever } = depositsAsLoops({ ...loop, lender: 'EULER_V2' } as LoopStrategy, subs.map((h) => ({ ...h, lender: 'EULER_V2' })))
    expect(lever.map((h) => [h.key, h.accountId])).toEqual([['a', undefined], ['b', '3']])
  })
  it('names the account’s other collateral, never what is switched off', () => {
    const weth = { ...deposit, key: 'w', symbol: 'WETH', amount: 1, valueUsd: 4000, marketUid: 'XLEND:8453:0xweth' }
    const off = { ...deposit, key: 'o', symbol: 'cbBTC', amount: 0.1, valueUsd: 9000, marketUid: 'XLEND:8453:0xcbbtc', collateralEnabled: false }
    const elsewhere = { ...weth, key: 'e', accountKey: 'other' }
    const [h] = depositsAsLoops(loop, [deposit, weth, off, elsewhere]).lever
    expect(h.others).toEqual([{ side: 'collateral', symbol: 'WETH', amount: 1, usd: 4000 }])
  })
  it('keeps a deposit a venue cannot lever in place beside the loop, with why', () => {
    const dolo = { ...deposit, lender: 'DOLOMITE' }
    expect(depositsAsLoops(loop, [dolo]).beside[0]?.why).toMatch(/main account only lends/)
    expect(depositsAsLoops(loop, [{ ...dolo, accountId: '101' }]).lever).toHaveLength(1)
    expect(depositsAsLoops(loop, [{ ...deposit, subAccount: { id: 'k', label: 'Multiply', count: 1, unsupported: 'Kamino Multiply' } }]).beside[0]?.why).toBe('Kamino Multiply')
  })
})

describe('cannotLeverInPlace', () => {
  it('refuses Solana, Gearbox, a Morpho loan-side supply and Dolomite’s lend-only accounts', () => {
    expect(cannotLeverInPlace({ ...deposit, chainId: 'solana' })).toMatch(/Solana/)
    expect(cannotLeverInPlace({ ...deposit, lender: 'GEARBOX_V3' })).toMatch(/Gearbox/)
    expect(cannotLeverInPlace({ ...deposit, lender: 'MORPHO_BLUE_ab12', collateralEnabled: false })).toMatch(/not collateral/)
    expect(cannotLeverInPlace({ ...deposit, lender: 'DOLOMITE', accountId: 'iso:7:3' })).toMatch(/isolation/)
    expect(cannotLeverInPlace({ ...deposit, lender: 'DOLOMITE', accountId: 'iso:7:100' })).toBeNull()
    expect(cannotLeverInPlace(deposit)).toBeNull()
  })
})

describe('needsCollateralOn', () => {
  it('asks for the switch on an Aave-type pool with the flag off, and only there', () => {
    expect(needsCollateralOn({ lender: 'XLEND', collateralEnabled: false })).toBe(true)
    expect(needsCollateralOn({ lender: 'AAVE_V3', collateralEnabled: false })).toBe(true)
    expect(needsCollateralOn({ lender: 'XLEND', collateralEnabled: true })).toBe(false)
    // an older answer without the flag: no guess
    expect(needsCollateralOn({ lender: 'XLEND' })).toBe(false)
    // the build does it (Euler's EVC batch, Venus, Aave V4), or the flag is fixed (Morpho)
    for (const lender of ['EULER_V2', 'VENUS', 'AAVE_V4_17905DB0', 'MORPHO_BLUE_ab12']) expect(needsCollateralOn({ lender, collateralEnabled: false })).toBe(false)
  })
})

describe('holdingsFrom on a small loop', () => {
  /** the xLend account behind tickets/0015, as `/earn/positions` answered it on 2026-10-21 (trimmed) */
  const leg = (sym: string, address: string, deposits: string, depositsUsd: number, debt: string, debtUsd: number, collateralEnabled: boolean) =>
    ({ earnUid: `XLEND:8453:${address}`, marketUid: `XLEND:8453:${address}`, asset: { symbol: sym, address, decimals: 6 }, side: debtUsd ? 'borrow' : 'supply', deposits, depositsUsd, debt, debtUsd, collateralEnabled }) as const
  const legs = [leg('YOUSD', YOUSD, '0.61565', 0.6574, '0', 0, true), leg('USDC', USDC, '0', 0, '0.48561', 0.4855, false)]
  const p = { positionUid: 'XLEND:8453', chainId: '8453', venue: 'XLEND', venueKind: 'lending', lender: 'XLEND', account: '0xbada', brand: 'xLend', name: 'xLend',
    suppliedUsd: 0.6574, borrowedUsd: 0.4855, netUsd: 0.1719, apr: 5.63, depositApr: 0, borrowApr: 3.42, health: 1.056, leverage: 3.82, crossMargin: true, legs,
    subAccounts: [{ accountId: '0', health: 1.056, suppliedUsd: 0.6574, borrowedUsd: 0.4855, netUsd: 0.1719, legs }] } as unknown as EarnLendingPosition
  it('reads $0.49 owed on $0.66 as the loop it is, not a plain deposit', () => {
    const hs = holdingsFrom([p])
    expect(hs).toHaveLength(1)
    expect(hs[0]).toMatchObject({ kind: 'loop', health: 1.056, debtSymbol: 'USDC', collateralUid: `XLEND:8453:${YOUSD}` })
    expect(hs[0].leverage).toBeCloseTo(3.82, 1)
  })
  it('still reads a cent of interest dust on a large deposit as a deposit, with its collateral flag', () => {
    const big = [leg('YOUSD', YOUSD, '10000', 10_000, '0', 0, true), leg('USDC', USDC, '0', 0, '0.01', 0.01, false)]
    const hs = holdingsFrom([{ ...p, suppliedUsd: 10_000, borrowedUsd: 0.01, netUsd: 9999.99, legs: big, subAccounts: [{ ...p.subAccounts[0], suppliedUsd: 10_000, borrowedUsd: 0.01, netUsd: 9999.99, legs: big }] }])
    expect(hs).toHaveLength(1)
    expect(hs[0]).toMatchObject({ kind: 'simple', collateralEnabled: true, accountKey: 'XLEND:8453:0', marketUid: `XLEND:8453:${YOUSD}` })
  })
})
