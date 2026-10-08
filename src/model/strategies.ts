/**
 * Strategy rows from the two listings, curated for a simple mode: a plain deposit is one
 * `/v1/data/earn` row on a base asset; a loop is one `/pairs/optimize` row whose collateral
 * resolves to a base asset and whose debt is the same denomination. A dollar's "base asset" is
 * its credit desk (`model/desk.ts`). Pure functions, but for the desk memo they fill
 * (`noteToken`), which positions and balances read.
 */
import type { EarnCapability, EarnMarket, OptimizerRowRaw } from '../sdk/types'
import { baseOfCollateral, baseOfSymbol, denomOf, deskOf, EXPOSURE_ASSETS, exposureOf, groupOf, sameMoney, type GroupId } from './assets'
import { creditDesk, deskKey, moneyOf, noteToken } from './desk'
import { DEFAULT_TIER, netAprAtLeverage, tierLeverages, type TierLeverages } from './leverage'
import { marketTag } from './market'
import { natureOfDeposit, type Nature } from './nature'
import type { HideCode } from './visibility'
import STRATEGY_TOKENS from '../data/strategy-tokens.json'
import { normAddr } from './address'
import { canonGroup } from './assetGroup'
/** `chain:vaultAddress` → the share token you end up holding (scripts/logos.mjs, from the chain token lists). */
const strategyToken = (chainId: string, ref: string | undefined) => (ref ? (STRATEGY_TOKENS as Record<string, { symbol: string; logoURI: string | null }>)[`${chainId}:${normAddr(ref)}`] : undefined)

export type Risk = 1 | 2 | 3
interface Base {
  id: string
  kind: 'simple' | 'loop'
  chainId: string
  group: GroupId
  /**
   * The row this strategy sits on: the base asset (`ETH`, `WBTC`), or for a dollar the DESK whose
   * credit it is — the deposit's own token, a loop's COLLATERAL, never its debt (`DESK` in
   * assets.ts; `nameOf` says it in words). `USDe` for an sUSDe/USDC loop, `syrupUSDC` (Maple) for
   * a syrupUSDC/USDC one.
   */
  asset: string
  /** the desk's issuer id (`ethena`, `circle`, `sym:USDf` for a dollar nobody is named for); dollars only */
  desk?: string
  /** the index's asset-group key of the token the money sits in — a deposit's underlying, a loop's collateral (`model/assetGroup.ts`); opens its asset page */
  assetGroup?: string
  /** that token's own mark (the deposit's underlying, the loop's collateral): the row's face where no curated icon exists (`assetLogo`) */
  tokenLogo?: string
  /** token you end up holding */
  holds: string
  venue: string
  venueKey: string
  logo?: string
  /**
   * A saving, or a position that takes a market's side (`model/nature.ts`). Says what the
   * principal is exposed to, which the rate alone does not: JLP's 8 % is fees on a basket that
   * moves with SOL, a lending market's 8 % is interest.
   */
  nature: Nature
  /** headline %: APR for a deposit, net at the suggested leverage for a loop */
  rate: number
  risk: Risk
  riskLabel: string
  /** the API's own 1-5 score, before it is folded into the three words above — what `Settings.maxRisk` caps. An unrated row carries 5 here, for the cap only: never shown as a score */
  riskScore: number
  /** false when the API scored nothing (no score on a deposit, no breakdown on a loop): the row says `unrated`, never `risk 5/5` */
  rated: boolean
  tvlUsd: number
  /**
   * Set only on a copy the catalogue puts in its HIDDEN list: which floor left
   * this row out. The row itself is otherwise complete, so letting it in is a
   * re-filter rather than a refetch (`model/visibility.ts`).
   */
  hide?: HideCode
}
export interface SimpleStrategy extends Base {
  kind: 'simple'
  earnUid: string
  brand: string
  /** `AAVE_V3`, `MORPHO_BLUE`, `vault.morpho`, … — the family the venue badge is drawn from */
  protocolKey: string
  /** which market of the venue this is (`wstETH 86`, `Ethena Ecosystem`) — '' when the venue has one */
  market: string
  via: string
  /** lending · savings · staking · fixed · vault */
  source: string
  assetAddress: string
  /** the market's own token as the chain spells it (`WHYPE`, `WETH`) — `asset` is its base (`HYPE`, `ETH`) */
  assetSymbol: string
  /**
   * the token a vault leaves you holding (`PT-apyUSD-5NOV2026`, `syrupUSDC`) when it is not the
   * one you put in — its own asset page; the index resolves the symbol to its group
   */
  shareGroup?: string
  shareLogo?: string
  /** the API says the chain's coin can be paid in / paid out for this row (`acceptsNative`); undefined on an API without the flag */
  nativeIn?: boolean
  nativeOut?: boolean
  /**
   * The row trades on a book (a Pendle PT on its AMM): the API needs `slippage` on its deposit and
   * withdrawal (a capability's `requires`) and refuses `isAll` on the exit
   */
  booked?: boolean
  decimals: number
  priceUsd?: number
  exitMode: string
  exitWord: string
  /** `exit.cooldownSecs`: how long a cooldown / queue takes, where the API knows it. Read through {@link exitTerms}. */
  exitSecs?: number
  /** `exit.feeBps`: what leaving NOW costs on a fee-or-queue exit */
  exitFeeBps?: number
  /**
   * What can leave the market right now (`EarnMarket.liquidity`), and how much
   * of the deposits are lent out. Size and liquidity are two different
   * questions — a $200m pool that is 99 % borrowed is a pool you cannot get
   * out of today — and the ticket used to answer neither, showing only the
   * size, tucked under the exit word.
   *
   * `undefined` is not zero: 92 of 217 vault rows report no figure, and those
   * say so in words rather than rendering as a market with nothing free.
   */
  liquidityUsd?: number
  /** borrowed / deposited, 0–1 — lending rows only. */
  utilization?: number
  /**
   * The lender market this row is, in the index's uid shape — `refs.marketUid`
   * upstream, which is exactly the key the rate-curve endpoint takes. Absent
   * on vault rows, which have no curve of their own, so it also gates the
   * popover: no uid, no offer to open one.
   */
  marketUid?: string
  /** the vault's (or market's) own address — `ref` upstream. The identity two rows of one curator differ by. */
  ref: string
  /** the share token's own name (`Steakhouse Prime USDC`, `OUSD Vault V1`), from the vault registry */
  vaultName?: string
  canDeposit: boolean
  reason?: string
  maturity?: number
  rewards: number
  /**
   * The market pays nothing of its own: the rate is the token's (`rate.passthrough`), so holding
   * the token in the wallet earns the same. Only exposure assets are asked for these rows — a JLP
   * deposit is the 1× of the JLP loop, collateral already in the market the loop borrows from.
   */
  passthrough?: boolean
  /** `termSheet.supply.headline` — one line, templated from THIS row's numbers. */
  headline?: string
  /**
   * `termSheet.supply.description` — 1-3 sentences saying what the row is.
   *
   * Per ROW, which is the point: the generic per-source sentence it replaces
   * described a category, so the two Bitway USDT products (different vaults,
   * different strategies, different rates) read as the same thing. Absent when
   * the worker served no sheet; callers fall back to the source wording.
   */
  description?: string
}
export interface LoopStrategy extends Base {
  kind: 'loop'
  lender: string
  debt: string
  /** the debt token's asset-group key */
  debtGroup?: string
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
  /** the legs quoted at $10k of collateral — what the LIST ranks and floors on */
  dep: number
  bor: number
  /**
   * The legs at the market's utilisation right now, before anyone adds to it.
   * The ticket starts from these and walks the borrow curve by its own size
   * (`borrowAtSize`): on a thin market the $10k quote alone can be the whole
   * free liquidity, and a 1-token ticket quoted at it read −229 %.
   */
  depSpot: number
  borSpot: number
  rewardsLong: number
  rewardsShort: number
  maxLev: number
  liqLtv: number
  /** leverage at the balanced tier — the list's headline */
  rec: number
  tiers: TierLeverages
  borrowLiquidityUsd: number
  /** the collateral earns on its own (staking, savings, a PT, a fund) — false makes the loop a pure rate bet */
  collateralYields: boolean
  /** whose CONTRACT the collateral is when that is not whose credit (`Pendle` on a PT over sUSDe) */
  instrument?: string
  expiry?: number
  /**
   * Set on a FIXED-RATE loop: the terms the debt can be borrowed for, shortest first. The rate is
   * the broker's, one per term, the same at any size — so `bor` / `borSpot` are the cheapest term and
   * nothing walks a curve. Only Lista's broker today (see `classifyPair`).
   */
  terms?: LoopTerm[]
  /**
   * Set on a Loopscale loop: the loan tenors the open can ask for (the build refuses one without).
   * Each tenor is its own order book. The feed's `termsShort` carries the tenors lenders offer, with
   * a rate and depth (null until ~2026-10; most pairs offer only `1d`); the ticket still quotes each
   * at size and prefers that quote, falling back to the feed's rate when the build cannot quote.
   */
  tenors?: LoopTenor[]
  /**
   * Set on an order-book loan that falls due on one date (Morpho Midnight): the maturity, unix s.
   * Zero-coupon — the face owed is fixed when the loan is taken and does not accrue; repaid early it
   * is still the whole face, with no penalty on top; unpaid at maturity the loan can be liquidated
   * whatever its health. Each maturity is its own market (`MORPHO_MIDNIGHT_<id>`). `bor` / `borSpot`
   * are the top of the book (the API's `borrowAprShort`); the ticket prices its size off the book.
   */
  dueAt?: number
  /** Every maturity of the same pair on the same venue, soonest first (this row among them, without their own `dates`) — the ticket's date picker. */
  dates?: LoopStrategy[]
}
/** One fixed term: `apr` is effective (on `borrowAprShort`'s footing), `days` from the day it is opened. */
export interface LoopTerm { id: string; days: number; apr: number }
/**
 * A Loopscale tenor, in its own enum: `durationType` 0 = days, 1 = weeks, 2 = months. `apr` / `fillable`
 * are the pairs feed's own book for this tenor (`termsShort`, on `borrowAprShort`'s footing; debt
 * tokens it fills at that rate) — absent = no lender offers the tenor.
 */
export interface LoopTenor { id: string; days: number; duration: number; durationType: 0 | 1 | 2; apr?: number; fillable?: number }
/**
 * The four tenors Loopscale's app offers (margin-fetcher-sol `LS_TENORS`). A pair's lenders need not
 * quote all four: a tenor nobody offers answers `NO_OFFER`, and the ticket greys it out.
 */
/** A Loopscale pair's lender key (`LOOPSCALE_<principal>_<collateral>`): one isolated book per pair, loans as accounts. */
export const isLoopscale = (lender?: string) => !!lender?.startsWith('LOOPSCALE_')
export const LOOPSCALE_TENORS: LoopTenor[] = [
  { id: '1d', days: 1, duration: 1, durationType: 0 },
  { id: '1w', days: 7, duration: 1, durationType: 1 },
  { id: '1m', days: 30, duration: 1, durationType: 2 },
  { id: '3m', days: 90, duration: 3, durationType: 2 },
]
export type Strategy = SimpleStrategy | LoopStrategy

/**
 * One row of either listing, judged.
 *
 * `s` is built whenever the app could show the row at all — including when a
 * floor currently hides it, because the floors move. `hide` is set only when
 * there is nothing to build: an asset the whitelist does not map, a debt in
 * another money, a market with no variable borrow. `label` names the row
 * either way, so a list of what was left out can give examples.
 */
export interface Candidate<T extends Strategy> {
  s: T | null
  hide: HideCode | null
  label: string
  chainId: string
}

/** `Capy Fi` is `CapyFi`: the same words, said with different spaces and case. */
const sameWords = (a: string, b: string) => a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase()
/** a group key as an asset page opens it; none when the API sent none */
const groupKey = (g: string | undefined) => (g ? canonGroup(g) : undefined)
const num = (v: string | number | null | undefined): number => { if (v == null || v === '') return 0; const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : 0 }
/**
 * One vocabulary for both listings: the API's 1–5 score, bucketed exactly as
 * the API's own words bucket it — 1–2 low, 3–4 medium, 5 high, 0 / missing
 * unknown (measured 2026-09-25 on both the earn listing and the optimizer:
 * every `low`/`medium`/`high` label sits on those scores). The score, not the
 * label, is read, because the earn listing mixes in colour words that disagree
 * with it (`2 yellow`, `4 red`). An unrated row wears the medium dot, never low.
 */
const riskOf = (score: number | undefined, _label?: string): { risk: Risk; riskLabel: string } => {
  if (!score) return { risk: 2, riskLabel: 'Unrated' }
  const risk: Risk = score <= 2 ? 1 : score <= 4 ? 2 : 3
  return { risk, riskLabel: risk === 1 ? 'Low' : risk === 2 ? 'Medium' : 'High' }
}
const EXIT_WORD: Record<string, string> = { instant: 'Any time', 'instant-capped': 'Any time', 'instant-or-queued': 'Any time or queued', queued: 'Queued', 'fixed-cooldown': 'Cooldown', 'request-based': 'Queued', 'market-sale': 'Sell on market', 'off-chain': 'Off-chain', 'fee-or-queued': 'Fee or queue' }
const DAY = 86400
/** `17 Dec 2026` */
export const dateOf = (t: number) => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const MON: Record<string, number> = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 }
/**
 * A PT's maturity from its symbol, `PT-USD3-17DEC2026` → 17 Dec 2026 00:00 UTC,
 * which is when Pendle expires every PT. Solana spells the year in two digits
 * and sometimes the month in four: Exponent's `PT-eUSX-01DEC26`, Loopscale's
 * `PT-ONyc-10SEPT26` — the DAY is right, the hour is the venue's (an Exponent
 * PT matures at 10:00 or 13:00 UTC; `props.exponent.maturity` has it exactly).
 * For a position the index or the positions route names only by token: neither
 * carries the expiry on the position row, and the catalogue's `maturity` only
 * exists for a PT it lists.
 */
export function ptMaturityOf(symbol: string | null | undefined): number | undefined {
  const m = /^PT-.+-(\d{1,2})([A-Z]{3})T?(\d{2}|\d{4})$/.exec(symbol ?? '')
  if (!m || MON[m[2]] == null) return undefined
  return Date.UTC(m[3].length === 2 ? 2000 + +m[3] : +m[3], MON[m[2]], +m[1]) / 1000
}
/**
 * A held PT's clock, for a position row: the date, and once it is near or past,
 * that the money has to move — a matured PT earns nothing until it is redeemed
 * or rolled into the next maturity.
 */
export function maturityClock(t: number, now = Date.now() / 1000): { text: string; title: string; due: boolean } {
  const days = Math.ceil((t - now) / DAY)
  if (days <= 0) return { text: `matured ${dateOf(t)} · redeem or roll`, title: 'Past maturity the PT redeems 1:1 for the underlying and earns nothing more: redeem it, or roll into a later maturity.', due: true }
  return {
    text: `matures ${dateOf(t)} · ${days}d`,
    title: `Redeems 1:1 for the underlying on ${dateOf(t)}; the rate is locked until then. After it, the position earns nothing until it is redeemed or rolled.`,
    due: days <= 14,
  }
}
/**
 * A fixed-rate LOAN's term on its meta line (`termEndsAt` / `termDays` from the
 * index, Loopscale): `1-day term · fixed to 9 Oct 2026 · 11h`. Loopscale rolls
 * a loan at its term's end — refinanced at the rate then on offer — and only
 * when no lender takes it does the 2-day grace start, so a passed end is
 * amber, never "due": the next read shows the rolled term.
 */
export function termClock(end: number, termDays?: number | null, now = Date.now() / 1000): { text: string; title: string; due: boolean } {
  const left = end - now
  const term = termDays ? `${termDays === 1 ? '1-day' : termDays === 7 ? '1-week' : termDays % 30 === 0 ? `${termDays / 30}-month` : `${termDays}-day`} term` : 'fixed term'
  const when = new Date(end * 1000).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'
  if (left <= 0) return {
    text: `${term} · ended ${dateOf(end)}`,
    title: `The term ended ${when}. The loan is refinanced at the rate then on offer; if no lender takes it, it must be repaid or rolled within the grace period, after which it can be liquidated.`,
    due: true,
  }
  const span = left < DAY ? `${Math.max(1, Math.round(left / 3600))}h` : `${Math.ceil(left / DAY)}d`
  return {
    text: `${term} · fixed to ${dateOf(end)} · ${span}`,
    title: `This loan's rate is fixed until ${when}. At the end of the term it is refinanced at the rate then on offer; if no lender takes it, it must be repaid or rolled within the grace period, after which it can be liquidated.`,
    due: false,
  }
}
/** `7 days`, `~1 day`, `18 h` — a cooldown is a whole number of days nearly always; the `~` says when it is not */
export const spanOf = (secs: number) => {
  if (secs < DAY) return `${Math.max(1, Math.round(secs / 3600))} h`
  const d = Math.round(secs / DAY)
  return `${d * DAY === secs ? '' : '~'}${d} day${d === 1 ? '' : 's'}`
}
/**
 * The exit WITH its clock, from the row's own numbers: a PT's maturity, a
 * cooldown's `cooldownSecs`. `word` / `when` fill the ticket's Exit cell,
 * `short` the list's meta line, `risk` the "what can go wrong" line (null on an
 * instant exit, whose risk is liquidity, said elsewhere).
 *
 * Where the API publishes no time (queued LST exits, most request-based vaults
 * as of 2026-10-02) it says so instead of a vague "may take time".
 */
export function exitTerms(s: SimpleStrategy, now = Date.now() / 1000): { word: string; when: string; short: string; risk: string | null } {
  if (s.maturity) {
    const days = Math.ceil((s.maturity - now) / DAY)
    if (days <= 0) return { word: 'Matured', when: `redeem at par since ${dateOf(s.maturity)}`, short: 'matured', risk: null }
    return {
      word: `${days} day${days === 1 ? '' : 's'}`, when: `par on ${dateOf(s.maturity)} · or sell any time`, short: `matures in ${days}d`,
      risk: `Before ${dateOf(s.maturity)} the only exit is selling on the market, at whatever price is bid — it can be below par.`,
    }
  }
  const word = EXIT_WORD[s.exitMode] ?? s.exitMode
  if (s.exitMode === 'instant' || s.exitMode === 'instant-capped') return { word, when: 'same block', short: 'any time', risk: null }
  const fee = s.exitFeeBps ? `${+(s.exitFeeBps / 100).toFixed(2)}%` : ''
  if (s.exitSecs) {
    const t = spanOf(s.exitSecs)
    const how = s.exitMode === 'fixed-cooldown' ? 'cooldown' : 'queue'
    return {
      word: t, when: fee ? `${how} · or now for a ${fee} fee` : how, short: `${t.replace(/ days?$/, 'd')} ${how}${fee ? ` or ${fee} fee` : ''}`,
      risk: fee ? `Leaving now costs ${fee}; without the fee the exit takes about ${t}.` : `Getting out takes about ${t} (${how}); the funds are not yours to move until then.`,
    }
  }
  return { word, when: 'wait time not published', short: word.toLowerCase(), risk: `Exit is ${word.toLowerCase()} and the venue publishes no wait time: you may wait to get out at par.` }
}

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '')
/** carried by names, carries nothing: `Safe x Steakhouse`, `Gauntlet x Lista USD1 Vault` */
const FILLER = new Set(['x', 'and', 'of', 'the', 'by', 'vault', 'vaults'])
/**
 * Which vault of the venue this is, in the vault's own words.
 *
 * The registry name minus everything the row already says — the curator, the
 * protocol, the asset's symbol AND its long name, and the word "vault" itself.
 * `Steakhouse Prime USDC` under Steakhouse Financial on USDC is `Prime`;
 * `Steakhouse USDC` is nothing; `Fluid USD Coin` is nothing (`USD Coin` is
 * what USDC is called, not which vault this is); `OUSD Vault V1` under the
 * bare `Morpho` brand is `OUSD V1`, which the share symbol `OUSD-V1` already
 * says, so it is dropped too. What survives is exactly the part that tells two
 * vaults of one curator apart.
 */
export function vaultTag(name: string | null | undefined, known: (string | null | undefined)[], holds: string): string {
  const kn = known.flatMap((w) => (w ?? '').split(/[^A-Za-z0-9]+/)).map(norm).filter((w) => w.length > 1)
  // a prefix counts as the same word in both directions: `Spark` is `SparkDAO`,
  // `Sylva` is `Sylva.money`, `USDCcore` carries `USDC`
  const same = (n: string) => kn.some((k) => k === n || (n.length >= 4 && k.startsWith(n)) || (k.length >= 4 && n.startsWith(k)))
  const kept = (name ?? '').split(/\s+/).filter((w) => { const n = norm(w); return n.length > 0 && !FILLER.has(n) && !same(n) })
  const tag = kept.slice(0, 3).join(' ')
  // `OUSD V1` next to the symbol `OUSD-V1`: the row already says it
  return !tag || sameWords(tag.replace(/[-_]/g, ''), holds.replace(/[-_]/g, '')) ? '' : tag
}

/**
 * `/earn` row → plain deposit, or null when it is not a strategy on a base asset we present.
 *
 * `/v1/data/earn` is the ONE source for vaults and lending alike (batched
 * across chains) — no per-chain vault registry is joined. A vault is named
 * from what the row carries: `curator`/`brand`, `name` (the server synthesises
 * `"USDC · 0x5b8b"` for unnamed vaults — the tail is stripped), and
 * `shareToken.symbol` where upstream sets it, else the build-time token map.
 * Where the row is thin, the fix belongs in the earn row, not in a second fetch.
 */
export function classifyEarn(m: EarnMarket): Candidate<SimpleStrategy> {
  const label = `${m.asset?.symbol ?? '?'} \u00b7 ${m.protocol?.name ?? m.brand ?? m.venue}`
  const no = (hide: HideCode): Candidate<SimpleStrategy> => ({ s: null, hide, label, chainId: m.chainId })
  // a dollar, ether or bitcoin sits on its desk's row; anything else on its whitelisted base
  const tok = { ...m.asset, chainId: m.chainId }
  // a vault whose SHARE is an exposure asset is that asset, whatever it is deposited in: Jupiter's
  // JLP pool is minted with USDC (its unit, `asset`), and filed by that it read "USDC savings"
  const exposed = m.venueKind === 'vault' ? EXPOSURE_ASSETS.find((e) => e.chainId === m.chainId && e.address === m.ref) : undefined
  const money = exposed ? undefined : moneyOf(tok)
  const coin = exposed ? exposed.sym : baseOfSymbol(m.asset.symbol)
  let asset = money ? deskKey(tok, money) : coin
  if (!asset) return no('unmapped')
  if (money) noteToken(m.chainId, m.asset.address, asset)
  // the token in words: the asset is a desk for a dollar (`USDS` for a DAI market), so what the
  // row HOLDS is spelled from the token itself
  const own = coin ?? m.asset.symbol
  if (m.basket) return no('basket')
  // the structural gates only: a row nobody can deposit into is not a strategy
  // at any floor. Size, rate and risk are floors and live in `softHide`.
  if (!m.availability?.canDeposit) return no('closed')
  const dep = m.capabilities.find((c) => c.action === 'deposit'); if (!dep) return no('closed')
  const rate = m.rate?.total ?? 0
  const tvl = m.tvl?.usd ?? 0
  const isVault = m.venueKind === 'vault'
  // a row the API left unscored (missing or 0) is treated as its worst: hidden
  // by the default cap of 4, shown by "everything"
  const riskScore = m.risk?.score || 5
  const protocol = m.protocol?.name ?? m.venue
  // the curator is the brand when upstream has none: `vault.morpho` with no
  // curator answers brand = protocol = 'Morpho', and "Morpho vault" is the
  // label that says nothing
  const curator = m.curator?.name ?? undefined
  const brand = m.brand && !sameWords(m.brand, protocol) ? m.brand : curator && !sameWords(curator, protocol) ? curator : m.brand ?? protocol
  // the server names unnamed vaults "USDC · 0x28b3": the address tail is not a token you hold
  const clean = (m.name ?? '').replace(/\s*·\s*0x[0-9a-f]{4,}$/i, '').trim()
  const named = clean && clean.toUpperCase() !== own.toUpperCase() && clean.toUpperCase() !== m.asset.symbol.toUpperCase() ? clean : ''
  // the share token, resolved from the vault address: the listing's own logoURI is the ASSET's on nearly every row
  const share = isVault ? strategyToken(m.chainId, m.ref) : undefined
  // the row's own share token first (null on vault rows as of 2026-09-30); the
  // build-time token map covers the rest it knows (tokens in a chain token list)
  const shareSym = m.shareToken?.symbol ?? share?.symbol
  // A staking or savings vault leaves you holding the ISSUER's token (ankrETH, tETH, syrupUSDC),
  // so the row is that issuer's, not the deposited coin's: staking ETH with Ankr is Ankr's credit.
  // A curated vault keeps its deposit token's desk; where its money sits is a disclosure (`exposure`).
  if (money && (m.venue === 'vault.lst' || m.venue === 'vault.savings')) {
    const st = { chainId: m.chainId, address: m.shareToken?.address ?? m.ref, symbol: shareSym }
    if (moneyOf(st) === money && creditDesk(st, money)) asset = deskKey(st, money)
  }
  // WHICH market: `Lend on Morpho` is the same sentence for three hundred Morpho markets and the
  // ticket deposits into one of them. Skipped when it only repeats the venue (`Capy Fi · CapyFi`).
  // WHICH vault: the same question on the vault side, answered from the row's own name
  const tag = isVault
    ? vaultTag(named, [brand, protocol, curator, m.asset.symbol], shareSym ?? own)
    : marketTag(m.name, m.asset.symbol)
  const market = tag && !sameWords(tag, brand) && !sameWords(tag, protocol) ? tag : ''
  // a PT's maturity is part of WHICH product it is: PT sUSDai Oct and PT sUSDai Feb are two rows
  const maturity = typeof m.maturity?.maturity === 'number' ? m.maturity.maturity : undefined
  let via: string, source: string, holds: string
  if (exposed) { via = `Mint ${exposed.sym} on ${brand}`; source = 'pool'; holds = exposed.sym }
  else if (m.venue === 'vault.lst') { via = `Stake with ${brand}`; source = 'staking'; holds = shareSym || named || own }
  else if (m.venue === 'vault.savings') { via = `${brand} savings`; source = 'savings'; holds = shareSym ?? (named || own) }
  else if (m.venue === 'vault.pendle') { via = `Fixed on Pendle${maturity ? ` · ${dateOf(maturity)}` : ''}`; source = 'fixed'; holds = 'PT ' + (named || own).replace(/^PT\s*/, '').split(' ')[0] }
  else if (isVault) { const who = `${brand}${market ? ` ${market}` : ''} vault`; via = sameWords(brand, protocol) ? who : `${who} · ${protocol}`; source = 'vault'; holds = shareSym ?? (named || own) }
  // the token's own yield, parked as collateral: nobody borrows JLP, and "Lend" would say they do
  else if (m.rate?.passthrough) { via = `Collateral on ${brand}${market ? ` · ${market}` : ''}`; source = 'collateral'; holds = own }
  // the BRAND, not the protocol: `Aave V3` and `Aave V4` are both "Aave" upstream, and a V4
  // isolated market is not the V3 pool the same sentence would have named
  else { via = `Lend on ${brand}${market ? ` · ${market}` : ''}`; source = 'lending'; holds = own }
  const ownLogo = m.logoURI && m.logoURI !== m.asset.logoURI ? m.logoURI : undefined
  const logo = share?.logoURI ?? ownLogo ?? (isVault ? undefined : m.asset.logoURI)
  const exitMode = m.exit?.mode ?? 'instant'
  const { risk, riskLabel } = riskOf(m.risk?.score, m.risk?.label)
  const s: SimpleStrategy = {
    id: `s:${m.earnUid}`, kind: 'simple', chainId: m.chainId, group: groupOf(asset), asset, desk: money ? deskOf(asset)?.id : undefined, assetGroup: groupKey(m.asset.assetGroup), tokenLogo: m.asset.logoURI || undefined, holds, venue: sameWords(brand, protocol) || brand.toLowerCase().includes(protocol.toLowerCase()) ? brand : `${brand} · ${protocol}`, venueKey: m.venue, logo, brand, protocolKey: m.protocol?.key ?? m.venue,
    nature: natureOfDeposit(m.venue, asset, m.name, m.risk?.yieldProfile), rate, risk, riskLabel, riskScore, rated: !!m.risk?.score, tvlUsd: tvl,
    earnUid: m.earnUid, market, via, source, assetAddress: m.asset.address, assetSymbol: m.asset.symbol, shareGroup: shareSym && shareSym.toUpperCase() !== m.asset.symbol.toUpperCase() ? shareSym : undefined, shareLogo: share?.logoURI ?? undefined, decimals: m.asset.decimals, priceUsd: m.asset.priceUsd,
    liquidityUsd: m.liquidity?.usd, utilization: typeof m.utilization === 'number' ? m.utilization : undefined, marketUid: m.refs?.marketUid || undefined,
    exitMode, exitWord: maturity ? 'At maturity' : EXIT_WORD[exitMode] ?? exitMode, exitSecs: m.exit?.cooldownSecs || undefined, exitFeeBps: m.exit?.feeBps || undefined, ref: m.ref, vaultName: named || undefined, canDeposit: true, reason: m.availability?.reason, maturity, rewards: m.rate?.rewards ?? 0, passthrough: m.rate?.passthrough || undefined,
    // an API that knows the flag sets it on the deposit; then a missing withdraw leg (an async exit) is a no
    booked: isBooked(m.venue, m.capabilities) || undefined,
    nativeIn: dep.acceptsNative, nativeOut: dep.acceptsNative === undefined ? undefined : m.capabilities.find((c) => c.action === 'withdraw')?.acceptsNative ?? false,
    headline: m.termSheet?.supply?.headline || undefined, description: m.termSheet?.supply?.description || undefined,
  }
  return { s, hide: null, label, chainId: m.chainId }
}

/**
 * A deposit that settles on a book rather than at a protocol-set price. The capability says so
 * (`requires: ['slippage']`); the venue stands in for a listing that does not publish `requires`.
 */
export const isBooked = (venue: string, caps?: EarnCapability[]): boolean =>
  venue.startsWith('vault.pendle') || venue.startsWith('vault.exponent') || !!caps?.some((c) => (c.action === 'deposit' || c.action === 'withdraw') && c.requires?.includes('slippage'))

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
  // a Solana lender key's instance is a base58 pubkey (KAMINO_C7h9…) or a
  // numbered pool (JUPITER_LEND_main_8): strip those tails like the hex ones
  return lender.replace(/(_(?:[0-9A-F]{40}|[0-9A-F]{6,8}|\d+|[1-9A-HJ-NP-Za-km-z]{32,44}))+$/i, '').replace(/_main$/i, '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Optimizer row → a loop, or the structural reason there is none.
 *
 * Same-denomination carry on a base asset is the only shape the ticket can
 * build, so those four gates answer with a code. Everything else the old
 * version rejected here — thin borrow liquidity, a risk score over the cap, a
 * collateral that earns nothing, a carry that costs more than it pays — is a
 * FLOOR, kept in `Settings` and applied by `softHide` at render, so the list
 * can say how many rows it is holding back and let them in.
 */
export function classifyPair(r: OptimizerRowRaw): Candidate<LoopStrategy> {
  const L = r.underlyingInfoLong.asset, S = r.underlyingInfoShort.asset
  const label = `${L.symbol}/${S.symbol}`
  const no = (hide: HideCode): Candidate<LoopStrategy> => ({ s: null, hide, label, chainId: r.chainId })
  if (r.isBasketLong) return no('basket')
  // fixed-rate debt the ticket can build is a Lista broker's rate card: a few terms, one rate each, set
  // by the broker rather than by size. Every other fixed debt prices off an order book or an auction
  // the API does not quote at size yet (Midnight, Term, TermMax, Teller). Neither flag catches them
  // all: Midnight sends `variableBorrowDisabledShort: false` on every row with a 0 % borrow rate, and
  // a `fixedTerm` block alone means nothing — Lista's float markets and Exactly's pools carry one.
  const terms = r.variableBorrowDisabledShort && r.fixedTerm?.model === 'lista' ? termCard(r) : []
  // Morpho Midnight is the one dated order book the ticket builds: the API prices its top of book
  // (`borrowAprShort`), the book route prices any size, and open and close both have a native route.
  // A maturity nobody is lending into (`canOpen: false`, 0 % and no liquidity) stays out
  const dueAt = r.fixedTerm?.model === 'midnight' && r.debtTerms?.canOpen && num(r.borrowAprShort) > 0 ? r.fixedTerm.maturity : undefined
  // Loopscale flags its loan leg brokered (it has only tenor offers) and the ticket quotes each tenor at
  // size; a pair no strategy lends on right now has no rate (`borrowAprShort` null), so no loop to price
  const loopscaleCard = r.fixedTerm?.model === 'loopscale' && r.borrowAprShort != null && r.borrowAprShort !== ''
  if (dueAt) { if (dueAt * 1000 < Date.now() + 2 * 86400_000) return no('brokered') }
  else if (r.variableBorrowDisabledShort ? !(terms.length || loopscaleCard) : FIXED_DATE.has(r.fixedTerm?.model ?? '') || r.debtTerms?.maturityKind === 'fixed-date') return no('brokered')
  // A dollar, ether or bitcoin loop sits on its COLLATERAL's desk. The debt is a rate, not an
  // exposure: a stable does not depeg upward, so borrowing USDC against sUSDe is Ethena's credit;
  // borrowing WETH against wstETH is Lido's (docs/stablecoin-exposure.md). Any debt of the same
  // money will do, whitelisted or not.
  const coll = { ...L, chainId: r.chainId, desk: r.collateralDesk }
  const debtMoney = moneyOf({ ...S, chainId: r.chainId, desk: r.debtDesk }), collMoney = moneyOf(coll)
  let asset: string | undefined
  // an asset held for its exposure, levered in a money it allows: the bet is the product (JLP
  // borrowed in dollars). Asked before the carry test, which would call it `cross-denom`.
  const exposed = exposureOf(baseOfSymbol(L.symbol))
  const debtDenom = debtMoney ? debtMoney.toLowerCase() : baseOfSymbol(S.symbol) ? denomOf(baseOfSymbol(S.symbol)!) : undefined
  if (exposed) {
    if (!debtDenom || !exposed.debt.includes(debtDenom)) return no(debtDenom ? 'cross-denom' : 'unmapped')
    asset = baseOfSymbol(L.symbol)!
  } else if (debtMoney || collMoney) {
    if (debtMoney !== collMoney) return no((debtMoney || baseOfSymbol(S.symbol)) && (collMoney || baseOfCollateral(L, S.symbol)) ? 'cross-denom' : 'unmapped')
    asset = deskKey(coll, collMoney!)
    noteToken(r.chainId, L.address, asset)
  } else {
    asset = baseOfCollateral(L, S.symbol)
    if (!asset) return no('unmapped')
    const debtBase = baseOfSymbol(S.symbol)
    if (!debtBase) return no('unmapped')
    // the SAME MONEY, not merely the same tab: 'More' holds BNB, AVAX, the euro
    // and gold together, and sAVAX against EURC is a price bet wearing a carry's
    // clothes (docs: assets.ts `denomOf`)
    if (!sameMoney(debtBase, asset)) return no('cross-denom')
  }
  // a carry needs collateral that yields on its own (staking, savings, a PT, a fund); lending one plain stable
  // against another is a rate bet on a small market — a FLOOR (`Settings.showRateBets`), not a structural gate
  const p = L.props ?? {}
  const collateralYields = !!(p.lst || p.savings || p.pendle || p.spectra || p.exponent || p.rwa || (L.intrinsicYield ?? 0) > 0)
  // the at-size legs (quoted at $10k of collateral) when the venue has a depth grid, else the sticker
  const dep = num(r.depositAprAtAmount) || num(r.depositAprLong), maxLev = num(r.maxLeverage)
  const bor = terms.length ? Math.min(...terms.map((t) => t.apr)) : num(r.borrowAprAtAmount) || num(r.borrowAprShort)
  // no leverage and no collateral value are the two the ticket cannot build around;
  // a collateral paying nothing simply lands in the negative-carry bucket below
  if (!(maxLev >= 2)) return no('no-leverage')
  const liq = num(r.borrowLiquidityUsdShort)
  const worst = Math.max(0, ...r.risk.breakdown.map((b) => b.score ?? 0), r.risk.maxTokenScore ?? 0)
  const liqLtv = num(r.collateralFactorLong) || num(r.ltv)
  if (!(liqLtv > 0.3)) return no('thin-ltv')
  const tiers = tierLeverages(maxLev)
  // a price that moves on its own does not get the carry's default: at Balanced a JLP loop is
  // ~5× with a 10 % fall to liquidation, a normal week for SOL. Its headline is the Defensive tier
  const rec = tiers[exposed ? 'defensive' : DEFAULT_TIER]
  // the PT's own clock: Pendle and Spectra on EVM, Exponent on Solana (`maturity`, unix s), else the
  // symbol's date. A matured PT cannot be bought into — Loopscale still lists `PT-ONyc-10SEPT26` books
  const expiry = p.pendle?.expiry ?? p.spectra?.expiry ?? p.spectra?.maturity ?? p.exponent?.maturity ?? ptMaturityOf(L.symbol)
  if (expiry && expiry * 1000 < Date.now()) return no('closed')
  // no outlier cap here: at 75 % of a 28x range a thin carry is legitimately a big number, and the card says what it risks
  const rate = netAprAtLeverage(dep, bor, rec)
  const { risk, riskLabel } = riskOf(worst)
  const venue = venueLabel(r.lender, r.curatorNameLong)
  const instrument = r.collateralDesk?.via ?? (p.pendle || p.spectra || p.exponent ? p.issuer?.name : undefined)
  const s: LoopStrategy = {
    id: `l:${r.marketLongUid}|${r.marketShortUid}`, kind: 'loop', chainId: r.chainId, group: groupOf(asset), asset, desk: debtMoney && !exposed ? deskOf(asset)?.id : undefined, assetGroup: groupKey(L.assetGroup), tokenLogo: L.logoURI || undefined, debtGroup: groupKey(S.assetGroup), nature: exposed?.nature ?? 'savings', holds: L.symbol, venue, venueKey: r.lender, logo: L.logoURI,
    // unscored is not safe: capped like a 5, the same as a deposit the API left unscored
    rate, risk, riskLabel, riskScore: worst || 5, rated: worst > 0, tvlUsd: num(r.totalDepositsUsdLong),
    lender: r.lender, debt: S.symbol, marketLongUid: r.marketLongUid, marketShortUid: r.marketShortUid,
    collateralAddress: L.address, debtAddress: S.address, decimalsLong: L.decimals ?? 18, decimalsShort: S.decimals ?? 18,
    priceLong: r.underlyingInfoLong.prices?.priceUsd, priceShort: r.underlyingInfoShort.prices?.priceUsd, logoLong: L.logoURI, logoShort: S.logoURI,
    dep, bor, depSpot: num(r.depositAprLong) || dep, borSpot: num(r.borrowAprShort) || bor, rewardsLong: num(r.rewardAprLong), rewardsShort: num(r.rewardAprShort), maxLev, liqLtv, rec, tiers, borrowLiquidityUsd: liq, collateralYields,
    expiry, instrument,
    ...(terms.length ? { terms, borSpot: bor } : {}),
    ...(r.fixedTerm?.model === 'loopscale' ? { tenors: loopscaleTenors(r) } : {}),
    ...(dueAt ? { dueAt } : {}),
  }
  return { s, hide: null, label, chainId: r.chainId }
}
/** Fixed debts that fall due on one date and price at size: shown only when the API quotes them honestly. */
const FIXED_DATE = new Set(['midnight', 'term', 'termmax', 'teller'])
/** Loopscale's four tenors, each with the feed's rate and depth where a lender offers it. */
function loopscaleTenors(r: OptimizerRowRaw): LoopTenor[] {
  const adj = num(r.intrinsicYieldShort) - num(r.rewardAprShort)
  const feed = new Map((r.termsShort ?? []).map((t) => [String(t.termId), t]))
  return LOOPSCALE_TENORS.map((t) => {
    const f = feed.get(t.id)
    return f ? { ...t, apr: num(f.aprAtAmount ?? f.apr) + adj, fillable: f.fillable == null ? undefined : num(f.fillable) } : t
  })
}
/** `termsShort` → terms on the same footing as `borrowAprShort` (the card's rates are raw), shortest first. */
function termCard(r: OptimizerRowRaw): LoopTerm[] {
  const adj = num(r.intrinsicYieldShort) - num(r.rewardAprShort)
  return (r.termsShort ?? [])
    .map((t) => ({ id: String(t.termId), days: num(t.durationDays), apr: num(t.apr) + adj }))
    .filter((t) => t.id && t.days > 0)
    .sort((a, b) => a.days - b.days)
}

/**
 * Keep the best row per (asset, holds, venue) so the same pair on one venue does not repeat per e-mode / sub-market.
 *
 * A VAULT is keyed by its own address instead. Two vaults of one curator on
 * one asset are two products with two rates and two sets of collateral — not
 * one market seen twice — and keying them by (asset, holds, venue) silently
 * dropped seven of the 78 (2026-09-23: three Gauntlet USDT vaults on Ethereum,
 * paying 9.77 / 8.79 / 7.92 %, became one row). The cap per asset still
 * decides how many of them a reader is shown.
 *
 * A FIXED-RATE loop is kept apart from the float one on the same pair for
 * the same reason: Lista's slisBNB/WBNB is 0.30 % floating with $6m to
 * borrow and 0.5 % fixed with $141m, and the cheaper one silently won.
 *
 * So is each MATURITY of one PT (a deposit's `maturity`, a loop's collateral
 * `expiry`): `holds` reads `PT sUSDai` for both the Oct and the Feb market, and
 * 2026-10-02 four Pendle pairs lost their nearer maturity to the higher rate.
 */
export const rowKey = (r: Strategy): string =>
  r.kind === 'simple' && r.source === 'vault' ? `${r.chainId}|${r.ref}` : `${r.chainId}|${r.asset}|${r.holds}|${r.venue}|${r.kind === 'loop' ? `${r.debt}${r.terms ? '|fixed' : ''}|${r.expiry ?? ''}${r.dueAt ? `|due${r.dueAt}` : ''}` : r.maturity ?? ''}`
/**
 * One row per dated pair: the maturities of a Midnight pair (each its own market, its own row out of
 * `dedupe`) become one row — the cheapest — carrying all of them as `dates`, for the ticket's picker.
 * The others go back as `rest`: not listed, still openable by id (a holder of that maturity).
 */
export function foldDates(rows: LoopStrategy[]): { rows: LoopStrategy[]; rest: LoopStrategy[] } {
  const groups = new Map<string, LoopStrategy[]>()
  const out: LoopStrategy[] = [], rest: LoopStrategy[] = []
  for (const r of rows) {
    if (!r.dueAt) { out.push(r); continue }
    const k = `${r.chainId}|${r.collateralAddress}|${r.debtAddress}|${r.venue}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  for (const g of groups.values()) {
    // the entries carry no `dates` of their own: no cycle for anything that serialises a row
    const dates = [...g].sort((a, b) => a.dueAt! - b.dueAt!)
    const withDates = dates.map((r) => ({ ...r, dates }))
    const lead = [...withDates].sort((a, b) => b.rate - a.rate)[0]
    out.push(lead); rest.push(...withDates.filter((r) => r !== lead))
  }
  return { rows: out, rest }
}
export function dedupe<T extends Strategy>(rows: T[]): T[] {
  const best = new Map<string, T>()
  for (const r of rows) {
    const k = rowKey(r)
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
    // a pick is a saving: a perp LP or a managed fund is never the default answer for an asset
    if (r.risk > 2 || !r.rated || r.nature !== 'savings') continue
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
