import { describe, expect, it } from 'vitest'
import { chipNews } from './activity'
import type { Trace } from './txTrace'

const t = (receipt: Trace['receipt']): Trace => ({ id: '0x1', hash: '0x1', chainId: '8453', account: '0xme', title: '', label: '', moves: 'positions', phase: 'settled', at: 0, need: 1, receipt })

describe('the balance chip after an action lands (ticket 0016 §4)', () => {
  it('says where the money went: a deposit moves idle to work, so the total does not jump', () => {
    expect(chipNews(t({ kind: 'deposit', usd: 250 }))).toBe('+$250 at work')
    expect(chipNews(t({ kind: 'open', usd: 12.5 }))).toBe('+$12.50 at work')
    expect(chipNews(t({ kind: 'close', usd: 1520 }))).toBe('$1.5k back in your wallet')
    expect(chipNews(t({ kind: 'repay', usd: 40 }))).toBe('$40.00 paid back')
  })
  it('nothing without a dollar figure, or for a leverage change', () => {
    expect(chipNews(t({ kind: 'deposit' }))).toBeNull()
    expect(chipNews(t({ kind: 'lever', usd: 100 }))).toBeNull()
    expect(chipNews(t(undefined))).toBeNull()
  })
})
