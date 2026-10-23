import { describe, expect, it } from 'vitest'
import { bufferOfHealth, holdingLine, saferTargets, dayKey, depositLines, liteEligible, liteMenu, loopLines, moneyWord, noteDay, plainName, pointsOf, streakOf, type DayMark } from './lite'
import type { LoopStrategy, SimpleStrategy, Strategy } from './strategies'
import { learnDesk } from './assets'

// the fields the Lite rules read; the rest of a row is irrelevant to them
const base = { chainId: '1', venue: 'Aave V3', venueKey: 'AAVE_V3', holds: 'USDC', nature: 'savings' as const, riskLabel: 'low', rated: true, riskScore: 2, risk: 1 as const, tvlUsd: 50_000_000, rate: 5 }
const dep = (id: string, more: Partial<SimpleStrategy> = {}): Strategy => ({ ...base, id, kind: 'simple', group: 'USD', asset: 'USDC', source: 'lending', brand: 'Aave', canDeposit: true, ...more } as unknown as SimpleStrategy)
const loop = (id: string, more: Partial<LoopStrategy> = {}): Strategy => ({
  ...base, id, kind: 'loop', group: 'USD', asset: 'USDe', holds: 'sUSDe', debt: 'USDC', rate: 14, risk: 2, collateralYields: true,
  tiers: { defensive: 3, balanced: 4.5, aggressive: 5.6 }, liqLtv: 0.95, ...more,
} as unknown as LoopStrategy)

describe('liteEligible', () => {
  it('takes rated savings with size, deposits and same-money loops alike', () => {
    expect(liteEligible(dep('a'))).toBe(true)
    expect(liteEligible(loop('b'))).toBe(true)
  })
  it('keeps a PT and a PT loop: the date is a fact, not a choice', () => {
    expect(liteEligible(dep('pt', { source: 'fixed', maturity: 1_800_000_000 }))).toBe(true)
    expect(liteEligible(loop('ptl', { expiry: 1_800_000_000 }))).toBe(true)
  })
  it('leaves out what the three-line ticket cannot carry', () => {
    expect(liteEligible(dep('perp', { nature: 'perp-lp' }))).toBe(false)
    expect(liteEligible(dep('unrated', { rated: false }))).toBe(false)
    expect(liteEligible(dep('risky', { riskScore: 5 }))).toBe(false)
    expect(liteEligible(dep('thin', { tvlUsd: 400_000 }))).toBe(false)
    expect(liteEligible(dep('book', { book: { family: 'midnight', lender: 'x', earlyExit: true } }))).toBe(false)
    expect(liteEligible(dep('stock', { group: 'STOCKS' }))).toBe(false)
    expect(liteEligible(loop('term', { terms: [{ id: '30', days: 30, apr: 4 }] }))).toBe(false)
    expect(liteEligible(loop('due', { dueAt: 1_800_000_000 }))).toBe(false)
    expect(liteEligible(loop('bet', { collateralYields: false }))).toBe(false)
  })
  it('leaves out a loop whose Balanced tier sits within 3% of liquidation', () => {
    // 22× at a 96.5 % threshold: (21/22) / 0.965 → about 1 % to the line
    expect(liteEligible(loop('emode', { tiers: { defensive: 12, balanced: 22, aggressive: 26 }, liqLtv: 0.965 }))).toBe(false)
  })
})

describe('names in words', () => {
  it('an issued dollar keeps its ticker, a yield dollar says whose it is', () => {
    expect(moneyWord('USDC', 'USD')).toBe('USDC')
    expect(moneyWord('USDe', 'USD')).toBe('Dollars via Ethena')
    expect(moneyWord('syrupUSDC', 'USD')).toBe('Dollars via Maple')
  })
  it('ether and bitcoin the same way', () => {
    expect(moneyWord('ETH', 'ETH')).toBe('Ether')
    expect(moneyWord('wstETH', 'ETH')).toBe('Ether via Lido')
    expect(moneyWord('cbBTC', 'BTC')).toBe('cbBTC')
    expect(moneyWord('LBTC', 'BTC')).toBe('Bitcoin via Lombard')
    expect(moneyWord('AVA-LABS:BTC', 'BTC')).toBe('Bitcoin via Ava Labs')
    expect(moneyWord('okx:BTC', 'BTC')).toBe('Bitcoin via OKX')
    // a custodian the API names at runtime is keyed by issuer, never shown as that key
    expect(moneyWord(learnDesk({ id: 'ava-labs', name: 'Ava Labs', kind: 'cex' }, 'BTC'), 'BTC')).toBe('Bitcoin via Ava Labs')
    expect(moneyWord(learnDesk({ id: 'superstate', name: 'Superstate', kind: 'institution' }), 'USD')).toBe('Dollars via Superstate')
    expect(moneyWord(learnDesk({ id: 'superstate-2', name: 'SUPERSTATE', kind: 'institution' }), 'USD')).toBe('Dollars via Superstate 2')
  })
  it('a row never names a venue or a chain', () => {
    const n = plainName(loop('x'))
    expect(n.title).toBe('Dollars via Ethena')
    expect(n.sub).toBe('Levered ×4.5 · borrows dollars')
    expect(JSON.stringify(plainName(dep('y')))).not.toMatch(/Aave|Ethereum/)
  })
})

describe('liteMenu', () => {
  const rank = (s: Strategy) => s.rate
  it('one row per thing in words and kind, the best rate wins, the rest are counted', () => {
    const rows = liteMenu([dep('a', { rate: 4 }), dep('b', { rate: 6 }), loop('l')], rank)
    expect(rows.map((r) => r.s.id)).toEqual(['b', 'l'])
    expect(rows[0].also).toBe(1)
  })
  it('a held row keeps its own place beside the best of its kind', () => {
    const rows = liteMenu([dep('a', { rate: 4 }), dep('b', { rate: 6 })], rank, new Set(['a']))
    expect(rows.map((r) => [r.s.id, r.yours])).toEqual([['b', false], ['a', true]])
  })
  it('safer rows first, then the steady rate: a loop never jumps a safer deposit', () => {
    const rows = liteMenu([loop('l', { rate: 20, risk: 2 }), dep('d', { rate: 5, risk: 1 }), dep('e', { asset: 'USDe', rate: 9, risk: 2 })], rank)
    expect(rows.map((r) => r.s.id)).toEqual(['d', 'l', 'e'])
  })
})

describe('the three lines', () => {
  it('a dollar loop says the move that liquidates against the dollar', () => {
    const l = loopLines({ net: 12, amountUsd: 500, lev: 4.5, drop: 0.07, holds: 'Dollars via Ethena', debt: 'dollars', dollarDebt: true, cost: 0.8, payback: 2, quoting: false })
    expect(l.earn.v).toBe('12.00% a year')
    expect(l.earn.s).toContain('$5.00 a month on $500')
    expect(l.lose.v).toBe('If Dollars via Ethena drops 7.0%')
    expect(l.lose.s).toMatch(/^under the dollar/)
    expect(l.lose.tone).toBe('warn')
    expect(l.cost.v).toBe('$0.80 to enter')
    expect(l.cost.s).toBe('earned back in 2 days')
  })
  it('an ether loop is liquidated against ether, not a dollar', () => {
    const l = loopLines({ net: 4, amountUsd: 0, lev: 6, drop: 0.12, holds: 'Ether via Lido', debt: 'ether', dollarDebt: false, cost: null, payback: null, quoting: true })
    expect(l.lose.s).toMatch(/^against ether/)
    expect(l.cost.v).toBe('Pricing the entry…')
  })
  it('a deposit says its way out, and a tight market says so', () => {
    expect(depositLines({ rate: 5, amountUsd: 1000, exitWord: 'Instant', exitWhen: 'withdraw any time', tight: false, booked: false, rewards: 0 }).lose.v).toBe('Out: instant')
    const t = depositLines({ rate: 5, amountUsd: 1000, exitWord: '7 days', exitWhen: 'cooldown', tight: true, booked: false, rewards: 0 })
    expect(t.lose.tone).toBe('warn')
    expect(t.cost.v).toBe('Only the network fee')
  })
  it('a PT is locked in to its date, and selling early is at the market price', () => {
    const l = depositLines({ rate: 9, amountUsd: 1000, exitWord: '55 days', exitWhen: 'par on 17 Dec', tight: false, maturity: 1_797_465_600, booked: true, rewards: 0 })
    expect(l.lose.v).toMatch(/^Locked in until/)
    expect(l.lose.s).toMatch(/market price/)
  })
})

describe('streak and points', () => {
  const day = (i: number) => dayKey(new Date(2026, 9, i))
  it('counts days in a row ending today or yesterday', () => {
    let log: DayMark[] = []
    for (const i of [18, 19, 20, 22, 23]) log = noteDay(log, day(i), 500)
    expect(streakOf(log, day(23))).toBe(2)
    expect(streakOf(log, day(24))).toBe(2)
    expect(streakOf(log, day(25))).toBe(0)
  })
  it('a day under the floor does not count, and a day keeps its highest', () => {
    let log = noteDay([], day(1), 5)
    expect(log).toEqual([])
    log = noteDay(noteDay(log, day(1), 300), day(1), 200)
    expect(log).toEqual([{ d: day(1), work: 300 }])
  })
  it('a point a day per $100 at work, plus five a day past a week in a row', () => {
    let log: DayMark[] = []
    for (let i = 1; i <= 9; i++) log = noteDay(log, day(i), 1000)
    expect(pointsOf(log)).toBe(9 * 10 + 2 * 5)
  })
})

describe('managing a position', () => {
  it('reads how far from liquidation off the health factor', () => {
    expect(bufferOfHealth(1.25)).toBeCloseTo(0.2)
    expect(bufferOfHealth(null)).toBeNull()
  })
  it('offers lower-risk targets only below today’s leverage', () => {
    // a 21× wstETH loop at a 95 % threshold: 5 % → 10.25×, 10 % → 6.89×, 20 % → 4.16×
    const t = saferTargets(21, 0.95)
    expect(t.map((x) => x.L)).toEqual([10.25, 6.89, 4.16])
    expect(saferTargets(5, 0.95).map((x) => x.word)).toEqual(['Much safer'])
    expect(saferTargets(21, null)).toEqual([])
  })
  it('says a risky loop in words, with its tone', () => {
    expect(holdingLine({ kind: 'loop', leverage: 21, health: 1.01 })).toEqual({ text: 'Levered ×21 · 1.0% from liquidation', tone: 'bad' })
    expect(holdingLine({ kind: 'borrow', health: 2 }).text).toBe('A loan · 50% from liquidation')
  })
})
