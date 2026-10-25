import { describe, expect, it } from 'vitest'
import { asAmount, formatUnits, fromUnits, heldRaw, parseUnits, payRaw, portion, unitsOf } from './amount'
import { capRaw, toRaw } from './leverage'
import { mergeIdle, type Idle } from './positions'

// The live case (2026-10-21): Max on a Resupply loop margin sent 166,624 wei more than the wallet held.
const have = { amount: 74.27903891665083, raw: '74279038916650833376' }

describe('the float round-trip overshoots, which is the bug', () => {
  it('toRaw of the float balance is above the balance', () => {
    expect(BigInt(toRaw(have.amount, 18))).toBeGreaterThan(BigInt(have.raw))
  })
})

describe('payRaw — an amount box as sent', () => {
  it('Max pays the exact balance', () => {
    expect(payRaw(portion(have, 100, 18), 18, have)).toBe(have.raw)
  })
  it('Max shows the balance cut to 8 places, never above it', () => {
    expect(portion(have, 100, 18).text).toBe('74.27903891')
  })
  it('a percent is computed on the raw, rounding down', () => {
    expect(payRaw(portion(have, 50, 18), 18, have)).toBe('37139519458325416688')
    expect(payRaw(portion({ amount: 0.000003, raw: '3' }, 50, 6), 6, { amount: 0.000003, raw: '3' })).toBe('1')
  })
  it('the reference follows the balance it points at, not the one it was clicked on', () => {
    expect(payRaw(portion(have, 100, 18), 18, { amount: 10, raw: '10000000000000000001' })).toBe('10000000000000000001')
  })
  it('a typed amount is parsed from its text, digit by digit', () => {
    expect(payRaw({ text: '50.000000000000000001' }, 18, have)).toBe('50000000000000000001')
  })
  it('a typed amount above the balance is capped at it', () => {
    expect(payRaw({ text: '74.279038916651' }, 18, have)).toBe(have.raw)
  })
  it('a 6-decimal balance', () => {
    const u = { amount: 0.30000000000000004, raw: '300000' }
    expect(payRaw(portion(u, 100, 6), 6, u)).toBe('300000')
    expect(payRaw({ text: '0.3000009' }, 6, u)).toBe('300000')
  })
  it('no raw to go on: the text as it stands', () => {
    expect(payRaw({ text: '1.5' }, 6, { amount: 2 })).toBe('1500000')
    expect(payRaw({ text: '1.5' }, 6)).toBe('1500000')
  })
  it('a withdraw is capped at the holding', () => {
    const h = { amount: have.amount, amountRaw: have.raw }
    expect(payRaw(portion(heldRaw(h), 100, 18), 18, heldRaw(h))).toBe(h.amountRaw)
    expect(payRaw({ text: '80' }, 18, heldRaw(h))).toBe(h.amountRaw)
  })
})

describe('text ↔ units', () => {
  it('parseUnits cuts excess decimals and reads junk as 0', () => {
    expect(parseUnits('1.2345679', 6)).toBe(1234567n)
    expect(parseUnits('.5', 6)).toBe(500000n)
    expect(parseUnits('7.', 6)).toBe(7000000n)
    expect(parseUnits('', 6)).toBe(0n)
    expect(parseUnits('1e-7', 18)).toBe(0n)
  })
  it('formatUnits drops trailing zeros', () => {
    expect(formatUnits(1500000n, 6)).toBe('1.5')
    expect(formatUnits(2000000n, 6)).toBe('2')
  })
  it('fromUnits never writes an exponent', () => {
    expect(fromUnits(1e-7).text).toBe('0.0000001')
    expect(fromUnits(1000).text).toBe('1000')
  })
  it('a number kept by an older build reads as typed text', () => {
    expect(asAmount(1.25)).toEqual({ text: '1.25' })
    expect(unitsOf(asAmount('junk'))).toBe(0)
  })
})

describe('capRaw — a float-born size (a slider sell) taken out of a position', () => {
  it('"all of it" is the exact holding', () => {
    expect(capRaw(have.amount, 18, have)).toBe(have.raw)
  })
  it('a smaller size is untouched', () => {
    expect(capRaw(50, 18, have)).toBe(toRaw(50, 18))
  })
})

describe('mergeIdle — the group row sums floats, so it has no raw to send', () => {
  const row = (chainId: string, amount: number, raw: string): Idle => ({ asset: 'ETH', symbol: 'WETH', amount, usd: amount * 3000, address: '0x' + chainId.padStart(40, '0'), decimals: 18, price: 3000, chainId, raw })
  it('a single row keeps its raw', () => {
    expect(mergeIdle([row('1', 1, '1000000000000000000')])[0].raw).toBe('1000000000000000000')
  })
  it('two rows merge without one', () => {
    const [m] = mergeIdle([row('1', 1, '1000000000000000000'), row('8453', 2, '2000000000000000000')])
    expect(m.amount).toBe(3)
    expect(m.raw).toBeUndefined()
    expect(m.chainId).toBe('8453')
  })
  it('does not touch the rows it was given', () => {
    const a = row('1', 1, '1000000000000000000')
    mergeIdle([a, row('8453', 2, '2000000000000000000')])
    expect(a.raw).toBe('1000000000000000000')
  })
})
