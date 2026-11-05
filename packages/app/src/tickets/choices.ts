import React from 'react'
import type { ChoiceEffects, LendingBook, PositionChoice } from '@yieldcircle/core/sdk/types'
import { blockingLine, pickable, rateChoiceOf } from '@yieldcircle/core/model/choices'
import { capacityAt, clampRate, debtAheadAt, recommendedOf, type UserSetRate } from '@yieldcircle/core/model/userSetRate'
import { useLendingChoices } from '../sdk/queries'

export interface TicketPicker {
  choice: PositionChoice
  value: number
  onValue: (v: number) => void
  /** what the current value gets you */
  readout: ChoiceEffects
}

const useDebounced = <T,>(v: T, ms = 400): T => { const [d, setD] = React.useState(v); React.useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms]); return d }

/**
 * The choices of a NEW position, at the ticket's size: one list of pickers for a rate, a band count
 * and whatever the term sheet declares next (`model/choices.ts`). The answer comes from
 * `/v1/data/lending/choices`, the same rule the API applies to an open; until it lands the row's
 * picks stand, so a rate ticket never waits on it. A position already open keeps its own values:
 * pass `enabled: false`.
 */
export function useTicketChoices(p: {
  uid: string
  enabled: boolean
  u: UserSetRate | null
  /** borrow-token units */
  size: number
  /** the LTV the position opens at, a fraction */
  ltv: number
  book: LendingBook | null
  /** the rate the reader set, null while they have not */
  rate0: number | null
  onRate: (v: number) => void
  debtSymbol: string
  /** the rate when nothing else knows one */
  fallbackApr: number
}) {
  const { u, rate0, book } = p
  const [bands0, setBands] = React.useState<number | null>(null)
  const size = useDebounced(Math.round(p.size * 100) / 100)
  const ltv = useDebounced(Math.round(p.ltv * 1e4) / 1e4)
  const dRate = useDebounced(rate0), dBands = useDebounced(bands0)
  const q = useLendingChoices(p.enabled ? p.uid : '', { size, ltv, rate: dRate ?? undefined, bands: dBands ?? undefined })
  const live = pickable(q.data?.choices)
  const selected = q.data?.selected
  const liveRate = typeof selected?.rate === 'number' ? selected.rate : undefined
  const rate = u ? clampRate(u, rate0 ?? liveRate ?? recommendedOf(u)?.apr ?? p.fallbackApr) : null
  const bands = bands0 ?? (typeof selected?.bands === 'number' ? selected.bands : null)

  const pickers: TicketPicker[] = []
  const rateChoice = live.find((c) => c.id === 'rate') ?? (u ? rateChoiceOf(u) : undefined)
  if (rateChoice && rate != null)
    pickers.push({
      choice: rateChoice, value: rate, onValue: p.onRate,
      readout: q.data && dRate === rate0 ? q.data.outcome : { ahead: { assets: debtAheadAt(book, rate), share: book?.totalDebt ? debtAheadAt(book, rate) / book.totalDebt : 0 }, ...(capacityAt(book, rate) != null ? { capacity: capacityAt(book, rate) } : {}) },
    })
  for (const c of live)
    if (c.id !== 'rate' && (c.id === 'bands' ? bands : selected?.[c.id]) != null)
      pickers.push({ choice: c, value: Number(c.id === 'bands' ? bands : selected?.[c.id]), onValue: c.id === 'bands' ? setBands : () => {}, readout: q.data?.outcome ?? {} })

  return { rate, bands, pickers, blockedBy: blockingLine(q.data?.warnings, p.debtSymbol) }
}
