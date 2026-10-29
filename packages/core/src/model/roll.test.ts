import { describe, expect, it } from 'vitest'
import { lendRoll, lendRollTargets, listaRollSources, loanRoll, loanRollTargets, rollKindOf, REDEEM_HEADROOM, ROLL_HEADROOM } from './roll'
import type { LoopStrategy, SimpleStrategy } from './strategies'
import type { Holding } from './positions'

// the Base book that has three dates (`/v1/data/earn?includeFixedTerm=true&protocol=MORPHO_MIDNIGHT`, 2026-10-29)
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', AERO = '0x940181a94a35a4569e4529a3cdfb74e38fd98631'
const NOV27 = 1795791600, DEC25 = 1798210800, MAR26 = 1806073200
const NOW = Date.UTC(2026, 9, 29) / 1000
const M = { nov: 'MORPHO_MIDNIGHT_6284', dec: 'MORPHO_MIDNIGHT_8A87', mar: 'MORPHO_MIDNIGHT_AD8C' }
const lend = (venue: string, maturity: number, rate: number, collateral = 'USDC+AERO'): SimpleStrategy => ({
  id: venue, kind: 'simple', chainId: '8453', earnUid: `${venue}:8453:${USDC}`, marketUid: `${venue}:8453:${USDC}`, assetAddress: USDC, maturity, rate,
  book: { family: 'midnight', lender: venue, earlyExit: true, collateral, lltv: 98 },
} as unknown as SimpleStrategy)
const loop = (venue: string, dueAt: number | undefined, coll = AERO): LoopStrategy => ({
  id: `l:${venue}`, kind: 'loop', chainId: '8453', marketLongUid: `${venue}:8453:${coll}`, marketShortUid: `${venue}:8453:${USDC}`, dueAt,
} as unknown as LoopStrategy)
const held = (o: Partial<Holding>): Holding => ({ key: 'k', chainId: '8453', kind: 'loop', valueUsd: 1000, amount: 1, symbol: 'AERO', decimals: 18, ...o } as Holding)

describe('which positions roll', () => {
  it('names the three shapes and leaves the rest alone', () => {
    expect(rollKindOf(held({ kind: 'simple', bookLoan: true }), null)).toBe('lend')
    expect(rollKindOf(held({ collateralUid: `${M.nov}:8453:${AERO}`, debtUid: `${M.nov}:8453:${USDC}` }), null)).toBe('midnight-loan')
    expect(rollKindOf(held({ debtUid: 'LISTA_DAO_X:56:0x55' }), { kind: 'loop', terms: [{ id: '1', days: 30, apr: 5 }] } as unknown as LoopStrategy)).toBe('lista-loan')
    // a variable loop, a plain deposit, paper, an account the API cannot build for
    expect(rollKindOf(held({ debtUid: 'AAVE_V3:8453:0x83' }), { kind: 'loop' } as LoopStrategy)).toBeNull()
    expect(rollKindOf(held({ kind: 'simple' }), null)).toBeNull()
    expect(rollKindOf(held({ kind: 'simple', bookLoan: true, paper: true }), null)).toBeNull()
    expect(rollKindOf(held({ kind: 'simple', bookLoan: true, subAccount: { id: '1', label: 'x', count: 2, unsupported: 'Multiply' } }), null)).toBeNull()
  })
})

describe('a lend roll', () => {
  const nov = lend(M.nov, NOV27, 4.27), dec = lend(M.dec, DEC25, 4.28), mar = lend(M.mar, MAR26, 4.3)
  it('offers the later open dates of the same book, soonest first, once each', () => {
    const other = lend('MORPHO_MIDNIGHT_9010', MAR26, 7.9, 'cbBTC')
    const empty = lend('MORPHO_MIDNIGHT_EEEE', MAR26 + 86400 * 30, 0)
    expect(lendRollTargets(nov, [mar, nov, dec, other, empty, dec], NOW).map((r) => r.id)).toEqual([M.dec, M.mar])
    expect(lendRollTargets(dec, [nov, dec, mar], NOW).map((r) => r.id)).toEqual([M.mar])
    expect(lendRollTargets(mar, [nov, dec, mar], NOW)).toEqual([])
  })
  it('sells before the date, keeps headroom back, and lends the rest', () => {
    const r = lendRoll({ face: 1000, now: NOW, from: NOV27, to: MAR26, sellApr: 5, lendApr: 4.3 })
    expect(r.matured).toBe(false)
    expect(r.proceeds!).toBeCloseTo(1000 / (1 + 0.05 * (NOV27 - NOW) / (365 * 86400)), 6)
    expect(r.lend!).toBeCloseTo(r.proceeds! * (1 - ROLL_HEADROOM), 6)
    expect(r.left!).toBeCloseTo(r.proceeds! * ROLL_HEADROOM, 6)
    expect(r.newFace!).toBeGreaterThan(r.lend!)
  })
  it('redeems the whole face after the date and lends all but a hair of it', () => {
    const r = lendRoll({ face: 1000, now: NOV27 + 3600, from: NOV27, to: MAR26, sellApr: null, lendApr: 4.3 })
    expect(r).toMatchObject({ matured: true, proceeds: 1000 })
    expect(r.lend!).toBeCloseTo(1000 * (1 - REDEEM_HEADROOM), 9)
  })
  it('waits for the sale price before it says anything', () => {
    expect(lendRoll({ face: 1000, now: NOW, from: NOV27, to: MAR26, sellApr: null, lendApr: 4 })).toMatchObject({ proceeds: null, lend: null, newFace: null })
  })
})

describe('a Midnight loan roll', () => {
  const h = held({ collateralUid: `${M.nov}:8453:${AERO}`, debtUid: `${M.nov}:8453:${USDC}`, dueAt: NOV27, debtAmount: 500 })
  it('offers later dates of the same pair only', () => {
    const rows = [loop(M.mar, MAR26), loop(M.nov, NOV27), loop(M.dec, DEC25), loop(M.dec, DEC25),
      loop(M.mar, MAR26, USDC) /* the market's other collateral */, loop('AAVE_V3', undefined), loop('MORPHO_MIDNIGHT_9010', MAR26, '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf')]
    expect(loanRollTargets(h, rows, NOW).map((l) => l.id)).toEqual([`l:${M.dec}`, `l:${M.mar}`])
    expect(loanRollTargets({ ...h, dueAt: DEC25 }, rows, NOW).map((l) => l.id)).toEqual([`l:${M.mar}`])
  })
  it('owes the face again plus the new book to its date', () => {
    expect(loanRoll({ owed: 500, now: NOW, to: MAR26, borApr: 6 })).toBeCloseTo(500 * (1 + 0.06 * (MAR26 - NOW) / (365 * 86400)), 6)
  })
})

describe('a Lista re-fix', () => {
  it('rolls each fixed loan on its own, and the variable part a lapsed term left', () => {
    const h = held({ debtAmount: 300, loans: [{ id: '450', debt: 200, debtUsd: 200 }, { id: '451', debt: 50, debtUsd: 50 }] })
    expect(listaRollSources(h)).toEqual([{ id: '450', debt: 200, debtUsd: 200 }, { id: '451', debt: 50, debtUsd: 50 }, { debt: 50, debtUsd: 50 }])
  })
  it('has no variable part when the loans are the whole debt', () => {
    expect(listaRollSources(held({ debtAmount: 200, loans: [{ id: '450', debt: 200, debtUsd: 200 }] }))).toHaveLength(1)
  })
  it('prices a debt with no fixed loan off the account', () => {
    expect(listaRollSources(held({ debtAmount: 100, collateralUsd: 1100, valueUsd: 1000 }))).toEqual([{ debt: 100, debtUsd: 100 }])
  })
})
