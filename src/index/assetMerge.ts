/**
 * One asset page from two indexes (docs/solana.md decision 2): the EVM index
 * and the Solana index each answer `/assets/:group` in the same shape for
 * their own chains, and a group that lives on both VMs (nOPAL: Ethereum +
 * Plume + Solana) is the sum of the two. Nothing here adapts a shape; it only
 * adds two answers that are disjoint by construction — no market, member or
 * position is on both ledgers.
 *
 * Identity (name, logo, desk, headline, market cap) is the EVM answer's where
 * it has one: that is where DefiLlama and the token-lists metadata live.
 */
import type { AssetDetail, AssetHistory, AssetHolders, AssetSlice } from './types'

const SOL = 'solana'

/** slices with the same key (a protocol on both VMs: none today, but `KAMINO` could appear on EVM) add; shares are recomputed */
function mergeSlices(a: AssetSlice[], b: AssetSlice[]): AssetSlice[] {
  const by = new Map<string, AssetSlice>()
  for (const s of [...a, ...b]) {
    const cur = by.get(s.key)
    by.set(s.key, !cur ? { ...s } : { ...cur, name: cur.name ?? s.name, logo: cur.logo ?? s.logo, usd: cur.usd + s.usd, markets: cur.markets + s.markets })
  }
  const rows = [...by.values()].sort((x, y) => y.usd - x.usd)
  const total = rows.reduce((t, s) => t + s.usd, 0)
  return rows.map((s) => ({ ...s, pct: total > 0 ? (s.usd / total) * 100 : null }))
}

/** the 24 h change of a sum, from each part's change: yesterday's total is each part un-changed */
function change24h(parts: { usd: number; pct: number | null }[]): number | null {
  let now = 0
  let before = 0
  for (const p of parts) {
    if (!p.usd) continue
    if (p.pct == null) return null
    now += p.usd
    before += p.usd / (1 + p.pct / 100)
  }
  return before > 0 ? (now / before - 1) * 100 : null
}

const older = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b)

export function mergeAssetDetail(e: AssetDetail, s: AssetDetail): AssetDetail {
  const te = e.totals
  const ts = s.totals
  const depositsUsd = te.depositsUsd + ts.depositsUsd
  const borrowsUsd = te.borrowsUsd + ts.borrowsUsd
  const solSupply = s.supply.perChain.length > 0
  const markets = [...e.markets, ...s.markets].sort((x, y) => (y.depositsUsd ?? 0) - (x.depositsUsd ?? 0))
  return {
    ...e,
    symbol: e.symbol ?? s.symbol,
    name: e.name ?? s.name,
    logoUri: e.logoUri ?? s.logoUri,
    issuer: e.issuer ?? s.issuer,
    issuerName: e.issuerName ?? s.issuerName,
    issuerExposures: e.issuerExposures ?? s.issuerExposures,
    intrinsicApr: e.intrinsicApr ?? s.intrinsicApr,
    headline: e.headline ?? s.headline,
    price: e.price ?? s.price,
    marketCap: e.marketCap ?? s.marketCap,
    totals: {
      depositsUsd,
      borrowsUsd,
      collateralUsd: te.collateralUsd + ts.collateralUsd,
      liquidityUsd: te.liquidityUsd + ts.liquidityUsd,
      vaultTvlUsd: te.vaultTvlUsd + ts.vaultTvlUsd,
      wrappedUsd: (te.wrappedUsd ?? 0) + (ts.wrappedUsd ?? 0),
      utilization: depositsUsd > 0 ? borrowsUsd / depositsUsd : null,
      depositsChange24hPct: change24h([{ usd: te.depositsUsd, pct: te.depositsChange24hPct }, { usd: ts.depositsUsd, pct: ts.depositsChange24hPct }]),
      asOf: older(te.asOf, ts.asOf),
    },
    supply: {
      perChain: [...e.supply.perChain, ...s.supply.perChain],
      // a Solana copy of an EVM token is a bridge mint (or the reverse): adding them could count one dollar twice
      totalUsd: solSupply ? null : e.supply.totalUsd,
      totalNote: solSupply
        ? e.supply.totalNote ?? 'Not summed across Solana and the EVM chains: a token on both is usually a bridged copy, and adding them would count the same money twice.'
        : e.supply.totalNote,
      coin: e.supply.coin ?? null,
    },
    members: [...e.members, ...s.members],
    byProtocol: mergeSlices(e.byProtocol, s.byProtocol),
    byChain: mergeSlices(e.byChain, s.byChain),
    borrowsByProtocol: mergeSlices(e.borrowsByProtocol, s.borrowsByProtocol),
    collateralByProtocol: mergeSlices(e.collateralByProtocol, s.collateralByProtocol),
    byProtocolChain: [...e.byProtocolChain, ...s.byProtocolChain],
    vaults: [...e.vaults, ...s.vaults].sort((x, y) => (y.tvlUsd ?? 0) - (x.tvlUsd ?? 0)),
    wrappers: [...(e.wrappers ?? []), ...(s.wrappers ?? [])].sort((x, y) => (y.tvlUsd ?? 0) - (x.tvlUsd ?? 0)),
    markets,
    marketCount: (e.marketCount ?? e.markets.length) + (s.marketCount ?? s.markets.length),
    chainCount: (e.chainCount ?? new Set(e.markets.map((m) => m.chainId)).size) + (s.chainCount ?? new Set(s.markets.map((m) => m.chainId)).size),
    notes: [...new Set([...e.notes, ...s.notes])],
  }
}

export function mergeAssetHolders(e: AssetHolders, s: AssetHolders, limit: number): AssetHolders {
  const ie = e.impaired
  const is = s.impaired
  return {
    // an EVM and a Solana address are never the same string, so the lists only interleave
    holders: [...e.holders, ...s.holders].sort((x, y) => y.amountUsd - x.amountUsd).slice(0, limit),
    note: e.note,
    impaired: !ie ? is : !is ? ie : { positions: ie.positions + is.positions, wallets: ie.wallets + is.wallets, faceUsd: ie.faceUsd + is.faceUsd },
  }
}

export function mergeAssetHistory(e: AssetHistory, s: AssetHistory): AssetHistory {
  if (!s.points.length) return e
  if (!e.points.length) return s
  // the Solana ledger starts 2026-10-02: a shorter series added onto a longer one draws its first day as an inflow
  if (s.points[0].day > e.points[0].day) return e
  const days = new Map<string, AssetHistory['points'][number]>()
  for (const p of [...e.points, ...s.points]) {
    const cur = days.get(p.day)
    if (!cur) { days.set(p.day, { ...p, byProtocol: { ...p.byProtocol } }); continue }
    cur.depositsUsd += p.depositsUsd
    cur.borrowsUsd += p.borrowsUsd
    cur.collateralUsd += p.collateralUsd
    for (const [k, v] of Object.entries(p.byProtocol)) cur.byProtocol[k] = (cur.byProtocol[k] ?? 0) + v
  }
  const protocols = [...e.protocols, ...s.protocols.filter((p) => !e.protocols.some((q) => q.key === p.key))]
  return { ...e, protocols, points: [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1)) }
}

/** whether an answer counts the group's Solana half (the merge ran, or the Solana index answered alone) */
export const countsSolana = (d: AssetDetail | undefined) =>
  !!d && (d.members.some((m) => m.chainId === SOL) || d.markets.some((m) => m.chainId === SOL))
