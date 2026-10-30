import { describe, expect, it } from 'vitest'
import { EARN_FILTER, applyEarn, earnActive, exitsNow, filtersOn } from './earnFilter'
import type { Strategy } from './strategies'

const row = (p: Partial<Strategy> & { id: string }): Strategy => ({
  kind: 'simple', chainId: '1', group: 'USD', asset: 'USDC', holds: 'USDC', venue: 'Aave', venueKey: 'aave', nature: 'savings',
  rate: 5, risk: 1, riskLabel: 'Low', riskScore: 1, rated: true, tvlUsd: 5e7, via: 'Aave', brand: 'Aave', exitMode: 'instant', source: 'lending',
  ...p,
} as unknown as Strategy)

const rows = [
  row({ id: 'a', holds: 'USDC', venue: 'Aave', via: 'Aave', rate: 5, tvlUsd: 5e8 }),
  row({ id: 'b', holds: 'sUSDe', venue: 'Ethena', via: 'Ethena', rate: 9, risk: 2, tvlUsd: 2e6, exitMode: 'fixed-cooldown' }),
  row({ id: 'c', kind: 'loop', holds: 'wstETH', venue: 'Morpho', debt: 'WETH', rate: 12, risk: 3, tvlUsd: 3e7 } as Partial<Strategy> & { id: string }),
]
const ids = (xs: Strategy[]) => xs.map((s) => s.id)

describe('applyEarn', () => {
  it('keeps the list order on best, and nothing is active by default', () => {
    expect(ids(applyEarn(rows, EARN_FILTER, (s) => s))).toEqual(['a', 'b', 'c'])
    expect(earnActive(EARN_FILTER)).toBe(false)
  })
  it('needs every word of the query somewhere in the row', () => {
    expect(ids(applyEarn(rows, { ...EARN_FILTER, q: 'usd ethena' }, (s) => s))).toEqual(['b'])
    expect(ids(applyEarn(rows, { ...EARN_FILTER, q: 'weth' }, (s) => s))).toEqual(['c'])
    expect(ids(applyEarn(rows, { ...EARN_FILTER, q: 'base' }, (s) => s, { extra: (s) => [s.id === 'a' ? 'Base' : 'Ethereum'] }))).toEqual(['a'])
  })
  it('filters by kind, risk, size and exit', () => {
    expect(ids(applyEarn(rows, { ...EARN_FILTER, kind: 'loop' }, (s) => s))).toEqual(['c'])
    expect(ids(applyEarn(rows, { ...EARN_FILTER, risk: 2 }, (s) => s))).toEqual(['a', 'b'])
    expect(ids(applyEarn(rows, { ...EARN_FILTER, minTvl: 1e7 }, (s) => s))).toEqual(['a', 'c'])
    expect(ids(applyEarn(rows, { ...EARN_FILTER, instant: true }, (s) => s))).toEqual(['a', 'c'])
    expect(filtersOn({ ...EARN_FILTER, risk: 1, instant: true })).toBe(2)
  })
  it('sorts by rate, size, risk and name', () => {
    expect(ids(applyEarn(rows, { ...EARN_FILTER, sort: 'rate' }, (s) => s))).toEqual(['c', 'b', 'a'])
    expect(ids(applyEarn(rows, { ...EARN_FILTER, sort: 'size' }, (s) => s))).toEqual(['a', 'c', 'b'])
    expect(ids(applyEarn(rows, { ...EARN_FILTER, sort: 'risk' }, (s) => s))).toEqual(['a', 'b', 'c'])
    expect(ids(applyEarn(rows, { ...EARN_FILTER, sort: 'name' }, (s) => s))).toEqual(['b', 'a', 'c'])
  })
  it('a dated deposit is not an any-time exit', () => {
    expect(exitsNow(row({ id: 'd', maturity: 2e9 }))).toBe(false)
  })
})
