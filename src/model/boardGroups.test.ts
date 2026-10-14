import { describe, expect, it } from 'vitest'
import type { EarnerLeg, EarnerRow } from '../index/api'
import { groupByStrategy, isNewStrategy, primaryStrategyKey } from './boardGroups'
import { bookKeyOf } from './uid'
import type { Strategy } from './strategies'

const leg = (side: string, marketUid: string, amountUsd: number | null, more: Partial<EarnerLeg> = {}): EarnerLeg => ({
  marketUid, side, amountUsd, aprNow: null, intrinsicApr: null, aprEffective: null, symbol: null, assetGroup: null, ...more,
})
const NOPAL = 'KAMINO_HMNm3:solana:nOPAL'
const USDC = 'KAMINO_HMNm3:solana:USDC'
const row = (account: string, apr: number, equityUsd: number, legs: EarnerLeg[], more: Partial<EarnerRow> = {}): EarnerRow => ({
  key: `solana|${account}|p|r`, chainId: 'solana', account, posId: 'p', riskKey: 'r', lenderKey: 'KAMINO', marketUids: legs.map((l) => l.marketUid),
  supplyUsd: equityUsd * 4, debtUsd: equityUsd * 3, equityUsd, leverage: 4, annualUsd: (equityUsd * apr) / 100, perDayUsd: (equityUsd * apr) / 36500,
  netAprPct: apr, apr24hPct: apr, exact: true, since: '2026-09-01T00:00:00.000Z', risk: [], riskDetail: null, legs, wallet: null, ...more,
})
const loop = (account: string, apr: number, eq: number, more: Partial<EarnerRow> = {}) =>
  row(account, apr, eq, [leg('supply', NOPAL, eq * 4), leg('borrow', USDC, eq * 3)], more)

describe('primaryStrategyKey (a copy of pos-indexer strategyBook.ts)', () => {
  it('a loop is its held leg × its debt leg; a deposit its held leg', () => {
    expect(primaryStrategyKey([leg('supply', NOPAL, 400), leg('borrow', USDC, 300)])).toBe(`loop:${NOPAL}|${USDC}`)
    expect(primaryStrategyKey([leg('supply', USDC, 400)])).toBe(`dep:${USDC}`)
  })
  it('keeps a Jupiter Lend vault, whose collateral and debt share one uid', () => {
    expect(primaryStrategyKey([leg('collateral', 'JUP:solana:v1', 400), leg('borrow', 'JUP:solana:v1', 300)])).toBe('loop:JUP:solana:v1|JUP:solana:v1')
  })
  it('a multi-leg account ranks once, under its largest pair', () => {
    const k = primaryStrategyKey([
      leg('collateral', 'AAVE_V3:1:weth', 100), leg('collateral', 'AAVE_V3:1:wsteth', 900), leg('collateral', 'AAVE_V3:1:wbtc', 50),
      leg('borrow', 'AAVE_V3:1:usdc', 200), leg('borrow', 'AAVE_V3:1:weth', 500),
    ])
    expect(k).toBe('loop:AAVE_V3:1:wsteth|AAVE_V3:1:weth')
  })
  it('skips foreign collateral, empty legs, and breaks ties on the uid', () => {
    expect(primaryStrategyKey([leg('collateral', 'SILO:1:b', 900, { foreignCollateral: true } as Partial<EarnerLeg>), leg('supply', 'SILO:1:a', 10)])).toBe('dep:SILO:1:a')
    expect(primaryStrategyKey([leg('supply', 'X:1:b', 100), leg('supply', 'X:1:a', 100)])).toBe('dep:X:1:a')
    expect(primaryStrategyKey([leg('supply', 'X:1:a', null), leg('borrow', 'X:1:b', 5)])).toBeNull()
  })
  it('spells a two-leg loop the way the catalogue does (`bookKeyOf`)', () => {
    const s = { kind: 'loop', marketLongUid: NOPAL, marketShortUid: USDC } as unknown as Strategy
    expect(primaryStrategyKey([leg('supply', NOPAL, 4), leg('borrow', USDC, 3)])).toBe(bookKeyOf(s))
  })
})

describe('groupByStrategy', () => {
  const rows = [
    loop('a', 27.6, 33_000),
    loop('b', 27.57, 80_000),
    row('c', 26.85, 177_000, [leg('supply', 'KAMINO:solana:apyUSD', 177_000)]),
    loop('d', 27.5, 124_000),
    loop('a', 20, 10_000, { key: 'solana|a|p2|r' }),
  ]
  it('one row per strategy, ranked on APR by its best position, wallets counted once', () => {
    const g = groupByStrategy(rows, 'apr')
    expect(g.map((r) => r.strategy.key)).toEqual([`loop:${NOPAL}|${USDC}`, 'dep:KAMINO:solana:apyUSD'])
    expect(g[0].account).toBe('a')
    expect(g[0].apr24hPct).toBe(27.6)
    expect(g[0].strategy).toMatchObject({ kind: 'loop', wallets: 3, positions: 4, equityUsd: 247_000, aprMin: 20, aprMax: 27.6, faces: ['a', 'b', 'd'] })
    // equity-weighted
    expect(g[0].strategy.aprPct).toBeCloseTo((33_000 * 27.6 + 80_000 * 27.57 + 124_000 * 27.5 + 10_000 * 20) / 247_000, 6)
  })
  it('on $/day by what the strategy pays all its holders', () => {
    const g = groupByStrategy(rows, 'perDay')
    expect(g[0].strategy.key).toBe(`loop:${NOPAL}|${USDC}`)
    // the best member is the one paying the most a day
    expect(g[0].account).toBe('d')
    expect(g[0].strategy.perDayUsd).toBeCloseTo(g[0].strategy.annualUsd! / 365, 9)
  })
  it('the index’s own key wins; a keyless row stands alone', () => {
    const g = groupByStrategy([loop('a', 10, 1, { strategyKey: 'loop:x|y' }), row('z', 5, 1, [])], 'apr')
    expect(g.map((r) => r.strategy.key)).toEqual(['loop:x|y', 'pos:solana|z|p|r'])
    expect(g[1].strategy.kind).toBe('position')
  })
  it('new = first holder opened under a week ago', () => {
    const [g] = groupByStrategy([loop('a', 10, 1, { since: '2026-10-10T00:00:00.000Z' })], 'apr')
    expect(isNewStrategy(g.strategy, Date.parse('2026-10-14T00:00:00.000Z'))).toBe(true)
    expect(isNewStrategy(g.strategy, Date.parse('2026-10-20T00:00:00.000Z'))).toBe(false)
  })
})
