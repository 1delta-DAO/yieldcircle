/**
 * The paper ledger in the app's own shapes (tickets/0006 §A): `Holding` for every position and
 * `Idle` for the bank, so `useBook` hands paper money to every screen exactly as it hands real
 * money — the positions sheet, the asset pages, the tickets, the chip — with no second code path.
 */
import type { TokenBalance } from '../sdk/types'
import { idleFrom, type Holding, type Idle } from './positions'
import { knownTokens, legPrices, tokenKey, valueOf, type PaperLedger, type PaperPosition, type PriceFn } from './paper'

/** What a bank token is called: its symbol, decimals and logo, keyed `chainId:token`. */
export type TokenMeta = Record<string, { symbol: string; decimals: number; logo?: string }>
export const metaKey = (chainId: string, token: string) => `${chainId}:${tokenKey(chainId, token)}`
const STARTER_META: TokenMeta = Object.fromEntries(knownTokens().map((t) => [metaKey(t.chainId, t.address), { symbol: t.symbol, decimals: t.decimals }]))
/** Every name the ledger itself can vouch for: the starter bank and every position's legs. */
export function ledgerMeta(l: PaperLedger | null): TokenMeta {
  const m: TokenMeta = { ...STARTER_META }
  for (const p of l?.positions ?? []) for (const leg of [p.snap.held, p.snap.debt]) if (leg) m[metaKey(p.chainId, leg.address)] ??= { symbol: leg.symbol, decimals: leg.decimals, logo: leg.logo }
  return m
}

/** The bank on one chain, as the balance route would answer it — then through the same `idleFrom` a real wallet goes through. */
export function paperBalances(l: PaperLedger, chainId: string, price: PriceFn, meta: TokenMeta): TokenBalance[] {
  const out: TokenBalance[] = []
  for (const [token, units] of Object.entries(l.bank[chainId] ?? {})) {
    if (!(units > 0)) continue
    const m = meta[metaKey(chainId, token)]
    const p = price(chainId, token)
    const decimals = m?.decimals ?? 18
    out.push({ address: token, symbol: m?.symbol ?? '?', decimals, balanceRaw: rawOf(units, decimals), balance: String(units), priceUSD: p, balanceUSD: p != null ? units * p : undefined })
  }
  return out
}
export function paperIdle(l: PaperLedger, chainIds: string[], price: PriceFn, meta: TokenMeta): Idle[] {
  return chainIds.flatMap((c) => idleFrom(paperBalances(l, c, price, meta), c))
}
const rawOf = (units: number, decimals: number) => {
  // a display figure: exact enough for a balance read, never sent anywhere
  try { return BigInt(Math.floor(units * 10 ** Math.min(decimals, 15))).toString() + '0'.repeat(Math.max(0, decimals - 15)) } catch { return '0' }
}

/** The rate as the menu says it: a 'live' position accrues without its token's own yield, but that yield is still what it pays. */
export const shownApr = (p: PaperPosition) => p.rate.supply + (p.snap.mode === 'live' ? p.rate.intrinsic ?? 0 : 0)

export function paperHoldings(l: PaperLedger, at: number, price: PriceFn): Holding[] {
  return l.positions.map((p): Holding => {
    const v = valueOf(p, at, price)
    const s = p.snap
    const base = {
      key: `paper:${p.id}`, chainId: p.chainId, group: s.group as Holding['group'], asset: s.asset, label: s.label, venue: s.venue,
      valueUsd: v.equityUsd, logo: s.logo ?? s.held.logo, amount: v.units, symbol: s.held.symbol, decimals: s.held.decimals, maturity: s.maturity, paper: true as const,
    }
    if (p.kind === 'simple') return { ...base, kind: 'simple', apr: shownApr(p), earnUid: s.earnUid, assetAddress: s.held.address }
    const net = v.equityUsd > 0 ? (v.heldUsd * shownApr(p) - v.debtUsd * p.rate.borrow) / v.equityUsd : undefined
    if (p.kind === 'borrow') return {
      ...base, kind: 'borrow', apr: net, health: v.health, earnUid: s.marketUid,
      collateralUid: s.marketUid, debtUid: s.debtUid, debtSymbol: s.debt?.symbol, debtAmount: v.debtUnits,
      collateralAddress: s.held.address, debtAddress: s.debt?.address, lender: s.lender, collateralUsd: v.heldUsd,
    }
    return {
      ...base, kind: 'loop', apr: net, health: v.health, leverage: v.leverage ?? undefined, earnUid: s.marketUid, directional: false,
      collateralUid: s.marketUid, debtUid: s.debtUid, debtSymbol: s.debt?.symbol, debtAmount: v.debtUnits,
      collateralAddress: s.held.address, debtAddress: s.debt?.address, lender: s.lender, collateralUsd: v.heldUsd,
    }
  })
}

const DAY = 86_400_000

/** One open paper position's lifetime figure, the shape the real book's rows have (`boardPositions`). */
export interface PaperPnlPosition {
  key: string
  title: string
  sub: string
  pnlUsd: number
  /** farming: what the rate earned (the position at its open prices) */
  yieldUsd: number
  /** the legs' prices since the open (a peg position: its money's move only) */
  priceUsd: number
  aprPct: number | null
  equityUsd: number
  since: string
}

/**
 * The paper account's "What you made" in the real wallet book's shape (pos-indexer
 * docs/lifetime-pnl.md "The wallet book"), so Lite's You page and the wallet page render paper
 * and real money the same way: one figure, how much of it was farming and how much price, an APR
 * on what was in, and each position's own figure.
 *
 * Display only — nothing here is in `paper.ts` (the model the server runs), and nothing changes
 * what `bookOf` ranks. The split, per open position: `price` = the units held now × each leg's
 * move since its open price (`snap.*.priceUsd`, stamped at the open), `yield` = the rest. A
 * position added to later (`into`) keeps its first open's prices, so units bought after a move
 * book that move as price and the same amount as a farming loss — the total is exact, the split
 * approximate there. `realizedUsd` (closes, swaps, bridges, fees) has no split: it counts as
 * farming, and `frictionUsd` says how much of it was cost. The APR is the open positions' PnL over
 * their basis × days open (≥ 1 day), the real book's capital-days rule with the basis as capital.
 */
export function paperPnlBook(l: PaperLedger, at: number, price: PriceFn) {
  let open = 0, priceUsd = 0, capDays = 0, openPnl = 0
  const positions: PaperPnlPosition[] = []
  for (const p of l.positions) {
    const v = valueOf(p, at, price)
    const { pHeld, pDebt } = legPrices(p, price)
    const px = v.units * (pHeld - p.snap.held.priceUsd) - (p.snap.debt ? v.debtUnits * (pDebt - p.snap.debt.priceUsd) : 0)
    const days = (at - p.openedAt) / DAY
    const cap = days >= 1 && p.basisUsd > 0 ? p.basisUsd * days : 0
    open += v.pnlUsd
    priceUsd += px
    if (cap > 0) { capDays += cap; openPnl += v.pnlUsd }
    positions.push({
      key: p.id,
      title: p.snap.label,
      sub: `${p.kind === 'simple' ? 'Deposit' : `Levered · borrows ${p.snap.debt?.symbol ?? ''}`} · ${p.snap.venue}`,
      pnlUsd: v.pnlUsd,
      yieldUsd: v.pnlUsd - px,
      priceUsd: px,
      aprPct: cap > 0 ? (v.pnlUsd / cap) * 365 * 100 : null,
      equityUsd: v.equityUsd,
      since: new Date(p.openedAt).toISOString(),
    })
  }
  const pnlUsd = l.realizedUsd + open
  return {
    total: { pnlUsd, yieldUsd: pnlUsd - priceUsd, directionalUsd: priceUsd, pnlAprPct: capDays > 0 ? (openPnl / capDays) * 365 * 100 : null },
    // every paper position has its figure at once: nothing waits to be drawn. With none open, the
    // realized part still counts as one line
    coverage: { positions: Math.max(1, positions.length), withPnl: positions.length || (Math.abs(l.realizedUsd) > 0.005 ? 1 : 0) },
    realizedUsd: l.realizedUsd,
    positions: positions.sort((a, b) => b.pnlUsd - a.pnlUsd),
  }
}
