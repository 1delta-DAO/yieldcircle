import React from 'react'
import { useBook } from './book'
import { useRateHistory } from './sdk/queries'
import { steadyRate } from '@yieldcircle/core/model/rateHistory'
import { useStrategyProofs } from './index/queries'
import { bookKeyOf, canonUid, uidOf } from '@yieldcircle/core/model/uid'
import { proofOf, recommendAll } from '@yieldcircle/core/model/activity'
import { holdingMatches, liteMenu, noteDay, pointsOf, streakOf, dayKey, type DayMark, type LiteRow } from '@yieldcircle/core/model/lite'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { totalsOf, type Holding } from '@yieldcircle/core/model/positions'

/**
 * Lite's menu: the same catalogue, book and rate history every Pro page reads (one cache), cut by
 * `model/lite.ts`, ranked on the steady rate, with who holds each row. Every Lite page starts here.
 */
export function useLiteMenu() {
  const b = useBook()
  const get = useRateHistory(b.all, !b.isFetching)
  const rank = React.useCallback((s: Strategy) => steadyRate(s, get), [get])
  // the strategy a position is, wherever the catalogue holds it: on the menu, below a floor, or past a desk's cap
  const runs = (h: Holding) => b.all.find((s) => holdingMatches(s, h)) ?? b.hidden.find((s) => holdingMatches(s, h)) ?? b.overflow.find((s) => holdingMatches(s, h))
  const heldIds = new Set(b.holdings.map((h) => runs(h)?.id).filter((x): x is string => !!x))
  const rows: LiteRow[] = liteMenu(b.all, rank, heldIds)
  const keys = [...new Set(rows.map((r) => bookKeyOf(r.s)).filter((k): k is string => !!k))].sort()
  const proofs = useStrategyProofs(keys)
  const proof = (s: Strategy) => proofOf(s, proofs.data)
  return { b, get, rank, rows, proof, book: proofs.data, proofsHeld: proofs.current, runs, holdingsOf: (s: Strategy) => b.holdings.filter((h) => holdingMatches(s, h) && !h.putUp) }
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

/** Lite home's three lenses on the same rows (docs/lite.md §1). */
export type Lens = 'proven' | 'trending' | 'held'
export const LENSES: { id: Lens; word: string; why: string }[] = [
  { id: 'proven', word: 'Proven', why: 'held by a crowd of real wallets, and paying for the attention it asks' },
  { id: 'trending', word: 'Trending', why: 'where money moved in over the last week' },
  { id: 'held', word: 'Most held', why: 'the most money real wallets have in it' },
]

/** The cards each lens shows, out of Lite's own rows only — six at most, one per row. */
export function liteCards(lens: Lens, rows: LiteRow[], L: Pick<LiteMenu, 'book' | 'rank' | 'proof'>, trending: { marketUid?: string | null; netUsd: number }[]): LiteRow[] {
  const by = new Map(rows.map((r) => [r.s.id, r]))
  if (lens === 'proven') {
    // the beginner page's own recommender (model/activity.ts), over Lite's rows, per money
    const out: LiteRow[] = []
    for (const g of ['USD', 'ETH', 'BTC', 'MORE'] as const) {
      const rec = recommendAll(rows.filter((r) => r.s.group === g).map((r) => r.s), L.book, L.rank)
      for (const band of ['passive', 'medium', 'active'] as const) for (const p of rec[band]) { const r = by.get(p.s.id); if (r && !out.includes(r)) out.push(r) }
    }
    // a crowd's proof first, then the rest in the recommender's order (a stable sort keeps it)
    const crowd = (r: LiteRow) => ((L.proof(r.s)?.wallets ?? 0) >= 3 ? 1 : 0)
    return out.sort((a, b) => crowd(b) - crowd(a)).slice(0, 6)
  }
  if (lens === 'held') return rows.filter((r) => (L.proof(r.s)?.totalUsd ?? 0) > 0).sort((a, b) => (L.proof(b.s)?.totalUsd ?? 0) - (L.proof(a.s)?.totalUsd ?? 0)).slice(0, 6)
  const at = (u: string | null | undefined) => (u ? (canonUid(u) ?? u).toLowerCase() : '')
  const rank = new Map<string, number>()
  for (const m of trending) if (m.netUsd > 0) { const k = at(m.marketUid); if (k && !rank.has(k)) rank.set(k, m.netUsd) }
  return rows.map((r) => ({ r, n: rank.get(at(uidOf(r.s))) ?? 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).map((x) => x.r).slice(0, 6)
}
