/**
 * Positions in the simple app's shape: group → asset → idle (wallet) + strategies. Built from
 * `/v1/data/earn/positions` (vault rows are standalone; a lending account with debt is a loop,
 * one without is a plain deposit per leg) and `/v1/data/token/balances` for idle.
 */
import type { EarnPosition, TokenBalance, VaultListing } from '../sdk/types'
import { baseOfSymbol, groupOf, sameMoney, type GroupId } from './assets'
import { marketTag } from './market'
import { venueLabel } from './strategies'

export interface Holding {
  key: string
  chainId: string
  group: GroupId
  asset: string
  kind: 'simple' | 'loop'
  label: string
  venue: string
  valueUsd: number
  apr?: number
  health?: number | null
  leverage?: number
  earnUid?: string
  logo?: string
  /** a loop whose debt is in another group (ETH / USDC): a directional bet, not a simple-mode strategy */
  directional?: boolean
  /** what is held, in token units, and the token: vault assets, a lending deposit, or a loop's collateral */
  amount: number
  symbol: string
  decimals: number
  /** loop legs, for a close / reduce */
  collateralUid?: string
  debtUid?: string
  debtSymbol?: string
  debtAmount?: number
  accountId?: string
  lender?: string
}
/**
 * `vaults` is the registry the catalogue already loads (`VaultListing`): the
 * positions route names a vault the same way the listing does — `USDC · 0x5b8b`
 * — so without it a held vault reads as its asset and an address tail. Keyed
 * `chainId:address`, optional, decoration only.
 */
export function holdingsFrom(items: EarnPosition[], vaults: Record<string, VaultListing> = {}): Holding[] {
  const out: Holding[] = []
  for (const p of items) {
    if (p.venueKind === 'vault') {
      const asset = baseOfSymbol(p.asset.symbol); if (!asset || p.suppliedUsd < 0.5) continue
      const v = vaults[`${p.chainId}:${String(p.vault ?? '').toLowerCase()}`]
      const brand = p.brand ?? v?.curatorName ?? p.venue
      out.push({ key: p.positionUid, chainId: p.chainId, group: groupOf(asset), asset, kind: 'simple', label: `${v?.name ?? p.name ?? asset} · ${brand}`, venue: brand, valueUsd: p.suppliedUsd, apr: p.apr ?? p.rate?.total, earnUid: p.earnUid, logo: p.logoURI,
        amount: parseFloat(p.assets) || 0, symbol: p.asset.symbol ?? asset, decimals: p.asset.decimals ?? 18 })
      continue
    }
    // `Morpho sUSDS-USDT 97`: the positions route names the MARKET where the catalogue names the
    // family. Split it — the family is the venue, the rest says which of its markets this is, and
    // the API's own casing is kept for the family word (`LlamaLend`, not venueLabel's `Llamalend`).
    const lead = venueLabel(p.lender)
    const full = (p.name ?? p.brand ?? '').trim()
    const named = full.toLowerCase().startsWith(lead.toLowerCase())
    const protocol = named ? full.slice(0, lead.length) : lead
    const instance = named ? full.slice(lead.length).trim() : ''
    const venueOf = (symbol: string | undefined) => { const t = marketTag(instance, symbol ?? ''); return t ? `${protocol} · ${t}` : protocol }
    const accounts = p.crossMargin ? [{ accountId: '0', health: p.health, legs: p.legs, netUsd: p.netUsd, borrowedUsd: p.borrowedUsd, suppliedUsd: p.suppliedUsd }] : p.subAccounts
    for (const a of accounts) {
      const supply = a.legs.filter((l) => l.depositsUsd > 0.5).sort((x, y) => y.depositsUsd - x.depositsUsd)
      const debt = a.legs.filter((l) => l.debtUsd > 0.5).sort((x, y) => y.debtUsd - x.debtUsd)
      if (!supply.length) continue
      if (debt.length) {
        const coll = supply[0], d = debt[0]
        const asset = baseOfSymbol(coll.asset.symbol) ?? baseOfSymbol(d.asset.symbol); if (!asset) continue
        const debtBase = baseOfSymbol(d.asset.symbol)
        // same test as the catalogue's: same money, not the same display tab
        const directional = !debtBase || !sameMoney(debtBase, asset)
        const lev = a.suppliedUsd > 0 && a.netUsd > 0 ? a.suppliedUsd / a.netUsd : p.leverage
        out.push({ key: `${p.positionUid}:${a.accountId}`, chainId: p.chainId, group: groupOf(asset), asset, kind: 'loop', label: `${coll.asset.symbol} / ${d.asset.symbol} loop`, venue: venueOf(coll.asset.symbol), valueUsd: a.netUsd, apr: p.apr, health: a.health, leverage: lev, earnUid: coll.earnUid, logo: coll.asset.logoURI, directional,
          amount: parseFloat(coll.deposits) || 0, symbol: coll.asset.symbol ?? asset, decimals: coll.asset.decimals ?? 18, collateralUid: coll.marketUid, debtUid: d.marketUid, debtSymbol: d.asset.symbol, debtAmount: parseFloat(d.debt) || 0, accountId: p.crossMargin ? undefined : a.accountId, lender: p.lender })
      } else {
        for (const l of supply) {
          const asset = baseOfSymbol(l.asset.symbol); if (!asset) continue
          // the label is the FAMILY, `venue` the market inside it: the two are printed together
          // (the asset page) and one under the other (the explorer), so neither may repeat the other
          out.push({ key: `${p.positionUid}:${a.accountId}:${l.marketUid}`, chainId: p.chainId, group: groupOf(asset), asset, kind: 'simple', label: `${l.asset.symbol} · Lend on ${protocol}`, venue: venueOf(l.asset.symbol), valueUsd: l.depositsUsd, apr: p.depositApr, earnUid: l.earnUid, logo: l.asset.logoURI,
            amount: parseFloat(l.deposits) || 0, symbol: l.asset.symbol ?? asset, decimals: l.asset.decimals ?? 18, accountId: p.crossMargin ? undefined : a.accountId, lender: p.lender })
        }
      }
    }
  }
  return out
}

/** One idle balance: one TOKEN on one chain (native ETH and WETH are two entries with the same base `asset`). */
export interface Idle { asset: string; symbol: string; amount: number; usd: number; address: string; decimals: number; price: number; chainId: string }
export const isNativeAddress = (a: string) => /^0x0{40}$/i.test(a) || /^0xe{40}$/i.test(a)
/**
 * What the native coin of a chain IS. It used to be "BNB on 56, ETH
 * everywhere else", which was true until Avalanche was offered and then said
 * a wallet's AVAX was ether.
 */
const NATIVE: Record<string, string> = { '56': 'BNB', '43114': 'AVAX' }
export const nativeSymbol = (chainId: string): string => NATIVE[chainId] ?? 'ETH'
export function idleFrom(items: TokenBalance[], chainId: string): Idle[] {
  const out: Idle[] = []
  for (const b of items) {
    const native = isNativeAddress(b.address)
    const asset = native ? nativeSymbol(chainId) : baseOfSymbol(b.symbol); if (!asset) continue
    const amount = parseFloat(b.balance); if (!(amount > 0)) continue
    const usd = b.balanceUSD ?? amount * (b.priceUSD ?? 0)
    // `symbol` is the token as held: native reads as the chain coin (ETH on Base, BNB on BNB Chain), never "ETH" on BNB
    out.push({ asset, symbol: native ? nativeSymbol(chainId) : b.symbol, amount, usd, address: native ? '0x0000000000000000000000000000000000000000' : b.address.toLowerCase(), decimals: b.decimals, price: b.priceUSD ?? (amount ? usd / amount : 0), chainId })
  }
  return out
}

export interface AssetBook { asset: string; group: GroupId; idle: Idle | null; idleUsd: number; atWorkUsd: number; yearlyUsd: number; blended: number; totalUsd: number; holdings: Holding[] }
export function books(allHoldings: Holding[], idle: Idle[]): AssetBook[] {
  const holdings = allHoldings.filter((h) => !h.directional)
  const assets = new Set<string>([...holdings.map((h) => h.asset), ...idle.map((i) => i.asset)])
  const out: AssetBook[] = []
  for (const asset of assets) {
    const hs = holdings.filter((h) => h.asset === asset).sort((a, b) => b.valueUsd - a.valueUsd)
    const id = idle.find((i) => i.asset === asset) ?? null
    const atWork = hs.reduce((a, h) => a + h.valueUsd, 0)
    const yearly = hs.reduce((a, h) => a + h.valueUsd * (h.apr ?? 0) / 100, 0)
    out.push({ asset, group: groupOf(asset), idle: id, idleUsd: id?.usd ?? 0, atWorkUsd: atWork, yearlyUsd: yearly, blended: atWork ? yearly / atWork * 100 : 0, totalUsd: atWork + (id?.usd ?? 0), holdings: hs })
  }
  return out.filter((b) => b.totalUsd >= 1).sort((a, b) => b.totalUsd - a.totalUsd)
}
