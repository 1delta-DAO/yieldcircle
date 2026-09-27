/**
 * Wire shapes of the position index (`pos-indexer`, positions.1delta.io).
 * Only the fields this app reads are typed. Every amount comes with the index's
 * own honesty markers: `usdStatus` says how sure the dollar figure is and
 * `amountFromIndex` says the amount was derived as units × index rather than
 * read from the log.
 */

export type UsdStatus = 'exact' | 'provisional' | 'pending' | 'no-asset' | 'no-index' | 'no-price'
/** `vault` = the address IS a share token; `protocol` = a roster emitter moving its own shares. */
export type AccountKind = 'vault' | 'protocol' | 'router' | 'eoa' | 'contract' | null

export interface Named {
  lenderKey: string
  lenderName?: string | null
  lenderLogo?: string | null
  marketUid?: string | null
  marketName?: string | null
}
/**
 * Whose credit a token leaves you holding (pos-indexer tickets/0011).
 * `issuer` is the INSTRUMENT — whose contract the token is. `issuerExposures`
 * is the desk BEHIND it, reached by the token-list walk: a PT over sUSDe is
 * Pendle's contract and Ethena's solvency, and both are true. `hops` says how
 * far the walk went, so a two-hop attribution can be shown as the weaker
 * claim it is. Both null for a token nobody issues — never `[]`.
 */
export interface IssuerRef { id: string; name: string }
export interface IssuerExposure extends IssuerRef { hops: number }
export interface Desked {
  issuer?: IssuerRef | null
  issuerExposures?: IssuerExposure[] | null
}

/**
 * A market's POSITION exposure: whose credit the money IN it sits behind —
 * a curated vault's allocation, or what can be posted against a lending
 * market. Read `status` before `legs`: `unavailable` means no allocation
 * could be read, and rendering it as an empty list would tell a depositor
 * the vault is exposed to nothing.
 */
export interface MarketExposure {
  status: 'resolved' | 'none' | 'unavailable'
  source: string
  legs: { id: string; name: string; weightPct?: number; via?: boolean }[] | null
  legCount: number
  unattributedPct: number | null
  asOf: string | null
  refreshedAt: string
}

export interface Valued extends Desked {
  amount?: string | null
  amountRaw: string
  amountUsd: number | null
  usdStatus?: UsdStatus
  unitsRaw?: string | null
  amountFromIndex?: boolean | null
  asset?: string | null
  symbol?: string | null
  assetName?: string | null
  assetLogo?: string | null
  decimals?: number | null
  /** the cross-chain asset key, when the index answers one — what an asset page is keyed by */
  assetGroup?: string | null
}
export interface AccountIdentity { accountKind?: AccountKind; accountLabel?: string | null }

export interface LedgerEvent extends Named, Valued, AccountIdentity {
  chainId: string
  blockNumber: number
  blockTs: string
  txHash: string
  logIndex: number
  seq: number
  family?: string
  account: string
  posId?: string | null
  side: string
  kind: string
  caller?: string | null
  /** the POOL's rate for this side at the row's hour, % */
  apr?: number | null
  /**
   * What the TOKEN itself earns, % (pos-indexer tickets/0017): an RWA or
   * savings token posted where nobody borrows it reads `apr` 0 while the
   * token accrues on its own. `null` = nobody publishes one, never zero.
   */
  intrinsicApr?: number | null
  intrinsicSource?: 'market' | 'asset' | null
  /** pool + intrinsic: what the leg earns, or on a borrow leg what it costs */
  aprEffective?: number | null
}
/** One leg of a transaction: a ledger row, a Pool+token pair, or a folded transfer. */
export interface TxLeg extends LedgerEvent { folded: 'row' | 'pair' | 'transfer'; rows: string[]; to?: string; /** the same money one layer down: a vault putting this deposit to work */ passthrough?: boolean }
/**
 * Who a transaction is ABOUT (pos-indexer tickets/0016) — not the same question as
 * which leg it headlines. A deposit into a curated vault touches the depositor AND
 * the vault that routes the money, and the index names the outermost actor here so
 * a card cannot take the address from one and the name from the other.
 *
 * `wallet` one economic actor · `desk` every account is a vault, so this is an
 * allocation decision · `multi` unrelated wallets a solver batched, and `accounts`
 * says how many.
 */
export interface TxSubject {
  account: string
  accountKind?: AccountKind
  accountLabel?: string | null
  reason: 'wallet' | 'desk' | 'multi'
  accounts: number
}
/** `?group=tx` — the feed's unit: a four-leg loop is ONE of these, not four rows. */
export interface TxBundle {
  chainId: string
  txHash: string
  blockNumber: number
  blockTs: string
  accounts: string[]
  subject?: TxSubject | null
  /** legs that are the same money one layer down (a vault putting a deposit to work) */
  nPassthrough?: number
  lenders: string[]
  kinds: Record<string, number>
  legs: TxLeg[]
  nRows: number
  netUsd: number | null
  volumeUsd: number | null
  unpriced: number
}

/** The subject, or what this app did before the index carried one. */
export const subjectOf = (t: TxBundle): TxSubject =>
  t.subject ?? { account: t.accounts[0] ?? '', reason: 'wallet', accounts: t.accounts.length }

export interface Accrual { exact: boolean; source: string; model?: string; growth: number; accrued?: string; projected?: string }
export interface IndexPosition extends Named, Valued, AccountIdentity {
  chainId: string
  account: string
  posId: string
  marketUid: string
  side: string
  unitKind: string
  aprAtRead: number | null
  /** the POOL's own rate for this side — zero on a Morpho collateral leg by construction */
  aprNow: number | null
  /**
   * What the TOKEN itself earns (pos-indexer tickets/0017), percent. `null` means
   * nobody publishes a figure for it, which for a plain stablecoin is the same as
   * nothing and for a yield-bearing one is an unknown — never read it as zero.
   */
  intrinsicApr?: number | null
  intrinsicSource?: 'market' | 'asset' | null
  /** pool + intrinsic: what the leg earns, or on a borrow leg what it costs */
  aprEffective?: number | null
  accrual: Accrual | null
  asOfBlock: number
  asOfTs: string
  readMethod?: string
  method?: string
}
/**
 * The legs that share one liquidation, folded (pos-indexer tickets/0018).
 * `blend: 'none'` means no blended rate is published for this set — a fixed-term
 * loan carries its own rate and maturity — and the legs are then the only honest
 * answer.
 */
export interface PositionGroup {
  key: string
  chainId: string
  account: string
  posId: string
  riskKey: string
  lenderKey: string
  marketUids: string[]
  supplyUsd: number
  debtUsd: number
  equityUsd: number
  leverage: number | null
  annualUsd: number | null
  netAprPct: number | null
  blend: 'net' | 'none'
  reason: string | null
  /** every leg carried a price and a rate; false means the figure is a floor */
  exact: boolean
  unpriced: number
  legs: { marketUid: string; side: string; posId: string }[]
}
export interface PositionsResponse {
  account: string
  positions: IndexPosition[]
  groups?: PositionGroup[]
  totals: { depositsUsd: number; debtUsd: number; navUsd: number }
  asOf: { oldest: string } | null
}

export interface FlowRow { chainId: string; side: string; inUsd: number; outUsd: number; nEvents: number; unpriced: number }
export interface FlowsResponse {
  account: string
  days: number
  flows: FlowRow[]
  totals: {
    depositedUsd: number; withdrawnUsd: number; borrowedUsd: number; repaidUsd: number
    netSupplyUsd: number; netBorrowUsd: number; nEvents: number; unpriced: number
  }
}

export interface MarketRow extends Named {
  chainId: string
  family?: string
  assetSymbol?: string | null
  assetLogo?: string | null
  supplyApr?: number | null
  borrowApr?: number | null
  exposure?: MarketExposure | null
  /** the asset page keys of the market's asset and its collateral (tickets/0026) — null when the index names no group */
  assetGroup?: string | null
  collateralGroup?: string | null
  collateralSymbol?: string | null
  collateralLogo?: string | null
  /** the market's published size, newest hour — null when nobody publishes one */
  totals?: { ts: string; depositsUsd: number | null; debtUsd: number | null; liquidityUsd: number | null } | null
  [k: string]: unknown
}
export interface Holder extends AccountIdentity, Desked {
  account: string
  side: string
  amountUsd: number | null
  amount?: string | null
  symbol?: string | null
  posId?: string | null
  asOfTs?: string
}
/**
 * A vault as the index's `/vaults` book has it — the SHARE TOKEN's own row.
 *
 * A curated vault is an address in the ledger like any other, so a page
 * opened on one is really a vault page: `supplyRate` is what it pays its
 * depositors, which is the number its positions do not carry (those are the
 * markets it lends INTO) and the first thing anyone looking at the address
 * wants. `valueUsd` is what this index has read holders for; `tvlUsd` is the
 * whole vault as the listing states it, and the two are different questions.
 */
export interface VaultRow {
  marketUid: string
  chainId: string
  provider: string | null
  name: string | null
  symbol: string | null
  address: string | null
  /** percent APR a depositor earns — `null` is "nobody publishes one", never 0 */
  supplyRate: number | null
  /** raw asset per raw share at `indexTs`, as a decimal string */
  supplyIndex: string | null
  indexTs: string | null
  tvlUsd: number | null
  valueUsd: number | null
  holders: number
  assetSymbol: string | null
  assetLogo: string | null
  curatorId: string | null
  curatorName: string | null
  async: boolean
  expiry: number | null
}
export interface TrendingMarket extends Named {
  chainId: string
  netUsd: number
  inUsd: number
  outUsd: number
  nEvents: number
  nAccounts?: number
}
/** `following: {source, accounts, markets}` — how `/events/recent` resolved the scope. */
export interface Following { source: string; accounts: number; markets: number }

/**
 * The index follows chains this app offers no strategies on, so a ledger row
 * could name a chain `sdk/queries.ts` had no label for. It no longer can:
 * `CHAINS` names every chain the index follows and `chainLabel` reads
 * from it, which is why this map — once `{ '137': 'Polygon', '10': 'Optimism' }`
 * — is empty rather than a second, staler copy of the same names. It stays as
 * the seam: the next chain the index adds before this app hears about it lands
 * here, not in a `137` printed at the reader.
 */
const EXTRA: Record<string, string> = {}
export const indexChainLabel = (id: string | undefined, known: (id: string) => string): string => {
  if (!id) return ''
  const k = known(id)
  return k === id ? (EXTRA[id] ?? id) : k
}

// ---------------------------------------------------------------- assets (pos-indexer tickets/0026)

/** One share of a total: a protocol, or a chain (`key` = chain id). */
export interface AssetSlice {
  key: string
  name: string | null
  logo: string | null
  usd: number
  /** share of the slice list's total, 0..100 */
  pct: number | null
  markets: number
}
export interface AssetBookRow {
  group: string
  symbol: string | null
  name: string | null
  logoUri: string | null
  issuer: string | null
  issuerName: string | null
  priceUsd: number | null
  priceChange24hPct: number | null
  depositsUsd: number
  borrowsUsd: number
  collateralUsd: number
  /** curated vaults over this asset — already inside the markets, NOT added to deposits */
  vaultTvlUsd: number
  /** held inside tokens BUILT on this one (stETH over ETH, sUSDS over USDS) — their own assets, not lending */
  wrappedUsd?: number
  /** 0..1 */
  utilization: number | null
  depositsChange24hPct: number | null
  intrinsicApr: number | null
  chains: string[]
  markets: number
  protocols: number
}
export interface AssetMarket {
  marketUid: string
  chainId: string
  lenderKey: string
  protocol: string
  protocolName: string | null
  protocolLogo: string | null
  name: string | null
  role: 'lending' | 'collateral'
  depositsUsd: number | null
  borrowsUsd: number | null
  liquidityUsd: number | null
  utilization: number | null
  supplyApr: number | null
  borrowApr: number | null
  intrinsicApr: number | null
  asOf: string | null
}
export interface AssetVault {
  marketUid: string
  chainId: string
  address: string
  name: string | null
  symbol: string | null
  provider: string
  curatorId: string | null
  curatorName: string | null
  tvlUsd: number | null
  supplyApr: number | null
}
export interface AssetMember {
  chainId: string
  address: string
  symbol: string | null
  name: string | null
  decimals: number | null
  logoUri: string | null
  priceUsd: number | null
  supply: { amount: string; usd: number | null; block: number | null; day: string } | null
  lentPct: number | null
  marketCapUsd: number | null
}
export interface AssetDetail {
  group: string
  symbol: string | null
  name: string | null
  logoUri: string | null
  issuer: string | null
  issuerName: string | null
  issuerExposures: { id: string; name?: string; weightPct?: number; via?: string }[] | null
  intrinsicApr: number | null
  /** the member to rate — ratings key `<chainId>:<address>` */
  headline: { chainId: string; address: string } | null
  price: { usd: number; ts: string; change24hPct: number | null } | null
  marketCap: { usd: number; source: 'defillama'; chainId: string; address: string; asOf: string } | null
  totals: {
    depositsUsd: number; borrowsUsd: number; collateralUsd: number; liquidityUsd: number
    vaultTvlUsd: number
    /** held inside wrappers (LSTs, savings tokens) — their own assets, not lent */
    wrappedUsd?: number
    utilization: number | null
    depositsChange24hPct: number | null
    asOf: string | null
  }
  supply: {
    /** `symbols`: the members this row's totalSupply() sums (WETH, not ETH); absent on an older index */
    perChain: { chainId: string; symbols?: string[]; amount: string; usd: number | null; lentPct: number | null }[]
    /** null when a bridged member would double count */
    totalUsd: number | null
    totalNote: string | null
    /** a gas-coin group (ETH, BNB …): the coin's circulating supply, cap ÷ price; absent on an older index */
    coin?: { chainId: string; symbol: string | null; amount: number; usd: number; lentPct: number | null; source: 'defillama' } | null
  }
  members: AssetMember[]
  byProtocol: AssetSlice[]
  byChain: AssetSlice[]
  borrowsByProtocol: AssetSlice[]
  collateralByProtocol: AssetSlice[]
  byProtocolChain: { protocol: string; chainId: string; depositsUsd: number; borrowsUsd: number; collateralUsd: number; markets: number }[]
  /** curated LENDING vaults only */
  vaults: AssetVault[]
  /** tokens built on this one (provider 'lst' | 'savings') — their own assets, not lending */
  wrappers?: AssetVault[]
  markets: AssetMarket[]
  /** the whole market set before the API's 300 cap (older index: absent) */
  marketCount?: number
  chainCount?: number
  /** caveats, rendered verbatim */
  notes: string[]
}
export interface AssetHistory {
  group: string
  days: number
  /** top 8 by latest deposits; the rest folded into `other` */
  protocols: { key: string; name: string | null; logo: string | null }[]
  points: { day: string; depositsUsd: number; borrowsUsd: number; collateralUsd: number; byProtocol: Record<string, number> }[]
}
export interface AssetHolder {
  account: string
  amountUsd: number
  positions: number
  chains: string[]
  accountKind: string | null
  accountLabel: string | null
  since: string | null
}
export interface AssetHolders { holders: AssetHolder[]; note: string }
