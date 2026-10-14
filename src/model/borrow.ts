/**
 * Borrowing (tickets/0008): put something up, take dollars out, pay them back, take it back.
 *
 * Built off the same `/pairs/optimize` rows the loops are, but never through `classifyPair`: that
 * one refuses every pair whose two legs are different money (`cross-denom`), which is right for a
 * loop and is the whole point here — ETH → USDC, TSLAx → USDC, SOL → USDC.
 *
 * Everything a borrower must understand is said in the collateral's own price, not as a health
 * factor: how far it can fall before the lender sells it (`dropOf`, `liquidationPrice`), sorted
 * into three zones (`zoneOf`), and what the loan costs in money (`monthlyCost`).
 *
 * Pure: the only state it touches is the asset model's memo (`noteStock` / `keyOfToken`), which a
 * row fills as it is read.
 */
import type { OptimizerRowRaw } from '../sdk/types'
import { baseOfSymbol, groupOf, noteStock, stockInfo, type GroupId } from './assets'
import { assetClassOf, type AssetClass } from './assetClass'
import { keyOfToken, moneyOf } from './desk'
import { riskOf, venueLabel, type Risk } from './strategies'

export interface BorrowLeg { uid: string; symbol: string; address: string; decimals: number; logo?: string; price?: number; group?: string }
export interface BorrowOffer {
  /** `b:<collateral market uid>|<debt market uid>` — the index's `loop:` strategy key has the same two legs */
  id: string
  chainId: string
  lender: string
  venue: string
  /** the row the collateral sits on (`TSLA`, `ETH`, a dollar's desk) and its group */
  asset: string
  group: GroupId
  collateral: BorrowLeg
  debt: BorrowLeg
  /** the most a borrow may be, as a share of the collateral's value (the borrow factor already in) */
  maxLtv: number
  /** where the lender liquidates, the same way */
  liqLtv: number
  /** the borrow rate now, APR % (what the market charges at its current utilisation) */
  borrowApr: number
  /** dollars that can still be borrowed */
  liquidityUsd: number
  /** the collateral market's size, USD (what is already put up) */
  collateralUsd: number
  utilization?: number
  risk: Risk
  riskLabel: string
  riskScore: number
  rated: boolean
  /** a tokenized equity's class and ticker (`stock` · `TSLA`); null for crypto */
  assetClass: AssetClass | null
  ticker?: string
  issuer?: string
  /** both legs are the same money (sUSDe against USDC): only a depeg can liquidate it */
  pegged: boolean
  /** Aave e-mode the factors are for — sent back as `modeId` */
  modeId?: string
  /**
   * A venue that needs an input the ticket does not ask yet — a fixed term, a smart-debt leg,
   * LlamaLend bands, Inverse's DBR, a Liquity trove (its own interest rate), an institutional
   * (permissioned) market. Not offered in v1.
   */
  needsInput?: 'term' | 'smart' | 'bands' | 'dbr' | 'trove' | 'permissioned'
}

const num = (v: string | number | null | undefined): number => { if (v == null || v === '') return 0; const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : 0 }
const FIXED = new Set(['lista', 'loopscale', 'midnight', 'term', 'termmax', 'teller'])
/** The Liquity family: a loan is a trove with an interest rate the borrower sets (Ticket.tsx `LIQUITY_FAMILY`). */
const TROVES = /^(LIQUITY|FELIX|NERITE|QUILL|EBISU|SONETA|ENOSYS_LOANS)/

/** One pairs row → an offer, or null when it is no dollar loan this app can describe. */
export function offerFromRow(r: OptimizerRowRaw): BorrowOffer | null {
  const L = r.underlyingInfoLong.asset, S = r.underlyingInfoShort.asset
  // a dollar out: the debt leg must be a dollar (any issuer's)
  const debtMoney = moneyOf({ ...S, chainId: r.chainId, desk: r.debtDesk })
  if (debtMoney !== 'USD') return null
  const ticker = noteStock({ ...L, chainId: r.chainId })
  const asset = ticker ?? keyOfToken({ ...L, chainId: r.chainId, desk: r.collateralDesk }) ?? baseOfSymbol(L.props?.lst?.asset)
  if (!asset) return null
  const bf = num(r.borrowFactorShort) || 1
  const maxLtv = num(r.ltv) || num(r.borrowCollateralFactorLong) / bf
  const liqLtv = (num(r.collateralFactorLong) || num(r.ltv)) / bf
  if (!(maxLtv > 0) || !(liqLtv > 0) || liqLtv >= 1.2) return null
  const worst = Math.max(0, ...r.risk.breakdown.map((b) => b.score ?? 0), r.risk.maxTokenScore ?? 0)
  const { risk, riskLabel } = riskOf(worst)
  const cls = (r.collateralAssetClass as AssetClass | null | undefined) ?? assetClassOf(L.props?.rwa)
  const model = r.fixedTerm?.model ?? ''
  const needsInput: BorrowOffer['needsInput'] = r.variableBorrowDisabledShort || FIXED.has(model) || r.debtTerms?.maturityKind === 'fixed-date' ? 'term'
    : r.isBasketLong ? 'smart'
    : /^(LLAMALEND|CURVE_LEND)/.test(r.lender) ? 'bands'
    : /^INVERSE/.test(r.lender) ? 'dbr'
    : TROVES.test(r.lender) ? 'trove'
    : /INSTITUTIONAL|PERMISSIONED|KYC/.test(r.lender) ? 'permissioned' : undefined
  const util = num(r.utilizationShort)
  return {
    id: `b:${r.marketLongUid}|${r.marketShortUid}`, chainId: r.chainId, lender: r.lender, venue: venueLabel(r.lender, r.curatorNameLong),
    asset, group: groupOf(asset),
    collateral: { uid: r.marketLongUid, symbol: L.symbol, address: L.address, decimals: L.decimals ?? 18, logo: L.logoURI || undefined, price: r.underlyingInfoLong.prices?.priceUsd ?? undefined, group: L.assetGroup },
    debt: { uid: r.marketShortUid, symbol: S.symbol, address: S.address, decimals: S.decimals ?? 18, logo: S.logoURI || undefined, price: r.underlyingInfoShort.prices?.priceUsd ?? undefined, group: S.assetGroup },
    maxLtv, liqLtv, borrowApr: num(r.borrowAprShort), liquidityUsd: num(r.borrowLiquidityUsdShort), collateralUsd: num(r.totalDepositsUsdLong),
    ...(util > 0 ? { utilization: util } : {}),
    risk, riskLabel, riskScore: worst || 5, rated: worst > 0,
    assetClass: cls === 'stock' || cls === 'etf' || cls === 'pre-ipo' ? cls : null,
    ...(ticker ? { ticker: stockInfo(ticker)?.ticker ?? ticker, issuer: L.props?.rwa?.issuer } : {}),
    pegged: moneyOf({ ...L, chainId: r.chainId, desk: r.collateralDesk }) === 'USD',
    ...(r.eModeConfigId != null && r.eModeConfigId !== '' && String(r.eModeConfigId) !== '0' ? { modeId: String(r.eModeConfigId) } : {}),
    ...(needsInput ? { needsInput } : {}),
  }
}

/**
 * The offers a list shows: one per pair (the best e-mode of a pair wins), none the ticket cannot
 * build yet, none with a broken rate, none with nothing left to lend.
 */
export function offersFrom(rows: OptimizerRowRaw[]): BorrowOffer[] {
  const best = new Map<string, BorrowOffer>()
  for (const r of rows) {
    const o = offerFromRow(r)
    if (!o || o.needsInput || !(o.borrowApr >= 0) || o.borrowApr > MAX_BORROW_APR || o.liquidityUsd < MIN_LIQUIDITY_USD) continue
    const cur = best.get(o.id)
    if (!cur || o.maxLtv > cur.maxLtv) best.set(o.id, o)
  }
  return [...best.values()]
}
/** Above this a borrow rate is a market in distress or a broken feed, not an offer (Edel's frozen stock markets read 300 %). */
export const MAX_BORROW_APR = 60
/** Below this there is nothing to borrow worth a ticket. */
export const MIN_LIQUIDITY_USD = 50
/** Enough to fill an ordinary loan: offers under it sort after the ones that can. */
export const DEEP_USD = 10_000

/** A collateral market people actually use: what is put up there already. */
export const USED_USD = 100_000
/**
 * The offers a headline may quote ("from 1.9 %", "up to 79 %"): ones that can fill an ordinary
 * loan in a market people use. An empty vault at 0 % is a real offer and stays in the list; it is
 * not what "from" should promise. Falls back to every deep offer where none is used yet.
 */
export function headlineOffers(offers: BorrowOffer[]): BorrowOffer[] {
  // (a market that charges nothing is one nobody borrows from yet: not the rate to promise)
  const deep = offers.filter((o) => o.liquidityUsd >= DEEP_USD && o.borrowApr >= 0.05)
  const used = deep.filter((o) => o.collateralUsd >= USED_USD)
  return used.length ? used : deep
}
/**
 * The order a list reads in: offers that can fill an ordinary loan first, then markets people
 * actually put collateral into, then the lower risk, then the cheaper rate, then the higher limit.
 * Never the rate alone — a $100 market at 0.02 %, or an empty vault nobody borrows from at 0 %,
 * is not where to borrow $5,000.
 */
export const byOffer = (a: BorrowOffer, b: BorrowOffer) =>
  Number(b.liquidityUsd >= DEEP_USD) - Number(a.liquidityUsd >= DEEP_USD) || Number(b.collateralUsd >= USED_USD) - Number(a.collateralUsd >= USED_USD) || a.risk - b.risk || a.borrowApr - b.borrowApr || b.maxLtv - a.maxLtv

// ----------------------------------------------------------------- the zones
export type Zone = 'safe' | 'watch' | 'spicy'
/** How far the collateral may fall (0–1) before each zone ends: ≥ `safe` is Safe, ≥ `watch` Watch, under it Spicy. */
export interface Borders { safe: number; watch: number }
export const CRYPTO_BORDERS: Borders = { safe: 0.4, watch: 0.2 }
/** A stock does not trade at night or on weekends: Monday's open can jump past the line, so Safe asks for more room. */
export const EQUITY_BORDERS: Borders = { safe: 0.5, watch: 0.25 }
/** A dollar against a dollar moves only on a depeg: a few percent is already a wide berth. */
export const PEGGED_BORDERS: Borders = { safe: 0.1, watch: 0.04 }
export const bordersFor = (o: Pick<BorrowOffer, 'assetClass' | 'pegged'>): Borders => (o.pegged ? PEGGED_BORDERS : o.assetClass ? EQUITY_BORDERS : CRYPTO_BORDERS)
export const ZONES: Record<Zone, { word: string; cls: 'ok' | 'warn' | 'bad'; why: string }> = {
  safe: { word: 'Safe', cls: 'ok', why: 'The price can fall a long way before anything happens.' },
  watch: { word: 'Watch', cls: 'warn', why: 'A bad week could bring it close. Check on it now and then.' },
  spicy: { word: 'Spicy', cls: 'bad', why: 'An ordinary move can liquidate it. Only with a plan to add collateral or pay back fast.' },
}
/** The lowest health a ticket will send: under it, one tick of the oracle liquidates. */
export const MIN_HEALTH = 1.05

/** Health factor: collateral × liquidation threshold over debt (∞ with no debt). */
export const healthOf = (collUsd: number, debtUsd: number, liqLtv: number) => (debtUsd > 0 ? (collUsd * liqLtv) / debtUsd : Infinity)
/** How far (0–1) the collateral's price can fall against the debt before liquidation; 1 with no debt, 0 when already past it. */
export const dropOf = (collUsd: number, debtUsd: number, liqLtv: number) => (debtUsd > 0 && collUsd > 0 ? Math.max(0, 1 - debtUsd / (collUsd * liqLtv)) : debtUsd > 0 ? 0 : 1)
/** The total debt that leaves exactly `drop` of room. */
export const debtAtDrop = (collUsd: number, liqLtv: number, drop: number) => Math.max(0, collUsd * liqLtv * (1 - drop))
export const zoneOf = (drop: number, b: Borders): Zone => (drop >= b.safe ? 'safe' : drop >= b.watch ? 'watch' : 'spicy')
/** The collateral price at which the loan is liquidated (the debt held at its price). */
export const liquidationPrice = (debtUsd: number, collUnits: number, liqLtv: number) => (collUnits > 0 && liqLtv > 0 ? debtUsd / (collUnits * liqLtv) : 0)
/** What the loan costs a month at `apr` (APR %, simple). */
export const monthlyCost = (debtUsd: number, apr: number) => (debtUsd * apr) / 100 / 12

/**
 * The most this ticket may add to the debt, in USD: the venue's limit (`maxLtv` on everything put
 * up), never past {@link MIN_HEALTH}, never more than the market has free.
 */
export function maxBorrowUsd(o: Pick<BorrowOffer, 'maxLtv' | 'liqLtv' | 'liquidityUsd'>, collUsd: number, debtUsd = 0): number {
  const cap = Math.min(collUsd * o.maxLtv, (collUsd * o.liqLtv) / MIN_HEALTH)
  return Math.max(0, Math.min(cap - debtUsd, o.liquidityUsd))
}

/**
 * The three chips' amounts — what to ADD to the debt to land in each zone, with room to spare
 * (Safe a quarter of the way into it, Watch in its middle, Spicy half way to the edge), each
 * capped by {@link maxBorrowUsd}. `null` where the cap does not reach the zone.
 */
export function zoneAmounts(o: Pick<BorrowOffer, 'maxLtv' | 'liqLtv' | 'liquidityUsd'>, b: Borders, collUsd: number, debtUsd = 0): Record<Zone, number | null> {
  const cap = maxBorrowUsd(o, collUsd, debtUsd)
  const at = (drop: number) => { const add = debtAtDrop(collUsd, o.liqLtv, drop) - debtUsd; return add > 0.005 ? Math.min(add, cap) : null }
  const safe = at(b.safe + (1 - b.safe) * 0.25)
  const watch = at((b.safe + b.watch) / 2)
  const spicy = at(Math.max(b.watch / 2, 1 - 1 / MIN_HEALTH))
  // a chip that only reaches the cap of a lower zone is no chip of its own
  return { safe, watch: watch != null && safe != null && watch <= safe + 0.005 ? null : watch, spicy: spicy != null && watch != null && spicy <= watch + 0.005 ? null : spicy }
}
/** Where a fresh ticket starts: the Safe chip, else the smallest chip there is. */
export const defaultBorrow = (z: Record<Zone, number | null>) => z.safe ?? z.watch ?? z.spicy ?? 0

/**
 * A running loan the offer list does not carry (a market outside the requests, a venue it hides):
 * its offer rebuilt from the position itself, so it can still be paid back. The liquidation
 * threshold is read back off the health the positions route reports; the venue's borrow limit is
 * unknown, so the ticket is told to borrow no more on it (`maxLtv` 0).
 */
export function offerFromHolding(h: { chainId: string; asset: string; group: GroupId; venue: string; lender?: string; symbol: string; decimals: number; logo?: string; amount: number; collateralUid?: string; debtUid?: string; collateralAddress?: string; debtAddress?: string; debtSymbol?: string; debtAmount?: number; collateralUsd?: number; valueUsd: number; health?: number | null; apr?: number }): BorrowOffer | null {
  if (!h.collateralUid || !h.debtUid || !h.collateralAddress || !h.debtAddress) return null
  const collUsd = h.collateralUsd ?? 0, debtUsd = Math.max(0, collUsd - h.valueUsd)
  const liqLtv = h.health && collUsd > 0 && debtUsd > 0 ? (h.health * debtUsd) / collUsd : 0.75
  const st = stockInfo(h.asset)
  return {
    id: `b:${h.collateralUid}|${h.debtUid}`, chainId: h.chainId, lender: h.lender ?? '', venue: h.venue, asset: h.asset, group: h.group,
    collateral: { uid: h.collateralUid, symbol: h.symbol, address: h.collateralAddress, decimals: h.decimals, logo: h.logo, price: h.amount > 0 && collUsd > 0 ? collUsd / h.amount : undefined },
    debt: { uid: h.debtUid, symbol: h.debtSymbol ?? 'USD', address: h.debtAddress, decimals: 6, price: h.debtAmount && debtUsd ? debtUsd / h.debtAmount : 1 },
    maxLtv: 0, liqLtv, borrowApr: 0, liquidityUsd: 0, collateralUsd: 0, risk: 2, riskLabel: 'Unrated', riskScore: 5, rated: false,
    assetClass: st?.cls ?? null, ...(st ? { ticker: st.ticker } : {}), pegged: false,
  }
}

/**
 * Is the US stock market trading at `now`, and when does it open next — in New York's own clock
 * (09:30–16:00 ET, Monday to Friday; holidays are not known here). A stock's oracle holds the last
 * close while it is shut, and the next open can jump past a liquidation line with nothing in between.
 */
export function usMarket(now = new Date()): { open: boolean; next: string } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, p.value]))
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
  const mins = Number(parts.hour) * 60 + Number(parts.minute)
  const weekday = day >= 1 && day <= 5
  const open = weekday && mins >= 570 && mins < 960
  if (open) return { open, next: '' }
  const today = weekday && mins < 570
  const ahead = today ? 0 : day === 5 ? 3 : day === 6 ? 2 : 1
  const next = ahead === 0 ? 'today' : ahead === 1 ? 'tomorrow' : 'on Monday'
  return { open, next: `${next} at 9:30 New York time` }
}
