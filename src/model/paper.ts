/**
 * The paper ledger (tickets/0006): play money on real rates.
 *
 * PURE and SELF-CONTAINED — no imports. pos-indexer keeps a VERBATIM copy at
 * `packages/social/src/paperModel.ts` and applies every signed op with it, so the
 * book the server keeps and the one this app shows are computed by one function
 * (`pnpm paper-check` compares the two files). Change it here, copy it there.
 *
 * The model:
 *   - a BANK of real tokens per chain (`bank[chainId][token] = units`), seeded by
 *     `STARTER` on every chain the app offers;
 *   - POSITIONS, each a snapshot of the strategy it was opened from plus units of
 *     the held token (and of the debt, for a loop) as of `asOf`, accruing at
 *     `rate` (APR %, simple — the app's rates are APR and add, docs/apis.md);
 *   - bridges IN FLIGHT, debited at send and landed when their quoted time is up.
 *
 * Every action is one op, applied by `apply()`: settle (accrue every position to
 * `now`, land due bridges), then the op. An op that would create value is
 * refused: whatever leaves the bank or a position is worth at least what arrives
 * (within `TOLERANCE`, for two price feeds a few seconds apart).
 *
 * Valuation. A yield-bearing token (an LST, a savings dollar, a PT) carries its
 * yield in its price — and the rate the API quotes carries it too (`intrinsic`).
 * Counting both would pay it twice. So a SAVING (`mode: 'peg'`) is priced at its
 * open price, scaled only by its money's live price (`snap.money`; a loop's money
 * is its debt), and earns the full rate; a DIRECTIONAL position (`mode: 'live'`)
 * is marked to market on every leg and accrues the rate without the token's own
 * yield. Either way the PnL is what the strategy earned, not what a price did.
 */

export const PAPER_VERSION = 1
const YEAR_MS = 365 * 86_400_000
/** A route may come out up to this much richer than the price feed says (two feeds, a few seconds apart). */
export const TOLERANCE = 0.01
export const MAX_TOPUPS = 5
export const TOPUP_UNITS = 10_000
/** Below this a balance or a position is gone. */
const DUST = 1e-9

export const ZERO_EVM = '0x0000000000000000000000000000000000000000'
/** Solana's native coin, as the balances route and the action builders spell it (the System Program id). */
export const SOL_NATIVE = '11111111111111111111111111111111'
export const isSol = (chainId: string) => chainId === 'solana'
/** The chain's native coin as a bank key. */
export const nativeOf = (chainId: string) => (isSol(chainId) ? SOL_NATIVE : ZERO_EVM)
/** A token as a bank key: hex lowered, base58 verbatim (its case IS the address); every native alias is the one key. */
export function tokenKey(chainId: string, address: string): string {
  const a = String(address ?? '').trim()
  if (isSol(chainId)) return a === 'native' || a === SOL_NATIVE ? SOL_NATIVE : a
  const l = a.toLowerCase()
  return /^0x0{40}$/.test(l) || /^0xe{40}$/.test(l) ? ZERO_EVM : l
}

// ----------------------------------------------------------------- the starting bank
/** `refUsd`: the price the token is counted at in what was put in, when the feed has none at genesis (a dollar is 1). */
export interface StarterToken { address: string; symbol: string; decimals: number; units: number; refUsd: number }
export interface StarterChain { chainId: string; dollar: StarterToken; native?: StarterToken }
/**
 * Every chain the app offers (`CHAINS` in sdk/queries.ts): its dollar and, where the gas coin is
 * not itself the dollar, ~$2–3k of it. Dollars are the API's own token-list entries (read
 * 2026-10-11); the gas-coin figures are round numbers at that day's prices. Arc's and Stable's gas
 * coin IS their dollar (an ERC-20), and Tempo has none, so they get the dollar only.
 */
const ETH = (units = 1): StarterToken => ({ address: ZERO_EVM, symbol: 'ETH', decimals: 18, units, refUsd: 2500 })
const usd = (address: string, symbol = 'USDC', decimals = 6): StarterToken => ({ address, symbol, decimals, units: 10_000, refUsd: 1 })
const coin = (symbol: string, units: number, refUsd: number, address = ZERO_EVM, decimals = 18): StarterToken => ({ address, symbol, decimals, units, refUsd })
export const STARTER: StarterChain[] = [
  { chainId: '1', dollar: usd('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'), native: ETH() },
  { chainId: '8453', dollar: usd('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'), native: ETH() },
  { chainId: '42161', dollar: usd('0xaf88d065e77c8cc2239327c5edb3a432268e5831'), native: ETH() },
  { chainId: '56', dollar: usd('0x55d398326f99059ff775485246999027b3197955', 'USDT', 18), native: coin('BNB', 3, 748) },
  { chainId: '43114', dollar: usd('0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e'), native: coin('AVAX', 250, 10.56) },
  { chainId: '10', dollar: usd('0x0b2c639c533813f4aa9d7837caf62653d097ff85'), native: ETH() },
  { chainId: '999', dollar: usd('0xb88339cb7199b77e23db6e890353e22632ba630f'), native: coin('HYPE', 30, 85.3) },
  { chainId: '143', dollar: usd('0x754704bc059f8c67012fed69bc8a327a5aafb603'), native: coin('MON', 100_000, 0.0261) },
  { chainId: '9745', dollar: usd('0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb', 'USDT0'), native: coin('XPL', 30_000, 0.0875) },
  { chainId: '137', dollar: usd('0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'), native: coin('POL', 25_000, 0.1016) },
  { chainId: '5042', dollar: usd('0x3600000000000000000000000000000000000000') },
  { chainId: '4663', dollar: usd('0x5fc5360d0400a0fd4f2af552add042d716f1d168', 'USDG'), native: ETH() },
  { chainId: '4217', dollar: usd('0x20c0000000000000000000000000000000000000', 'pathUSD') },
  { chainId: '988', dollar: usd('0x779ded0c9e1022225f8e0630b35a9b54be713736', 'USDT0') },
  { chainId: '98866', dollar: usd('0xdddd73f5df1f0dc31373357beac77545dc5a6f3f', 'pUSD'), native: coin('PLUME', 100_000, 0.0202) },
  { chainId: 'solana', dollar: usd('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), native: coin('SOL', 20, 109.3, SOL_NATIVE, 9) },
]
export const starterOf = (chainId: string) => STARTER.find((c) => c.chainId === chainId)
/** Every token the starter bank names, with its symbol and decimals: what a bank row is called without a token list. */
export function starterTokens(): { chainId: string; address: string; symbol: string; decimals: number }[] {
  return STARTER.flatMap((c) => [c.dollar, ...(c.native ? [c.native] : [])].map((t) => ({ chainId: c.chainId, address: tokenKey(c.chainId, t.address), symbol: t.symbol, decimals: t.decimals })))
}

// ----------------------------------------------------------------- shapes
export interface PaperRate {
  /** APR % the held (collateral) units grow at */
  supply: number
  /** APR % the debt units grow at (0 on a deposit) */
  borrow: number
  /** the incentive part of each, kept so a refresh of the base rate (the server's hourly tick) keeps them */
  supplyRewards?: number
  borrowRewards?: number
  /** the held token's own yield, left out of a 'live' position's `supply` (its price carries it) — kept to SAY the rate whole */
  intrinsic?: number
}
export interface PaperLeg { symbol: string; decimals: number; address: string; priceUsd: number; logo?: string }
/** What a position needs to be named, priced and matched to its catalogue row when that row is gone. */
export interface PaperSnap {
  /** the row it sits on (`Strategy.asset`) and its group (`USD` · `ETH` · `BTC` · `MORE`) */
  asset: string
  group: string
  label: string
  venue: string
  logo?: string
  /** deposit: its earn uid; loop: the collateral market */
  earnUid?: string
  marketUid?: string
  /** loop: the debt market */
  debtUid?: string
  lender?: string
  /** the held token (a deposit's underlying, a loop's collateral) and its price at the open */
  held: PaperLeg
  debt?: PaperLeg
  /** loop: the liquidation threshold */
  liqLtv?: number
  /** 'peg': a saving, priced at the open scaled by its money's price; 'live': every leg marked to market */
  mode: 'peg' | 'live'
  /** a 'peg' deposit's money (the chain's ether for an ETH deposit); absent = the open price holds. A loop's money is its debt. */
  money?: PaperLeg
  nature?: string
  /** a fixed term or maturity, unix seconds (said, not enforced) */
  maturity?: number
}
export interface PaperPosition {
  id: string
  chainId: string
  kind: 'simple' | 'loop'
  strategyId: string
  snap: PaperSnap
  /** held units and debt units as of `asOf` (ms) */
  units: number
  debtUnits: number
  asOf: number
  rate: PaperRate
  /** dollars put in, net of the share already taken out — what the PnL is measured against */
  basisUsd: number
  entryCostUsd: number
  openedAt: number
}
export interface PaperTransfer { id: string; fromChainId: string; toChainId: string; token: string; units: number; bridge?: string; sentAt: number; arrivesAt: number }
export interface PaperLedger {
  v: number
  /** the EVM address: the account the server keys the book by and every op is signed by */
  account: string
  /** the linked Solana address, if any */
  sol?: string
  createdAt: number
  bank: Record<string, Record<string, number>>
  /** what was put in, in dollars when it was: the starter bank at genesis + every top-up */
  putInUsd: number
  /** realized PnL: what closed positions, withdrawals and trades gained or lost against their basis */
  realizedUsd: number
  topups: number
  positions: PaperPosition[]
  inflight: PaperTransfer[]
  /** ops applied */
  seq: number
  updatedAt: number
}
/** What the route said, kept with a trade. */
export interface QuoteStamp { bridge?: string; aggregator?: string; estimatedDuration?: number }
export type PaperOp =
  | { t: 'genesis'; sol?: string }
  | { t: 'topup'; chainId: string; units: number }
  | { t: 'swap'; chainId: string; from: string; to: string; unitsIn: number; unitsOut: number; route?: QuoteStamp }
  | { t: 'bridge'; id: string; fromChainId: string; toChainId: string; from: string; to: string; unitsIn: number; unitsOut: number; arrivesAt: number; route?: QuoteStamp }
  /** a deposit or a loop: a new position, or more of `into` */
  | { t: 'open'; id: string; into?: string; chainId: string; kind: 'simple' | 'loop'; strategyId: string; snap: PaperSnap; pay: { token: string; units: number }; units: number; debtUnits: number; rate: PaperRate; entryCostUsd: number }
  /** out of a deposit: `units` of the held token, paid out as `receive` (the token, or the gas coin it wraps) */
  | { t: 'withdraw'; id: string; units: number; all?: boolean; receive: { token: string; units: number } }
  /** a loop up: borrow `addDebt` more and hold `addUnits` more */
  | { t: 'lever'; id: string; addUnits: number; addDebt: number; costUsd: number }
  /** a loop down: sell `units` of collateral, repay `debtUnits`, and what is left comes back as `receive`; `all` closes it */
  | { t: 'reduce'; id: string; units: number; debtUnits: number; receive: { token: string; units: number }[]; costUsd: number; all?: boolean }
export type PaperOpKind = PaperOp['t']

export class PaperError extends Error {}
/** A price in USD for a token on a chain, or undefined when the feed has none. */
export type PriceFn = (chainId: string, token: string) => number | undefined
/** Fresh rates for a position, or undefined to keep its own. */
export type RateFn = (p: PaperPosition) => PaperRate | undefined
export interface ApplyCtx { now: number; price?: PriceFn; rate?: RateFn }

// ----------------------------------------------------------------- small helpers
const fin = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const nonNeg = (x: unknown, what: string): number => { if (!fin(x) || x < 0) throw new PaperError(`${what} must be a number ≥ 0`); return x }
const pos = (x: unknown, what: string): number => { if (!fin(x) || x <= 0) throw new PaperError(`${what} must be a number > 0`); return x }
const str = (x: unknown, what: string, max = 200): string => { if (typeof x !== 'string' || !x || x.length > max) throw new PaperError(`${what} is missing or too long`); return x }
const clone = (l: PaperLedger): PaperLedger => ({ ...l, bank: Object.fromEntries(Object.entries(l.bank).map(([c, b]) => [c, { ...b }])), positions: l.positions.map((p) => ({ ...p, rate: { ...p.rate } })), inflight: l.inflight.map((t) => ({ ...t })) })
/** What the bank holds of a token. */
export const balanceOf = (l: PaperLedger, chainId: string, token: string) => l.bank[chainId]?.[tokenKey(chainId, token)] ?? 0
function credit(l: PaperLedger, chainId: string, token: string, units: number) {
  if (!(units > 0)) return
  const k = tokenKey(chainId, token)
  const b = (l.bank[chainId] ??= {})
  b[k] = (b[k] ?? 0) + units
}
function debit(l: PaperLedger, chainId: string, token: string, units: number) {
  const k = tokenKey(chainId, token)
  const have = l.bank[chainId]?.[k] ?? 0
  // a Max typed off a rounded balance may ask a hair more than is there
  if (units > have * (1 + 1e-9) + DUST) throw new PaperError(`not enough in the paper bank: ${units} asked, ${have} held`)
  const left = have - units
  if (left <= DUST || left <= have * 1e-12) delete l.bank[chainId]![k]
  else l.bank[chainId]![k] = left
}
const priceOr = (price: PriceFn | undefined, chainId: string, token: string, fallback?: number): number | undefined => {
  const p = price?.(chainId, tokenKey(chainId, token))
  return fin(p) && p > 0 ? p : fallback
}
/**
 * `out` may not be worth more than `inp` (+ tolerance). Both must be priced: a side the feed cannot
 * price could otherwise be minted at will (1 USDC into 1e12 of an unpriced token and back).
 */
function bound(outUsd: number | undefined, inUsd: number | undefined, what: string) {
  if (outUsd == null || inUsd == null) throw new PaperError(`${what}: no price for one side right now, so it cannot be valued — try another token or later`)
  if (outUsd > inUsd * (1 + TOLERANCE) + 0.01) throw new PaperError(`${what}: ${outUsd.toFixed(2)} out for ${inUsd.toFixed(2)} in — a paper trade cannot create value`)
}
/** The highest APR a paper position may claim (%), either way: anything above is a broken feed or a made-up market. */
export const MAX_APR = 100
const clampApr = (x: number | undefined, lo = -MAX_APR) => (x == null || !fin(x) ? undefined : Math.min(MAX_APR, Math.max(lo, x)))
function clampRate(r: PaperRate): PaperRate {
  return {
    supply: clampApr(r.supply)!, borrow: clampApr(r.borrow)!,
    ...(r.supplyRewards != null ? { supplyRewards: clampApr(r.supplyRewards, 0) } : {}),
    ...(r.borrowRewards != null ? { borrowRewards: clampApr(r.borrowRewards, 0) } : {}),
    ...(r.intrinsic != null ? { intrinsic: clampApr(r.intrinsic, 0) } : {}),
  }
}
/** What a starter token is counted at when the feed has no price: what it was put in at. */
export const starterRef = (chainId: string, token: string): number | undefined => {
  const c = starterOf(chainId); if (!c) return undefined
  const k = tokenKey(chainId, token)
  return [c.dollar, ...(c.native ? [c.native] : [])].find((t) => tokenKey(chainId, t.address) === k)?.refUsd
}

// ----------------------------------------------------------------- accrual and valuation
/** Units at `at`: the held side at the supply rate, the debt at the borrow rate, simple APR from `asOf`. */
export function accrued(p: PaperPosition, at: number): { units: number; debtUnits: number } {
  const dt = Math.max(0, at - p.asOf) / YEAR_MS
  return { units: p.units * (1 + (p.rate.supply / 100) * dt), debtUnits: p.debtUnits * (1 + (p.rate.borrow / 100) * dt) }
}
/** The two legs' prices now. A 'peg' position keeps its open price, moved only by its money's (a loop's money is its debt). */
export function legPrices(p: PaperPosition, price?: PriceFn): { pHeld: number; pDebt: number } {
  const d = p.snap.debt
  const pDebt = d ? priceOr(price, p.chainId, d.address, d.priceUsd) ?? 0 : 0
  if (p.snap.mode === 'peg') {
    const ref = p.kind === 'loop' ? d : p.snap.money
    const scale = ref && ref.priceUsd > 0 ? (priceOr(price, p.chainId, ref.address, ref.priceUsd) ?? ref.priceUsd) / ref.priceUsd : 1
    return { pHeld: p.snap.held.priceUsd * scale, pDebt }
  }
  return { pHeld: priceOr(price, p.chainId, p.snap.held.address, p.snap.held.priceUsd) ?? 0, pDebt }
}
export interface PaperValue { units: number; debtUnits: number; heldUsd: number; debtUsd: number; equityUsd: number; leverage: number | null; health: number | null; pnlUsd: number; aprNet: number }
export function valueOf(p: PaperPosition, at: number, price?: PriceFn): PaperValue {
  const { units, debtUnits } = accrued(p, at)
  const { pHeld, pDebt } = legPrices(p, price)
  const heldUsd = units * pHeld, debtUsd = debtUnits * pDebt, equityUsd = heldUsd - debtUsd
  const health = p.kind === 'loop' && debtUsd > 0 && p.snap.liqLtv ? (heldUsd * p.snap.liqLtv) / debtUsd : null
  const leverage = p.kind === 'loop' && equityUsd > 0 ? heldUsd / equityUsd : null
  const aprNet = equityUsd > 0 ? (heldUsd * p.rate.supply - debtUsd * p.rate.borrow) / equityUsd : 0
  return { units, debtUnits, heldUsd, debtUsd, equityUsd, leverage, health, pnlUsd: equityUsd - p.basisUsd, aprNet }
}
export interface PaperBook {
  bankUsd: number
  inflightUsd: number
  deployedUsd: number
  navUsd: number
  /** realized + the open positions' value over their basis — what strategies earned, not what the gas coins did */
  pnlUsd: number
  returnPct: number
  annualUsd: number
  netAprPct: number | null
  worstHealth: number | null
  positions: number
  chains: string[]
}
export function bookOf(l: PaperLedger, at: number, price?: PriceFn): PaperBook {
  let bankUsd = 0, inflightUsd = 0, deployedUsd = 0, open = 0, annualUsd = 0
  let worst: number | null = null
  const chains = new Set<string>()
  for (const [c, b] of Object.entries(l.bank)) for (const [t, u] of Object.entries(b)) bankUsd += u * (priceOr(price, c, t) ?? starterRef(c, t) ?? 0)
  for (const t of l.inflight) inflightUsd += t.units * (priceOr(price, t.toChainId, t.token) ?? starterRef(t.toChainId, t.token) ?? 0)
  for (const p of l.positions) {
    const v = valueOf(p, at, price)
    deployedUsd += v.equityUsd
    open += v.pnlUsd
    annualUsd += (v.heldUsd * p.rate.supply - v.debtUsd * p.rate.borrow) / 100
    if (v.health != null) worst = worst == null ? v.health : Math.min(worst, v.health)
    chains.add(p.chainId)
  }
  const pnlUsd = l.realizedUsd + open
  return {
    bankUsd, inflightUsd, deployedUsd, navUsd: bankUsd + inflightUsd + deployedUsd, pnlUsd,
    returnPct: l.putInUsd > 0 ? (pnlUsd / l.putInUsd) * 100 : 0,
    annualUsd, netAprPct: deployedUsd > 0 ? (annualUsd / deployedUsd) * 100 : null,
    worstHealth: worst, positions: l.positions.length, chains: [...chains].sort(),
  }
}

// ----------------------------------------------------------------- the ledger
export function emptyLedger(account: string, now: number): PaperLedger {
  return { v: PAPER_VERSION, account, createdAt: now, bank: {}, putInUsd: 0, realizedUsd: 0, topups: 0, positions: [], inflight: [], seq: 0, updatedAt: now }
}
/** Accrue every position to `now` (re-based, with fresh rates where the caller has them) and land the bridges that are due. */
export function settle(l0: PaperLedger, ctx: ApplyCtx): PaperLedger {
  const l = clone(l0)
  for (const p of l.positions) {
    if (ctx.now > p.asOf) {
      const a = accrued(p, ctx.now)
      p.units = a.units; p.debtUnits = a.debtUnits; p.asOf = ctx.now
    }
    const r = ctx.rate?.(p)
    if (r && fin(r.supply) && fin(r.borrow)) p.rate = clampRate({ ...p.rate, ...r })
  }
  const due = l.inflight.filter((t) => t.arrivesAt <= ctx.now)
  for (const t of due) credit(l, t.toChainId, t.token, t.units)
  l.inflight = l.inflight.filter((t) => t.arrivesAt > ctx.now)
  return l
}
/** A position's own token, unpriced by the feed, is worth what the position values it at. */
const ownPrice = (p: PaperPosition, token: string, pHeld: number, pDebt: number): number | undefined => {
  const k = tokenKey(p.chainId, token)
  if (k === tokenKey(p.chainId, p.snap.held.address) && pHeld > 0) return pHeld
  if (p.snap.debt && k === tokenKey(p.chainId, p.snap.debt.address) && pDebt > 0) return pDebt
  return undefined
}
const findPos = (l: PaperLedger, id: string) => { const p = l.positions.find((x) => x.id === id); if (!p) throw new PaperError(`no paper position ${id}`); return p }
function checkSnap(s: PaperSnap, kind: 'simple' | 'loop') {
  if (!s || typeof s !== 'object') throw new PaperError('snap missing')
  str(s.asset, 'snap.asset'); str(s.group, 'snap.group', 40); str(s.label, 'snap.label'); str(s.venue, 'snap.venue')
  if (!s.held) throw new PaperError('snap.held missing')
  str(s.held.symbol, 'snap.held.symbol', 80); str(s.held.address, 'snap.held.address', 80); nonNeg(s.held.priceUsd, 'snap.held.priceUsd'); nonNeg(s.held.decimals, 'snap.held.decimals')
  if (s.mode !== 'peg' && s.mode !== 'live') throw new PaperError('snap.mode must be peg|live')
  if (kind === 'loop') {
    if (!s.debt) throw new PaperError('a loop needs snap.debt')
    str(s.debt.symbol, 'snap.debt.symbol', 80); str(s.debt.address, 'snap.debt.address', 80); pos(s.debt.priceUsd, 'snap.debt.priceUsd')
    pos(s.liqLtv, 'snap.liqLtv')
    if (s.liqLtv! >= 1.5) throw new PaperError('snap.liqLtv out of range')
  }
}

/**
 * Apply one op at `ctx.now` with `ctx.price` (the caller's feed; the server's own on the server).
 * Returns the new ledger; throws `PaperError` with a readable reason and leaves the old one untouched.
 */
export function apply(l0: PaperLedger, op: PaperOp, ctx: ApplyCtx): PaperLedger {
  if (!op || typeof op !== 'object' || typeof (op as { t?: unknown }).t !== 'string') throw new PaperError('op missing')
  if (op.t !== 'genesis' && l0.seq === 0 && !Object.keys(l0.bank).length) throw new PaperError('the paper account has no bank yet')
  const l = settle(l0, ctx)
  const P = (chainId: string, token: string, fallback?: number) => priceOr(ctx.price, chainId, token, fallback)
  const usdOf = (chainId: string, token: string, units: number, fallback?: number) => { const p = P(chainId, token, fallback); return p == null ? undefined : units * p }
  switch (op.t) {
    case 'genesis': {
      if (l0.seq > 0 || Object.keys(l0.bank).length) throw new PaperError('the paper account already exists')
      let put = 0
      for (const c of STARTER) for (const t of [c.dollar, ...(c.native ? [c.native] : [])]) {
        credit(l, c.chainId, t.address, t.units)
        put += t.units * (P(c.chainId, t.address) ?? t.refUsd)
      }
      l.putInUsd = put
      if (op.sol) l.sol = str(op.sol, 'sol', 64)
      break
    }
    case 'topup': {
      const c = starterOf(str(op.chainId, 'chainId', 20)); if (!c) throw new PaperError(`no paper bank on chain ${op.chainId}`)
      const units = pos(op.units, 'units')
      if (units > TOPUP_UNITS) throw new PaperError(`a top-up is at most ${TOPUP_UNITS} ${c.dollar.symbol}`)
      if (l.topups >= MAX_TOPUPS) throw new PaperError(`at most ${MAX_TOPUPS} top-ups per paper account`)
      credit(l, c.chainId, c.dollar.address, units)
      l.putInUsd += units * (P(c.chainId, c.dollar.address) ?? 1)
      l.topups++
      break
    }
    case 'swap': {
      const c = str(op.chainId, 'chainId', 20), inU = pos(op.unitsIn, 'unitsIn'), outU = pos(op.unitsOut, 'unitsOut')
      if (tokenKey(c, op.from) === tokenKey(c, op.to)) throw new PaperError('a swap needs two different tokens')
      const inUsd = usdOf(c, op.from, inU), outUsd = usdOf(c, op.to, outU)
      bound(outUsd, inUsd, 'swap')
      debit(l, c, op.from, inU); credit(l, c, op.to, outU)
      if (inUsd != null && outUsd != null) l.realizedUsd += outUsd - inUsd
      break
    }
    case 'bridge': {
      const from = str(op.fromChainId, 'fromChainId', 20), to = str(op.toChainId, 'toChainId', 20)
      const inU = pos(op.unitsIn, 'unitsIn'), outU = pos(op.unitsOut, 'unitsOut')
      if (from === to) throw new PaperError('a bridge crosses chains — use a swap')
      if (!fin(op.arrivesAt)) throw new PaperError('arrivesAt missing')
      const inUsd = usdOf(from, op.from, inU), outUsd = usdOf(to, op.to, outU)
      bound(outUsd, inUsd, 'bridge')
      debit(l, from, op.from, inU)
      // never later than a day, never before now: a quote's ETA, held to something a person waits for
      const arrivesAt = Math.min(ctx.now + 86_400_000, Math.max(ctx.now, op.arrivesAt))
      if (arrivesAt <= ctx.now) credit(l, to, op.to, outU)
      else l.inflight.push({ id: str(op.id, 'id', 64), fromChainId: from, toChainId: to, token: tokenKey(to, op.to), units: outU, bridge: op.route?.bridge, sentAt: ctx.now, arrivesAt })
      if (inUsd != null && outUsd != null) l.realizedUsd += outUsd - inUsd
      break
    }
    case 'open': {
      const c = str(op.chainId, 'chainId', 20)
      if (op.kind !== 'simple' && op.kind !== 'loop') throw new PaperError('kind must be simple|loop')
      checkSnap(op.snap, op.kind)
      const units = pos(op.units, 'units'), debtUnits = op.kind === 'loop' ? pos(op.debtUnits, 'debtUnits') : 0
      const payU = pos(op.pay?.units, 'pay.units')
      if (!fin(op.rate?.supply) || !fin(op.rate?.borrow)) throw new PaperError('rate missing')
      const payUsd = usdOf(c, op.pay.token, payU)
      // the held token may be one the feed does not price (a fresh PT, a vault share): then it is
      // valued at the caller's price for good ('peg') — bounded right here by what was paid
      const heldFeed = P(c, op.snap.held.address)
      const heldP = heldFeed ?? (op.snap.held.priceUsd > 0 ? op.snap.held.priceUsd : undefined)
      // a debt is always a priced token (what a market lends): no feed, no loop
      const debtP = op.snap.debt ? P(c, op.snap.debt.address) : 0
      // gross: what is held may not be worth more than what was paid plus what was borrowed
      bound(heldP == null ? undefined : units * heldP, payUsd == null || debtP == null ? undefined : payUsd + debtUnits * debtP, op.kind === 'loop' ? 'loop open' : 'deposit')
      if (op.kind === 'loop' && op.snap.liqLtv && debtP && heldP && (units * heldP * op.snap.liqLtv) / (debtUnits * debtP) < 1) throw new PaperError('this loop would be liquidated the moment it opens — lower the leverage')
      debit(l, c, op.pay.token, payU)
      const basis = payUsd!
      // the feed's prices, never the caller's, are what a position is valued at from here on
      const stamp = (leg: PaperLeg | undefined) => (leg ? { ...leg, priceUsd: P(c, leg.address, leg.priceUsd) ?? leg.priceUsd } : undefined)
      const money = op.snap.money && P(c, op.snap.money.address) ? stamp(op.snap.money) : undefined
      const snap: PaperSnap = { ...op.snap, held: { ...op.snap.held, priceUsd: heldP! }, ...(op.snap.debt ? { debt: stamp(op.snap.debt) } : {}), money, mode: heldFeed == null ? 'peg' : op.snap.mode }
      if (!money) delete snap.money
      if (op.into) {
        const p = findPos(l, op.into)
        if (p.kind !== op.kind || p.chainId !== c || p.strategyId !== op.strategyId) throw new PaperError('can only add to the same strategy')
        // a saving keeps its first open's price: units bought at today's are restated at it, so their value is today's
        const { pHeld } = legPrices(p, ctx.price)
        const conv = p.snap.mode === 'peg' && heldP && pHeld > 0 ? heldP / pHeld : 1
        p.units += units * conv; p.debtUnits += debtUnits; p.basisUsd += basis
        p.entryCostUsd += nonNeg(op.entryCostUsd ?? 0, 'entryCostUsd')
        p.rate = clampRate(op.rate)
      } else {
        if (l.positions.some((x) => x.id === op.id)) throw new PaperError('a position with that id exists')
        l.positions.push({
          id: str(op.id, 'id', 64), chainId: c, kind: op.kind, strategyId: str(op.strategyId, 'strategyId', 300), snap,
          units, debtUnits, asOf: ctx.now, rate: clampRate(op.rate), basisUsd: basis, entryCostUsd: nonNeg(op.entryCostUsd ?? 0, 'entryCostUsd'), openedAt: ctx.now,
        })
      }
      break
    }
    case 'withdraw': {
      const p = findPos(l, str(op.id, 'id', 64))
      if (p.kind !== 'simple') throw new PaperError('a loop is reduced, not withdrawn from')
      const units = op.all ? p.units : Math.min(p.units, pos(op.units, 'units'))
      if (!op.all && op.units > p.units * (1 + 1e-9) + DUST) throw new PaperError(`only ${p.units} ${p.snap.held.symbol} in the position`)
      const recvU = pos(op.receive?.units, 'receive.units')
      const { pHeld } = legPrices(p, ctx.price)
      const outUsd = usdOf(p.chainId, op.receive.token, recvU, ownPrice(p, op.receive.token, pHeld, 0))
      bound(outUsd, units * pHeld, 'withdrawal')
      const share = p.units > 0 ? units / p.units : 1
      const basisOut = p.basisUsd * share
      credit(l, p.chainId, op.receive.token, recvU)
      l.realizedUsd += (outUsd ?? units * pHeld) - basisOut
      p.basisUsd -= basisOut
      p.units -= units
      if (op.all || p.units <= DUST || share > 1 - 1e-9) l.positions = l.positions.filter((x) => x !== p)
      break
    }
    case 'lever': {
      const p = findPos(l, str(op.id, 'id', 64))
      if (p.kind !== 'loop') throw new PaperError('only a loop is levered')
      const addU = pos(op.addUnits, 'addUnits'), addD = pos(op.addDebt, 'addDebt')
      const { pHeld, pDebt } = legPrices(p, ctx.price)
      bound(addU * pHeld, addD * pDebt, 'leverage step')
      p.units += addU; p.debtUnits += addD
      p.entryCostUsd += nonNeg(op.costUsd ?? 0, 'costUsd')
      if (p.snap.liqLtv && pDebt > 0 && (p.units * pHeld * p.snap.liqLtv) / (p.debtUnits * pDebt) < 1) throw new PaperError('this would put the loop past liquidation — pick a lower leverage')
      break
    }
    case 'reduce': {
      const p = findPos(l, str(op.id, 'id', 64))
      if (p.kind !== 'loop') throw new PaperError('a deposit is withdrawn from, not reduced')
      const units = op.all ? p.units : Math.min(p.units, pos(op.units, 'units'))
      const repay = op.all ? p.debtUnits : Math.min(p.debtUnits, nonNeg(op.debtUnits, 'debtUnits'))
      if (!Array.isArray(op.receive)) throw new PaperError('receive must be a list')
      const { pHeld, pDebt } = legPrices(p, ctx.price)
      let outUsd = 0, priced = true
      for (const r of op.receive) { const u = nonNeg(r.units, 'receive.units'); const v = usdOf(p.chainId, r.token, u, ownPrice(p, r.token, pHeld, pDebt)); if (v == null) priced = false; else outUsd += v }
      // what is sold pays the debt and whatever comes back — never more
      bound(priced ? outUsd + repay * pDebt : undefined, units * pHeld, op.all ? 'close' : 'deleverage')
      const eqBefore = p.units * pHeld - p.debtUnits * pDebt
      const eqOut = units * pHeld - repay * pDebt
      const share = op.all ? 1 : eqBefore > 0 ? Math.min(1, Math.max(0, eqOut / eqBefore)) : units / p.units
      const basisOut = p.basisUsd * share
      for (const r of op.receive) credit(l, p.chainId, r.token, r.units)
      l.realizedUsd += (priced ? outUsd : eqOut) - basisOut
      p.basisUsd -= basisOut
      p.units -= units; p.debtUnits -= repay
      if (op.all || p.units <= DUST) {
        if (!op.all && p.debtUnits > DUST) throw new PaperError('selling all the collateral must repay the whole debt — close the loop instead')
        l.positions = l.positions.filter((x) => x !== p)
      } else if (p.snap.liqLtv && p.debtUnits > DUST && (p.units * pHeld * p.snap.liqLtv) / (p.debtUnits * pDebt) < 1) throw new PaperError('this leaves the loop past liquidation')
      break
    }
    default:
      throw new PaperError(`unknown op ${(op as { t: string }).t}`)
  }
  l.seq = l0.seq + 1
  l.updatedAt = ctx.now
  return l
}
