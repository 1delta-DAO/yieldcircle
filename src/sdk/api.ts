/**
 * Every call the simple app makes, one function each, on top of the vendored `http.ts`
 * boundary (the place to attach a key or a proxy). Loop parameters are named by meaning
 * (collateral / debt); the API's in/out naming is translated here and nowhere else.
 */
import { apiFetch, apiFetchEnvelope, apiFetchLoose, type ApiParams } from '../vendor/allocator/http'
import type { ApiTx, EarnPositionsResponse, EarnResponse, LoopActions, LoopPayAssetsData, LoopQuoteData, OptimizerResponse, TokenBalance } from './types'

// ---------------------------------------------------------------- deposits (supply side)
export function fetchEarn(p: { chainId: string; count?: number; maxRiskScore?: number; minTvlUsd?: number }) {
  const params: ApiParams = { chainId: p.chainId, count: p.count ?? 500, sort: 'tvl', maxRiskScore: p.maxRiskScore, minTvlUsd: p.minTvlUsd, terms: 'none' }
  return apiFetchLoose<EarnResponse>('/v1/data/earn', { params })
}

// ---------------------------------------------------------------- loops
export interface OptimizerQuery {
  chainId: string
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
    chainId: q.chainId, collateralTags: csv(q.collateralTags), debtTags: csv(q.debtTags), collateralAmountUsd: q.collateralAmountUsd,
    maxConfigRiskScore: q.maxConfigRiskScore, maxTokenRiskScore: q.maxTokenRiskScore, minBorrowLiquidityUsd: q.minBorrowLiquidityUsd,
    includeExpired: q.includeExpired, sortBy: 'aprTotal', sortDir: 'DESC', start: q.start, count: q.count ?? 100,
  }
  return apiFetchLoose<OptimizerResponse>('/v1/data/lending/pairs/optimize', { params })
}

// ---------------------------------------------------------------- wallet
export function fetchTokenBalances(account: string, chainId: string, assets: string[]) {
  return apiFetch<{ items: TokenBalance[] }>('/v1/data/token/balances', { params: { chainId, account, assets: assets.join(',') } })
}
export function fetchEarnPositions(account: string, chainIds: string[]) {
  return apiFetchLoose<EarnPositionsResponse>('/v1/data/earn/positions', { params: { chainIds: chainIds.join(','), account } })
}

// ---------------------------------------------------------------- actions
/** Plain deposit into a lending market or a vault. `amountRaw` is in the row's asset units; no `payAsset` = pay with that asset. */
export function earnDeposit(p: { earnUid: string; amountRaw: string; operator: string; payAsset?: string; slippageBp?: number }) {
  return apiFetchEnvelope<{ quotes?: unknown[] } | null, LoopActions>('/v1/actions/earn/deposit', {
    params: { earnUid: p.earnUid, amount: p.amountRaw, operator: p.operator, payAsset: p.payAsset, slippage: p.payAsset ? p.slippageBp ?? 50 : undefined },
  })
}
/** Withdraw from a lending market or a synchronous vault. `amountRaw` in the row's asset units (required: `isAll` is not honoured everywhere). */
export function earnWithdraw(p: { earnUid: string; amountRaw: string; operator: string; isAll?: boolean }) {
  return apiFetchEnvelope<unknown, LoopActions>('/v1/actions/earn/withdraw', { params: { earnUid: p.earnUid, amount: p.amountRaw, operator: p.operator, isAll: p.isAll ? 'true' : undefined } })
}
export interface LoopCloseParams { collateralMarketUid: string; debtMarketUid: string; amountRaw: string; slippageBp: number; isAll?: boolean; account: string; accountId?: string }
/** Close or reduce a loop: withdraw `amountRaw` of collateral, swap, repay. `isAll` repays the whole debt. */
export function loopClose(p: LoopCloseParams) {
  return apiFetchEnvelope<LoopQuoteData, LoopActions>('/v1/actions/loop/close', {
    params: { marketUidIn: p.collateralMarketUid /* in = COLLATERAL on CLOSE */, marketUidOut: p.debtMarketUid, amount: p.amountRaw, slippage: p.slippageBp, tradeType: 0, isAll: p.isAll, account: p.account, accountId: p.accountId },
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
}
export function loopOpen(p: LoopOpenParams) {
  return apiFetchEnvelope<LoopQuoteData, LoopActions>('/v1/actions/loop/leverage', {
    params: {
      marketUidIn: p.debtMarketUid,      // API: in = debt on OPEN
      marketUidOut: p.collateralMarketUid,
      debtAmount: p.debtAmountRaw, slippage: p.slippageBp, leverage: p.leverage, account: p.account, payAsset: p.payAsset, payAmount: p.payAmountRaw,
    },
  })
}
export function fetchLoopPayAssets(p: { collateralMarketUid: string; debtMarketUid: string }) {
  return apiFetch<LoopPayAssetsData>('/v1/actions/loop/leverage/pay-assets', { params: { marketUidIn: p.debtMarketUid, marketUidOut: p.collateralMarketUid } })
}
export const NATIVE_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeEEEeeeeEeeeeeeeEEeE'
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
