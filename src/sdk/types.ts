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
/** `acceptsNative`: the chain's coin can stand in for the row's (wrapped) token as `payAsset` / `receiveAsset` = the zero address. Absent on an API that predates the flag. */
export interface EarnCapability { action: string; via?: string; requires?: string[]; acceptsPayAsset?: boolean; acceptsReceiveAsset?: boolean; acceptsNative?: boolean; async?: boolean; inputs?: EarnActionInput[] }
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
  /**
   * What can leave right now: a lending market's unborrowed balance, a vault's
   * withdrawable assets. Present on every `lending` row (347/347 measured over
   * Ethereum, Base, Arbitrum and HyperEVM, 2026-09-24) and on 125 of 217 vault
   * rows, which is why the ticket renders its absence in words rather than
   * assuming a market with no figure is a market with no liquidity.
   */
  liquidity?: EarnAmount
  /** borrowed / deposited, 0–1. Lending rows only — a vault has no utilisation of its own. */
  utilization?: number
  /**
   * `refs.marketUid` is the lender market this row IS, in the index's own
   * `<lender>:<chain>:<ref>` shape. It is the key the interest-rate-model
   * endpoint takes, and it is absent on exactly the rows that have no curve to
   * draw: the vaults.
   */
  refs?: { marketUid?: string; oracleDescription?: string }
  exit: EarnExit
  availability: EarnAvailability
  risk?: EarnRisk
  capabilities: EarnCapability[]
  maturity?: { maturity?: number; kind?: string; [k: string]: unknown }
  termSheet?: EarnTermsDigest
}
export interface EarnResponse { start: number; count: number; total: number; items: EarnMarket[]; appliedDefaults?: Record<string, unknown> }

// ---------------------------------------------------------------- vault registry
/**
 * One row of `/v1/data/vaults` — the share-token registry behind every
 * `venueKind: 'vault'` row of the earn listing, keyed by the same address the
 * listing calls `ref`.
 *
 * It exists here because the earn listing does NOT carry the vault's identity:
 * `shareToken` is null on all 208 vault rows the catalogue keeps (measured
 * 2026-09-23, five chains) and `name` is the synthesised `"USDC \u00b7 0x5b8b"`,
 * whose address tail is not a token anyone holds. This endpoint — the same
 * worker, one call per chain, the whole set in one page — carries `symbol`
 * (560/560), `name` (560/560) and `curatorName` (451/560). Without it a
 * MetaMorpho vault with no curator renders as the bare words "Morpho vault"
 * and two vaults of the same curator on the same asset collapse into one row
 * in `dedupe`, because its key is (chain, asset, holds, venue).
 */
export interface VaultListing {
  chainId: string
  provider: string
  vaultAddress: string
  /** the share token's own symbol (`steakUSDC`, `gtUSDC`, `OUSD-V1`) */
  symbol?: string | null
  /** the share token's own ERC-20 name (`Steakhouse USDC`, `OUSD Vault V1`) */
  name?: string | null
  /** the listing's generic label (`Morpho USDC`) — the thing we are replacing */
  displayName?: string | null
  curatorName?: string | null
  /** the share token itself — its logo is the vault's own, where one exists (185 of 1103 rows) */
  shareAsset?: { logoURI?: string | null } | null
  /** the underlying's long name (`USD Coin`) — what a vault name may repeat without saying anything */
  underlyingInfo?: { asset?: { name?: string | null; symbol?: string | null } | null } | null
}
export interface VaultsResponse { start: number; count: number; total: number; items: VaultListing[] }

// ---------------------------------------------------------------- earn positions
export interface EarnPositionAsset { address: string; symbol?: string; decimals?: number; priceUsd?: number; logoURI?: string }
/** `loanId`: the leg is ONE fixed-term loan (Lista's broker), also counted in the market's unbound leg — never add the two */
export interface EarnPositionLeg { earnUid?: string; marketUid: string; loanId?: string; asset: EarnPositionAsset; side: 'supply' | 'borrow' | 'both' | 'none'; deposits: string; depositsUsd: number; debt: string; debtUsd: number }
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
  /**
   * The lender's fixed-term descriptor. NOT a fixed-rate signal on its own: Lista's float markets and
   * Exactly's floating pools carry one too. `model` names the mechanism (`lista`, `midnight`, `term`, …).
   */
  fixedTerm?: { model: string; maturity?: number; [k: string]: unknown } | null; variableBorrowDisabledShort?: boolean | null; isBasketLong?: boolean
  /**
   * The rate card of a brokered debt: one entry per term, each its own loop option. `apr` is RAW —
   * no intrinsic or reward — so add `intrinsicYieldShort` and subtract `rewardAprShort` to put it on
   * `borrowAprShort`'s footing. Null on a variable-rate debt.
   */
  termsShort?: { termId: string; durationDays?: number; apr: number | string }[] | null
  intrinsicYieldShort?: string | number
  /** `maturityKind: 'fixed-date'` is a debt that falls due on one date (Midnight, Term, TermMax) */
  debtTerms?: { maturityKind?: string; canOpen?: boolean } | null
  underlyingInfoLong: UnderlyingInfo; underlyingInfoShort: UnderlyingInfo
  risk: { maxTokenScore?: number; breakdown: { category: string; score: number | null; label?: string }[] }
}
export interface OptimizerResponse { start: number; count: number; total: number; hasMore: boolean; nextStart?: number; items: OptimizerRowRaw[] }

// ---------------------------------------------------------------- actions
export interface ApiTx { to: string; data: string; value: string; description?: string }
/** `transactions` run in order (pre-steps when there are `alternatives`); `postTransactions` run after the chosen route (e.g. unwrap to native). */
export interface LoopActions { transactions: ApiTx[]; permissions: ApiTx[]; alternatives?: ApiTx[]; postTransactions?: ApiTx[] }
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
/** `/loop/close`: the same quotes, with an exit's economics instead of an entry's */
export interface LoopCloseData extends Omit<LoopQuoteData, 'economics'> { economics?: { exitCostUsd?: { total?: number } } | null }
export interface LoopPayAsset { address: string; symbol: string; decimals?: number; logoURI?: string; role: 'collateral' | 'debt' | 'native'; wrapsTo?: string; wrapsRole?: 'collateral' | 'debt' }
export interface LoopPayAssetsData { payAssets: LoopPayAsset[]; strict: boolean; notes: string[] }

// ---------------------------------------------------------------- balances
export interface TokenBalance { address: string; symbol: string; decimals: number; balanceRaw: string; balance: string; priceUSD?: number; balanceUSD?: number }

// ---------------------------------------------------------------- interest-rate model
/**
 * One point of a lending market's rate curve: at this utilisation, borrowers
 * pay `borrowRate` and lenders earn `depositRate`, both in percent.
 */
export interface IrmPoint { utilization: number; borrowRate: number; depositRate: number }
/**
 * `/v1/data/lending/irm` — the whole (utilisation → rate) curve of one market,
 * 21 points at 5 % steps, plus where the market sits on it at this block.
 *
 * It is the only endpoint that answers **why** a rate is what it is: the
 * headline APY is a single number that moves for reasons the listing never
 * states, and the curve says the reason out loud — how much room is left
 * before the kink, and how violently the rate moves past it.
 *
 * Not every lender has one. Measured 2026-09-24 over four chains, 23 families
 * answer a curve (Aave, Morpho, Euler, Compound, Fluid, Silo, Dolomite,
 * LlamaLend, Moonwell, Venus, Spark, Gearbox, Exactly, …) and 14 do not,
 * nearly all of them for a real reason — Liquity, Sky, Frankencoin, Resupply
 * and Teller do not price debt off a utilisation curve at all. A vault has no
 * curve either: it is a wrapper over markets that each have their own.
 */
export interface IrmCurve {
  marketUid: string
  protocol: string
  lenderKey: string
  chainId: string
  marketName?: string
  /** decimal strings, in the asset's own units */
  totalDeposits?: string
  totalDebt?: string
  totalLiquidity?: string
  totalDepositsUsd?: string
  totalDebtUsd?: string
  totalLiquidityUsd?: string
  /** percent, as the market pays it right now — the curve's own numbers, rewards NOT included */
  depositRate?: string
  variableBorrowRate?: string
  currentUtilization: number
  points: IrmPoint[]
}
export interface IrmResponse { count: number; items: IrmCurve[] }
