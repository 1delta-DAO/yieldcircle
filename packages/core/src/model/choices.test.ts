import { describe, expect, it } from 'vitest'
import type { PositionChoice } from '../sdk/types'
import { blockingLine, effectLines, hasChoices, lockLine, pickable, rateChoiceOf, valueText } from './choices'
import { capacityAt } from './userSetRate'

const money = (x: number) => `$${x}`

describe('choices', () => {
  const u = { min: 0.1, max: 250, cooldownSecs: 604800, recommended: 'protected' as const, picks: [{ id: 'protected' as const, apr: 5.21, debtAhead: 500, share: 0.8, upfrontFeePct: 0.01, capacity: 600 }] }

  it("the row's picks read as a choice, capacity only where the queue fills", () => {
    const c = rateChoiceOf(u)
    expect(c.moves).toEqual(['cost', 'capacity', 'protection'])
    expect(effectLines(c, c.presets![0].effects, money)).toEqual(['fills up to $600', '$500 ahead (80 %)'])
    const { capacity: _c, ...pick } = u.picks[0]
    expect(rateChoiceOf({ ...u, picks: [pick] }).moves).toEqual(['cost', 'protection'])
  })

  it('states the lock the choice carries', () => {
    expect(lockLine(rateChoiceOf(u))).toMatch(/within 7 days/)
    expect(lockLine({ lock: { adjustable: false, cost: 'close-and-reopen' } } as PositionChoice)).toMatch(/closing and reopening/)
  })

  it('renders a value in its unit', () => {
    expect(valueText({ unit: 'count' } as PositionChoice, 20)).toBe('20 bands')
    expect(valueText({ unit: 'percent-apr' } as PositionChoice, 5.2)).toBe('5.20 %')
  })

  it('offers only the knobs a ticket has a control for', () => {
    expect(hasChoices({ debtTerms: { choices: [{ id: 'mode' }] } })).toBe(false)
    expect(hasChoices({ debtTerms: { choices: [{ id: 'bands' }] } })).toBe(true)
    expect(pickable([{ id: 'term' }, { id: 'bands' }] as PositionChoice[]).map((c) => c.id)).toEqual(['bands'])
  })

  it('only a blocking warning stops the ticket', () => {
    expect(blockingLine([{ code: 'NOTHING_AHEAD', blocking: false, choice: 'rate' }], 'USDC')).toBeNull()
    expect(blockingLine([{ code: 'EXCEEDS_CAPACITY', blocking: true, choice: 'rate' }], 'USDC')).toMatch(/cannot fill/)
  })

  it('capacity is idle plus debt strictly below the rate', () => {
    const book = { fill: { idle: 5 }, levels: [{ aprPct: 5, assets: 10, cumulativeAssets: 10 }, { aprPct: 6, assets: 20, cumulativeAssets: 30 }] } as never
    expect(capacityAt(book, 5)).toBe(5)
    expect(capacityAt(book, 5.5)).toBe(15)
    expect(capacityAt(null, 5)).toBeUndefined()
  })
})
