/**
 * A paper account's history on its wallet page (tickets/0006): every op it signed, as the server
 * applied it (`GET /paper/book/:a/ops`), in the same rows the index's moves use — and the 30-day
 * flows above them, valued at the prices each op was judged at. Nothing here is on chain.
 */
import React from 'react'
import { bookOf, starterRef, tokenKey, type PaperBook, type PaperLedger, type PaperOp, type PaperSnap, type PriceFn } from '../model/paper'
import { ledgerMeta, metaKey, type TokenMeta } from '../model/paperView'
import { usePaperBook, usePaperOps } from '../social/queries'
import { missingRoute, usePaper } from '../state/Paper'
import { chainLabel } from '../sdk/queries'
import { Ago } from './social-bits'
import { Sk, num, usdShort } from './bits'
import { marketHref } from '../state/AppState'

export interface PaperMove { id: number; at: string; chains: string[]; verb: string; cls: string; what: string; sub?: string; usd?: number; uid?: string; /** what it cost: fees, slippage, the bridge's cut */ costUsd?: number }
export interface PaperFlows { depositedUsd: number; withdrawnUsd: number; borrowedUsd: number; repaidUsd: number; moves: number }

type PosRef = { chainId: string; snap: PaperSnap }
const DAY = 86_400_000

/** One op in words, valued at the prices the server judged it at. */
function describe(id: number, at: string, op: PaperOp, prices: Record<string, number | null>, pos: Map<string, PosRef>, meta: TokenMeta): PaperMove & { flow: Partial<PaperFlows> } {
  const P = (c: string, t: string | undefined) => (t ? prices[`${c}:${tokenKey(c, t)}`] ?? undefined : undefined)
  const val = (c: string, t: string | undefined, u: number) => { const p = P(c, t); return p != null ? p * u : undefined }
  const sym = (c: string, t: string) => meta[metaKey(c, t)]?.symbol ?? `${t.slice(0, 6)}…`
  const base = { id, at }
  switch (op.t) {
    case 'genesis':
      return { ...base, chains: [], verb: 'opened the paper account', cls: 'k-move', what: 'the starting bank', flow: {} }
    case 'topup': {
      return { ...base, chains: [op.chainId], verb: 'added paper cash', cls: 'k-in', what: `${num(op.units, 0)} on ${chainLabel(op.chainId)}`, usd: op.units, flow: {} }
    }
    case 'swap':
      return { ...base, chains: [op.chainId], verb: 'swapped', cls: 'k-move', what: `${num(op.unitsIn, 4)} ${sym(op.chainId, op.from)} → ${num(op.unitsOut, 4)} ${sym(op.chainId, op.to)}`, sub: [op.route?.aggregator, chainLabel(op.chainId)].filter(Boolean).join(' · '), usd: val(op.chainId, op.from, op.unitsIn), flow: {} }
    case 'bridge':
      return { ...base, chains: [op.fromChainId, op.toChainId], verb: 'bridged', cls: 'k-move', what: `${num(op.unitsIn, 4)} ${sym(op.fromChainId, op.from)} → ${sym(op.toChainId, op.to)}`, sub: `${chainLabel(op.fromChainId)} → ${chainLabel(op.toChainId)}${op.route?.bridge ? ` · ${op.route.bridge}` : ''}`, usd: val(op.fromChainId, op.from, op.unitsIn), flow: {} }
    case 'open': {
      const paid = val(op.chainId, op.pay.token, op.pay.units)
      const uid = op.snap.marketUid ?? op.snap.earnUid
      if (op.kind === 'simple')
        return { ...base, chains: [op.chainId], verb: op.into ? 'added to' : 'deposited', cls: 'k-in', what: op.snap.label, sub: `${op.snap.venue} · ${chainLabel(op.chainId)}`, usd: paid, uid, flow: { depositedUsd: paid ?? 0 } }
      const pH = P(op.chainId, op.snap.held.address) ?? op.snap.held.priceUsd, pD = (op.snap.debt && P(op.chainId, op.snap.debt.address)) ?? op.snap.debt?.priceUsd ?? 0
      const held = op.units * pH, owed = op.debtUnits * pD
      const lev = held > owed ? held / (held - owed) : null
      return { ...base, chains: [op.chainId], verb: op.into ? 'added to a loop' : 'opened a loop', cls: 'k-borrow', what: `${op.snap.label}${lev ? ` · ${lev.toFixed(1)}×` : ''}`, sub: `${op.snap.venue} · ${chainLabel(op.chainId)}`, usd: paid, uid, flow: { depositedUsd: paid ?? 0, borrowedUsd: owed } }
    }
    case 'withdraw': {
      const p = pos.get(op.id)
      const c = p?.chainId ?? ''
      const got = c ? val(c, op.receive.token, op.receive.units) : undefined
      return { ...base, chains: c ? [c] : [], verb: 'withdrew', cls: 'k-out', what: p?.snap.label ?? 'a deposit', sub: p ? `${num(op.receive.units, 4)} ${sym(c, op.receive.token)} · ${chainLabel(c)}` : undefined, usd: got, uid: p?.snap.marketUid ?? p?.snap.earnUid, flow: { withdrawnUsd: got ?? 0 } }
    }
    case 'lever': {
      const p = pos.get(op.id)
      const c = p?.chainId ?? ''
      const owed = c && p?.snap.debt ? val(c, p.snap.debt.address, op.addDebt) : undefined
      return { ...base, chains: c ? [c] : [], verb: 'levered up', cls: 'k-borrow', what: p?.snap.label ?? 'a loop', sub: c ? chainLabel(c) : undefined, usd: owed, uid: p?.snap.marketUid, flow: { borrowedUsd: owed ?? 0 } }
    }
    case 'borrow': {
      const c = op.chainId
      const owed = op.snap.debt ? val(c, op.snap.debt.address, op.debtUnits) : undefined
      const put = op.collateral.units > 0 ? val(c, op.collateral.token, op.collateral.units) : undefined
      return { ...base, chains: [c], verb: op.into ? (op.collateral.units > 0 && !op.debtUnits ? 'added collateral to' : 'borrowed more on') : 'borrowed against', cls: 'k-borrow', what: op.snap.label, sub: `${op.debtUnits ? `${num(op.debtUnits, 2)} ${op.snap.debt?.symbol ?? ''} out · ` : ''}${op.snap.venue} · ${chainLabel(c)}`, usd: owed ?? put, uid: op.snap.marketUid, flow: { depositedUsd: put ?? 0, borrowedUsd: owed ?? 0 } }
    }
    case 'repay': {
      const p = pos.get(op.id)
      const c = p?.chainId ?? ''
      const repaid = c && p?.snap.debt ? val(c, p.snap.debt.address, op.debtUnits) ?? 0 : 0
      const got = c && op.withdraw > 0 ? val(c, p!.snap.held.address, op.withdraw) ?? 0 : 0
      return { ...base, chains: c ? [c] : [], verb: op.repayAll && op.withdrawAll ? 'closed a loan' : op.debtUnits > 0 || op.repayAll ? 'paid back' : 'took collateral out of', cls: 'k-repay', what: p?.snap.label ?? 'a loan', sub: c ? chainLabel(c) : undefined, usd: repaid || got, uid: p?.snap.marketUid, flow: { repaidUsd: repaid, withdrawnUsd: got } }
    }
    case 'reduce': {
      const p = pos.get(op.id)
      const c = p?.chainId ?? ''
      const got = c ? op.receive.reduce((a, r) => a + (val(c, r.token, r.units) ?? 0), 0) : 0
      const repaid = c && p?.snap.debt ? val(c, p.snap.debt.address, op.debtUnits) ?? 0 : 0
      return { ...base, chains: c ? [c] : [], verb: op.all ? 'closed a loop' : 'deleveraged', cls: 'k-repay', what: p?.snap.label ?? 'a loop', sub: c ? `${op.all ? `${op.receive.map((r) => `${num(r.units, 4)} ${sym(c, r.token)}`).join(' + ')} back · ` : ''}${chainLabel(c)}` : undefined, usd: op.all ? got : repaid, uid: p?.snap.marketUid, flow: { withdrawnUsd: got, repaidUsd: repaid } }
    }
  }
  // an admin entry (pos-indexer scripts/paper-rebank.ts): the account moved to the Solana start (tickets/0007)
  if ((op as { t: string }).t === 'rebank') return { ...base, chains: [], verb: 'moved to the Solana start', cls: 'k-move', what: 'balances outside Solana removed — every chain now starts with a bridge', flow: {} }
  return { ...base, chains: [], verb: (op as { t: string }).t, cls: 'k-move', what: '', flow: {} }
}

/**
 * A paper account's ledger for its wallet page: the server's, or — on your own page — whichever of
 * the server's and this browser's copy is newer (a browser can be behind: an op made on another
 * device, a sync that has not run). Opening your own page also syncs.
 */
export function usePaperLedgerFor(account: string | undefined) {
  const paper = usePaper()
  const mine = !!account && paper.session?.evm === account
  const server = usePaperBook(account)
  React.useEffect(() => { if (mine && paper.active) void paper.sync() }, [mine, paper.active]) // eslint-disable-line react-hooks/exhaustive-deps
  const local = mine ? paper.ledger : null
  const remote = server.data?.ledger ?? null
  const ledger = local && (!remote || local.seq >= remote.seq) ? local : remote ?? local
  // someone else's book: the starter tokens at their reference prices, positions at their own stamped prices
  const price: PriceFn = mine ? paper.price : (c, t) => starterRef(c, t)
  return { ledger, price, mine, loading: !ledger && server.isLoading, error: !ledger && server.isError }
}
/** The book on the chains in scope only — what the page's chain filter says, like the chip and the moves. */
export function scopedBook(l: PaperLedger | null, inScope: (chainId: string) => boolean, price: PriceFn): PaperBook | null {
  if (!l) return null
  const scoped: PaperLedger = {
    ...l,
    bank: Object.fromEntries(Object.entries(l.bank).filter(([c]) => inScope(c))),
    positions: l.positions.filter((p) => inScope(p.chainId)),
    inflight: l.inflight.filter((t) => inScope(t.toChainId)),
  }
  return bookOf(scoped, Date.now(), price)
}

/** The history and the last 30 days' flows, on the chains in scope. */
export function usePaperHistory(account: string | undefined, inScope: (chainId: string) => boolean) {
  const paper = usePaper()
  const q = usePaperOps(account)
  const mine = !!account && paper.session?.evm === account
  const { ledger } = usePaperLedgerFor(account)
  return React.useMemo(() => {
    const meta: TokenMeta = { ...ledgerMeta(ledger), ...(mine ? paper.tokens : {}) }
    const ops = q.data?.ops ?? []
    // every position the history or the book names, so a withdrawal says what it came out of
    const pos = new Map<string, PosRef>()
    for (const p of ledger?.positions ?? []) pos.set(p.id, { chainId: p.chainId, snap: p.snap })
    for (const o of [...ops].reverse()) if (o.op.t === 'open' || o.op.t === 'borrow') {
      if (!o.op.into) pos.set(o.op.id, { chainId: o.op.chainId, snap: o.op.snap })
      // every leg a position ever had names its token, closed positions included
      for (const leg of [o.op.snap.held, o.op.snap.debt, o.op.snap.money]) if (leg?.symbol) meta[metaKey(o.op.chainId, leg.address)] ??= { symbol: leg.symbol, decimals: leg.decimals }
    }
    const all = ops.map((o) => ({ ...describe(o.id, o.at, o.op, o.prices ?? {}, pos, meta), ...(o.frictionUsd != null && o.frictionUsd > 0 ? { costUsd: o.frictionUsd } : {}) }))
    const rows = all.filter((m) => !m.chains.length || m.chains.some(inScope))
    const since = Date.now() - 30 * DAY
    const flows: PaperFlows = { depositedUsd: 0, withdrawnUsd: 0, borrowedUsd: 0, repaidUsd: 0, moves: 0 }
    for (const m of rows) {
      if (Date.parse(m.at) < since) continue
      flows.moves++
      for (const k of ['depositedUsd', 'withdrawnUsd', 'borrowedUsd', 'repaidUsd'] as const) flows[k] += m.flow[k] ?? 0
    }
    // a service without the history route answers Fastify's 404: unavailable, not "no moves"
    const unavailable = q.isError && missingRoute(q.error)
    return { rows: rows as PaperMove[], flows, loading: q.isLoading, error: q.isError, unavailable, ledger }
  }, [q.data, q.error, ledger, mine, paper.tokens, inScope]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Small costs in cents: a Base deposit's $0.006 is not "$0". */
export const costWord = (x: number) => (x < 0.01 ? '<$0.01' : x < 10 ? `$${x.toFixed(2)}` : usdShort(x))

/** The moves, in the index's tape rows; a deposit or loop links to its market. */
export function PaperMovesList({ rows, loading, error, unavailable }: { rows: PaperMove[]; loading: boolean; error: boolean; unavailable?: boolean }) {
  return (
    <div className="card">
      {loading && <div className="empty"><Sk w={200} /></div>}
      {!loading && error && <div className="empty">{unavailable ? 'The paper server does not serve the history yet. Your actions are recorded; they show here once it is updated.' : 'The paper history is not answering right now.'}</div>}
      {!loading && !error && !rows.length && <div className="empty">No paper moves on these chains yet.</div>}
      <div className="tape">{rows.map((m) => (
        <div key={m.id} className="tape-item">
          <a className="tape-row" href={m.uid ? marketHref(m.uid) : undefined}>
            <span className={`verb ${m.cls}`}>{m.verb}</span>
            <span className="tr-m">{m.what} {m.sub && <span className="t50">{m.sub}</span>}{m.costUsd != null && <span className="t50" title="What this move cost: network fees, slippage, the bridge's cut, a loop's entry or exit"> · cost {costWord(m.costUsd)}</span>}</span>
            <span className="tr-v">{m.usd != null ? usdShort(m.usd) : <span className="t40">—</span>}</span>
            <span className="tr-t"><Ago ts={m.at} /></span>
          </a>
        </div>
      ))}</div>
    </div>
  )
}
