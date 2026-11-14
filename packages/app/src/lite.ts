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
import { useSettings } from './state/Settings'
import { sharedCache } from './shared'

/**
 * The menu's parts, one for every page that reads it (`shared.ts`): the header's chip, each tab
 * and every sheet call `useLiteMenu`, on every render, and the menu is the whole catalogue named,
 * folded and sorted by a rate read off a month of history.
 */
const rankOf = sharedCache()
const heldOf = sharedCache()
const menuOf = sharedCache()
const keysOf = sharedCache()

/**
 * Lite's menu: the same catalogue, book and rate history every Pro page reads (one cache), cut by
 * `model/lite.ts`, ranked on the steady rate, with who holds each row. Every Lite page starts here.
 *
 * Under a `LiteMenuProvider` it is the provider's menu, read from context (as `useBook` under a
 * `BookProvider`); without one the caller works out its own.
 */
export function useLiteMenu(): LiteMenu {
  const shared = React.useContext(Ctx)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return shared ?? useOwnLiteMenu()
}
export type LiteMenu = ReturnType<typeof useOwnLiteMenu>
const Ctx = React.createContext<LiteMenu | null>(null)
/** One menu for everything under it — the phone's root, inside its `BookProvider` (`book.ts` says why). */
export function LiteMenuProvider({ children }: { children: React.ReactNode }) {
  return React.createElement(Ctx.Provider, { value: useOwnLiteMenu() }, children)
}

function useOwnLiteMenu() {
  const b = useBook()
  // the reader's filters (You → Filters): at their defaults, Lite's own floors
  const { st } = useSettings()
  const get = useRateHistory(b.all, !b.isFetching)
  // a row's steady rate is asked for at every comparison of every sort: worked out once per row and history
  const rank = rankOf([get], () => {
    const seen = new WeakMap<Strategy, number>()
    return (s: Strategy) => { let r = seen.get(s); if (r === undefined) seen.set(s, r = steadyRate(s, get)); return r }
  })
  // the strategy a position is, wherever the catalogue holds it: on the menu, below a floor, or past a desk's cap
  // looked up once per position and catalogue: the lists ask for it per row, and it walks every row there is
  const runs = React.useMemo(() => {
    const seen = new WeakMap<Holding, Strategy | null>()
    return (h: Holding) => {
      let s = seen.get(h)
      if (s === undefined) seen.set(h, s = b.all.find((s) => holdingMatches(s, h)) ?? b.hidden.find((s) => holdingMatches(s, h)) ?? b.overflow.find((s) => holdingMatches(s, h)) ?? null)
      return s ?? undefined
    }
  }, [b.all, b.hidden, b.overflow])
  const heldKey = b.holdings.map((h) => runs(h)?.id).filter((x): x is string => !!x).sort().join('\n')
  const heldIds = heldOf([heldKey], () => new Set(heldKey ? heldKey.split('\n') : []))
  const rows: LiteRow[] = menuOf([b.all, rank, heldIds, st], () => liteMenu(b.all, rank, heldIds, st))
  const keys = keysOf([rows], () => [...new Set(rows.map((r) => bookKeyOf(r.s)).filter((k): k is string => !!k))].sort())
  const proofs = useStrategyProofs(keys)
  const proof = React.useCallback((s: Strategy) => proofOf(s, proofs.data), [proofs.data])
  const holdingsOf = React.useCallback((s: Strategy) => b.holdings.filter((h) => holdingMatches(s, h) && !h.putUp), [b.holdings])
  // the same object until a part of it changes (the book is, too): a page re-renders for news only
  return React.useMemo(() => ({ b, get, rank, rows, floors: st, proof, book: proofs.data, proofsHeld: proofs.current, runs, holdingsOf }), [b, get, rank, rows, st, proof, proofs.data, proofs.current, runs, holdingsOf])
}

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

/**
 * Lite search's recent picks (a strategy or a wallet), newest first, kept on this device: the web's
 * localStorage, the phone's SQLite-backed one (docs/mobile.md). Eight at most.
 */
export interface RecentPick { id: string; title: string; href: string; /** a wallet's address, for its face */ addr?: string }
const RECENT_KEY = 'yc.lite.search.recent'
const readRecent = (): RecentPick[] => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }
const writeRecent = (v: RecentPick[]) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(v)) } catch { /* private window */ } }
export function useRecentPicks() {
  const [recent, setRecent] = React.useState(readRecent)
  const remember = (r: RecentPick) => { const next = [r, ...recent.filter((x) => x.id !== r.id)].slice(0, 8); setRecent(next); writeRecent(next) }
  const clear = () => { setRecent([]); writeRecent([]) }
  return { recent, remember, clear }
}
