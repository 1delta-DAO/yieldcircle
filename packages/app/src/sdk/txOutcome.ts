import { isSvmChain } from '@yieldcircle/core/model/address'
import type { Holding } from '@yieldcircle/core/model/positions'
import { owedOf } from '@yieldcircle/core/model/borrow'
import { bridgeTracker } from '@yieldcircle/core/model/bridgeLinks'
import { pct, usd } from '@yieldcircle/core/model/format'
import { bufferOfHealth, leverTag } from '@yieldcircle/core/model/lite'
import { isBatchTrace, isDone, type Receipt, type ReceiptKind, type Trace } from './txTrace'
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

/**
 * One row of an action's order (the end screen's label · value list). `n` + `f`: a figure the screen
 * moves to when it changes — the quote's, greyed, then the synced position's — instead of swapping
 * the text. `tx`: a transaction to link (the bridge's arrival); `href`: a page to link.
 */
export interface Row { k: string; v: string; tone?: 'dim' | 'ok' | 'bad'; n?: number; f?: 'apr' | 'month' | 'usd'; tx?: { chainId: string; hash: string } }
/** A row's figure in words, the same while it moves and when it lands. */
export const rowText = (f: NonNullable<Row['f']>, n: number) => (f === 'apr' ? `${pct(n)} a year` : f === 'month' ? `≈ ${usd(n)} a month` : usd(n))
const row = (k: string, n: number, f: NonNullable<Row['f']>, tone?: Row['tone']): Row => ({ k, v: rowText(f, n), n, f, tone })
const leverOf = (l: number | undefined) => (l && l > 1.05 ? leverTag(l) : '1×')
const away = (b: number | null | undefined) => (b != null ? `${pct(b * 100, 1)} from liquidation` : undefined)

/**
 * What the action now is, in a few rows (docs/tx-feedback-plan.md §4.3): read from the synced
 * position once it is there (`h`), the quote's figures greyed before. The way out says what came
 * back and what it made; a change says before → after; a repay what is still owed.
 */
export function receiptRows(t: Trace, h: Holding | undefined, o: { chain: (id: string) => string; compact?: boolean }): Row[] {
  const r = t.receipt, done = t.phase === 'settled', live = done && !!h
  const rows: Row[] = []
  const got = t.received?.length ? t.received.map((x) => `+${x.amount} ${x.symbol}`).join(', ') : undefined
  const where = (word: string) => { const v = h?.venue ?? r?.venue; if (v) rows.push({ k: word, v: `${v.split(' · ')[0]} · ${o.chain(t.chainId)}` }) }
  switch (r?.kind) {
    case 'swap': case 'bridge': {
      if (r.amount && !o.compact) rows.push({ k: 'Paid', v: r.amount })
      rows.push({ k: 'Received', v: got ?? (r.out ? `≈ ${r.out}` : '—'), tone: got ? 'ok' : 'dim' })
      if (r.gas) rows.push({ k: 'Gas brought', v: `+${r.gas}`, tone: done ? undefined : 'dim' })
      if (o.compact) return rows
      rows.push(t.bridge ? { k: 'Route', v: `${o.chain(t.chainId)} → ${o.chain(t.bridge.toChainId)} · ${t.bridge.name}` } : { k: 'On', v: o.chain(t.chainId) })
      if (t.bridge && done && t.doneAt) { const s = Math.max(1, Math.round((t.doneAt - t.at) / 1000)); rows.push({ k: 'Took', v: s < 90 ? `${s} seconds` : `${Math.round(s / 60)} minutes` }) }
      if (t.bridge?.toHash) rows.push({ k: 'Arrival', v: `${t.bridge.toHash.slice(0, 6)}…${t.bridge.toHash.slice(-4)}`, tx: { chainId: t.bridge.toChainId, hash: t.bridge.toHash } })
      return rows
    }
    case 'withdraw': case 'close': {
      where('From')
      if (got) rows.push({ k: 'Received', v: got, tone: 'ok' })
      if (r.made != null && Math.abs(r.made) >= 0.01) rows.push({ k: 'It made', v: `${r.made >= 0 ? '+' : '−'}${usd(Math.abs(r.made))} since you opened it`, tone: r.made >= 0 ? 'ok' : 'bad' })
      if (h && r.kind === 'withdraw') rows.push(row('Still in it', h.valueUsd, 'usd', live ? undefined : 'dim'))
      return rows
    }
    case 'lever': case 'delever': {
      where('Where')
      const after = live && h?.leverage ? h.leverage : r.leverage
      rows.push({ k: 'Leverage', v: r.before?.leverage ? `${leverOf(r.before.leverage)} → ${leverOf(after)}` : leverOf(after), tone: live ? undefined : 'dim' })
      const bAfter = live ? bufferOfHealth(h!.health) : null
      // the new distance once the position is read; until then (or if it never is) what it was
      if (bAfter != null) rows.push({ k: 'Liquidation', v: [r.before?.buffer != null ? pct(r.before.buffer * 100, 1) : '', away(bAfter)].filter(Boolean).join(' → ') })
      else if (r.before?.buffer != null) rows.push({ k: 'Liquidation', v: `was ${away(r.before.buffer)}`, tone: 'dim' })
      const apr = live && h!.apr != null ? h!.apr : r.apr
      if (apr != null && Number.isFinite(apr)) rows.push(row('Rate', apr, 'apr', live ? undefined : 'dim'))
      return rows
    }
    case 'repay': {
      where('From')
      if (got) rows.push({ k: 'Received', v: got, tone: 'ok' })
      // after: the loan's own debt once synced; before that (or once it is gone), what was owed less what was paid
      const est = r.before?.owedUsd != null && r.usd != null ? Math.max(0, r.before.owedUsd - r.usd) : undefined
      const left = live && h!.kind !== 'simple' ? owedOf(h!) : est
      const closed = done && (r.all || (left != null && left < 0.01) || (!live && est != null && est < Math.max(0.01, r.before!.owedUsd! * 0.001)))
      if (closed) rows.push({ k: 'Still owed', v: 'Nothing — the loan is closed', tone: 'ok' })
      else if (left != null) rows.push(row('Still owed', left, 'usd', live ? undefined : 'dim'))
      const b = live ? bufferOfHealth(h!.health) : null
      if (b != null) rows.push({ k: 'Liquidation', v: away(b)! })
      return rows
    }
    case 'borrow': {
      where('Where')
      if (r.apr != null && Number.isFinite(r.apr)) rows.push({ k: 'Costs', v: `${pct(r.apr)} a year` })
      const b = live ? bufferOfHealth(h!.health) : null
      if (b != null) rows.push({ k: 'Liquidation', v: away(b)! })
      return rows
    }
    default: {
      where('Into')
      const apr = live && h!.apr != null ? h!.apr : r?.apr
      if (apr != null && Number.isFinite(apr) && r && r.kind !== 'roll') {
        rows.push(row('Rate', apr, 'apr', live ? undefined : 'dim'))
        const value = live ? h!.valueUsd : r.usd
        if (value && apr > 0) rows.push(row('Earns', (value * apr) / 100 / 12, 'month', live ? undefined : 'dim'))
      }
      const lev = live && h!.leverage ? h!.leverage : r?.leverage
      const b = live ? bufferOfHealth(h!.health) : null
      if ((lev && lev > 1.05) || (b != null && r?.kind !== 'deposit')) rows.push({ k: 'Leverage', v: [lev && lev > 1.05 ? leverTag(lev) : '', away(b) ?? ''].filter(Boolean).join(' · ') })
      if (live && r && r.kind !== 'roll') rows.push(row('Yours now', h!.valueUsd, 'usd'))
      return rows
    }
  }
}

/** The position as it stands before an action on it: what the end screen compares with. */
export const beforeOf = (h: Holding | null | undefined): Receipt['before'] =>
  h ? { leverage: h.leverage, buffer: bufferOfHealth(h.health), owedUsd: h.kind !== 'simple' ? owedOf(h) : undefined, valueUsd: h.valueUsd } : undefined

/** What money put to work has made since it landed — the end screen's ticker, counting up by the second. */
export function earnedSince(t: Trace, h: Holding | undefined, now: number): number | null {
  const r = t.receipt
  if (t.phase !== 'settled' || t.note || !t.doneAt || !r || !['deposit', 'open', 'collateral'].includes(r.kind)) return null
  const value = h?.valueUsd ?? r.usd, apr = h?.apr ?? r.apr
  if (!value || !apr || apr <= 0) return null
  return (value * apr) / 100 * Math.max(0, now - t.doneAt) / (365 * 86_400_000)
}
/** A ticker's few cents, readable while it is still fractions of one: six significant digits. */
export const tickerText = (x: number) => `+$${x < 1 ? x.toPrecision(3) : x.toFixed(4)}`

/** The pill's words as an action ends: the headline and what it is now ("Your loop is open · $10 at 15.3%"). */
export function pillLine(t: Trace, o: Outcome): string {
  if (o.state === 'flying') return o.detail ?? o.head
  if (o.state !== 'won') return o.head
  const r = t.receipt
  return [o.head, r?.amount && r.kind !== 'lever' && r.kind !== 'delever' ? r.amount : '', r?.apr != null && ['deposit', 'open'].includes(r.kind) ? `at ${pct(r.apr, 1)}` : ''].filter(Boolean).join(' · ').replace(' · at ', ' at ')
}

/** The bridge's own tracker, when it keys one on the source transaction. */
export const trackerOf = (t: Trace) => (t.bridge ? bridgeTracker(t.bridge.name, t.hash) : undefined)
