/**
 * The knobs a borrower turns, in one shape (`/v1/data/lending/choices`, lending-sdks
 * docs/terms/POSITION_CHOICES_PLAN.md): a rate they set, a band count, a liquidation LTV. Everything
 * here reads a `PositionChoice` and never a lender, so a new lender with a knob needs no code.
 *
 * Numbers are percent APR and borrow-token units, like the API.
 */
import type { ChoiceEffects, ChoiceWarning, OptimizerRowRaw, PositionChoice, RatePickId } from '../sdk/types'
import { PICK_WORD, type UserSetRate } from './userSetRate'

/** The ids a ticket offers a control for. Term and mode have their own selectors. */
const PICKABLE = new Set(['rate', 'bands', 'liqLtv'])

/** Does this row's debt leg have a knob a ticket should offer? */
export function hasChoices(r: Pick<OptimizerRowRaw, 'debtTerms'>): boolean {
  return !!r.debtTerms?.choices?.some((c) => PICKABLE.has(c.id))
}

/** The pickable choices of a resolved list, in the order they are made. */
export const pickable = (list: PositionChoice[] | undefined): PositionChoice[] => (list ?? []).filter((c) => PICKABLE.has(c.id))

/** The row's picks as a choice: what the ticket shows until the live answer lands. */
export function rateChoiceOf(u: UserSetRate): PositionChoice {
  const fills = u.picks.some((p) => p.capacity != null)
  return {
    id: 'rate', kind: 'interest-rate', param: { name: 'interestRate', encoding: 'wad-fraction' }, unit: 'percent-apr',
    domain: { min: u.min, max: u.max, step: 0.01 },
    moves: fills ? ['cost', 'capacity', 'protection'] : ['cost', 'protection'],
    presets: u.picks.map((p) => ({ id: p.id, value: p.apr, effects: { aprPct: p.apr, upfrontFeePct: p.upfrontFeePct, ahead: { assets: p.debtAhead, share: p.share }, ...(p.capacity != null ? { capacity: p.capacity } : {}) } })),
    ...(u.recommended ? { recommended: u.recommended } : {}),
    lock: { adjustable: true, ...(u.cooldownSecs ? { cooldownSecs: u.cooldownSecs } : {}), cost: 'upfront-fee-again' },
    ...(u.pressure ? { pressure: u.pressure } : {}),
  }
}

const BAND_WORD: Record<RatePickId, string> = { cheapest: 'Highest LTV', balanced: 'Market default', protected: 'Widest range' }

/** A preset's name: the stance is shared, the word belongs to the kind. */
export const presetWord = (c: PositionChoice, id: RatePickId): string => (c.id === 'bands' ? BAND_WORD[id] : PICK_WORD[id])

/** A value in the choice's unit, as a reader sees it. */
export function valueText(c: PositionChoice, v: number | string): string {
  const n = Number(v)
  if (c.unit === 'percent-apr' || c.unit === 'percent-ltv') return `${n.toFixed(2)} %`
  if (c.unit === 'count') return `${n} bands`
  return String(v)
}

/** One line per axis the choice moves, for a preset or a custom value. `money` formats borrow-token units. */
export function effectLines(c: PositionChoice, e: ChoiceEffects, money: (x: number) => string): string[] {
  const out: string[] = []
  if (c.moves.includes('capacity')) {
    if (e.capacity != null) out.push(`fills up to ${money(e.capacity)}`)
    if (e.maxLtv != null) out.push(`max LTV ${(e.maxLtv * 100).toFixed(1)} %`)
  }
  if (c.moves.includes('protection')) {
    if (e.ahead) out.push(`${money(e.ahead.assets)} ahead (${Math.round(e.ahead.share * 100)} %)`)
    if (e.rangeWidth != null) out.push(`range ${(e.rangeWidth * 100).toFixed(1)} % of the price`)
  }
  return out
}

/** What changing it later costs, or null when nothing needs saying. */
export function lockLine(c: PositionChoice): string | null {
  if (!c.lock.adjustable) return 'Fixed for the life of the loan: changing it means closing and reopening.'
  if (c.lock.cost !== 'upfront-fee-again') return null
  const days = c.lock.cooldownSecs ? Math.round(c.lock.cooldownSecs / 86400) : null
  return days ? `Changing it within ${days} days pays the upfront fee again.` : 'Changing it pays the upfront fee again.'
}

/** The warning that stops the ticket, in words; null when nothing does. */
export function blockingLine(warnings: ChoiceWarning[] | undefined, debtSymbol: string): string | null {
  const w = warnings?.find((x) => x.blocking)
  if (!w) return null
  if (w.code === 'EXCEEDS_CAPACITY') return `This rate cannot fill the loan: raise it or borrow less ${debtSymbol}. A new loan only redeems loans paying less than it.`
  if (w.code === 'LTV_ABOVE_MAX') return 'This setting cannot carry the loan at this size: pick fewer bands or borrow less.'
  return 'This combination cannot open.'
}
