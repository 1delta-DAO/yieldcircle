/**
 * Borrowing (tickets/0008): put something up, take something out, pay it back, take it back.
 *
 * What comes out is dollars by default, and since tickets/0011 any coin a market lends: ether,
 * bitcoin, another chain's native coin (`Out`). A pair whose two legs are the same money (wstETH
 * against WETH, LBTC against WBTC) is a loop, not a loan, and stays in the loop catalogue.
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
import type { Holding } from './positions'
import { baseOfSymbol, groupOf, noteStock, stockInfo, type GroupId } from './assets'
import { assetClassOf, type AssetClass } from './assetClass'
import { keyOfToken, moneyOf } from './desk'
import { riskOf, venueLabel, type Risk } from './strategies'

export interface BorrowLeg { uid: string; symbol: string; address: string; decimals: number; logo?: string; price?: number; group?: string }
/**
 * What a loan pays out, as a family the "Take out" picker groups by: dollars (any issuer's), ether
 * (ETH and its staked forms), bitcoin, or another chain's native coin (SOL, BNB, AVAX…) — `MORE`,
 * as the asset groups name it.
 */
export type Out = 'USD' | 'ETH' | 'BTC' | 'MORE'
export const OUTS: { id: Out; name: string; any: string }[] = [
  { id: 'USD', name: 'Dollars', any: 'Any dollar' },
  { id: 'ETH', name: 'Ether', any: 'Any ether' },
  { id: 'BTC', name: 'Bitcoin', any: 'Any bitcoin' },
  { id: 'MORE', name: 'Other coins', any: 'Any other coin' },
]
export const isOut = (x: string | null | undefined): x is Out => x === 'USD' || x === 'ETH' || x === 'BTC' || x === 'MORE'
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
  /** what comes out: dollars, ether, bitcoin or another coin (tickets/0011) */
  out: Out
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

/** The family a debt token pays out in: its money (dollars, ether, bitcoin), else a native coin of the `MORE` group; null for anything else. */
export function outOf(t: { chainId: string; address: string; symbol?: string; desk?: unknown; props?: unknown }): Out | null {
  const m = moneyOf(t as Parameters<typeof moneyOf>[0])
  if (m === 'USD' || m === 'ETH' || m === 'BTC') return m
  const b = baseOfSymbol(t.symbol)
  return b && groupOf(b) === 'MORE' ? 'MORE' : null
}

/** One pairs row → an offer, or null when it is no loan this app can describe. */
export function offerFromRow(r: OptimizerRowRaw): BorrowOffer | null {
  const L = r.underlyingInfoLong.asset, S = r.underlyingInfoShort.asset
  // what comes out: a dollar (any issuer's), or a coin a market lends (tickets/0011)
  const out = outOf({ ...S, chainId: r.chainId, desk: r.debtDesk })
  if (!out) return null
  const ticker = noteStock({ ...L, chainId: r.chainId })
  const asset = ticker ?? keyOfToken({ ...L, chainId: r.chainId, desk: r.collateralDesk }) ?? baseOfSymbol(L.props?.lst?.asset)
  if (!asset) return null
  const collMoney = moneyOf({ ...L, chainId: r.chainId, desk: r.collateralDesk })
  // the same money on both legs is a loop (wstETH against WETH, LBTC against WBTC, JitoSOL against
  // SOL), and the loop catalogue's. Dollars against dollars stay: that is a `pegged` loan
  if (out !== 'USD' && (collMoney === out || (out === 'MORE' && [asset, baseOfSymbol(L.props?.lst?.asset)].includes(baseOfSymbol(S.symbol))))) return null
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
    out,
    maxLtv, liqLtv, borrowApr: num(r.borrowAprShort), liquidityUsd: num(r.borrowLiquidityUsdShort), collateralUsd: num(r.totalDepositsUsdLong),
    ...(util > 0 ? { utilization: util } : {}),
    risk, riskLabel, riskScore: worst || 5, rated: worst > 0,
    assetClass: cls === 'stock' || cls === 'etf' || cls === 'pre-ipo' ? cls : null,
    ...(ticker ? { ticker: stockInfo(ticker)?.ticker ?? ticker, issuer: L.props?.rwa?.issuer } : {}),
    pegged: out === 'USD' && collMoney === 'USD',
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
  // (a market that charges nothing is one nobody borrows from yet: not the rate to promise; and a
  // headline quotes dollar loans — an ether loan's rate is a different number, tickets/0011)
  const deep = offers.filter((o) => o.out === 'USD' && o.liquidityUsd >= DEEP_USD && o.borrowApr >= 0.05)
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
export function offerFromHolding(h: Pick<Holding, 'chainId' | 'asset' | 'group' | 'venue' | 'lender' | 'symbol' | 'decimals' | 'logo' | 'amount' | 'collateralUid' | 'debtUid' | 'collateralAddress' | 'debtAddress' | 'debtSymbol' | 'debtDecimals' | 'debtAmount' | 'collateralUsd' | 'valueUsd' | 'health' | 'apr' | 'others'>): BorrowOffer | null {
  if (!h.collateralUid || !h.debtUid || !h.collateralAddress || !h.debtAddress) return null
  const collUsd = h.collateralUsd ?? 0, debtUsd = owedOf(h)
  const liqLtv = h.health && collUsd > 0 && debtUsd > 0 ? (h.health * debtUsd) / collUsd : 0.75
  const st = stockInfo(h.asset)
  return {
    id: `b:${h.collateralUid}|${h.debtUid}`, chainId: h.chainId, lender: h.lender ?? '', venue: h.venue, asset: h.asset, group: h.group,
    collateral: { uid: h.collateralUid, symbol: h.symbol, address: h.collateralAddress, decimals: h.decimals, logo: h.logo, price: h.amount > 0 && collUsd > 0 ? collUsd / h.amount : undefined },
    // the debt's own decimals: 6 was a guess that is wrong for BNB's USDT and every coin (18)
    debt: { uid: h.debtUid, symbol: h.debtSymbol ?? 'USD', address: h.debtAddress, decimals: h.debtDecimals ?? 6, price: h.debtAmount && debtUsd ? debtUsd / h.debtAmount : 1 },
    out: outOf({ chainId: h.chainId, address: h.debtAddress, symbol: h.debtSymbol }) ?? 'USD',
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

/**
 * Where to borrow against `asset` for THIS wallet (tickets/0010): the list's order (`byOffer`), but
 * a market on a chain where the wallet already holds the asset first — the ticket opens there, and
 * the other places are one tap away in it. Only offers that lend something (`maxLtv` > 0).
 */
export function bestOfferFor(asset: string, offers: BorrowOffer[], held: { asset: string; chainId: string; usd: number }[] = [], out: Out = 'USD'): BorrowOffer | undefined {
  const here = (o: BorrowOffer) => held.some((i) => i.asset === asset && i.chainId === o.chainId && i.usd >= 1)
  return offers.filter((o) => o.asset === asset && o.maxLtv > 0 && o.out === out).sort((a, b) => Number(here(b)) - Number(here(a)) || byOffer(a, b))[0]
}

// ----------------------------------------------------------------- what is already in (tickets/0011)
/** Every collateral leg of a held account, USD: the loop's own leg plus the others it carries. */
export const collateralOf = (h: Pick<Holding, 'collateralUsd' | 'others'>) => (h.collateralUsd ?? 0) + (h.others ?? []).reduce((a, x) => a + (x.side === 'collateral' ? x.usd : 0), 0)
/**
 * What a held account owes, USD: all it has put up less its equity. Reading it off the loop's own
 * leg alone understated it — or went negative — for an account with a second collateral.
 */
export const owedOf = (h: Pick<Holding, 'collateralUsd' | 'others' | 'valueUsd'>) => Math.max(0, collateralOf(h) - h.valueUsd)
/** Is this one of {@link depositsAsLoans}' rows: collateral already in, nothing owed yet? */
export const isPutUp = (h: Pick<Holding, 'putUp'>) => !!h.putUp

/**
 * Collateral the wallet has already put up and borrows nothing against: a lending deposit in this
 * offer's own collateral market (5 ETH supplied on Aave), read as a loan of $0 so the ticket can
 * borrow against it with nothing new typed. Matched on the market, which also fixes the lender and
 * the chain; an isolated venue's sub-account comes along in `accountId`. Paper deposits are left
 * out: a paper loan opens from the paper bank.
 */
export function depositsAsLoans(o: BorrowOffer, holdings: Holding[]): Holding[] {
  const m = o.collateral.uid.toLowerCase()
  return holdings.filter((h) => h.kind === 'simple' && !h.paper && h.marketUid?.toLowerCase() === m && h.valueUsd >= 0.5).map((h) => ({
    ...h, kind: 'borrow' as const, putUp: true as const,
    label: `${h.symbol} put up`, collateralUid: h.marketUid, debtUid: o.debt.uid, debtSymbol: o.debt.symbol, debtDecimals: o.debt.decimals, debtAmount: 0,
    collateralAddress: h.assetAddress, debtAddress: o.debt.address, collateralUsd: h.valueUsd, health: null,
  }))
}

/**
 * The wallet's running loans and its collateral already put up, by offer id: a loan under the offer
 * with the same two legs (or one rebuilt from the position when the list has no such offer), a
 * plain deposit under every offer on its market ({@link depositsAsLoans}).
 */
export function loansByOffer(offers: BorrowOffer[], holdings: Holding[]): Map<string, Holding[]> {
  const m = new Map<string, Holding[]>()
  const add = (id: string, h: Holding) => m.set(id, [...(m.get(id) ?? []), h])
  const byLegs = new Map(offers.map((o) => [`${o.collateral.uid.toLowerCase()}|${o.debt.uid.toLowerCase()}`, o]))
  const byColl = new Map<string, BorrowOffer[]>()
  for (const o of offers) { const k = o.collateral.uid.toLowerCase(); byColl.set(k, [...(byColl.get(k) ?? []), o]) }
  for (const h of holdings) {
    if (h.kind === 'borrow' && h.collateralUid && h.debtUid) {
      const o = byLegs.get(`${h.collateralUid.toLowerCase()}|${h.debtUid.toLowerCase()}`) ?? offerFromHolding(h)
      if (o) add(o.id, h)
    } else if (h.kind === 'simple' && h.marketUid && !h.paper) {
      for (const o of byColl.get(h.marketUid.toLowerCase()) ?? []) for (const d of depositsAsLoans(o, [h])) add(o.id, d)
    }
  }
  return m
}

/** What the wallet has for one offer: idle on its chain, already put up in its market, a loan on it — and how much it could take there, held to Safe. */
export interface Yours { idleUsd: number; idleAmount: number; symbol: string; putUpUsd: number; loan: boolean; room: number }
/**
 * Every offer the wallet could borrow on with what it has (tickets/0011, "Against what you hold"):
 * an idle balance of the asset on the offer's chain, collateral already in its market, or a loan
 * running there. `room` is what the Safe zone would let it take with that much put up.
 */
export function yoursOf(offers: BorrowOffer[], idle: { asset: string; chainId: string; usd: number; amount: number; symbol: string }[], held: Map<string, Holding[]>): Map<string, Yours> {
  const m = new Map<string, Yours>()
  for (const o of offers) {
    const here = idle.filter((i) => i.asset === o.asset && i.chainId === o.chainId && i.usd >= 1)
    const hs = held.get(o.id) ?? []
    const idleUsd = here.reduce((a, i) => a + i.usd, 0), putUpUsd = hs.filter(isPutUp).reduce((a, h) => a + h.valueUsd, 0)
    const loan = hs.some((h) => !isPutUp(h))
    if (!idleUsd && !putUpUsd && !loan) continue
    const usd = idleUsd + putUpUsd
    const room = o.maxLtv > 0 ? Math.min(maxBorrowUsd(o, usd), Math.max(0, usd * o.liqLtv * (1 - bordersFor(o).safe))) : 0
    m.set(o.id, { idleUsd, idleAmount: here.reduce((a, i) => a + i.amount, 0), symbol: here[0]?.symbol ?? o.collateral.symbol, putUpUsd, loan, room })
  }
  return m
}

/**
 * The collateral, USD, to ADD so that `owedUsd + take` lands where the Safe chip would put it —
 * a quarter of the way into the Safe zone — and never past the venue's limit or the health floor.
 * What "by amount" fills the Put up box with when the reader names the sum they need.
 */
export function collateralFor(o: Pick<BorrowOffer, 'maxLtv' | 'liqLtv'>, b: Borders, take: number, heldUsd = 0, owedUsd = 0): number {
  const debt = owedUsd + Math.max(0, take)
  if (!(debt > 0) || !(o.liqLtv > 0)) return 0
  const drop = b.safe + (1 - b.safe) * 0.25
  const need = Math.max(debt / (o.liqLtv * (1 - drop)), o.maxLtv > 0 ? debt / o.maxLtv : 0, (debt * MIN_HEALTH) / o.liqLtv)
  return Math.max(0, need - heldUsd)
}
