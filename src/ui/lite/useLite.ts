import React from 'react'
import { useBook } from '../useBook'
import { useRateHistory } from '../../sdk/queries'
import { steadyRate } from '../../model/rateHistory'
import { useStrategyProofs } from '../../index/queries'
import { bookKeyOf } from '../../model/uid'
import { proofOf } from '../../model/activity'
import { holdingMatches, liteMenu, noteDay, pointsOf, streakOf, dayKey, type DayMark, type LiteRow } from '../../model/lite'
import type { Strategy } from '../../model/strategies'
import type { Holding } from '../../model/positions'
import { totalsOf } from '../Positions'

/**
 * Lite's menu: the same catalogue, book and rate history every Pro page reads (one cache), cut by
 * `model/lite.ts`, ranked on the steady rate, with who holds each row. Every Lite page starts here.
 */
export function useLiteMenu() {
  const b = useBook()
  const get = useRateHistory(b.all, !b.isFetching)
  const rank = React.useCallback((s: Strategy) => steadyRate(s, get), [get])
  const runs = (h: Holding) => b.all.find((s) => holdingMatches(s, h))
  const heldIds = new Set(b.holdings.map((h) => runs(h)?.id).filter((x): x is string => !!x))
  const rows: LiteRow[] = liteMenu(b.all, rank, heldIds)
  const keys = [...new Set(rows.map((r) => bookKeyOf(r.s)).filter((k): k is string => !!k))].sort()
  const proofs = useStrategyProofs(keys)
  const proof = (s: Strategy) => proofOf(s, proofs.data)
  return { b, get, rank, rows, proof, book: proofs.data, proofsHeld: proofs.current, runs, holdingsOf: (s: Strategy) => b.holdings.filter((h) => holdingMatches(s, h)) }
}
export type LiteMenu = ReturnType<typeof useLiteMenu>

/**
 * The days this reader had money at work, as this device saw them (docs/lite-plan.md phase 4):
 * the live book is the only source for the connected wallet's own positions (docs/apis.md), so the
 * streak is noted when the app is open, never read back from the index. Kept per wallet, and per
 * paper account apart from it.
 */
const LOG = (who: string) => `yc.lite.days.${who.toLowerCase()}`
function readLog(who: string): DayMark[] {
  try { const v = JSON.parse(localStorage.getItem(LOG(who)) ?? '[]') as DayMark[]; return Array.isArray(v) ? v.filter((x) => typeof x?.d === 'string' && typeof x?.work === 'number') : [] } catch { return [] }
}
export function useDayLog(b: ReturnType<typeof useBook>) {
  const who = b.account ? (b.paper ? `paper:${b.account}` : b.account) : ''
  const [log, setLog] = React.useState<DayMark[]>(() => (who ? readLog(who) : []))
  React.useEffect(() => { setLog(who ? readLog(who) : []) }, [who])
  const work = totalsOf(b).work
  const ready = !!who && !b.positionsLoading
  React.useEffect(() => {
    if (!ready) return
    const next = noteDay(readLog(who), dayKey(), work)
    try { localStorage.setItem(LOG(who), JSON.stringify(next)) } catch { /* private mode: the streak lives for this visit */ }
    setLog(next)
  }, [ready, who, Math.round(work)]) // eslint-disable-line react-hooks/exhaustive-deps
  return { log, streak: streakOf(log, dayKey()), points: pointsOf(log), days: log.length }
}
