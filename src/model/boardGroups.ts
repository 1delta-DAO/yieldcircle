/**
 * The board by STRATEGY (docs/board-strategies.md): one row per strategy, its
 * face the best holder. When one loop pays best, every wallet that runs it
 * lined up behind each other — Solana's top 50 was 29× one AUTO/wYLDS loop —
 * so the ranked unit is what is run, not who runs it twice.
 *
 * The index groups (`/earners?group=strategy`, pos-indexer
 * docs/strategy-book.md). This is the same fold for an index that predates
 * it: the app asks its flat top 200 and folds them here — so a strategy whose
 * best holder ranks 201st is missing, which the board says.
 *
 * `primaryStrategyKey` is a COPY of pos-indexer
 * `position-store/src/strategyBook.ts::primaryStrategyKey`. Change both or
 * neither: a key that drifts files the same position under two rows.
 */
import type { EarnerLeg, EarnerRow, EarnersSort, StrategyGroup, StrategyBoardRow } from '../index/api'

const isDebt = (side: string) => side === 'borrow' || side === 'debt'
const largest = (legs: EarnerLeg[]) =>
  legs.reduce<EarnerLeg | null>((best, l) => {
    if (!best) return l
    const a = Math.abs(l.amountUsd ?? 0), b = Math.abs(best.amountUsd ?? 0)
    return a > b || (a === b && l.marketUid < best.marketUid) ? l : best
  }, null)

/**
 * The ONE strategy a position is ranked under. The strategy book files a
 * multi-collateral account under every (held, debt) pair — the wallet does run
 * each — but a board must count a position once: its largest held leg × its
 * largest debt leg (`loop:<held>|<debt>`), or with no debt its largest held
 * leg (`dep:<uid>`). Both legs may be one uid (a Jupiter Lend vault). Unlike
 * the book, a phantom or underwater position still has a key: `preset=all`
 * shows those rows. Null = nothing to key it by; that row is its own group.
 */
export function primaryStrategyKey(legs: (EarnerLeg & { foreignCollateral?: boolean })[]): string | null {
  const held = largest(legs.filter((l) => !isDebt(l.side) && !l.foreignCollateral && l.amountUsd != null && l.amountUsd > 0))
  if (!held) return null
  const debts = legs.filter((l) => isDebt(l.side))
  if (!debts.length) return `dep:${held.marketUid}`
  const debt = largest(debts.filter((l) => l.amountUsd != null && Math.abs(l.amountUsd) > 0))
  return debt ? `loop:${held.marketUid}|${debt.marketUid}` : null
}

/** The row's group key: the index's own when it sent one, else the copy above; a keyless row stands alone. */
export const groupKeyOf = (r: EarnerRow) => r.strategyKey ?? primaryStrategyKey(r.legs) ?? `pos:${r.key}`

export const kindOfKey = (key: string): StrategyGroup['kind'] =>
  key.startsWith('loop:') ? 'loop' : key.startsWith('dep:') ? 'deposit' : 'position'

/**
 * The figure the board ranks a single position on: the 24 h APR (the servers' default window),
 * its yearly carry, or what it made (pos-indexer tickets/0084: its lifetime PnL, or the yield).
 */
const aprOf = (r: EarnerRow) => r.apr24hPct ?? r.netAprPct
const rankOf = (r: EarnerRow, sort: EarnersSort) =>
  sort === 'apr' ? aprOf(r)
  : sort === 'pnl' ? r.lifetime?.pnlUsd ?? null
  : sort === 'yield' ? r.lifetime?.yieldUsd ?? null
  : r.annualUsd
/** Σ of a figure over the members that have it; null when none does — never a zero */
const sumOf = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x))
  return v.length ? v.reduce((a, b) => a + b, 0) : null
}
const desc = (a: number | null, b: number | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : b - a)
const minMax = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x))
  return v.length ? [Math.min(...v), Math.max(...v)] as const : [null, null] as const
}

/**
 * Fold ranked position rows into strategy rows, ranked as the index ranks
 * them: on APR by each strategy's BEST position (a real, held figure — today's
 * board with its repeats folded under their best), on $/day by the Σ of what
 * the strategy pays all its holders a day ("where the money is"). Every row is
 * its best position's own row, with the group beside it.
 */
export function groupByStrategy(rows: EarnerRow[], sort: EarnersSort): StrategyBoardRow[] {
  const groups = new Map<string, EarnerRow[]>()
  for (const r of rows) {
    const k = groupKeyOf(r)
    const g = groups.get(k)
    if (g) g.push(r)
    else groups.set(k, [r])
  }
  const out: StrategyBoardRow[] = []
  for (const [key, members] of groups) {
    members.sort((a, b) => desc(rankOf(a, sort), rankOf(b, sort)))
    const best = members[0]
    const equityUsd = members.reduce((s, r) => s + r.equityUsd, 0)
    const priced = members.filter((r) => r.annualUsd != null)
    const annualUsd = priced.length ? priced.reduce((s, r) => s + r.annualUsd!, 0) : null
    const [aprMin, aprMax] = minMax(members.map(aprOf))
    const [leverageMin, leverageMax] = minMax(members.map((r) => r.leverage))
    const since = members.map((r) => r.since).filter((s): s is string => !!s).sort()
    const strategy: StrategyGroup = {
      key,
      kind: kindOfKey(key),
      wallets: new Set(members.map((r) => r.account)).size,
      positions: members.length,
      equityUsd,
      annualUsd,
      perDayUsd: annualUsd === null ? null : annualUsd / 365,
      aprPct: annualUsd !== null && equityUsd > 0 ? (annualUsd / equityUsd) * 100 : null,
      aprMin,
      aprMax,
      leverageMin,
      leverageMax,
      faces: [...new Set(members.map((r) => r.account))].slice(0, 3),
      firstSince: since[0] ?? null,
      pnlUsd: sumOf(members.map((r) => r.lifetime?.pnlUsd)),
      yieldUsd: sumOf(members.map((r) => r.lifetime?.yieldUsd)),
    }
    out.push({ ...best, strategyKey: key, strategy })
  }
  return out.sort((a, b) => desc(groupRank(a, sort), groupRank(b, sort)))
}

/** What strategy rows are ranked, and merged across the two indexes, by: the best's APR, or the members' dollars summed. */
export const groupRank = (r: StrategyBoardRow, sort: EarnersSort) =>
  sort === 'apr' ? aprOf(r)
  : sort === 'pnl' ? r.strategy.pnlUsd ?? null
  : sort === 'yield' ? r.strategy.yieldUsd ?? null
  : r.strategy.annualUsd

/** A strategy whose first holder on the board opened less than a week ago: what is starting, not just what is big. */
export const isNewStrategy = (g: StrategyGroup, now = Date.now()) =>
  !!g.firstSince && now - Date.parse(g.firstSince) < 7 * 86_400_000
