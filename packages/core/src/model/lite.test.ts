import { describe, expect, it } from 'vitest'
import { followedFirst, howOf, safestFirst, tileRates, rowName, liteFind, pnlSummary, signedMoney, splitTitle, boardPositions, boardStrategies, closedPosition, boardWallets, bufferOfHealth, holdingLine, holdingRow, madeRows, saferTargets, dayKey, depositLines, liteEligible, liteMenu, liteModes, loopLines, moneyWord, noteDay, plainName, pointsOf, streakOf, type DayMark, riskWord, riskTag, liteTiers, withdrawLines, closeLines, LITE_MIN_BUFFER, liteLeverTargets, liteLevRange, overLtv } from './lite'
import { borrowCapLtv, healthAt, healthAtLtv, liqBuffer, liqBufferAtLtv } from './leverage'
import type { LoopStrategy, SimpleStrategy, Strategy } from './strategies'
import { learnDesk } from './assets'
import { LITE_CONTROLS, LITE_FLOORS, liteWidened } from './lite'
import { DEFAULTS } from './settings'
import type { Holding } from './positions'

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
  it('a loop on an issued desk’s product is the desk’s, and says what it holds', () => {
    const n = plainName(loop('nest', { asset: 'pUSD', holds: 'nOPAL' }))
    expect(n.title).toBe('Dollars via Nest')
    expect(n.sub).toBe('Holds nOPAL · borrows dollars')
    expect(plainName(loop('usdc', { asset: 'USDC', holds: 'USDC' })).title).toBe('USDC')
  })
  it('splits a "via" title into the money and whose it is', () => {
    expect(splitTitle('Dollars via 3Jane')).toEqual({ short: '3Jane', via: true })
    expect(splitTitle('USDC')).toEqual({ short: 'USDC', via: false })
  })
  it('a name says whose it is and where it sits — never "Dollars via"', () => {
    const pt = dep('pt', { asset: 'USDe', source: 'fixed', via: 'Fixed on Pendle · 17 Dec', maturity: 1_800_000_000 })
    expect(rowName({ s: pt, title: 'Dollars via 3Jane' })).toBe('3Jane via Pendle')
    expect(rowName({ s: loop('l', { venue: 'Morpho · Steakhouse' }), title: 'Dollars via 3Jane' })).toBe('3Jane loop via Morpho')
    expect(howOf(loop('a'))).toBe('loop via Aave')
    expect(rowName({ s: dep('d'), title: 'Dollars via 3Jane' })).toBe('3Jane via Aave')
    expect(rowName({ s: dep('m', { brand: 'Morpho Blue' }), title: 'USDC' })).toBe('USDC via Morpho')
    // a vault: the platform it runs on; the curator is the sub's
    const v = dep('v', { source: 'vault', brand: 'Gami', venue: 'Gami · Lagoon' })
    expect(rowName({ s: v, title: 'Dollars via Hastra' })).toBe('Hastra via Lagoon')
    expect(plainName(v).sub).toBe('Vault curated by Gami')
    // an issuer's own savings or staking is just its name; someone else's says whose
    expect(rowName({ s: dep('h', { source: 'savings', brand: 'Hastra' }), title: 'Dollars via Hastra' })).toBe('Hastra')
    expect(rowName({ s: dep('e', { source: 'staking', brand: 'EtherFi' }), title: 'Ether via ether.fi' })).toBe('ether.fi')
    expect(rowName({ s: dep('s', { source: 'savings', brand: 'Spark' }), title: 'USDC' })).toBe('USDC via Spark')
  })
  it('a row never names a chain', () => {
    const n = plainName(loop('x'))
    expect(n.title).toBe('Dollars via Ethena')
    expect(n.sub).toBe('Borrows dollars')
    expect(JSON.stringify(plainName(dep('y')))).not.toMatch(/Ethereum/)
    expect(plainName(dep('y')).sub).toBe('Lent to borrowers')
  })
  it('the risk under a rate: word and score, never a score the API did not give', () => {
    expect(riskTag({ risk: 2, riskScore: 3, rated: true })).toBe('Medium · 3/5')
    expect(riskTag({ risk: 1, riskScore: 1.25, rated: true })).toBe('Low · 1.3/5')
    expect(riskTag({ risk: 2, riskScore: 5, rated: false })).toBe('Unrated')
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

describe('liteFind', () => {
  const rank = (s: Strategy) => s.rate
  const rows = liteMenu([
    dep('usdc', { rate: 5 }),
    dep('usdt', { asset: 'USDT', holds: 'USDT', rate: 6, risk: 2 }),
    loop('l', { rate: 14, risk: 2 }),
    dep('eth', { group: 'ETH', asset: 'wstETH', holds: 'wstETH', rate: 3 }),
  ], rank)
  const ids = (q: string) => liteFind(q, rows).map((r) => r.s.id)
  it('finds a row by its coin, its money and its kind', () => {
    expect(ids('usdt')).toEqual(['usdt'])
    expect(ids('ether')).toEqual(['eth'])
    expect(ids('loop')).toEqual(['l'])
  })
  it('a loop is found by the coin it borrows too, but the coin itself leads', () => {
    expect(ids('usdc')[0]).toBe('usdc')
    expect(ids('usdc')).toContain('l')
  })
  it('every word must match, and the list order holds otherwise', () => {
    expect(ids('dollars')).toEqual(rows.filter((r) => r.s.group === 'USD').map((r) => r.s.id))
    expect(ids('dollars loop')).toEqual(['l'])
    expect(ids('xyz')).toEqual([])
    expect(ids('  ')).toEqual([])
  })
})

describe('followedFirst', () => {
  it('puts the people you follow first and keeps the rest in order', () => {
    const xs = [{ account: '0xA' }, { account: '0xb' }, { account: '0xc' }]
    expect(followedFirst(xs, new Set(['0xc'])).map((x) => x.account)).toEqual(['0xc', '0xA', '0xb'])
  })
})

describe('the three lines', () => {
  it('a dollar loop says the move that liquidates against the dollar', () => {
    const l = loopLines({ net: 12, amountUsd: 500, lev: 4.5, drop: 0.07, holds: 'Dollars via Ethena', debt: 'dollars', dollarDebt: true, cost: 0.8, payback: 2, quoting: false })
    expect(l.earn.v).toBe('12.00% a year')
    expect(l.earn.s).toContain('$5.00 a month on $500')
    expect(l.lose.v).toBe('If Ethena’s dollar trades 7.0% under $1')
    expect(l.lose.s).toMatch(/^Then the loop is liquidated/)
    expect(l.lose.tone).toBe('warn')
    expect(l.cost.v).toBe('$0.80 to enter')
    expect(l.cost.s).toBe('earned back in 2 days')
  })
  it('stale reference prices: the swap reads as unpriced, never as free or as a loss', () => {
    const l = loopLines({ net: 52, amountUsd: 1000, lev: 5.6, drop: 0.044, holds: 'Dollars via Apyx', debt: 'dollars', dollarDebt: true, cost: 0.2, payback: 0.1, quoting: false, staleHours: 41.7 })
    expect(l.cost.v).toBe('Swap not priced')
    expect(l.cost.s).toContain('42 h old')
    expect(l.cost.tone).toBe('warn')
  })
  it('an ether loop is liquidated against ether, not a dollar', () => {
    const l = loopLines({ net: 4, amountUsd: 0, lev: 6, drop: 0.12, holds: 'Ether via Lido', debt: 'ether', dollarDebt: false, cost: null, payback: null, quoting: true })
    expect(l.lose.s).toMatch(/^Then the loop is liquidated/)
    expect(l.lose.v).toBe('If Lido’s ether trades 12.0% under plain ether')
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
  it('offers a running loop the safer steps and the tiers inside the venue’s range', () => {
    const t = liteLeverTargets({ Lnow: 5, liqLtv: 0.95, maxL: 10, tiers: { defensive: 4, balanced: 7, aggressive: 12 } })
    // Bold's 12× is capped at the venue's 10×, and still clears Lite's floor there
    expect(t.map((x) => [x.word, x.L, x.up])).toEqual([['Bold', 10, true], ['Balanced', 7, true], ['Much safer', 4.16, false], ['Careful', 4, false]])
    expect(t.every((x) => x.buffer >= LITE_MIN_BUFFER)).toBe(true)
    // off the menu (no tiers) or on a fixed-rate loan (maxL = today): only down
    expect(liteLeverTargets({ Lnow: 5, liqLtv: 0.95, maxL: 5 }).map((x) => x.up)).toEqual([false])
    expect(liteLeverTargets({ Lnow: 5, liqLtv: 0.95, maxL: 5, tiers: { defensive: 4, balanced: 7, aggressive: 12 } }).map((x) => x.L)).toEqual([4.16, 4])
  })
  it('says a risky loop in words, with its tone', () => {
    expect(holdingLine({ kind: 'loop', leverage: 21, health: 1.01 })).toEqual({ text: 'Levered ×21 · 1.0% from liquidation', tone: 'bad' })
    expect(holdingLine({ kind: 'borrow', health: 2 }).text).toBe('A loan · 50% from liquidation')
  })
  it('splits the row into what it is and how far from the line, naming the token once', () => {
    expect(holdingRow({ kind: 'loop', leverage: 21, health: 1.01, symbol: 'USDY' }, 'Dollars via Ondo')).toEqual({ what: 'USDY · Levered ×21', risk: { text: '1.0% from liquidation', tone: 'bad' } })
    expect(holdingRow({ kind: 'simple', symbol: 'USDC' }, 'USDC')).toEqual({ what: 'Earning', risk: null })
  })
})

describe('every number, as one list', () => {
  const strat = (key: string, pnlUsd: number, more = {}) => ({ key, kind: 'loop', held: ['USDY'], debt: ['USDC'], protocol: null, pnlUsd, yieldUsd: pnlUsd, pnlAprPct: 6, equityUsd: 2000, since: '2026-10-01', ...more })
  const pos = (key: string, strategyKey: string, pnlUsd: number | null, more = {}) => ({ key, chainId: '1', strategyKey, pnlUsd, yieldUsd: pnlUsd, pnlAprPct: 6, equityUsd: 2000, since: '2026-10-01', status: 'ok', ...more })
  it('lists a strategy with one position once, in its live name and value', () => {
    const live = new Map([['p1', { valueUsd: 1955, title: 'Dollars via Ondo', what: 'USDY · Levered ×8.7' }]])
    const rows = madeRows({ strategies: [strat('s1', 7.58)], positions: [pos('p1', 's1', 7.58)] }, () => 'Other name', live)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ title: 'Dollars via Ondo', what: 'USDY · Levered ×8.7', valueUsd: 1955, pnlUsd: 7.58 })
    expect(rows[0].records).toHaveLength(1)
  })
  it('carries several positions of one strategy under its row and sums their values', () => {
    const rows = madeRows({ strategies: [strat('s1', 10)], positions: [pos('p1', 's1', 4, { equityUsd: 100 }), pos('p2', 's1', 6, { equityUsd: 200 })] }, () => 'Dollars')
    expect(rows).toHaveLength(1)
    expect(rows[0].valueUsd).toBe(300)
    expect(rows[0].records.map((r) => r.key)).toEqual(['p2', 'p1'])
  })
  it('falls back to the catalogue name, then the tokens, and loses no position', () => {
    const rows = madeRows({ strategies: [strat('s1', 1)], positions: [pos('p1', 's1', 1), pos('p2', 'gone', -5, { status: 'ok' }), pos('p3', 's1', null, { status: 'pending' })] }, () => null)
    expect(rows.map((r) => [r.key, r.title])).toEqual([['gone', 'A position'], ['s1', 'USDY']])
    expect(rows[1]).toMatchObject({ what: 'Levered · borrows USDC' })
    expect(rows[1].records).toHaveLength(1)
  })
})

describe('the leaderboard', () => {
  const w = (account: string, apr: number | null, day: number | null, nCounted = 2) => ({ account, netAprPct: apr, perDayUsd: day, navUsd: 50_000, nCounted })
  it('ranks by one number, and only wallets with a figure', () => {
    const rows = [w('0xa', 12, 30), w('0xb', 30, 5), w('0xc', null, 90), w('0xd', 50, 1, 0)]
    expect(boardWallets(rows, 'apr').map((r) => [r.account, r.rank])).toEqual([['0xb', 1], ['0xa', 2]])
    expect(boardWallets(rows, 'perDay').map((r) => r.account)).toEqual(['0xc', '0xa', '0xb'])
  })
  it('narrows to the people the reader follows', () => {
    expect(boardWallets([w('0xA', 12, 3), w('0xb', 30, 5)], 'apr', new Set(['0xa'])).map((r) => r.account)).toEqual(['0xA'])
  })
  it('lists each position with what it made, best first, skipping what is not drawn yet', () => {
    const book = {
      strategies: [{ key: 'loop:x|y', kind: 'loop', held: ['wstETH'], debt: ['WETH'], protocol: 'AAVE_V3' }, { key: 'dep:z', kind: 'deposit', held: ['USDC'], debt: [], protocol: 'vault.morpho', market: 'Steakhouse USDC' }],
      positions: [
        { key: 'p1', strategyKey: 'dep:z', pnlUsd: 120, pnlAprPct: 6, equityUsd: 5000, since: null, status: 'ok' },
        { key: 'p2', strategyKey: 'loop:x|y', pnlUsd: 900, pnlAprPct: 14, equityUsd: 9000, since: null, status: 'ok' },
        { key: 'p3', strategyKey: 'loop:x|y', pnlUsd: null, pnlAprPct: null, equityUsd: 100, since: null, status: 'pending' },
      ],
    }
    const ps = boardPositions(book, (k) => (k === 'loop:x|y' ? 'Ether via Lido' : null))
    expect(ps.map((p) => [p.title, p.sub, p.pnlUsd])).toEqual([['Ether via Lido', 'Levered · borrows WETH', 900], ['Steakhouse USDC', 'Deposit', 120]])
    expect(ps.map((p) => [p.kind, p.held, p.debt, p.share])).toEqual([['loop', ['wstETH'], ['WETH'], 9000 / 14000], ['deposit', ['USDC'], [], 5000 / 14000]])
  })
  it('names a closed position by its legs, in Lite’s words where they are a Lite row’s markets', () => {
    const legs = [{ marketUid: 'AAVE_V3:1:0xAbC', side: 'supply', symbol: 'wstETH' }, { marketUid: 'AAVE_V3:1:0xDeF', side: 'borrow', symbol: 'WETH' }]
    const k = { key: '1|0xa||AAVE_V3', lastAt: '2026-10-28T13:19:00.000Z' }
    const sum = { pnl: 151, aprPct: 5.4, capitalDays: 1000, avgCapital: 80_000 }
    const c = closedPosition(k, { summary: sum, legs }, (sk) => (sk.startsWith('loop:') ? 'Ether via Lido' : null))!
    expect([c.title, c.sub, c.kind, c.held, c.debt, c.pnlUsd, c.closed]).toEqual(['Ether via Lido', 'Levered · borrows WETH', 'loop', ['wstETH'], ['WETH'], 151, { at: k.lastAt, avgUsd: 80_000 }])
    expect(closedPosition(k, { summary: sum, legs: [legs[0]] }, () => null)!.title).toBe('wstETH')
    expect(closedPosition(k, { summary: { ...sum, capitalDays: 0 }, legs }, () => null)).toBeNull()
  })
})

describe('the strategy board', () => {
  const g = (key: string, apr: number | null, day: number | null, more: Partial<Parameters<typeof boardStrategies>[0][number]['strategy']> = {}) => ({
    account: '0xbest', netAprPct: 27.6, leverage: 4, equityUsd: 350_000,
    legs: [{ side: 'supply', symbol: 'nOPAL' }, { side: 'borrow', symbol: 'USDC' }],
    strategy: { key, kind: 'loop' as const, wallets: 12, equityUsd: 941_000, aprPct: apr, perDayUsd: day, leverageMin: 3.9, leverageMax: 4, faces: ['0xbest', '0x2'], firstSince: null, ...more },
  })
  it('ranks by the holders’ rate or their dollars a day, and names what Lite carries in its words', () => {
    const rows = [g('loop:a|b', 12, 300), g('loop:c|d', 27.6, 90), g('dep:e', null, 50)]
    const out = boardStrategies(rows, 'apr', (k) => (k === 'loop:c|d' ? { title: 'Dollars via Nest', sub: 'Levered ×4.0 · borrows dollars', color: '#3fbf7f', held: { symbol: 'nOPAL' }, debt: { symbol: 'USDC' } } : null))
    expect(out.map((s) => [s.title, s.value])).toEqual([['Dollars via Nest', 27.6], ['nOPAL', 12]])
    expect(out[1].sub).toBe('Levered · borrows USDC')
    expect(out[1].held.symbol).toBe('nOPAL')
    expect(out[0].levRange).toBe('×4.0')
    expect(boardStrategies(rows, 'perDay', () => null).map((s) => s.key)).toEqual(['loop:a|b', 'loop:c|d', 'dep:e'])
  })
  it('leaves out a strategy one wallet alone runs', () => {
    expect(boardStrategies([g('loop:a|b', 90, 1, { wallets: 1 }), g('loop:c|d', 10, 1)], 'apr', () => null).map((s) => s.key)).toEqual(['loop:c|d'])
  })
  it('says a leverage range when the holders differ', () => {
    expect(boardStrategies([g('loop:a|b', 10, 1, { leverageMin: 2, leverageMax: 4 })], 'apr', () => null)[0].levRange).toBe('×2.0–4.0')
  })
})

describe('what you made', () => {
  const book = (pnl: number, y: number | null, d: number | null, withPnl = 3) => ({ total: { pnlUsd: pnl, yieldUsd: y, directionalUsd: d, pnlAprPct: 8 }, coverage: { positions: 4, withPnl } })
  it('splits farming from the price move, and says which did it', () => {
    const s = pnlSummary(book(312, 300, 12))!
    expect(s.split!.yield).toBeCloseTo(300 / 312)
    expect(s.word).toBe('Almost all of it is farming: farming made $300.')
    expect(pnlSummary(book(-90, 10, -100))!.word).toBe('Mostly the coin\'s price: prices took $100, farming made $10.')
    expect(pnlSummary(book(100, 60, 40))!.word).toBe('Farming made $60 and prices added $40.')
  })
  it('has nothing to say without a record, and no split without a yield figure', () => {
    expect(pnlSummary(book(10, null, null, 0))).toBeNull()
    expect(pnlSummary(book(10, null, null))!.split).toBeNull()
    expect(signedMoney(-40)).toBe('−$40')
    expect(signedMoney(0)).toBe('$0')
  })
})

describe('liteModes', () => {
  const held = (more: Partial<Holding> = {}) => ({
    key: 'k', kind: 'loop', chainId: 'solana', health: 1.2, collateralUid: 'KAMINO_X:solana:a', debtUid: 'KAMINO_X:solana:b',
    collateralAddress: 'a', debtAddress: 'b', ...more,
  } as unknown as Holding)
  const ids = (h: Holding, s: Strategy | null = null) => liteModes(s, h).tabs.map((t) => t.id)

  it('offers a held loop the plain top-up and pay-back beside Lower risk and Close', () => {
    expect(ids(held())).toEqual(['reduce', 'topup', 'payback', 'close'])
  })
  it('lets a held position be added to even when Lite would not open it new', () => {
    const s = { id: 's', kind: 'loop', tvlUsd: 0 } as unknown as Strategy
    expect(ids(held(), s)).toEqual(['add', 'reduce', 'topup', 'payback', 'close'])
    expect(ids(held({ subAccount: { id: '1', label: 'Multiply', count: 1, unsupported: 'no build' } }), s)).toEqual(['reduce', 'close'])
  })
  it('never on paper, an unmanaged sub-account, or a loop whose legs are not both named', () => {
    expect(ids(held({ paper: true }))).toEqual(['reduce', 'close'])
    expect(ids(held({ subAccount: { id: '1', label: 'Multiply', count: 1, unsupported: 'no build' } }))).toEqual(['reduce', 'close'])
    expect(ids(held({ debtUid: undefined }))).toEqual(['reduce', 'close'])
  })
  it('leaves a deposit as it was', () => {
    expect(ids(held({ kind: 'simple' }))).toEqual(['reduce'])
  })
})

describe('Lite polish (docs/lite-design-review.md)', () => {
  it('says the risk in a word', () => {
    expect(riskWord(1)).toBe('Low risk')
    expect(riskWord(2)).toBe('Medium risk')
  })
  it('offers only the tiers that clear the buffer floor', () => {
    const t = liteTiers({ defensive: 3, balanced: 5, aggressive: 12 }, 0.9, (l) => l)
    expect(t.map((x) => x.word)).toEqual(['Careful', 'Balanced'])
    expect(t.every((x) => x.buffer >= LITE_MIN_BUFFER)).toBe(true)
  })
  it('words a withdrawal and a close', () => {
    const w = withdrawLines({ backUsd: 921.29, back: '921.29 USDC', exitWord: 'Instant', exitWhen: 'any time', leftUsd: 0, rate: 4 })
    expect(w.map((l) => l.k)).toEqual(['You get', 'When', 'Left in'])
    expect(w[2].v).toBe('Nothing')
    expect(closeLines({ backUsd: null, back: '', costUsd: 2, short: false })[0].v).toBe('—')
  })
})

describe('tileRates', () => {
  it('says the best deposit, and the loop beside it — never the levered one alone over savings', () => {
    expect(tileRates([{ s: dep('a', { rate: 4 }) }, { s: loop('l', { rate: 59 }) }, { s: dep('b', { rate: 6 }) }])).toEqual({ best: 6, bestLoop: 59 })
  })
  it('has only the loop rate when nothing else is on the tile', () => {
    expect(tileRates([{ s: loop('l', { rate: 20 }) }])).toEqual({ best: 0, bestLoop: 20 })
  })
})

describe('safestFirst', () => {
  it('orders by risk, then the steady rate', () => {
    const rows = [{ s: loop('x6', { rate: 40, risk: 2 }) }, { s: dep('save', { rate: 4, risk: 1 }) }, { s: dep('more', { rate: 9, risk: 2 }) }, { s: dep('best', { rate: 5, risk: 1 }) }]
    expect(rows.sort(safestFirst((s) => s.rate)).map((r) => r.s.id)).toEqual(['best', 'save', 'x6', 'more'])
  })
})

describe('liteWidened', () => {
  it('counts only the filters Lite reads', () => {
    expect(liteWidened(DEFAULTS)).toBe(0)
    // Pro-only switches move nothing on a Lite list
    expect(liteWidened({ ...DEFAULTS, wideNet: true, minBorrowLiquidityUsd: 0, slippageBp: 30 })).toBe(0)
    expect(liteWidened({ ...DEFAULTS, minTvlUsd: 250_000, showNegative: true })).toBe(2)
    expect(liteWidened({ ...DEFAULTS, ...LITE_FLOORS })).toBe(0)
    // every Lite control moves a Lite floor
    for (const c of LITE_CONTROLS) {
      const patch = c.kind === 'seg' ? { [c.key]: c.opts[c.opts.length - 1].v } : c.to(true)
      expect(liteWidened({ ...DEFAULTS, ...patch })).toBe(1)
    }
  })
})

describe('liteLevRange / overLtv', () => {
  it('holds the top where the loop still clears Lite’s floor', () => {
    const [lo, hi] = liteLevRange(10, 0.9)
    expect(lo).toBe(1.1)
    expect(liqBuffer(0.9, hi)).toBeGreaterThanOrEqual(LITE_MIN_BUFFER)
    expect(liqBuffer(0.9, hi + 0.02)).toBeLessThan(LITE_MIN_BUFFER)
  })
  it('keeps the venue’s own range when the floor is further out', () => {
    expect(liteLevRange(2.8, 0.8)).toEqual([1.1, 2.76])
  })
  it('reads a max-LTV refusal', () => {
    expect(overLtv('Alchemix open: 79 alUSD of debt against collateral worth 87 exceeds the 90% max LTV (with a 0.5% buffer). Borrow less or add margin.')).toBe(true)
    expect(overLtv('No route')).toBe(false)
  })
})
describe('liqBufferAtLtv', () => {
  it('matches the leverage form at (L − 1) / L and reads a costlier open as closer', () => {
    expect(liqBufferAtLtv(0.9, 5 / 6)).toBeCloseTo(liqBuffer(0.9, 6), 10)
    expect(liqBufferAtLtv(0.9, 0.844)).toBeLessThan(liqBuffer(0.9, 6.02))
    expect(healthAtLtv(0.9, 5 / 6)).toBeCloseTo(healthAt(0.9, 6), 10)
    expect(borrowCapLtv(10)).toBeCloseTo(0.9, 10)
  })
})
