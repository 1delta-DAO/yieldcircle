/**
 * The paper ledger in the app's own shapes (tickets/0006 §A): `Holding` for every position and
 * `Idle` for the bank, so `useBook` hands paper money to every screen exactly as it hands real
 * money — the positions sheet, the asset pages, the tickets, the chip — with no second code path.
 */
import type { TokenBalance } from '../sdk/types'
import { idleFrom, type Holding, type Idle } from './positions'
import { knownTokens, tokenKey, valueOf, type PaperLedger, type PaperPosition, type PriceFn } from './paper'

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
