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
  apr?: number | null
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
 * `SCOPE_CHAINS` names every chain the index follows and `chainLabel` reads
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
