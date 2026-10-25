import { describe, expect, it } from 'vitest'
import { bookKeysOfHolding, pnlLine, pnlOfHolding, type PnlRecord } from './holdingPnl'
import type { Holding } from './positions'

const A = '0xd54cf7019d0c3159807ccf29760b68de0aa43040'
const rec = (chainId: string, lender: string, strategyKey: string, pnlUsd: number | null, sub = '', status = 'ok', pnlAprPct: number | null = 5): PnlRecord =>
  ({ key: `${chainId}|${A}|${sub}|${lender}`, chainId, strategyKey, pnlUsd, pnlAprPct, status })
const hold = (x: Partial<Holding>): Holding => ({ key: 'k', chainId: '1', group: 'USD', asset: 'USDC', kind: 'simple', label: '', venue: '', valueUsd: 1, amount: 1, symbol: 'USDC', decimals: 6, ...x } as Holding)

// the index's records, as /accounts/:a/pnl names them (lender names upper case, addresses lower)
const book = [
  rec('8453', 'AAVE_V3', 'loop:AAVE_V3:8453:0x4200000000000000000000000000000000000006|AAVE_V3:8453:0x4200000000000000000000000000000000000006', -36355),
  rec('1', 'AAVE_V3', 'dep:AAVE_V3:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 120),
  rec('1', 'MORPHO', 'dep:AAVE_V3:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 7, '2'),
  rec('1', 'SPARK', 'loop:SPARK:1:0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf|SPARK:1:0x8292bb45bf1ee4d140127049757c2e0ff06317ed', null, '', 'unreliable'),
  rec('1', 'vault.savings:1:0x99cd4ec3f88a45940936f469e4bb72a2a701eeb9', 'dep:vault.savings:1:0x99cd4ec3f88a45940936f469e4bb72a2a701eeb9', 524),
]

describe('pnlOfHolding', () => {
  it('matches a loop by its two legs', () => {
    const h = hold({ chainId: '8453', kind: 'loop', lender: 'AAVE_V3', collateralUid: 'AAVE_V3:8453:0x4200000000000000000000000000000000000006', debtUid: 'AAVE_V3:8453:0x4200000000000000000000000000000000000006' })
    expect(pnlOfHolding(book, h)?.pnlUsd).toBe(-36355)
  })
  it('tells two accounts on one market apart by lender and sub-account, whatever the address case', () => {
    const uid = 'AAVE_V3:1:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    expect(pnlOfHolding(book, hold({ marketUid: uid, lender: 'AAVE_V3' }))?.pnlUsd).toBe(120)
    expect(pnlOfHolding(book, hold({ marketUid: uid, lender: 'MORPHO', accountId: '2' }))?.pnlUsd).toBe(7)
  })
  it('matches a vault by its earn uid', () => {
    expect(pnlOfHolding(book, hold({ earnUid: 'vault.savings:1:0x99cd4ec3f88a45940936f469e4bb72a2a701eeb9' }))?.pnlUsd).toBe(524)
  })
  it('has no figure for an unreliable record, another chain, or paper', () => {
    expect(pnlOfHolding(book, hold({ kind: 'borrow', lender: 'SPARK', collateralUid: 'SPARK:1:0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', debtUid: 'SPARK:1:0x8292bb45bf1ee4d140127049757c2e0ff06317ed' }))).toBeNull()
    expect(pnlOfHolding(book, hold({ chainId: '10', marketUid: 'AAVE_V3:1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' }))).toBeNull()
    expect(pnlOfHolding(book, hold({ key: 'paper:1', earnUid: 'vault.savings:1:0x99cd4ec3f88a45940936f469e4bb72a2a701eeb9' }))).toBeNull()
    expect(bookKeysOfHolding(hold({}))).toEqual([])
  })
})

describe('pnlLine', () => {
  it('says the figure, and a yearly rate only where it means something', () => {
    expect(pnlLine({ pnlUsd: 523.6, pnlAprPct: 3.14 })).toEqual({ text: '+$524 since you opened it · 3.1% a year', tone: 'ok' })
    expect(pnlLine({ pnlUsd: -12406, pnlAprPct: -207 }).text).toBe('−$12,406 since you opened it')
    expect(pnlLine({ pnlUsd: 15048, pnlAprPct: 40 }, { loan: true }).text).toBe('+$15,048 since you opened it')
  })
})
