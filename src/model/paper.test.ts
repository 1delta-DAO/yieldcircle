import { describe, expect, it } from 'vitest'
import { apply, bookOf, emptyLedger, PaperError, STARTER, valueOf, ZERO_EVM, SOL_NATIVE, tokenKey, type PaperLedger, type PaperOp, type PaperSnap, type PriceFn } from './paper'

const T0 = Date.UTC(2026, 9, 11)
const DAY = 86_400_000
const USDC_BASE = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
const USDC_ETH = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const WSTETH_ARB = '0x5979d7b546e38e414f7e9822514be443a4800529'
const WETH_ARB = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'
const USDC_ARB = '0xaf88d065e77c8cc2239327c5edb3a432268e5831'

const prices: Record<string, number> = {
  [`1:${USDC_ETH}`]: 1, [`8453:${USDC_BASE}`]: 1, [`42161:${USDC_ARB}`]: 1,
  [`42161:${ZERO_EVM}`]: 2500, [`42161:${WETH_ARB}`]: 2500, [`42161:${WSTETH_ARB}`]: 3000,
  [`8453:${ZERO_EVM}`]: 2500, [`1:${ZERO_EVM}`]: 2500, [`solana:${SOL_NATIVE}`]: 100,
}
const feed = (over: Record<string, number> = {}): PriceFn => (c, t) => ({ ...prices, ...over })[`${c}:${t}`]
const ctx = (days = 0, over: Record<string, number> = {}) => ({ now: T0 + days * DAY, price: feed(over) })

function genesis(): PaperLedger {
  return apply(emptyLedger('0xabc', T0), { t: 'genesis', sol: 'So1Paper111' }, ctx())
}
const vaultSnap: PaperSnap = {
  asset: 'USDC', group: 'USD', label: 'USDC · Steakhouse', venue: 'Morpho', earnUid: 'vault.morpho:8453:0xv',
  held: { symbol: 'USDC', decimals: 6, address: USDC_BASE, priceUsd: 1 }, mode: 'peg',
}
const loopSnap: PaperSnap = {
  asset: 'ETH', group: 'ETH', label: 'wstETH / WETH loop', venue: 'Aave', marketUid: 'AAVE_V3:42161:wst', debtUid: 'AAVE_V3:42161:weth',
  held: { symbol: 'wstETH', decimals: 18, address: WSTETH_ARB, priceUsd: 3000 }, debt: { symbol: 'WETH', decimals: 18, address: WETH_ARB, priceUsd: 2500 },
  liqLtv: 0.95, mode: 'peg',
}
const deposit = (units = 1000): PaperOp => ({ t: 'open', id: 'p1', chainId: '8453', kind: 'simple', strategyId: 's:vault', snap: vaultSnap, pay: { token: USDC_BASE, units }, units, debtUnits: 0, rate: { supply: 10, borrow: 0 }, entryCostUsd: 0 })

describe('genesis', () => {
  it('funds every chain the app offers, once', () => {
    const l = genesis()
    expect(Object.keys(l.bank).sort()).toEqual(STARTER.map((c) => c.chainId).sort())
    expect(l.bank['8453'][USDC_BASE]).toBe(10_000)
    expect(l.bank['solana'][SOL_NATIVE]).toBe(20)
    expect(l.putInUsd).toBeGreaterThan(180_000)
    expect(l.sol).toBe('So1Paper111')
    expect(() => apply(l, { t: 'genesis' }, ctx())).toThrow(PaperError)
  })
  it('refuses ops before genesis', () => {
    expect(() => apply(emptyLedger('0xabc', T0), deposit(), ctx())).toThrow(/no bank/)
  })
})

describe('deposits', () => {
  it('moves tokens from the bank into a position that accrues at its rate', () => {
    const l = apply(genesis(), deposit(1000), ctx())
    expect(l.bank['8453'][USDC_BASE]).toBe(9000)
    const v = valueOf(l.positions[0], T0 + 365 * DAY, feed())
    expect(v.equityUsd).toBeCloseTo(1100, 6)
    expect(v.pnlUsd).toBeCloseTo(100, 6)
  })
  it('withdraws all with the accrued interest and books the gain', () => {
    let l = apply(genesis(), deposit(1000), ctx())
    l = apply(l, { t: 'withdraw', id: 'p1', units: 0, all: true, receive: { token: USDC_BASE, units: 1000 * (1 + 0.1 * 30 / 365) } }, ctx(30))
    expect(l.positions).toHaveLength(0)
    expect(l.bank['8453'][USDC_BASE]).toBeCloseTo(9000 + 1000 * (1 + 0.1 * 30 / 365), 6)
    expect(l.realizedUsd).toBeCloseTo(1000 * 0.1 * 30 / 365, 6)
  })
  it('refuses a withdrawal that pays out more than the position is worth', () => {
    const l = apply(genesis(), deposit(1000), ctx())
    expect(() => apply(l, { t: 'withdraw', id: 'p1', units: 0, all: true, receive: { token: USDC_BASE, units: 1500 } }, ctx(1))).toThrow(/cannot create value/)
  })
  it('refuses spending more than the bank holds', () => {
    expect(() => apply(genesis(), deposit(20_000), ctx())).toThrow(/not enough/)
  })
  it('stamps the feed price over a caller price', () => {
    const l = apply(genesis(), { ...deposit(1000), snap: { ...vaultSnap, held: { ...vaultSnap.held, priceUsd: 5 } } } as PaperOp, ctx())
    expect(l.positions[0].snap.held.priceUsd).toBe(1)
  })
})

describe('loops', () => {
  // $2,500 of WETH margin at 4×: $10,000 of wstETH, $7,500 of WETH debt, $20 entry cost
  const E = 2500, L = 4, cost = 20
  const open: PaperOp = { t: 'open', id: 'l1', chainId: '42161', kind: 'loop', strategyId: 'l:wst|weth', snap: loopSnap, pay: { token: ZERO_EVM, units: 1 },
    units: (E * L - cost) / 3000, debtUnits: (E * (L - 1)) / 2500, rate: { supply: 3, borrow: 2 }, entryCostUsd: cost }
  it('opens at the leverage asked, health from the threshold, equity less the entry cost', () => {
    const l = apply(genesis(), open, ctx())
    const v = valueOf(l.positions[0], T0, feed())
    expect(v.equityUsd).toBeCloseTo(E - cost, 6)
    expect(v.health!).toBeCloseTo((0.95 * (E * L - cost)) / (E * (L - 1)), 6)
    expect(l.bank['42161'][ZERO_EVM]).toBe(0 || undefined)
  })
  it('a same-money loop moves with its money, not with the collateral feed', () => {
    const l = apply(genesis(), open, ctx())
    // wstETH's own feed jumps (its yield is in its price) — the ratio from the open holds
    const a = valueOf(l.positions[0], T0, feed({ [`42161:${WSTETH_ARB}`]: 3300 }))
    expect(a.equityUsd).toBeCloseTo(E - cost, 6)
    // ether itself moves: both legs move with it
    const b = valueOf(l.positions[0], T0, feed({ [`42161:${WETH_ARB}`]: 2750 }))
    expect(b.equityUsd).toBeCloseTo((E - cost) * 1.1, 6)
  })
  it('refuses an open that holds more than was paid and borrowed', () => {
    expect(() => apply(genesis(), { ...open, units: (E * L * 1.2) / 3000 } as PaperOp, ctx())).toThrow(/cannot create value/)
  })
  it('refuses an open already past liquidation', () => {
    expect(() => apply(genesis(), { ...open, units: (E * 1.5) / 3000, debtUnits: (E * 2) / 2500, pay: { token: ZERO_EVM, units: 1 } } as PaperOp, ctx())).toThrow()
  })
  it('levers up and closes, paying the rest back', () => {
    let l = apply(genesis(), open, ctx())
    l = apply(l, { t: 'lever', id: 'l1', addUnits: 1000 / 3000, addDebt: 1000 / 2500, costUsd: 0 }, ctx())
    const p = l.positions[0]
    const v = valueOf(p, T0 + 10 * DAY, feed())
    l = apply(l, { t: 'reduce', id: 'l1', units: 0, debtUnits: 0, all: true, receive: [{ token: WETH_ARB, units: v.equityUsd / 2500 * 0.998 }], costUsd: 5 }, ctx(10))
    expect(l.positions).toHaveLength(0)
    expect(l.bank['42161'][WETH_ARB]).toBeCloseTo(v.equityUsd / 2500 * 0.998, 9)
  })
  it('deleverages part of the way and keeps the health above one', () => {
    let l = apply(genesis(), open, ctx())
    l = apply(l, { t: 'reduce', id: 'l1', units: 3000 / 3000, debtUnits: 2990 / 2500, receive: [], costUsd: 10 }, ctx())
    const v = valueOf(l.positions[0], T0, feed())
    expect(v.leverage!).toBeLessThan(L)
    expect(v.health!).toBeGreaterThan(1)
  })
})

describe('trades', () => {
  it('a swap may lose value but never create it', () => {
    const l = apply(genesis(), { t: 'swap', chainId: '42161', from: USDC_ARB, to: WETH_ARB, unitsIn: 2500, unitsOut: 0.99 }, ctx())
    expect(l.bank['42161'][WETH_ARB]).toBe(0.99)
    expect(l.realizedUsd).toBeCloseTo(-25, 6)
    expect(() => apply(genesis(), { t: 'swap', chainId: '42161', from: USDC_ARB, to: WETH_ARB, unitsIn: 2500, unitsOut: 1.2 }, ctx())).toThrow(/cannot create value/)
  })
  it('a bridge is debited now and lands when its time is up', () => {
    let l = apply(genesis(), { t: 'bridge', id: 'b1', fromChainId: '1', toChainId: '8453', from: USDC_ETH, to: USDC_BASE, unitsIn: 5000, unitsOut: 4995, arrivesAt: T0 + 180_000, route: { bridge: 'across' } }, ctx())
    expect(l.bank['1'][USDC_ETH]).toBe(5000)
    expect(l.bank['8453'][USDC_BASE]).toBe(10_000)
    expect(l.inflight).toHaveLength(1)
    l = apply(l, { t: 'topup', chainId: '1', units: 10 }, { now: T0 + 200_000, price: feed() })
    expect(l.inflight).toHaveLength(0)
    expect(l.bank['8453'][USDC_BASE]).toBe(14_995)
  })
  it('caps top-ups', () => {
    let l = genesis()
    for (let i = 0; i < 5; i++) l = apply(l, { t: 'topup', chainId: '8453', units: 10_000 }, ctx())
    expect(() => apply(l, { t: 'topup', chainId: '8453', units: 1 }, ctx())).toThrow(/at most/)
    expect(() => apply(genesis(), { t: 'topup', chainId: '8453', units: 50_000 }, ctx())).toThrow(/at most/)
  })
})

describe('the book', () => {
  it('measures what strategies earned, not what the gas coins did', () => {
    const l = apply(genesis(), deposit(10_000), ctx())
    const flat = bookOf(l, T0 + 365 * DAY, feed())
    const ethUp = bookOf(l, T0 + 365 * DAY, feed({ [`1:${ZERO_EVM}`]: 5000, [`42161:${ZERO_EVM}`]: 5000, [`8453:${ZERO_EVM}`]: 5000 }))
    expect(flat.pnlUsd).toBeCloseTo(1000, 6)
    expect(ethUp.pnlUsd).toBeCloseTo(1000, 6)
    expect(ethUp.navUsd).toBeGreaterThan(flat.navUsd)
    expect(flat.netAprPct).toBeCloseTo(10, 6)
  })
  it('keys tokens the way the bank does', () => {
    expect(tokenKey('1', '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')).toBe(ZERO_EVM)
    expect(tokenKey('solana', 'native')).toBe(SOL_NATIVE)
    expect(tokenKey('8453', '0x833589FCD6EDB6E08F4C7C32D4F71B54BDA02913')).toBe(USDC_BASE)
  })
})

describe('closed holes (server review, 2026-10-11)', () => {
  const ODD = '0x00000000000000000000000000000000000000dd'
  it('refuses a trade into or out of a token the feed cannot price', () => {
    expect(() => apply(genesis(), { t: 'swap', chainId: '8453', from: USDC_BASE, to: ODD, unitsIn: 1, unitsOut: 1e12 }, ctx())).toThrow(/no price/)
    expect(() => apply(genesis(), { t: 'bridge', id: 'b', fromChainId: '8453', toChainId: '1', from: USDC_BASE, to: ODD, unitsIn: 1, unitsOut: 1e12, arrivesAt: T0 }, ctx())).toThrow(/no price/)
  })
  it('values an unpriced held token at what was paid, for good', () => {
    const snap = { ...vaultSnap, mode: 'live' as const, held: { symbol: 'PT-X', decimals: 18, address: ODD, priceUsd: 0.9 } }
    const l = apply(genesis(), { ...deposit(900), snap, units: 1000 } as PaperOp, ctx())
    expect(l.positions[0].snap.mode).toBe('peg')
    expect(valueOf(l.positions[0], T0, feed({ [`8453:${ODD}`]: 50 })).equityUsd).toBeCloseTo(900, 6)
    // and the caller cannot claim more than it paid for it
    expect(() => apply(genesis(), { ...deposit(900), snap: { ...snap, held: { ...snap.held, priceUsd: 5 } }, units: 1000 } as PaperOp, ctx())).toThrow(/cannot create value/)
  })
  it('clamps a made-up rate', () => {
    const l = apply(genesis(), { ...deposit(1000), rate: { supply: 10_000, borrow: 0, supplyRewards: 500 } } as PaperOp, ctx())
    expect(l.positions[0].rate.supply).toBe(100)
    expect(l.positions[0].rate.supplyRewards).toBe(100)
  })
  it('counts a starter token the feed misses at what it was put in at', () => {
    const l = apply(emptyLedger('0xabc', T0), { t: 'genesis' }, { now: T0, price: () => undefined })
    const none = bookOf(l, T0, () => undefined)
    expect(none.navUsd).toBeCloseTo(l.putInUsd, 0)
  })
})
