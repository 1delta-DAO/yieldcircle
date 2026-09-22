/**
 * Strategy rows from the two listings, curated for a simple mode: a plain deposit is one
 * `/v1/data/earn` row on a base asset; a loop is one `/pairs/optimize` row whose collateral
 * resolves to a base asset and whose debt is the same denomination. Pure functions.
 */
import type { EarnMarket, OptimizerRowRaw } from '../sdk/types'
import { baseOfCollateral, baseOfSymbol, groupOf, sameMoney, type GroupId } from './assets'
import { DEFAULT_TIER, netAprAtLeverage, tierLeverages, type TierLeverages } from './leverage'
import STRATEGY_TOKENS from '../data/strategy-tokens.json'
/** `chain:vaultAddress` → the share token you end up holding (scripts/logos.mjs, from the chain token lists). */
const strategyToken = (chainId: string, ref: string | undefined) => (ref ? (STRATEGY_TOKENS as Record<string, { symbol: string; logoURI: string | null }>)[`${chainId}:${ref.toLowerCase()}`] : undefined)

export type Risk = 1 | 2 | 3
interface Base {
  id: string
  kind: 'simple' | 'loop'
  chainId: string
  group: GroupId
  /** base asset symbol (canonical) */
  asset: string
  /** token you end up holding */
  holds: string
  venue: string
  venueKey: string
  logo?: string
  /** headline %: APY for a deposit, net at the suggested leverage for a loop */
  rate: number
  risk: Risk
  riskLabel: string
  tvlUsd: number
}
export interface SimpleStrategy extends Base {
  kind: 'simple'
  earnUid: string
  brand: string
  /** `AAVE_V3`, `MORPHO_BLUE`, `vault.morpho`, … — the family the venue badge is drawn from */
  protocolKey: string
  via: string
  /** lending · savings · staking · fixed · vault */
  source: string
  assetAddress: string
  decimals: number
  priceUsd?: number
  exitMode: string
  exitWord: string
  canDeposit: boolean
  reason?: string
  maturity?: number
  rewards: number
}
export interface LoopStrategy extends Base {
  kind: 'loop'
  lender: string
  debt: string
  marketLongUid: string
  marketShortUid: string
  collateralAddress: string
  debtAddress: string
  decimalsLong: number
  decimalsShort: number
  priceLong?: number
  priceShort?: number
  logoLong?: string
  logoShort?: string
  dep: number
  bor: number
  rewardsLong: number
  rewardsShort: number
  maxLev: number
  liqLtv: number
  /** leverage at the balanced tier — the list's headline */
  rec: number
  tiers: TierLeverages
  borrowLiquidityUsd: number
  expiry?: number
}
export type Strategy = SimpleStrategy | LoopStrategy

const num = (v: string | number | null | undefined): number => { if (v == null || v === '') return 0; const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : 0 }
/** One vocabulary for both listings: the API's 1–5 score → low / medium / high. Its colour words are ignored on purpose. */
const riskOf = (score: number | undefined, _label?: string): { risk: Risk; riskLabel: string } => {
  const s = score ?? 2
  const risk: Risk = s <= 1 ? 1 : s <= 2 ? 2 : 3
  return { risk, riskLabel: risk === 1 ? 'Low' : risk === 2 ? 'Medium' : 'High' }
}
const EXIT_WORD: Record<string, string> = { instant: 'Any time', 'instant-capped': 'Any time', 'instant-or-queued': 'Any time or queued', queued: 'Queued', 'fixed-cooldown': 'Cooldown', 'request-based': 'Queued', 'market-sale': 'Sell on market', 'off-chain': 'Off-chain' }

/** `/earn` row → plain deposit, or null when it is not a strategy on a base asset we present. */
export function simpleFromEarn(m: EarnMarket): SimpleStrategy | null {
  const asset = baseOfSymbol(m.asset.symbol)
  if (!asset) return null
  if (m.basket) return null
  const rate = m.rate?.total ?? 0
  if (!(rate > 0.01) || rate > 25) return null                         // dead rows and outliers
  const tvl = m.tvl?.usd ?? 0
  const isVault = m.venueKind === 'vault'
  if (tvl < 2e6) return null                                           // real size only
  if (!m.availability?.canDeposit) return null
  const dep = m.capabilities.find((c) => c.action === 'deposit'); if (!dep) return null
  if ((m.risk?.score ?? 5) > 4) return null
  const protocol = m.protocol?.name ?? m.venue
  const brand = m.brand ?? protocol
  // the server names unnamed vaults "USDC · 0x28b3": the address tail is not a token you hold
  const clean = (m.name ?? '').replace(/\s*·\s*0x[0-9a-f]{4,}$/i, '').trim()
  const named = clean && clean.toUpperCase() !== asset.toUpperCase() && clean.toUpperCase() !== m.asset.symbol.toUpperCase() ? clean : ''
  // the share token, resolved from the vault address: the listing's own logoURI is the ASSET's on nearly every row
  const share = isVault ? strategyToken(m.chainId, m.ref) : undefined
  const shareSym = m.shareToken?.symbol ?? share?.symbol
  let via: string, source: string, holds: string
  if (m.venue === 'vault.lst') { via = `Stake with ${brand}`; source = 'staking'; holds = shareSym ?? named ?? asset }
  else if (m.venue === 'vault.savings') { via = `${brand} savings`; source = 'savings'; holds = shareSym ?? (named || asset) }
  else if (m.venue === 'vault.pendle') { via = 'Fixed on Pendle'; source = 'fixed'; holds = 'PT ' + (named || asset).replace(/^PT\s*/, '').split(' ')[0] }
  else if (isVault) { via = brand === protocol ? `${protocol} vault` : `${brand} vault · ${protocol}`; source = 'vault'; holds = shareSym ?? (named || asset) }
  else { via = `Lend on ${protocol}`; source = 'lending'; holds = asset }
  const ownLogo = m.logoURI && m.logoURI !== m.asset.logoURI ? m.logoURI : undefined
  const logo = share?.logoURI ?? ownLogo ?? (isVault ? undefined : m.asset.logoURI)
  const exitMode = m.exit?.mode ?? 'instant'
  const { risk, riskLabel } = riskOf(m.risk?.score, m.risk?.label)
  const maturity = typeof m.maturity?.maturity === 'number' ? m.maturity.maturity : undefined
  return {
    id: `s:${m.earnUid}`, kind: 'simple', chainId: m.chainId, group: groupOf(asset), asset, holds, venue: brand === protocol ? protocol : `${brand} · ${protocol}`, venueKey: m.venue, logo, brand, protocolKey: m.protocol?.key ?? m.venue,
    rate, risk, riskLabel, tvlUsd: tvl,
    earnUid: m.earnUid, via, source, assetAddress: m.asset.address, decimals: m.asset.decimals, priceUsd: m.asset.priceUsd,
    exitMode, exitWord: maturity ? 'At maturity' : EXIT_WORD[exitMode] ?? exitMode, canDeposit: true, reason: m.availability?.reason, maturity, rewards: m.rate?.rewards ?? 0,
  }
}

/** Lender keys carry 64-hex market ids — shorten to the family name. */
export function venueLabel(lender: string, curator?: string | null): string {
  if (lender.startsWith('AAVE_V4')) return 'Aave V4'
  if (lender.startsWith('AAVE_V3_PRIME') || lender.startsWith('AAVE_V3_LIDO')) return 'Aave V3 Prime'
  if (lender.startsWith('AAVE_V3')) return 'Aave V3'
  if (lender.startsWith('MORPHO_MIDNIGHT')) return 'Midnight'
  if (lender.startsWith('MORPHO_BLUE')) return curator ? `Morpho · ${curator}` : 'Morpho'
  if (lender.startsWith('FLUID')) return 'Fluid'
  if (lender.startsWith('COMPOUND_V3')) return 'Compound'
  if (lender.startsWith('EULER')) return 'Euler'
  if (lender.startsWith('LISTA')) return 'Lista'
  if (lender.startsWith('VENUS')) return 'Venus'
  // instance-keyed lenders (Gearbox pools, Fraxlend pairs, Silo markets): the words, without the trailing ids
  return lender.replace(/(_(?:[0-9A-F]{40}|[0-9A-F]{6,8}|\d+))+$/i, '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/** optimizer row → loop, or null when it is not a same-denomination carry on a base asset. */
export function loopFromRow(r: OptimizerRowRaw): LoopStrategy | null {
  const L = r.underlyingInfoLong.asset, S = r.underlyingInfoShort.asset
  // float debt only: a BROKERED market (Lista broker, Midnight book, Term repo) has no variable borrow and needs a term picker the
  // simple ticket does not have. A `fixedTerm` block alone is not that — Lista's float-first markets carry one too.
  if (r.variableBorrowDisabledShort || r.isBasketLong) return null
  const asset = baseOfCollateral(L, S.symbol)
  if (!asset) return null
  const debtBase = baseOfSymbol(S.symbol)
  // the SAME MONEY, not merely the same tab: 'More' holds BNB, AVAX, the euro
  // and gold together, and sAVAX against EURC is a price bet wearing a carry's
  // clothes (docs: assets.ts `denomOf`)
  if (!debtBase || !sameMoney(debtBase, asset)) return null
  // a carry needs collateral that yields on its own (staking, savings, a PT, a fund); lending one plain stable against another is a rate bet on a small market
  const p = L.props ?? {}
  if (!(p.lst || p.savings || p.pendle || p.spectra || p.rwa || (L.intrinsicYield ?? 0) > 0)) return null
  // the at-size legs (quoted at $10k of collateral) when the venue has a depth grid, else the sticker
  const dep = num(r.depositAprAtAmount) || num(r.depositAprLong), bor = num(r.borrowAprAtAmount) || num(r.borrowAprShort), maxLev = num(r.maxLeverage)
  if (!(dep > 0) || !(maxLev >= 2)) return null
  const liq = num(r.borrowLiquidityUsdShort); if (liq < 100_000) return null
  const worst = Math.max(0, ...r.risk.breakdown.map((b) => b.score ?? 0), r.risk.maxTokenScore ?? 0)
  if (worst > 4) return null                                                        // only the critical tier is hidden
  const liqLtv = num(r.collateralFactorLong) || num(r.ltv)
  if (!(liqLtv > 0.3)) return null
  const tiers = tierLeverages(maxLev)
  const rec = tiers[DEFAULT_TIER]
  const rate = netAprAtLeverage(dep, bor, rec)
  if (rate <= 0) return null   // no outlier cap here: at 75 % of a 28× range a thin carry is legitimately a big number, and the card says what it risks
  const { risk, riskLabel } = riskOf(worst)
  const venue = venueLabel(r.lender, r.curatorNameLong)
  return {
    id: `l:${r.marketLongUid}|${r.marketShortUid}`, kind: 'loop', chainId: r.chainId, group: groupOf(asset), asset, holds: L.symbol, venue, venueKey: r.lender, logo: L.logoURI,
    rate, risk, riskLabel, tvlUsd: num(r.totalDepositsUsdLong),
    lender: r.lender, debt: S.symbol, marketLongUid: r.marketLongUid, marketShortUid: r.marketShortUid,
    collateralAddress: L.address, debtAddress: S.address, decimalsLong: L.decimals ?? 18, decimalsShort: S.decimals ?? 18,
    priceLong: r.underlyingInfoLong.prices?.priceUsd, priceShort: r.underlyingInfoShort.prices?.priceUsd, logoLong: L.logoURI, logoShort: S.logoURI,
    dep, bor, rewardsLong: num(r.rewardAprLong), rewardsShort: num(r.rewardAprShort), maxLev, liqLtv, rec, tiers, borrowLiquidityUsd: liq,
    expiry: L.props?.pendle?.expiry ?? L.props?.spectra?.expiry,
  }
}

/** Keep the best row per (asset, holds, venue) so the same pair on one venue does not repeat per e-mode / sub-market. */
export function dedupe<T extends Strategy>(rows: T[]): T[] {
  const best = new Map<string, T>()
  for (const r of rows) {
    const k = `${r.chainId}|${r.asset}|${r.holds}|${r.venue}|${r.kind === 'loop' ? r.debt : ''}`
    const cur = best.get(k)
    if (!cur || r.rate > cur.rate) best.set(k, r)
  }
  return [...best.values()]
}
/** "Our pick": the best row of its kind on its asset among low/medium risk with real size. Data, not editorial. */
export function markPicks(rows: Strategy[]): Set<string> {
  const picks = new Set<string>()
  const byKey = new Map<string, Strategy>()
  for (const r of rows) {
    if (r.risk > 2) continue
    if (r.tvlUsd < (r.kind === 'simple' ? 2e7 : 0) || (r.kind === 'loop' && r.borrowLiquidityUsd < 2e6)) continue
    const k = `${r.asset}|${r.kind}`
    const cur = byKey.get(k)
    if (!cur || r.rate > cur.rate) byKey.set(k, r)
  }
  for (const r of byKey.values()) picks.add(r.id)
  return picks
}
/** A simple mode shows a short menu: the top `n` of each kind per asset, by rate. */
export function capPerAsset<T extends Strategy>(rows: T[], n = 30): T[] {
  const by = new Map<string, T[]>()
  for (const r of [...rows].sort((a, b) => b.rate - a.rate)) { const k = `${r.asset}|${r.kind}`; const l = by.get(k) ?? []; if (l.length < n) { l.push(r); by.set(k, l) } }
  return [...by.values()].flat()
}
export const headline = (s: Strategy) => s.rate
export const title = (s: Strategy) => (s.kind === 'loop' ? `${s.holds} / ${s.debt} loop` : `${s.holds} · ${s.via}`)
