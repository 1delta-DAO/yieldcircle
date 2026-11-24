import { describe, expect, it } from 'vitest'
import { holdingsFrom } from './positions'
import type { EarnLendingPosition, EarnPositionLeg } from '../sdk/types'

const LENDER = 'LLAMALEND_0x1111111111111111111111111111111111111111'
const SVZCHF = { address: '0x2222222222222222222222222222222222222222', symbol: 'svZCHF', decimals: 18 }
const CRVUSD = { address: '0xf939e0a03fb07f59a73314e73794be0e57ac1b4e', symbol: 'crvUSD', decimals: 18 }
const coll: EarnPositionLeg = { marketUid: `${LENDER}:1:${SVZCHF.address}`, asset: SVZCHF, side: 'supply', deposits: '1425.4215', depositsUsd: 1660, debt: '0', debtUsd: 0, collateralEnabled: true }
/** the debt market's own leg: 1,990 crvUSD owed, 447 crvUSD in the bands (soft liquidation) */
const debtLeg = (deposits: string, depositsUsd: number, extra: Partial<EarnPositionLeg> = {}): EarnPositionLeg =>
  ({ marketUid: `${LENDER}:1:${CRVUSD.address}`, asset: CRVUSD, side: 'both', deposits, depositsUsd, debt: '1990', debtUsd: 1990, collateralEnabled: false, ...extra })
const pos = (legs: EarnPositionLeg[]): EarnLendingPosition => {
  const suppliedUsd = legs.reduce((t, l) => t + l.depositsUsd, 0)
  return { positionUid: 'p', chainId: '1', venue: 'LlamaLend', venueKind: 'lending', lender: LENDER, account: '0xabc', health: 0.79, leverage: 1, depositApr: 0, borrowApr: 0, crossMargin: true,
    suppliedUsd, borrowedUsd: 1990, netUsd: suppliedUsd - 1990, legs, subAccounts: [] }
}

describe('holdingsFrom · LlamaLend soft liquidation', () => {
  it('nets the band out of the other legs, read off the debt market’s own leg', () => {
    const [h] = holdingsFrom([pos([coll, debtLeg('447.0397', 446)])])
    expect(h).toMatchObject({ symbol: 'svZCHF', debtSymbol: 'crvUSD', band: { amount: 447.0397, usd: 446, exact: false } })
    expect(h.others).toBeUndefined()
  })
  it('takes the exact split when the route sends it, and keeps a plain vault supply beside the band', () => {
    const [h] = holdingsFrom([pos([coll, debtLeg('547.0397', 546, { llamalend: { bandCollateralInBorrowed: '447039700000000000000', lendAssets: '100', softLiquidating: true } })])])
    expect(h.band).toMatchObject({ amount: 447.0397, exact: true })
    expect(h.others).toHaveLength(1)
    expect(h.others![0]).toMatchObject({ side: 'collateral', symbol: 'crvUSD', amount: 100 })
  })
  it('never takes the band for the collateral, however deep it runs', () => {
    const [h] = holdingsFrom([pos([{ ...coll, depositsUsd: 300, deposits: '257' }, debtLeg('1800', 1800)])])
    expect(h).toMatchObject({ symbol: 'svZCHF', band: { usd: 1800 } })
  })
  it('reads a deposit on the debt market as an ordinary leg elsewhere', () => {
    const p = pos([coll, debtLeg('447.0397', 446)])
    const [h] = holdingsFrom([{ ...p, lender: 'AAVE_V3' }])
    expect(h.band).toBeUndefined()
    expect(h.others).toEqual([{ side: 'collateral', symbol: 'crvUSD', amount: 447.0397, usd: 446, marketUid: debtLeg('0', 0).marketUid }])
  })
})
