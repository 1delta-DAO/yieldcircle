/**
 * Wire shapes the simple app reads. Only the fields we use are typed.
 * `/v1/data/earn` is the supply side (plain deposits: lending markets + vaults);
 * `/v1/data/lending/pairs/optimize` is the loop side; numerics there arrive as STRINGS.
 */

// ---------------------------------------------------------------- earn (deposits)
export interface EarnAsset { address: string; symbol: string; decimals: number; assetGroup?: string; priceUsd?: number; logoURI?: string }
export interface EarnRate { total: number; base?: number; rewards?: number; intrinsic?: number; marketOwn?: number; passthrough?: boolean; kind: string; source: string }
export interface EarnAmount { raw?: string; formatted?: number; usd?: number }
export interface EarnExit { mode: string; settlement?: 'sync' | 'async'; cooldownSecs?: number; feeBps?: number }
export interface EarnAvailability { canDeposit: boolean; canWithdraw: boolean; gating?: string; reason?: string }
export interface EarnRisk { yieldProfile?: string; denomination?: string; score?: number; label?: string; illiquid?: boolean; vault?: { level?: string; score?: number } }
export interface EarnActionInput { asset: string; symbol?: string; mode?: string; needs?: string[] }
export interface EarnCapability { action: string; via?: string; requires?: string[]; acceptsPayAsset?: boolean; async?: boolean; inputs?: EarnActionInput[] }
/**
 * The `?terms=digest` sheet, narrowed to what this app reads.
 *
 * Structurally different from `terms=full`: `headline`, `description` and
 * `tags` sit at the side root, NOT under an `info` object. Every field is
 * optional here because the worker fail-softs the whole block — a term-sheet
 * bug must never take down the listing it decorates.
 */
export interface EarnTermsDigest {
  supply?: { headline?: string; description?: string; tags?: string[] }
}
export interface EarnMarket {
  earnUid: string
  chainId: string
  venue: string
  venueKind: string
  brand?: string
  subtitle?: string
  protocol?: { key: string; name: string }
  curator?: { name?: string }
  name?: string
  ref: string
  logoURI?: string
  asset: EarnAsset
  shareToken?: { address: string; symbol: string; decimals: number }
  basket?: unknown
  rate: EarnRate
  tvl: EarnAmount
  liquidity?: EarnAmount
  exit: EarnExit
  availability: EarnAvailability
  risk?: EarnRisk
  capabilities: EarnCapability[]
  maturity?: { maturity?: number; kind?: string; [k: string]: unknown }
  termSheet?: EarnTermsDigest
}
export interface EarnResponse { start: number; count: number; total: number; items: EarnMarket[]; appliedDefaults?: Record<string, unknown> }

// ---------------------------------------------------------------- earn positions
export interface EarnPositionAsset { address: string; symbol?: string; decimals?: number; priceUsd?: number; logoURI?: string }
export interface EarnPositionLeg { earnUid?: string; marketUid: string; asset: EarnPositionAsset; side: 'supply' | 'borrow' | 'both' | 'none'; deposits: string; depositsUsd: number; debt: string; debtUsd: number }
export interface EarnPositionBase { positionUid: string; chainId: string; venue: string; venueKind: string; brand?: string; name?: string; logoURI?: string; suppliedUsd: number; borrowedUsd: number; netUsd: number; apr?: number }
export interface EarnLendingPosition extends EarnPositionBase { venueKind: 'lending'; lender: string; account: string; health: number | null; leverage: number; depositApr: number; borrowApr: number; crossMargin: boolean; legs: EarnPositionLeg[]; subAccounts: { accountId: string; health: number | null; suppliedUsd: number; borrowedUsd: number; netUsd: number; legs: EarnPositionLeg[] }[] }
export interface EarnVaultPosition extends EarnPositionBase { venueKind: 'vault'; earnUid: string; provider: string; vault: string; asset: EarnPositionAsset; shares: string; assets: string; rate?: EarnRate; exit?: EarnExit }
export type EarnPosition = EarnLendingPosition | EarnVaultPosition
export interface EarnPositionsResponse { ok: boolean; account: string; items: EarnPosition[]; totals: { suppliedUsd: number; borrowedUsd: number; netUsd: number }; partial?: boolean; stale?: boolean }

// ---------------------------------------------------------------- optimizer (loops)
export interface AssetRef {
  chainId: string; address: string; symbol: string; name?: string; decimals?: number; logoURI?: string; assetGroup?: string; intrinsicYield?: number
  props?: { lst?: { type?: string; asset?: string; provider?: string }; pendle?: { expiry: number; tokenType?: string; underlyingAsset?: string }; spectra?: { expiry?: number; maturity?: number }; rwa?: { type?: string; issuer?: string }; savings?: { base?: string; underlying?: string }; stablecoin?: { base?: string }; risk?: { score?: number; source?: string; category?: string }; wnative?: boolean; [k: string]: unknown }
}
export interface UnderlyingInfo { asset: AssetRef; prices?: { priceUsd?: number } }
export interface OptimizerRowRaw {
  chainId: string; lender: string; marketLongUid: string; marketShortUid: string; marketNameLong: string; marketNameShort: string; curatorNameLong?: string | null
  maxLeverage: string | number; ltv: string | number; collateralFactorLong?: string | number
  depositAprLong: string | number; borrowAprShort: string | number; rewardAprLong?: string | number; rewardAprShort?: string | number
  aprBase: string | number; aprTotal: string | number; netAprAtAmount?: string | number | null; borrowAprAtAmount?: string | number | null; depositAprAtAmount?: string | number | null
  borrowLiquidityUsdShort: string | number; totalDepositsUsdLong?: string | number
  fixedTerm?: { model: string; maturity?: number } | null; variableBorrowDisabledShort?: boolean | null; isBasketLong?: boolean
  underlyingInfoLong: UnderlyingInfo; underlyingInfoShort: UnderlyingInfo
  risk: { maxTokenScore?: number; breakdown: { category: string; score: number | null; label?: string }[] }
}
export interface OptimizerResponse { start: number; count: number; total: number; hasMore: boolean; nextStart?: number; items: OptimizerRowRaw[] }

// ---------------------------------------------------------------- actions
export interface ApiTx { to: string; data: string; value: string; description?: string }
export interface LoopActions { transactions: ApiTx[]; permissions: ApiTx[]; alternatives?: ApiTx[] }
export interface TradeEconomics {
  notionalUsd: { equity: number; collateral: number; debt: number }
  entryCostUsd: { slippage: number; fees: number; gas: number | null; total: number }
  slippageBp: number | null
  carryPerDayUsd: { total: number; base: number } | null
  breakEvenDays: { total: number | null; base: number | null }
  horizonDays: number | null
  notes: string[]
}
export interface LoopQuoteData {
  lender: string
  quotes: { deltas?: { aggregator?: string; tradeInput?: number; tradeOutput?: number }; economics?: TradeEconomics | null }[]
  economics?: TradeEconomics | null
  simulation?: { pre?: { healthFactor?: number }; post?: { healthFactor?: number } }
}
export interface LoopPayAsset { address: string; symbol: string; decimals?: number; logoURI?: string; role: 'collateral' | 'debt' | 'native'; wrapsTo?: string; wrapsRole?: 'collateral' | 'debt' }
export interface LoopPayAssetsData { payAssets: LoopPayAsset[]; strict: boolean; notes: string[] }

// ---------------------------------------------------------------- balances
export interface TokenBalance { address: string; symbol: string; decimals: number; balanceRaw: string; balance: string; priceUSD?: number; balanceUSD?: number }
