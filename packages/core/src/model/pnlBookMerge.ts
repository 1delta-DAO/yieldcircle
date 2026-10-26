import type { AccountPnlBook, PnlBookPoint } from '../index/types'

/** how many strategies keep their own line, as each index draws them (`BOOK_SERIES_STRATEGIES`) */
const LINES = 8

/**
 * Several wallets' PnL books as one (tickets/0018): an owner with an EVM and a Solana wallet has a
 * book on each index, and "What you made" is over both. Folded by the index's own rules
 * (pos-indexer docs/lifetime-pnl.md "The wallet book") so the result reads as one index's answer:
 * figures summed, the APR Σ PnL ÷ Σ capital-days (never a mean of rates), the lines summed on one
 * calendar where a line is 0 before its first day and holds its last value after it. Strategy and
 * position keys carry the chain, so two indexes' never collide.
 */
export function mergeBooks(books: readonly AccountPnlBook[]): AccountPnlBook | null {
  if (books.length <= 1) return books[0] ?? null
  const sum = (f: (b: AccountPnlBook) => number) => books.reduce((t, b) => t + f(b), 0)
  const pnlUsd = sum((b) => b.total.pnlUsd), yieldUsd = sum((b) => b.total.yieldUsd), capitalDays = sum((b) => b.total.capitalDays)
  const apr = (v: number) => (capitalDays > 0 ? (v / capitalDays) * 365 * 100 : null)
  const open = books.map((b) => b.total.openDays).filter((d): d is number => d != null)
  const withLine = books.every((b) => b.coverage.withLine != null) ? sum((b) => b.coverage.withLine!) : undefined
  const unranked: Record<string, number> = {}
  for (const b of books) for (const [k, n] of Object.entries(b.coverage.unranked)) unranked[k] = (unranked[k] ?? 0) + n
  // the value share each book's figure covers, weighted by that book's equity
  const shared = books.filter((b) => b.coverage.equityShare != null)
  const eq = shared.reduce((t, b) => t + Math.abs(b.total.equityUsd), 0)
  const equityShare = shared.length === 0 ? null : eq > 0 ? shared.reduce((t, b) => t + b.coverage.equityShare! * Math.abs(b.total.equityUsd), 0) / eq : shared[0].coverage.equityShare
  const strategies = books.flatMap((b) => b.strategies).sort((x, y) => Math.abs(y.pnlUsd) - Math.abs(x.pnlUsd))
    .map((s, i) => (i < LINES ? s : { ...s, series: null }))
  const requested = books.map((b) => b.requestedAt).filter((t): t is string => !!t).sort()
  const anyUnsupported = books.some((b) => b.unsupported != null)
  return {
    account: books.map((b) => b.account).join(','),
    total: {
      pnlUsd, yieldUsd, directionalUsd: sum((b) => b.total.directionalUsd), capitalDays,
      pnlAprPct: apr(pnlUsd), yieldAprPct: apr(yieldUsd),
      openDays: open.length ? Math.max(...open) : null,
      positions: sum((b) => b.total.positions), equityUsd: sum((b) => b.total.equityUsd),
    },
    coverage: {
      positions: sum((b) => b.coverage.positions), withPnl: sum((b) => b.coverage.withPnl), withLine,
      pending: sum((b) => b.coverage.pending), unranked, equityShare,
    },
    series: sumSeries(books.map((b) => b.series)),
    strategies,
    positions: books.flatMap((b) => b.positions),
    requestedAt: requested[0] ?? null,
    ...(anyUnsupported ? { unsupported: books.flatMap((b) => b.unsupported ?? []) } : {}),
  }
}

/** Lines summed on the union of their days: 0 before a line starts, its last value after it ends. */
export function sumSeries(lines: readonly PnlBookPoint[][]): PnlBookPoint[] {
  const drawn = lines.filter((l) => l.length > 0)
  if (drawn.length <= 1) return drawn[0] ?? []
  const ts = [...new Set(drawn.flatMap((l) => l.map((p) => p.t)))].sort((a, b) => Date.parse(a) - Date.parse(b))
  const at = drawn.map(() => -1)
  return ts.map((t) => {
    const ms = Date.parse(t)
    const pt: PnlBookPoint = { t, pnl: 0, yield: 0, nav: 0 }
    drawn.forEach((l, i) => {
      while (at[i] + 1 < l.length && Date.parse(l[at[i] + 1].t) <= ms) at[i]++
      const p = at[i] >= 0 ? l[at[i]] : null
      if (p) { pt.pnl += p.pnl; pt.yield += p.yield; pt.nav += p.nav }
    })
    return pt
  })
}
