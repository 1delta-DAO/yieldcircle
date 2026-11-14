import { isSvmChain } from '@yieldcircle/core/model/address'
import type { Holding } from '@yieldcircle/core/model/positions'
import { isBatchTrace, isDone, type ReceiptKind, type Trace } from './txTrace'
import { phaseWords } from './txWords'

/**
 * How an action ended, read once for every screen that says so — the ticket's end, *Get*'s, the
 * phone's pill and receipt, the web's tray (docs/tx-feedback-plan.md §3.2). Pure: the trace in,
 * the words out.
 *
 *   flying  still on its way
 *   won     settled, and the app's numbers show it
 *   soft    final on chain, but the positions or the balance have not shown it yet — said honestly,
 *           never celebrated, with "Check again"
 *   lost    reverted, dropped or failed: what happened, and above all where the money is
 */
export type OutcomeState = 'flying' | 'won' | 'soft' | 'lost'
/** What the screen offers next: send it again, open the explorer, re-read, or just close. */
export type Next = 'again' | 'view' | 'check' | 'done'
export interface Outcome {
  state: OutcomeState
  /** the one bold line */
  head: string
  /** under it: where it is (flying), what came of it (won / soft) */
  detail?: string
  /** a failure's one sentence that matters: where the funds are */
  money?: string
  /** the colour of the mark: amber for an end that is not a plain no */
  tone: 'run' | 'ok' | 'warn' | 'bad'
  next: Next[]
}

/** The headline of a success, per kind of action. A bridge says where it landed. */
export function wonHead(kind: ReceiptKind | undefined, landedOn?: string): string {
  switch (kind) {
    case 'deposit': return 'Deposit complete'
    case 'open': return 'Your loop is open'
    case 'withdraw': case 'close': return 'Back in your wallet'
    case 'delever': return 'Safer now'
    case 'lever': return 'Leverage raised'
    case 'borrow': return 'The money’s in your wallet'
    case 'repay': return 'Paid back'
    case 'collateral': return 'Collateral added'
    case 'roll': return 'Rolled over'
    case 'swap': return 'Swapped'
    case 'bridge': return landedOn ? `Landed on ${landedOn}` : 'Bridge complete'
    default: return 'Done'
  }
}

export interface OutcomeOpts {
  now?: number
  /** the chain's name, for "Landed on Base" and "Refunded on Arbitrum" */
  chain?: (id: string) => string
  /** what a revert of this step means for the funds, when the generic words would mislead (the ladder's `onFail`) */
  onFail?: string
  /** earlier steps of the same action landed before this one failed */
  partial?: boolean
}

export function outcomeOf(t: Trace, o: OutcomeOpts = {}): Outcome {
  const now = o.now ?? Date.now()
  const chain = o.chain ?? ((id: string) => id)
  if (!isDone(t)) {
    const w = phaseWords(t, now)
    return { state: 'flying', head: t.title, detail: [w.head, w.detail].filter(Boolean).join(' · '), tone: w.tone === 'warn' ? 'warn' : 'run', next: [] }
  }
  const kind = t.receipt?.kind
  if (t.phase === 'settled') {
    if (t.note) return { state: 'soft', head: t.bridge ? `Arrived on ${chain(t.bridge.toChainId)}` : 'Landed on chain', detail: t.note, tone: 'warn', next: t.paper || t.moves === 'none' ? ['done'] : ['check', 'done'] }
    const got = t.received?.length ? `${t.received.map((r) => `+${r.amount} ${r.symbol}`.trim()).join(', ')} in your wallet` : undefined
    return { state: 'won', head: wonHead(kind, t.bridge ? chain(t.bridge.toChainId) : undefined), detail: t.paper ? 'On paper — nothing was sent on chain.' : got, tone: 'ok', next: ['done'] }
  }
  const lost = (head: string, money: string, next: Next[], tone: Outcome['tone'] = 'bad'): Outcome => ({ state: 'lost', head, money, detail: t.err && t.err !== money ? t.err : undefined, tone, next })
  if (o.partial) return lost('Half done', `The earlier steps went through; this one did not${t.phase === 'reverted' ? ' (it reverted — only its network fee was spent)' : ''}. Send it again to finish.`, ['again', 'view'], 'warn')
  if (t.phase === 'reverted') {
    if (o.onFail) return lost('Almost', o.onFail, ['done', 'view'], 'warn')
    if (isBatchTrace(t.id)) return lost('It didn’t go through', 'The batch reverted, so nothing was moved. Only the network fee was spent.', ['again'])
    return lost('It didn’t go through', 'Nothing moved. Only the network fee was spent.', ['again', 'view'])
  }
  if (t.phase === 'dropped') {
    if (/cancel/i.test(t.err ?? '')) return lost('Cancelled', 'You cancelled it in the wallet. Nothing left your wallet.', ['again'], 'warn')
    if (isSvmChain(t.chainId) && /expired/i.test(t.err ?? '')) return lost('It expired', 'Nothing left your wallet. A Solana transaction lives about 90 seconds: start again for a fresh one.', ['again'])
    return lost('It never landed', 'Nothing left your wallet.', ['again'])
  }
  // failed
  if (t.bridge?.status === 'TRANSFER_REFUNDED') return lost('The bridge sent it back', `Refunded to your wallet on ${chain(t.chainId)}.`, ['again', 'view'], 'warn')
  if (/^lost track/i.test(t.err ?? '')) return lost('We lost track of it', 'It may have landed: your wallet shows whether it did.', ['check', 'view'], 'warn')
  if (t.bridge) return lost('The bridge failed', `${t.bridge.name} could not deliver it. Your funds are with the bridge or back on ${chain(t.chainId)}.`, ['view', 'again'])
  return lost('It didn’t go through', 'Nothing moved.', ['again', 'view'])
}

/**
 * The position an action made or changed, among the wallet's holdings: the one the ticket named,
 * else the one on its chain whose market it touched — a loop's two legs ahead of one.
 */
export function holdingFor(holdings: Holding[], t: Pick<Trace, 'chainId' | 'touches' | 'receipt'>): Holding | undefined {
  if (t.receipt?.holdingKey) { const h = holdings.find((x) => x.key === t.receipt!.holdingKey); if (h) return h }
  const touched = new Set(t.touches ?? [])
  if (!touched.size) return undefined
  const score = (h: Holding) => [h.earnUid, h.collateralUid, h.debtUid, h.marketUid].filter((u) => u && touched.has(u)).length
  return holdings.filter((h) => h.chainId === t.chainId && score(h) > 0).sort((a, b) => score(b) - score(a) || b.valueUsd - a.valueUsd)[0]
}
