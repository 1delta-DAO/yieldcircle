import type { Holding } from './positions'
import { canonUid } from './uid'
import { signedMoney } from './lite'
import { pct } from './format'

/** The index's figure for one position (`/accounts/:a/pnl` → `positions[]`), the fields read here. */
export interface PnlRecord {
  /** `chainId|account|sub-account|lender` */
  key: string
  chainId: string
  strategyKey: string
  pnlUsd: number | null
  pnlAprPct: number | null
  status: string
}

/**
 * The strategy-book keys a live position is filed under (`bookKeyOf`'s spelling): a loop or a loan
 * `loop:<collateral>|<debt>`, a lending deposit `dep:<market>`, a vault `dep:<its earn uid>`.
 * More than one when the uid has two spellings.
 */
export function bookKeysOfHolding(h: Holding): string[] {
  const ks: string[] = []
  if (h.collateralUid && h.debtUid) {
    const a = canonUid(h.collateralUid) ?? h.collateralUid.toLowerCase(), b = canonUid(h.debtUid) ?? h.debtUid.toLowerCase()
    ks.push(`loop:${a}|${b}`)
  } else {
    for (const u of [h.marketUid, h.earnUid]) if (u) ks.push(`dep:${canonUid(u) ?? u.toLowerCase()}`, `dep:${u.toLowerCase()}`)
  }
  return [...new Set(ks)]
}

/**
 * A live position's own PnL record in the account's book: the same strategy on the same chain,
 * and where the account holds that strategy more than once, the same lender and sub-account. Only
 * a drawn figure (`status: ok`) — a position the index has not read, or read badly, has none.
 * Paper positions are never in the index.
 */
export function pnlOfHolding<P extends PnlRecord>(positions: readonly P[] | undefined, h: Holding): P | null {
  if (!positions?.length || h.key.startsWith('paper:')) return null
  const keys = new Set(bookKeysOfHolding(h).map((k) => k.toLowerCase()))
  const cands = positions.filter((p) => p.chainId === h.chainId && keys.has(p.strategyKey.toLowerCase()))
  const sub = h.accountId ?? ''
  const exact = cands.filter((p) => { const [, , s = '', lender = ''] = p.key.split('|'); return (!h.lender || lender === h.lender) && (s === sub || (s === '0' && !sub)) })
  const p = (exact.length ? exact : cands.length === 1 ? cands : [])[0]
  return p && p.status === 'ok' && p.pnlUsd != null && Number.isFinite(p.pnlUsd) ? p : null
}

/**
 * "+$523 since you opened it · 3.1% a year", its tone the figure's sign: a ticket head's PnL line.
 * No yearly rate on a loan (its figure is mostly the collateral's price over a small equity), nor
 * past ±100 % a year, where a short span or a thin base has blown the annualising up.
 */
export function pnlLine(p: Pick<PnlRecord, 'pnlUsd' | 'pnlAprPct'>, { loan = false }: { loan?: boolean } = {}): { text: string; tone: 'ok' | 'bad' } {
  const v = p.pnlUsd ?? 0, a = p.pnlAprPct
  const yearly = !loan && a != null && Number.isFinite(a) && Math.abs(a) <= 100
  return { text: `${signedMoney(v)} since you opened it${yearly ? ` · ${pct(a, 1)} a year` : ''}`, tone: v >= 0 ? 'ok' : 'bad' }
}

/** You's "What you made" before the index holds any record for the wallet: why there is no figure, and when there will be. */
export const pnlNotReadYet = (live: number, syncing: boolean, failed: boolean) => failed
  ? 'The index could not be reached just now — what you made shows here once it answers.'
  : `No record yet: the index has not read ${live === 1 ? 'your position' : `your ${live} positions`}${syncing ? ' — syncing now' : ''}. It draws what each made within a few hours of reading it; this updates by itself.`
