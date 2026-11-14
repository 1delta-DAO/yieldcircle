/**
 * Where a transaction is, from the moment the wallet hands back a hash until every number on
 * screen includes it — the face of `sdk/txTrace.ts`.
 *
 *   TxTray    a pill in a corner of every page while anything is in flight (and a moment after,
 *             or until dismissed when it went wrong); tap it for the list
 *   TxTrack   the stages as one bar: sent · in block · final · synced
 *   TxNote    one line under a ticket's step, in the same words
 *
 * Bottom-left on a desktop (the ticket owns the right column), under the header on a phone (the
 * ticket is a bottom sheet there, and covers the pill while it is open — it shows the same state).
 */
import React from 'react'
import { useAccount } from 'wagmi'
import { chainLabel } from '@yieldcircle/app/sdk/queries'
import { useActivity } from '@yieldcircle/app/sdk/activity'
import { outcomeOf } from '@yieldcircle/app/sdk/txOutcome'
import { dismissTrace, isDone, isOk, useTraces, type Trace } from '@yieldcircle/app/sdk/txTrace'
import { useSolWallet } from '../wallet/solana'
import { TxLink } from './bits'
import { Confetti, ReceiptDialog } from './Outcome'

/** A second hand while something is moving: the "sent 14 s ago" counts up. */
// the words for where a transaction is are shared with the phone (`@yieldcircle/app/sdk/txWords`)
export { phaseWords, reached, stages, useNow, type Tone } from '@yieldcircle/app/sdk/txWords'
import { phaseWords, reached, stages, useNow, type Tone } from '@yieldcircle/app/sdk/txWords'

export function TxTrack({ t }: { t: Trace }) {
  const st = stages(t), n = reached(t), bad = !isOk(t)
  return (
    <div className={`txtrack${t.phase === 'settled' ? ' ok' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={st.length} aria-valuenow={n} aria-valuetext={phaseWords(t).head}>
      {st.map((s, i) => <span key={s} className={i < n ? 'done' : i === n ? (bad ? 'bad' : 'on') : ''}>{s}</span>)}
    </div>
  )
}

export function Spin({ sm }: { sm?: boolean }) { return <span className={`txspin${sm ? ' sm' : ''}`} aria-hidden /> }
function Mark({ tone }: { tone: Tone }) {
  if (tone === 'run') return <Spin />
  return <span className={`txmark ${tone}`} aria-hidden>{tone === 'bad' ? '!' : '✓'}</span>
}

/** One line under a ladder step: where its transaction is, in the tray's words. */
export function TxNote({ t }: { t: Trace | undefined }) {
  const now = useNow(!!t && !isDone(t))
  if (!t) return null
  const w = phaseWords(t, now)
  if (t.phase === 'settled' && !t.note && !t.received?.length) return null
  return <small className={w.tone === 'bad' ? 'bad' : w.tone === 'warn' ? 'warn' : ''}>{w.head}{w.detail ? ` · ${w.detail}` : ''}</small>
}

function TxRow({ t, now, onOpen }: { t: Trace; now: number; onOpen?: () => void }) {
  const w = phaseWords(t, now)
  return (
    <li className="txrow">
      <div className="txh"><Mark tone={w.tone} />{onOpen && isDone(t) ? <button className="lnk txopen" onClick={onOpen}><b>{t.title}</b></button> : <b>{t.title}</b>}<span className="sp" /><TxLink chainId={t.chainId} hash={t.hash} />
        {isDone(t) && <button className="x" onClick={() => dismissTrace(t.id)} aria-label="Dismiss">✕</button>}</div>
      <div className="txs">{t.label !== t.title ? `${t.label} · ` : ''}{chainLabel(t.chainId)}{t.bridge ? ` → ${chainLabel(t.bridge.toChainId)}` : ''}</div>
      <TxTrack t={t} />
      <div className={`txd ${w.tone === 'bad' ? 'bad' : w.tone === 'warn' ? 'warn' : ''}`}>{w.head}{w.detail ? ` · ${w.detail}` : ''}</div>
    </li>
  )
}

/** The in-flight list, for the positions sheet: nothing when nothing is moving. */
export function TxInFlight({ account }: { account: string | undefined }) {
  const live = useTraces(account).filter((t) => !isDone(t))
  const now = useNow(live.length > 0)
  if (!live.length) return null
  return <ul className="txlist inline" aria-label="Transactions in flight">{live.map((t) => <TxRow key={t.id} t={t} now={now} />)}</ul>
}

export function TxTray() {
  const { address } = useAccount()
  const sol = useSolWallet()
  // one tray over both VMs' signers and the paper account — a Solana deposit shows beside an EVM one.
  // A success lingers a moment, anything that went wrong until it is dismissed (`useActivity`, the phone's pill too)
  const { all, shown, now } = useActivity([address, sol.account?.address])
  const [open, setOpen] = React.useState(false)
  // one trace's end screen, over the page: a tap on a finished pill or row
  const [receipt, setReceipt] = React.useState<string | null>(null)
  // a small burst from the pill as an action whose ticket was closed lands
  const pill = React.useRef<HTMLButtonElement>(null)
  const [burst, setBurst] = React.useState<{ x: number; y: number } | null>(null)
  const ref = React.useRef<HTMLDivElement>(null)
  const close = () => { setOpen(false); for (const t of all) if (isDone(t) && !t.seen) dismissTrace(t.id) }
  React.useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('pointerdown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, all])
  const lead = shown[0] ?? all[0]
  const won = !!lead && lead.phase === 'settled' && !lead.note && shown[0] === lead
  React.useEffect(() => {
    if (!won || !lead || popped.has(lead.id) || !pill.current || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    popped.add(lead.id)
    const r = pill.current.getBoundingClientRect()
    setBurst({ x: r.left + 20, y: r.top + r.height / 2 })
  }, [won, lead?.id])
  const dialog = receipt && <ReceiptDialog id={receipt} onClose={() => setReceipt(null)} />
  if (!shown.length && !open) return dialog || null
  if (!lead) return dialog || null
  const w = phaseWords(lead, now)
  const o = outcomeOf(lead, { now, chain: chainLabel })
  const more = shown.length - 1
  // a finished one alone opens its end screen; several, or one still going, open the list
  const tap = () => (isDone(lead) && more <= 0 && !open ? (dismissTrace(lead.id), setReceipt(lead.id)) : open ? close() : setOpen(true))
  return (
    <div className="txtray" ref={ref}>
      {open && (
        <div className="txpanel" role="dialog" aria-label="Your transactions">
          <div className="txph"><span className="lbl">Transactions</span><span className="sp" /><button className="x" onClick={close} aria-label="Close">✕</button></div>
          <ul className="txlist">{all.slice(0, 8).map((t) => <TxRow key={t.id} t={t} now={now} onOpen={() => { setOpen(false); setReceipt(t.id) }} />)}</ul>
        </div>
      )}
      <button ref={pill} className={`txpill ${w.tone}${won ? ' won' : ''}`} onClick={tap} aria-expanded={open} aria-live="polite">
        <Mark tone={w.tone} /><b>{lead.title}</b><span className="ph">{isDone(lead) ? `${o.head}${isOk(lead) ? ' ›' : ''}` : w.detail && lead.bridge ? w.detail : w.head}</span>{more > 0 && <span className="txmore">+{more}</span>}
      </button>
      {burst && <Confetti small at={burst} onEnd={() => setBurst(null)} />}
      {dialog}
    </div>
  )
}
/** the tray's own bursts: one per trace on this page load */
const popped = new Set<string>()
