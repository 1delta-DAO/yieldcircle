import { describe, expect, it } from 'vitest'
import { bookKey, cardPnlState, joinBook, showableApr, type BookRecord } from './bookJoin'

const A = '0x6d3b000000000000000000000000000000005409'
const rec = (key: string, more: Partial<BookRecord> = {}): BookRecord => ({ key, pnlUsd: -98_000, pnlAprPct: -624, status: 'ok', ...more })

describe('joinBook', () => {
  it('lands every record on its card by netting key, whatever the EVM case', () => {
    const cards = [`1|${A}|0|SPARK`, `1|${A}|0|MORPHO_BLUE_0xabc`, `8453|${A}|0|MORPHO_BLUE_0xdef`]
    const recs = [rec(`1|${A.toUpperCase().replace('0X', '0x')}|0|SPARK`), rec(`1|${A}|0|MORPHO_BLUE_0xABC`), rec(`8453|${A}|0|MORPHO_BLUE_0xdef`)]
    const j = joinBook(cards, recs)
    expect(j.orphans).toEqual([])
    expect(cards.every((k) => j.byKey.has(bookKey(k)))).toBe(true)
  })

  it('hands back the records the chain filter cut as orphans', () => {
    const j = joinBook([`1|${A}|0|SPARK`], [rec(`1|${A}|0|SPARK`), rec(`8453|${A}|0|MORPHO_BLUE_0xdef`)])
    expect(j.byKey.size).toBe(1)
    expect(j.orphans.map((p) => p.key)).toEqual([`8453|${A}|0|MORPHO_BLUE_0xdef`])
  })

  it('keeps a Solana key case-significant', () => {
    const sol = 'solana|9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin|p|KAMINO_HMNm3'
    expect(joinBook([sol], [rec(sol)]).orphans).toEqual([])
    expect(joinBook([sol.toLowerCase()], [rec(sol)]).orphans).toHaveLength(1)
  })

  it('never matches the leg-shaped keys of an index without groups', () => {
    expect(joinBook([`MORPHO_BLUE_0xabc:1:USDe|collateral|0`], [rec(`1|${A}|0|MORPHO_BLUE_0xabc`)]).byKey.size).toBe(0)
  })
})

describe('cardPnlState', () => {
  it('reads the record into words', () => {
    expect(cardPnlState(undefined)).toBe('none')
    expect(cardPnlState(rec('k'))).toBe('ok')
    expect(cardPnlState(rec('k', { pnlUsd: null }))).toBe('unranked')
    expect(cardPnlState(rec('k', { status: 'pending', queuePosition: 3 }))).toBe('drawing')
    expect(cardPnlState(rec('k', { status: 'pending', queuePosition: null }))).toBe('waiting')
    expect(cardPnlState(rec('k', { status: 'no-anchor' }))).toBe('unranked')
  })
})

describe('showableApr', () => {
  it('hides a blown-up lifetime rate', () => {
    expect(showableApr(12.39)).toBe(true)
    expect(showableApr(-624.07)).toBe(false)
    expect(showableApr(null)).toBe(false)
  })
})
