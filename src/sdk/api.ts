/**
 * Every call the simple app makes, one function each, on top of the vendored `http.ts`
 * boundary (the place to attach a key or a proxy). Loop parameters are named by meaning
 * (collateral / debt); the API's in/out naming is translated here and nowhere else.
 */
import { apiFetch, apiFetchEnvelope, apiFetchLoose, type ApiParams } from '../vendor/allocator/http'
import { isNativeAddress } from '../model/positions'
import type { RateHistoryResponse } from '../model/rateHistory'
import type { ApiTx, EarnPositionsResponse, EarnResponse, IrmResponse, LoopActions, LoopCloseData, LoopPayAssetsData, LoopQuoteData, OptimizerResponse, TokenBalance } from './types'

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
export async function fetchEarn(p: { chainIds: string[]; count?: number; maxRiskScore?: number; minTvlUsd?: number }): Promise<EarnResponse> {
  const count = p.count ?? 500
  const params: ApiParams = { chainIds: p.chainIds.join(','), count, sort: 'tvl', maxRiskScore: p.maxRiskScore, minTvlUsd: p.minTvlUsd, terms: 'digest' }
  const served = (r: EarnResponse) => r.items.length + (r.excluded?.unrealizable ?? 0)
  const first = await apiFetchLoose<EarnResponse>('/v1/data/earn', { params })
  const items = [...first.items]
  let at = served(first)
  for (let page = 1, last = first; page < 4 && served(last) >= count && at < first.total; page++) {
    last = await apiFetchLoose<EarnResponse>('/v1/data/earn', { params: { ...params, start: at } })
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

// ---------------------------------------------------------------- loops
export interface OptimizerQuery {
  /** one or several chains; several go as `chainIds` (tag filters work the same in either mode) */
  chainIds: string[]
  collateralTags?: string[]
  debtTags?: string[]
  collateralAmountUsd?: number
  maxConfigRiskScore?: number
  maxTokenRiskScore?: number
  minBorrowLiquidityUsd?: number
  includeExpired?: boolean
  count?: number
  start?: number
}
const csv = (v?: string[]) => (v && v.length ? v.join(',') : undefined)
export function fetchOptimizerPairs(q: OptimizerQuery): Promise<OptimizerResponse> {
  const params: ApiParams = {
    ...(q.chainIds.length === 1 ? { chainId: q.chainIds[0] } : { chainIds: q.chainIds.join(',') }), collateralTags: csv(q.collateralTags), debtTags: csv(q.debtTags), collateralAmountUsd: q.collateralAmountUsd,
    maxConfigRiskScore: q.maxConfigRiskScore, maxTokenRiskScore: q.maxTokenRiskScore, minBorrowLiquidityUsd: q.minBorrowLiquidityUsd,
    includeExpired: q.includeExpired, sortBy: 'aprTotal', sortDir: 'DESC', start: q.start, count: q.count ?? 100,
  }
  return apiFetchLoose<OptimizerResponse>('/v1/data/lending/pairs/optimize', { params })
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
export function fetchEarnPositions(account: string, chainIds: string[], only: PositionsScope = {}, fresh = false) {
  return apiFetchLoose<EarnPositionsResponse>('/v1/data/earn/positions', {
    params: { chainIds: chainIds.join(','), account, venueKind: only.venueKind, lenders: only.lenders?.join(','), vaults: only.vaults?.join(',') },
    ...(fresh ? { cache: 'no-store' as const } : {}),
  })
}

// ---------------------------------------------------------------- actions
/** Plain deposit into a lending market or a vault. `amountRaw` is in the row's asset units; no `payAsset` = pay with that asset, {@link ZERO} = the native coin into a wrapped-native row. */
export function earnDeposit(p: { earnUid: string; amountRaw: string; operator: string; payAsset?: string; slippageBp?: number }) {
  return apiFetchEnvelope<{ quotes?: unknown[] } | null, LoopActions>('/v1/actions/earn/deposit', {
    params: { earnUid: p.earnUid, amount: p.amountRaw, operator: p.operator, payAsset: p.payAsset, slippage: p.payAsset ? p.slippageBp ?? 50 : undefined },
  })
}
/** Withdraw from a lending market or a synchronous vault. `amountRaw` in the row's asset units (required: `isAll` is not honoured everywhere). `receiveAsset` = {@link ZERO} unwraps to the native coin. */
export function earnWithdraw(p: { earnUid: string; amountRaw: string; operator: string; isAll?: boolean; receiveAsset?: string }) {
  return apiFetchEnvelope<unknown, LoopActions>('/v1/actions/earn/withdraw', { params: { earnUid: p.earnUid, amount: p.amountRaw, operator: p.operator, isAll: p.isAll ? 'true' : undefined, receiveAsset: p.receiveAsset } })
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
}
export function loopOpen(p: LoopOpenParams) {
  return apiFetchEnvelope<LoopQuoteData, LoopActions>('/v1/actions/loop/leverage', {
    params: {
      marketUidIn: p.debtMarketUid,      // API: in = debt on OPEN
      marketUidOut: p.collateralMarketUid,
      debtAmount: p.debtAmountRaw, slippage: p.slippageBp, leverage: p.leverage, account: p.account, payAsset: p.payAsset, payAmount: p.payAmountRaw, termId: p.termId,
    },
  })
}
export function fetchLoopPayAssets(p: { collateralMarketUid: string; debtMarketUid: string }) {
  return apiFetch<LoopPayAssetsData>('/v1/actions/loop/leverage/pay-assets', { params: { marketUidIn: p.debtMarketUid, marketUidOut: p.collateralMarketUid } })
}
/** The native coin, as the API and the balances route both spell it (`payAsset` / `receiveAsset` / `tokenIn`). */
export const ZERO = '0x0000000000000000000000000000000000000000'

// ---------------------------------------------------------------- swap / bridge
export interface SwapRouteQuote { bridge?: string; aggregator?: string; tradeInput: number; tradeOutput: number; estimatedDuration?: number; approvalTarget?: string; approvalRequired?: boolean }
export interface SwapQuoteData { fallback?: string; quotes?: SwapRouteQuote[] }
export interface SwapQuoteActions { alternatives?: ApiTx[]; permissions?: (ApiTx & { spender?: string })[] }
/** Same-chain meta-aggregator swap. One tx per route in `actions.alternatives`, positionally matched to `data.quotes`. */
export function spotSwapQuote(p: { chainId: string; tokenIn: string; tokenOut: string; amountRaw: string; slippageBp: number; account?: string }) {
  return apiFetchEnvelope<SwapQuoteData, SwapQuoteActions>('/v1/actions/swap/spot', {
    params: { chainId: p.chainId, tokenIn: p.tokenIn, tokenOut: p.tokenOut, amount: p.amountRaw, slippage: p.slippageBp, tradeType: 0, account: p.account },
  })
}
/** Cross-chain swap via bridge aggregation; falls back to spot when from == to. Approvals are per bridge (`permissions[].spender`). */
export function xchainSwapQuote(p: { fromChainId: string; toChainId: string; tokenIn: string; tokenOut: string; amountRaw: string; slippageBp: number; account?: string; order?: 'CHEAPEST' | 'FASTEST' }) {
  return apiFetchEnvelope<SwapQuoteData, SwapQuoteActions>('/v1/actions/swap/x-chain', {
    params: { fromChainId: p.fromChainId, toChainId: p.toChainId, tokenIn: p.tokenIn, tokenOut: p.tokenOut, amount: p.amountRaw, slippage: p.slippageBp, account: p.account, order: p.order ?? 'CHEAPEST' },
  })
}
export interface BridgeStatus { bridge: string; status: 'PENDING' | 'DONE' | 'FAILED' | 'TRANSFER_REFUNDED' | 'INVALID' | 'NOT_FOUND' | 'PARTIAL_SUCCESS'; message?: string; toHash?: string }
export function bridgeStatus(p: { bridge: string; fromChainId: string; toChainId: string; txHash: string; tokenIn?: string; tokenOut?: string }) {
  return apiFetch<BridgeStatus>('/v1/data/bridge/status', { params: p })
}
