import { describe, expect, it } from 'vitest'
import { emptyLedger, type PaperLedger, type PaperPosition, type PriceFn } from './paper'
import { paperPnlBook } from './paperView'
import { pnlSummary } from './lite'

const T0 = Date.UTC(2026, 9, 1)
const DAY = 86_400_000
const WSTETH = '0x5979d7b546e38e414f7e9822514be443a4800529'
const WETH = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'
const USDC = '0xaf88d065e77c8cc2239327c5edb3a432268e5831'
const leg = (symbol: string, address: string, priceUsd: number) => ({ symbol, address, priceUsd, decimals: 18 })
const pos = (x: Partial<PaperPosition> & Pick<PaperPosition, 'snap'>): PaperPosition => ({
  id: 'p1', chainId: '42161', kind: 'simple', strategyId: 's', units: 0, debtUnits: 0, asOf: T0,
  rate: { supply: 0, borrow: 0 }, basisUsd: 0, entryCostUsd: 0, openedAt: T0, ...x,
})
const ledger = (positions: PaperPosition[], realizedUsd = 0): PaperLedger => ({ ...emptyLedger('0xabc', T0), putInUsd: 10_000, realizedUsd, positions })
const feed = (p: Record<string, number>): PriceFn => (_c, t) => p[t]

describe('paperPnlBook — the real book’s shape for a paper account', () => {
  it('a live ETH deposit that only moved in price is all price, no farming', () => {
    const l = ledger([pos({ snap: { asset: 'ETH', group: 'ETH', label: 'WETH', venue: 'Aave', held: leg('WETH', WETH, 2500), mode: 'live' }, units: 1, basisUsd: 2500 })])
    const b = paperPnlBook(l, T0 + 10 * DAY, feed({ [WETH]: 2600 }))
    expect(b.total.pnlUsd).toBeCloseTo(100, 6)
    expect(b.total.directionalUsd).toBeCloseTo(100, 6)
    expect(b.total.yieldUsd).toBeCloseTo(0, 6)
    expect(pnlSummary(b)?.split).toEqual({ yield: 0, price: 1 })
  })

  it('a dollar saving at 10 % is all farming, with an APR on what was in', () => {
    const l = ledger([pos({ snap: { asset: 'USD', group: 'USD', label: 'USDC', venue: 'Aave', held: leg('USDC', USDC, 1), mode: 'peg' }, units: 1000, basisUsd: 1000, rate: { supply: 10, borrow: 0 } })])
    const b = paperPnlBook(l, T0 + 73 * DAY, feed({ [USDC]: 1 }))
    expect(b.total.directionalUsd).toBeCloseTo(0, 6)
    // the model accrues simple interest: 10 % a year over a fifth of a year is $20, 10 % on the basis
    expect(b.total.yieldUsd).toBeCloseTo(20, 4)
    expect(b.total.pnlAprPct!).toBeCloseTo(10, 4)
    expect(b.positions[0]).toMatchObject({ key: 'p1', title: 'USDC', sub: 'Deposit · Aave' })
  })

  it('a peg loop moves only with its money; the realized part counts as farming', () => {
    const l = ledger(
      [pos({
        kind: 'loop',
        snap: { asset: 'ETH', group: 'ETH', label: 'wstETH ↺ WETH', venue: 'Aave', held: leg('wstETH', WSTETH, 3000), debt: leg('WETH', WETH, 2500), liqLtv: 0.95, mode: 'peg' },
        units: 4, debtUnits: 4, basisUsd: 2000,
      })],
      -5,
    )
    // WETH +10 %: the held leg is scaled by its money, so the equity (2 000 in ETH) gains 10 %
    const b = paperPnlBook(l, T0 + 2 * DAY, feed({ [WETH]: 2750 }))
    expect(b.positions[0].priceUsd).toBeCloseTo(4 * 300 - 4 * 250, 6)
    expect(b.total.pnlUsd).toBeCloseTo(-5 + 200, 6)
    expect(b.total.yieldUsd).toBeCloseTo(-5, 6)
    expect(b.positions[0].sub).toBe('Levered · borrows WETH · Aave')
  })

  it('under a day open: no APR; nothing open and nothing booked: nothing to show', () => {
    const l = ledger([pos({ snap: { asset: 'USD', group: 'USD', label: 'USDC', venue: 'Aave', held: leg('USDC', USDC, 1), mode: 'peg' }, units: 10, basisUsd: 10 })])
    expect(paperPnlBook(l, T0 + DAY / 2, feed({ [USDC]: 1 })).total.pnlAprPct).toBeNull()
    expect(pnlSummary(paperPnlBook(ledger([]), T0, feed({})))).toBeNull()
    expect(pnlSummary(paperPnlBook(ledger([], 12), T0, feed({})))).not.toBeNull()
  })
})
