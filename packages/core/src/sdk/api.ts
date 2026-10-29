/**
 * Every call the simple app makes, one function each, on top of the vendored `http.ts`
 * boundary (the place to attach a key or a proxy). Loop parameters are named by meaning
 * (collateral / debt); the API's in/out naming is translated here and nowhere else.
 */
import { ApiError, apiFetch, apiFetchEnvelope, apiFetchLoose, type ApiParams } from '../vendor/allocator/http'
import { isNativeAddress } from '../model/positions'
import { isSvmChain } from '../model/address'
import type { RateHistoryResponse } from '../model/rateHistory'
import type { AnyTx, ApiTx, BorosHedgeData, EarnPositionLeg, EarnPositionsResponse, EarnResponse, IrmResponse, LendingActionData, LendingBook, LendingRange, LoopActions, LoopCloseData, LoopPayAssetsData, LoopQuoteData, OptimizerResponse, TokenBalance } from './types'

/**
 * The catalogue listings (earn + optimizer) answer in 0.5–4 s; a chain is settled once every one
 * of them has answered, so one that never answers must fail instead (`timeoutMs`). With the
 * app's single retry a wedged request costs ~50 s, then the chain settles without it. The home
 * page does not wait that long to paint: it ranks what has arrived after `START_DEADLINE_MS`
 * (`Start.tsx`) and replaces that ranking once every chain has settled.
 */
const LISTING_TIMEOUT_MS = 25_000

// ---------------------------------------------------------------- deposits (supply side)
// `terms: 'digest'` — NOT 'none'. The digest is where the row's own prose lives:
// `termSheet.supply.headline` (one line, templated from this row's live numbers)
// and `.description` (1-3 sentences, the vault's hand-written copy where it has
// any). Asking for 'none' is what left every strategy explained by a generic
// sentence chosen from its SOURCE, so two different Bitway USDT products read
// identically. `full` additionally inlines the exposure `items[]` and would be
// several kB per row on a 500-row page — that is a detail-view request, not a
// listing one.
//
// `chainIds` takes several chains in one request (CSV; every row still carries
// its own `chainId`) — measured 2026-09-25: the ten small chains answer 536
// rows / 2.9 MB in one call, against ten calls before. Paged to `total`, so a
// bundle never silently stops at the page size.
//
// A next page only when this one was FULL: the worker drops unrealizable rows
// from a page after the origin paged it (`excluded.unrealizable`), so `items`
// falls short of `total` on a listing that is complete — Ethereum answered 526
// of 528, and every load paid a second, sequential request for nothing. The
// page size is the origin's cap (1000), so no chain needs a second page at the
// default floor; worker-api's cron pre-warms exactly these pages
// (`scheduled/prewarmListings.ts`), so the query must stay as it is there.
//
// `assetSymbol` + `passthrough` are for the exposure assets only (`EXPOSURE` in assets.ts): a JLP
// deposit pays JLP's own yield and nothing of the market's, which the listing leaves out unless
// asked (`passthrough=include`). That is a separate, narrow request, never the pre-warmed one.
// `assetGroup` (the deposit token's index group) and `shareGroup` (the group of the token a vault
// MINTS) are the asset page's own requests (`useAssetStrategies`): every row of one token, and every
// vault that leaves you holding it, on every chain it lives on.
// `issuers` / `issuerMatch` are the fiat currencies' requests (`FIAT_REQUESTS`).
// `includeFixedTerm` + `protocol` are the fixed-rate shelf's request only (tickets/0013): the origin
// lists book loans (Midnight, Term) only when asked, and the default request must stay byte-identical
// for the pre-warm, so both are sent only when set.
/**
 * The risk ceiling every listing request sends: everything the API serves, up to 6
 * (`compromised`). What is SHOWN is the client's call (`softHide` against
 * `Settings.maxRisk`), so a row over the user's cap is still counted in the
 * "held back" bar, and raising the cap needs no new request. Without it the
 * pairs route applies its own default (`maxConfigRiskScore` 4) and every
 * score-5 loop is gone before the app sees it — Flying Tulip on Ethereum,
 * 2026-10-23, all eleven rows. Worker-api's `prewarmListings` sends the same.
 */
export const API_RISK_CEILING = 6
export async function fetchEarn(p: { chainIds: string[]; count?: number; maxRiskScore?: number; minTvlUsd?: number; assetSymbol?: string; assetGroup?: string; shareGroup?: string; issuers?: string[]; issuerMatch?: 'credit'; passthrough?: boolean; maxPages?: number; includeFixedTerm?: boolean; protocols?: string[] }): Promise<EarnResponse> {
  const count = p.count ?? 500
  const params: ApiParams = { chainIds: p.chainIds.join(','), count, sort: 'tvl', maxRiskScore: p.maxRiskScore ?? API_RISK_CEILING, minTvlUsd: p.minTvlUsd, terms: 'digest', assetSymbol: p.assetSymbol, assetGroup: p.assetGroup, shareGroup: p.shareGroup, issuers: p.issuers?.join(','), issuerMatch: p.issuerMatch, passthrough: p.passthrough ? 'include' : undefined, includeFixedTerm: p.includeFixedTerm ? 'true' : undefined, protocol: p.protocols?.join(',') }
  const served = (r: EarnResponse) => r.items.length + (r.excluded?.unrealizable ?? 0)
  const first = await apiFetchLoose<EarnResponse>('/v1/data/earn', { params, timeoutMs: LISTING_TIMEOUT_MS })
  const items = [...first.items]
  let at = served(first)
  for (let page = 1, last = first; page < (p.maxPages ?? 4) && served(last) >= count && at < first.total; page++) {
    last = await apiFetchLoose<EarnResponse>('/v1/data/earn', { params: { ...params, start: at }, timeoutMs: LISTING_TIMEOUT_MS })
    if (!last.items.length) break
    items.push(...last.items)
    at += served(last)
  }
  return { ...first, count: items.length, items }
}

/**
 * The rate curve behind a lending market (see `IrmCurve`), by the market uid
 * the earn listing carries as `refs.marketUid`.
 *
 * **Eight at a time.** The endpoint answers `INTERNAL_ERROR` above that —
 * measured 2026-09-24: 8 uids is the last size that works, 10 is a 500, and
 * every uid in the failing batch resolves on its own. The cap is here rather
 * than at the call site so no caller can rediscover it the hard way; the
 * ticket asks for one uid anyway, when the reader opens the curve.
 */
export const IRM_MAX_BATCH = 8
export function fetchIrm(marketUids: string[]) {
  return apiFetch<IrmResponse>('/v1/data/lending/irm', { params: { marketUids: marketUids.slice(0, IRM_MAX_BATCH).join(',') } })
}

/**
 * A fixed-rate lender's liquidity ladder (`MORPHO_MIDNIGHT_<id>`, Term, Exactly), best rate first.
 * `side=borrow` is what a borrower takes (the lenders' offers — also what a lender's early sale
 * fills); `side=lend` is what a fixed-rate deposit takes (the borrowers' offers). Display and sizing
 * only — the builders fill the book server-side. `marketUid` is the LOAN token's market.
 */
export function fetchLendingBook(marketUid: string, side: 'borrow' | 'lend' = 'borrow', count = 50) {
  return apiFetch<LendingBook>('/v1/data/lending/book', { params: { marketUid, side, count } })
}

// The chain directory: id, name and a logo, for every chain the API knows.
// Names and logos live upstream so a chain is called what the rest of 1delta
// calls it and wears the same mark, instead of a hand-kept copy here going
// stale the day a chain is added. `ChainMark` keeps drawn glyphs as the
// instant fallback, so a slow or failed logo never leaves a blank disc.
export function fetchChains() {
  return apiFetch<{ items: { chainId: string; name: string; logoURI?: string }[] }>('/v1/data/chains')
}

/**
 * 30 days of daily rate points for many rows at once — the sparkline and the
 * 30-day mean on each list row (see `model/rateHistory.ts`). POST, because a
 * page of loops names two Morpho-length uids per row; worker-api caches the
 * answer per uid SET for ten minutes (the origin rebuilds it hourly). The
 * origin takes 1000 uids a call, far above one list.
 */
export function fetchRateHistory(uids: string[]) {
  return apiFetchLoose<RateHistoryResponse>('/v1/data/earn/rate-history', { body: { uids } })
}

// ---------------------------------------------------------------- funding lock (Boros)
/**
 * What locking a collateral's perp funding on Pendle Boros (Arbitrum) costs and pays, without an
 * account: a quote, nothing to sign. `NO_FUNDING_EXPOSURE` / `FIXED_RATE_COLLATERAL` answer for a
 * collateral that earns no funding we can lock (a PT has already fixed its yield).
 */
export function fetchBorosHedge(p: { collateralSymbol: string; notionalUsd: number }) {
  return apiFetch<BorosHedgeData>('/v1/actions/boros/hedge', { params: { collateralSymbol: p.collateralSymbol, notionalUsd: String(Math.round(p.notionalUsd)) } })
}

// ---------------------------------------------------------------- loops
export interface OptimizerQuery {
  /** one or several chains; several go as `chainIds` (tag filters work the same in either mode) */
  chainIds: string[]
  collateralTags?: string[]
  /** collateral token addresses — single chain only (several chains read them as asset groups) */
  collaterals?: string[]
  debtTags?: string[]
  collateralAmountUsd?: number
  maxConfigRiskScore?: number
  maxTokenRiskScore?: number
  minBorrowLiquidityUsd?: number
  includeExpired?: boolean
  /**
   * keep pairs whose borrow liquidity cannot fund the size (the default drops them as
   * un-openable). Only the asset page asks: it lists every loop the API knows, an empty
   * one muted as `thin borrow`, rather than one that silently is not there.
   */
  includeIlliquid?: boolean
  /** `stocks` (stock + ETF + pre-IPO), or any class of `model/assetClass.ts` — the collateral's class, read off `props.rwa` upstream */
  collateralAssetClasses?: string[]
  /** default `aprTotal` (a loop's net yield); a borrow list asks for the biggest collateral markets first */
  sortBy?: 'aprTotal' | 'totalDepositsUsdLong' | 'borrowAprShort' | 'borrowLiquidityShort'
  sortDir?: 'ASC' | 'DESC'
  count?: number
  start?: number
}
const csv = (v?: string[]) => (v && v.length ? v.join(',') : undefined)
export function fetchOptimizerPairs(q: OptimizerQuery): Promise<OptimizerResponse> {
  const params: ApiParams = {
    ...(q.chainIds.length === 1 ? { chainId: q.chainIds[0] } : { chainIds: q.chainIds.join(',') }), collateralTags: csv(q.collateralTags), collaterals: csv(q.collaterals), debtTags: csv(q.debtTags), collateralAmountUsd: q.collateralAmountUsd,
    maxConfigRiskScore: q.maxConfigRiskScore ?? API_RISK_CEILING, maxTokenRiskScore: q.maxTokenRiskScore, minBorrowLiquidityUsd: q.minBorrowLiquidityUsd,
    includeExpired: q.includeExpired, includeIlliquid: q.includeIlliquid || undefined, collateralAssetClasses: csv(q.collateralAssetClasses), sortBy: q.sortBy ?? 'aprTotal', sortDir: q.sortDir ?? 'DESC', start: q.start, count: q.count ?? 100,
  }
  return apiFetchLoose<OptimizerResponse>('/v1/data/lending/pairs/optimize', { params, timeoutMs: LISTING_TIMEOUT_MS })
}

// ---------------------------------------------------------------- wallet
// Single-chain only: `chainId` is required and there is no `chainIds` (the
// multi-chain mode exists only on `/token/balances/rpc-call`, which hands back
// RPC calls for the client to run). One request per chain is the floor here.
// `fresh` bypasses the browser's copy: the route answers `max-age=15`, and a re-read seconds after
// a transaction (or a bridge landing) would otherwise be handed the balance from before it.
export async function fetchTokenBalances(account: string, chainId: string, assets: string[], fresh = false) {
  const r = await apiFetch<{ items: TokenBalance[]; native?: TokenBalance }>('/v1/data/token/balances', { params: { chainId, account, assets: assets.length ? assets.join(',') : undefined }, ...(fresh ? { cache: 'no-store' as const } : {}) })
  // Solana answers the gas coin as its own `native` row (the System Program id `1111…1111`, 9 decimals) beside
  // `items`; EVM carries it inside `items` at the zero address. One shape for every caller.
  const items = r.native && !r.items.some((b) => isNativeAddress(b.address)) ? [...r.items, r.native] : r.items
  return { ...r, items }
}
/**
 * `only` narrows the read to what one transaction touched: `lenders` are exact meta keys (the
 * `<LENDER>` of a market uid, `MORPHO_BLUE_<id>` for a Morpho market), `vaults` share-token
 * addresses (skipping vault discovery). Measured 2026-09-29 on Ethereum: ~1 s narrowed against
 * ~3.7 s for the whole chain. `fresh` bypasses the browser's copy of the `max-age=15` answer.
 */
export interface PositionsScope { venueKind?: 'lending' | 'vault'; lenders?: string[]; vaults?: string[] }
export async function fetchEarnPositions(account: string, chainIds: string[], only: PositionsScope = {}, fresh = false) {
  const r = await apiFetchLoose<EarnPositionsResponse>('/v1/data/earn/positions', {
    params: { chainIds: chainIds.join(','), account, venueKind: only.venueKind, lenders: only.lenders?.join(','), vaults: only.vaults?.join(',') },
    ...(fresh ? { cache: 'no-store' as const } : {}),
  })
  return { ...r, items: r.items.map(restoreSolCase) }
}
/**
 * The route lower-cases every asset address, base58 included (seen 2026-10-04: `asset.address:
 * "susdai6y3gxys…"` beside the uid's `sUSDai6Y3Gxys…`). On Solana case IS the address, so the
 * token misses everything keyed by it — a sUSDai loop filed under MORE instead of the USDai desk,
 * absent from its asset page. Until the route keeps case, each address is put back from the uid it
 * came with (`<venue>:solana:<ref>`), when that ref is the same string apart from case.
 */
function restoreSolCase<P extends EarnPositionsResponse['items'][number]>(p: P): P {
  if (!isSvmChain(p.chainId)) return p
  const fix = (a: string | undefined, uid: string | undefined) => { const ref = uid?.split(':')[2]; return a && ref && a !== ref && a.toLowerCase() === ref.toLowerCase() ? ref : a }
  const leg = (l: EarnPositionLeg) => ({ ...l, asset: { ...l.asset, address: fix(l.asset.address, l.marketUid) ?? l.asset.address } })
  if (p.venueKind === 'vault') return { ...p, vault: fix(p.vault, p.earnUid) ?? p.vault }
  return { ...p, legs: p.legs.map(leg), subAccounts: p.subAccounts.map((a) => ({ ...a, legs: a.legs.map(leg) })) }
}

// ---------------------------------------------------------------- actions
/**
 * Plain deposit into a lending market or a vault. `amountRaw` is in the row's asset units; no `payAsset` = pay with that asset, {@link nativeAsset} = the native coin into a wrapped-native row.
 * `slippageBp` is required on a row that trades on a book (a Pendle PT, `SimpleStrategy.booked`) and on a `payAsset` conversion (50 when not given).
 */
export function earnDeposit(p: { earnUid: string; amountRaw: string; operator: string; payAsset?: string; slippageBp?: number; /** the sub-account to add to (`Holding.accountId`); none = the venue's default, or a new Fluid / Jupiter Lend position */ accountId?: string }) {
  return apiFetchEnvelope<{ quotes?: unknown[] } | null, LoopActions>('/v1/actions/earn/deposit', {
    params: { earnUid: p.earnUid, amount: p.amountRaw, operator: p.operator, payAsset: p.payAsset, slippage: p.slippageBp ?? (p.payAsset ? 50 : undefined), accountId: p.accountId },
  })
}
/** Withdraw from a lending market or a synchronous vault. `amountRaw` in the row's asset units (required: `isAll` is not honoured everywhere, and refused on a booked row). `receiveAsset` = {@link nativeAsset} unwraps to the native coin. `slippageBp`: required on a booked row (a PT sold on its AMM). */
/** `accountId`: the sub-account the deposit sits in (`Holding.accountId`) — without it Euler withdraws from account 0, and Fluid / Jupiter Lend refuse */
export function earnWithdraw(p: { earnUid: string; amountRaw: string; operator: string; isAll?: boolean; receiveAsset?: string; slippageBp?: number; accountId?: string }) {
  return apiFetchEnvelope<unknown, LoopActions>('/v1/actions/earn/withdraw', { params: { earnUid: p.earnUid, amount: p.amountRaw, operator: p.operator, isAll: p.isAll ? 'true' : undefined, receiveAsset: p.receiveAsset, slippage: p.slippageBp, accountId: p.accountId } })
}
/**
 * Sell a Midnight lend position before its maturity: `amountRaw` is FACE units (what the position
 * is repaid at maturity, the positions route's `deposits`), filled against the lenders' offers at
 * a discount to face. `/earn/withdraw` on the same market redeems only after maturity.
 * `lender` is the market's `MORPHO_MIDNIGHT_<id>`.
 */
export function midnightSell(p: { chainId: string; lender: string; amountRaw: string; operator: string }) {
  return apiFetchEnvelope<unknown, LoopActions>('/v1/actions/midnight/sell', { params: { chainId: p.chainId, lender: p.lender, amount: p.amountRaw, account: p.operator } })
}
/**
 * Move a running loop's whole position into another market on the same chain, in ONE transaction:
 * a flash loan repays the source debt, the collateral moves over, the new debt repays the flash.
 * Used for a Morpho Midnight maturity ROLL (same collateral, same loan token, a later date — each
 * date is its own `MORPHO_MIDNIGHT_<id>` market): the route reads the debt on chain and takes the
 * later book's lenders for it, so no swap runs. `slippageBp` is sent as the FRACTION migrate takes
 * (unlike every other action). The general migrate (tickets/0012) is not built on top of this yet.
 */
export interface LoopMigrateParams { source: { collateralMarketUid: string; debtMarketUid: string }; target: { collateralMarketUid: string; debtMarketUid: string }; debtAmountRaw: string; account: string; slippageBp: number; accountId?: string }
export function loopMigrate(p: LoopMigrateParams) {
  return apiFetchEnvelope<unknown, LoopActions>('/v1/actions/loop/migrate', {
    params: { marketUidSourceCollateral: p.source.collateralMarketUid, marketUidSourceDebt: p.source.debtMarketUid, marketUidTargetCollateral: p.target.collateralMarketUid, marketUidTargetDebt: p.target.debtMarketUid,
      debtAmount: p.debtAmountRaw, account: p.account, slippage: p.slippageBp / 10_000, accountIdFrom: p.accountId, accountIdTo: p.accountId },
  })
}
/**
 * Re-fix a Lista broker loan into a new term in one transaction (a flash repays the source, the new
 * term's loan repays the flash). `fromLoanId` = the fixed loan rolled; absent = the variable part a
 * lapsed term left behind. A full close: the route sizes the flash from the larger of
 * `borrowBalanceRaw` (POSTed, the positions route's figure) and its own on-chain read, plus an
 * unfinished term's early-repay penalty — a GET alone answers `INVALID_PARAM` whenever that read
 * comes back empty (measured 2026-10-29).
 */
export function loopRefinance(p: { debtMarketUid: string; termId: string; fromLoanId?: string; borrowBalanceRaw: string; operator: string }) {
  return apiFetchEnvelope<unknown, LoopActions>('/v1/actions/loop/refinance', {
    params: { marketUid: p.debtMarketUid, termId: p.termId, fromLoanId: p.fromLoanId, operator: p.operator, isAll: true },
    body: { borrowBalance: p.borrowBalanceRaw },
  })
}
/** `loanId`: which fixed-term loan the repay pays down — required on a Lista broker debt, ignored elsewhere */
export interface LoopCloseParams { collateralMarketUid: string; debtMarketUid: string; amountRaw: string; slippageBp: number; isAll?: boolean; account?: string; accountId?: string; loanId?: string }
/** Close or reduce a loop: withdraw `amountRaw` of collateral, swap, repay. `isAll` repays the whole debt. */
export function loopClose(p: LoopCloseParams) {
  return apiFetchEnvelope<LoopCloseData, LoopActions>('/v1/actions/loop/close', {
    params: { marketUidIn: p.collateralMarketUid /* in = COLLATERAL on CLOSE */, marketUidOut: p.debtMarketUid, amount: p.amountRaw, slippage: p.slippageBp, tradeType: 0, isAll: p.isAll, account: p.account, accountId: p.accountId, loanId: p.loanId },
  })
}
export interface LoopOpenParams {
  collateralMarketUid: string
  debtMarketUid: string
  /** raw units of the debt token */
  debtAmountRaw: string
  slippageBp: number
  leverage?: number
  account?: string
  payAsset?: string
  payAmountRaw?: string
  /** the fixed term to borrow for — required on a Lista broker debt (`LoopStrategy.terms`), ignored elsewhere */
  termId?: string
  /** the loan tenor — required on a Loopscale open (`LoopStrategy.tenors`), ignored elsewhere */
  tenor?: { duration: number; durationType: number }
  /** the position a leverage step adds to (Solana: with no `payAmount` the API adjusts THIS position to `leverage`) */
  accountId?: string
  /** a user-set-rate debt's rate for a NEW trove, WAD fraction; absent → the queue's recommended pick */
  interestRate?: string
  /**
   * Read the account first (`data.simulation`). Sent on every build into an account that already
   * holds something: without it an Aave-type build assumes eMode 0 and may switch the mode
   * needlessly, or not switch it when it must (worker-api `leverage/open.ts:1465`, tickets/0015).
   */
  simulate?: boolean
}
export function loopOpen(p: LoopOpenParams) {
  return apiFetchEnvelope<LoopQuoteData, LoopActions>('/v1/actions/loop/leverage', {
    params: {
      marketUidIn: p.debtMarketUid,      // API: in = debt on OPEN
      marketUidOut: p.collateralMarketUid,
      debtAmount: p.debtAmountRaw, slippage: p.slippageBp, leverage: p.leverage, account: p.account, payAsset: p.payAsset, payAmount: p.payAmountRaw, termId: p.termId, accountId: p.accountId, interestRate: p.interestRate, simulate: p.simulate ? 'true' : undefined,
      duration: p.tenor?.duration, durationType: p.tenor?.durationType,
    },
  })
}
/**
 * Switch a supplied token on as collateral (Aave V2/V3 `setUserUseReserveAsCollateral`, Compound V2
 * `enterMarkets`). An Aave supply whose flag is off stays off through every later supply, so a loop
 * or a borrow on it reverts until this is sent (tickets/0015). Euler, Venus and Aave V4 builds do it
 * themselves; Morpho's flags are fixed (`needsCollateralOn`). `accountId` = a Gearbox credit account.
 */
export function enableCollateral(p: { marketUid: string; operator: string; accountId?: string }) {
  return apiFetchEnvelope<unknown, LoopActions>('/v1/actions/lending/enable-collateral', { params: { marketUid: p.marketUid, enabled: 'true', operator: p.operator, accountId: p.accountId } })
}
// ---------------------------------------------------------------- borrowing (tickets/0008)
/**
 * Put collateral up and borrow against it, one request (no swap, no loop). The API routes it per
 * lender (one atomic call, a composer bundle, or a sequence) and, with `simulate`, answers the
 * account's health before and after. **`marketUid` = COLLATERAL, `debtMarketUid` = DEBT** here —
 * the withdraw-and-repay route below names them the other way round. Neither leg is ever sent as 0:
 * a borrow with nothing to put up, or collateral with nothing to borrow, goes through {@link lendingAction}.
 */
export function lendingDepositAndBorrow(p: { collateralMarketUid: string; debtMarketUid: string; operator: string; collateralRaw: string; borrowRaw: string; payAsset?: string; receiveAsset?: string; accountId?: string; modeId?: string; simulate?: boolean; /** a user-set-rate loan's rate, WAD fraction (`model/userSetRate.ts` `rateToWad`); absent → the queue's recommended pick */ interestRate?: string }) {
  return apiFetchEnvelope<LendingActionData, LoopActions>('/v1/actions/lending/deposit-and-borrow', {
    params: { marketUid: p.collateralMarketUid, debtMarketUid: p.debtMarketUid, operator: p.operator, collateralAmount: p.collateralRaw, borrowAmount: p.borrowRaw, payAsset: p.payAsset, receiveAsset: p.receiveAsset, accountId: p.accountId, modeId: p.modeId, interestRate: p.interestRate, simulate: p.simulate ? 'true' : undefined },
  })
}
/**
 * Pay a loan back and take collateral out, one request. **`marketUid` = DEBT, `collateralMarketUid`
 * = COLLATERAL** (the flip of deposit-and-borrow). `repayMax` / `withdrawMax` size the full exit on
 * chain — an amount read off the screen leaves interest dust behind, so a full exit always sends them.
 */
export function lendingWithdrawAndRepay(p: { collateralMarketUid: string; debtMarketUid: string; operator: string; repayRaw?: string; withdrawRaw?: string; repayMax?: boolean; withdrawMax?: boolean; payAsset?: string; receiveAsset?: string; accountId?: string; simulate?: boolean }) {
  return apiFetchEnvelope<LendingActionData, LoopActions>('/v1/actions/lending/withdraw-and-repay', {
    params: { marketUid: p.debtMarketUid, collateralMarketUid: p.collateralMarketUid, operator: p.operator, repayAmount: p.repayMax ? undefined : p.repayRaw, withdrawAmount: p.withdrawMax ? undefined : p.withdrawRaw, repayMax: p.repayMax ? 'true' : undefined, withdrawMax: p.withdrawMax ? 'true' : undefined, payAsset: p.payAsset, receiveAsset: p.receiveAsset, accountId: p.accountId, simulate: p.simulate ? 'true' : undefined },
  })
}
/** One leg on its own: add collateral, borrow more, repay, take collateral back. `isAll` = the whole debt (repay) or deposit (withdraw). */
export function lendingAction(action: 'deposit' | 'borrow' | 'repay' | 'withdraw', p: { marketUid: string; operator: string; amountRaw: string; isAll?: boolean; payAsset?: string; receiveAsset?: string; accountId?: string; simulate?: boolean }) {
  return apiFetchEnvelope<LendingActionData, LoopActions>(`/v1/actions/lending/${action}`, {
    params: { marketUid: p.marketUid, operator: p.operator, amount: p.amountRaw, isAll: p.isAll ? 'true' : undefined, payAsset: p.payAsset, receiveAsset: p.receiveAsset, accountId: p.accountId, simulate: p.simulate ? 'true' : undefined },
  })
}
/**
 * How far the caller's OWN account can go: a deposit → the most it can then borrow
 * (`maxBorrow`; a deposit of `'0'` is the headroom of what is already in), a borrow → the least
 * collateral it still needs (`minDeposit`, tickets/0011), or a repay → the most collateral that can
 * then leave (`maxWithdraw`). Read on chain
 * for `account` (its existing position and e-mode included), so only asked with a real wallet.
 * Amounts in are raw; out are human decimals + USD. `collateralModeId` goes back as `modeId`.
 * **`marketUidOut` = COLLATERAL, `marketUidIn` = DEBT**, as on the loop ranges.
 */
export async function lendingRange(kind: 'deposit-borrow' | 'withdraw-repay', p: { collateralMarketUid: string; debtMarketUid: string; account: string; depositRaw?: string; borrowRaw?: string; repayRaw?: string; modeId?: string; accountId?: string }): Promise<LendingRange> {
  const r = await apiFetch<LendingRange | LendingRange[]>(`/v1/data/lending/range/${kind}`, {
    params: { marketUidOut: p.collateralMarketUid, marketUidIn: p.debtMarketUid, account: p.account, depositAmount: p.depositRaw, borrowAmount: p.borrowRaw, repayAmount: p.repayRaw, modeId: p.modeId, accountId: p.accountId },
  })
  return (Array.isArray(r) ? r[0] : r) ?? {}
}

/** A Loopscale open too big for one lender, as worker-api restates it: amounts in debt tokens, and the margin / leverage that fit this request. */
export interface LoopDepthShort {
  message: string
  /** what the deepest lender on the tenor has, and what the loan needs — debt tokens (0 from a worker that predates `details`) */
  available: number
  required: number
  fit: { margin?: { asset: string; amount: number; usd?: number }; leverage?: number }
}
/** `INSUFFICIENT_DEPTH` (one loan draws on one lender) read off a failed loop quote; `null` for any other failure. */
export function loopDepthShort(err: unknown): LoopDepthShort | null {
  if (!(err instanceof ApiError) || err.code !== 'INSUFFICIENT_DEPTH') return null
  const d = (err.details ?? {}) as { availableAmount?: number; requiredAmount?: number; fit?: LoopDepthShort['fit'] }
  return { message: err.message, available: d.availableAmount ?? 0, required: d.requiredAmount ?? 0, fit: d.fit ?? {} }
}
export function fetchLoopPayAssets(p: { collateralMarketUid: string; debtMarketUid: string }) {
  return apiFetch<LoopPayAssetsData>('/v1/actions/loop/leverage/pay-assets', { params: { marketUidIn: p.debtMarketUid, marketUidOut: p.collateralMarketUid } })
}
/** The native coin on an EVM chain, as the API and the balances route both spell it (`payAsset` / `receiveAsset` / `tokenIn`). */
export const ZERO = '0x0000000000000000000000000000000000000000'
/** Solana's native coin: the System Program id, what the balances route returns for SOL (the Solana earn / lending builders rejected `ZERO` with "must be a base58 mint"). */
export const SOL_NATIVE = '11111111111111111111111111111111'
/** The native coin as `payAsset` / `receiveAsset` on `chainId`. */
export const nativeAsset = (chainId: string): string => (isSvmChain(chainId) ? SOL_NATIVE : ZERO)

// ---------------------------------------------------------------- swap / bridge
/**
 * Destination gas a cross-chain route delivers (asked with `destinationGas`): `amount` in the
 * destination gas coin's base units. `paidFrom`: `output` = dropped out of the bridged amount (already
 * in `tradeOutput`), `value` = in the route's own `msg.value`, `gas-leg` = a second deposit
 * (`transaction`, NEAR Intents / Gas.zip) the wallet sends right after the route. `cost.amount` is in
 * the SOURCE gas coin's base units.
 */
export interface DestinationGas { amount: string; decimals: number; mode: 'native-drop' | 'batch'; paidFrom: 'output' | 'value' | 'gas-leg'; bridge?: string; cost?: { amount?: string; decimals?: number; usd?: number }; transaction?: AnyTx; /** the leg is INSIDE the route's own transaction (a composer route, a Solana source): one signature, no `transaction` */ bundled?: boolean }
/** Native the route's own transaction charges ON TOP of `tradeInput` (Squid's Axelar gas, LayerZero fees), source gas coin base units. */
export interface NativeFee { amount: string; decimals: number; usd?: number }
export interface SwapRouteQuote { bridge?: string; aggregator?: string; tradeInput: number; tradeOutput: number; estimatedDuration?: number; approvalTarget?: string; approvalRequired?: boolean; destinationGas?: DestinationGas; nativeFee?: NativeFee; /** `tradeOutput` less the gas and native fee paid on top, at current prices — what the ranking sorts by */ tradeOutputNetOfGas?: number }
export interface SwapQuoteData { fallback?: string; quotes?: SwapRouteQuote[] }
export interface SwapQuoteActions { alternatives?: ApiTx[]; permissions?: (ApiTx & { spender?: string })[] }
/** Same-chain meta-aggregator swap. One tx per route in `actions.alternatives`, positionally matched to `data.quotes`. */
export function spotSwapQuote(p: { chainId: string; tokenIn: string; tokenOut: string; amountRaw: string; slippageBp: number; account?: string }) {
  return apiFetchEnvelope<SwapQuoteData, SwapQuoteActions>('/v1/actions/swap/spot', {
    params: { chainId: p.chainId, tokenIn: p.tokenIn, tokenOut: p.tokenOut, amount: p.amountRaw, slippage: p.slippageBp, tradeType: 0, account: p.account },
  })
}
/** Cross-chain swap via bridge aggregation; falls back to spot when from == to. Approvals are per bridge (`permissions[].spender`). */
/** `receiver` is required whenever the two chains are different VMs (a Solana destination for an EVM sender): without it the API answers no route. */
/** `destinationGas`: gas to deliver on the destination — a decimal in its gas coin's units, or `auto` on Solana (each route then carries `destinationGas`). */
export function xchainSwapQuote(p: { fromChainId: string; toChainId: string; tokenIn: string; tokenOut: string; amountRaw: string; slippageBp: number; account?: string; receiver?: string; order?: 'CHEAPEST' | 'FASTEST'; destinationGas?: string }) {
  return apiFetchEnvelope<SwapQuoteData, SwapQuoteActions>('/v1/actions/swap/x-chain', {
    params: { fromChainId: p.fromChainId, toChainId: p.toChainId, tokenIn: p.tokenIn, tokenOut: p.tokenOut, amount: p.amountRaw, slippage: p.slippageBp, account: p.account, receiver: p.receiver, order: p.order ?? 'CHEAPEST', destinationGas: p.destinationGas },
  })
}
export interface BridgeStatus { bridge: string; status: 'PENDING' | 'DONE' | 'FAILED' | 'TRANSFER_REFUNDED' | 'INVALID' | 'NOT_FOUND' | 'PARTIAL_SUCCESS'; message?: string; toHash?: string }
export function bridgeStatus(p: { bridge: string; fromChainId: string; toChainId: string; txHash: string; tokenIn?: string; tokenOut?: string }) {
  return apiFetch<BridgeStatus>('/v1/data/bridge/status', { params: p })
}
