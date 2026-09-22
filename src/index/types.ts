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
export interface Valued {
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
export interface TxLeg extends LedgerEvent { folded: 'row' | 'pair' | 'transfer'; rows: string[]; to?: string }
/** `?group=tx` — the feed's unit: a four-leg loop is ONE of these, not four rows. */
export interface TxBundle {
  chainId: string
  txHash: string
  blockNumber: number
  blockTs: string
  accounts: string[]
  lenders: string[]
  kinds: Record<string, number>
  legs: TxLeg[]
  nRows: number
  netUsd: number | null
  volumeUsd: number | null
  unpriced: number
}

export interface Accrual { exact: boolean; source: string; model?: string; growth: number; accrued?: string; projected?: string }
export interface IndexPosition extends Named, Valued, AccountIdentity {
  chainId: string
  account: string
  posId: string
  marketUid: string
  side: string
  unitKind: string
  aprAtRead: number | null
  aprNow: number | null
  accrual: Accrual | null
  asOfBlock: number
  asOfTs: string
  readMethod?: string
  method?: string
}
export interface PositionsResponse {
  account: string
  positions: IndexPosition[]
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
  [k: string]: unknown
}
export interface Holder extends AccountIdentity {
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
 * can name a chain `sdk/queries.ts` has no label for. Naming it is better than
 * printing `137` at the reader. Avalanche left this list when the selector
 * gained it — `chainLabel` answers for every chain in `CHAINS`, and a duplicate
 * here would only go stale.
 */
const EXTRA: Record<string, string> = { '137': 'Polygon', '10': 'Optimism' }
export const indexChainLabel = (id: string | undefined, known: (id: string) => string): string => {
  if (!id) return ''
  const k = known(id)
  return k === id ? (EXTRA[id] ?? id) : k
}
