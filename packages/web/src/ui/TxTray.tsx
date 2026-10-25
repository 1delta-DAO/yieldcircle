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
import { dismissTrace, isDone, isOk, useTraces, type Trace } from '@yieldcircle/app/sdk/txTrace'
import { useSolWallet } from '../wallet/solana'
import { TxLink } from './bits'

const LINGER_MS = 8_000

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

function TxRow({ t, now }: { t: Trace; now: number }) {
  const w = phaseWords(t, now)
  return (
    <li className="txrow">
      <div className="txh"><Mark tone={w.tone} /><b>{t.title}</b><span className="sp" /><TxLink chainId={t.chainId} hash={t.hash} />
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
  // one tray over both VMs' signers — a Solana deposit shows beside an EVM one
  const evmTraces = useTraces(address)
  const solTraces = useTraces(sol.account?.address)
  const all = React.useMemo(() => [...evmTraces, ...solTraces].sort((a, b) => b.at - a.at), [evmTraces, solTraces])
  const [open, setOpen] = React.useState(false)
  const live = all.filter((t) => !isDone(t))
  // a success lingers a moment; anything that went wrong stays until it is dismissed
  const fresh = (t: Trace, now: number) => isDone(t) && !t.seen && (!isOk(t) || now - (t.doneAt ?? 0) < LINGER_MS)
  const now = useNow(live.length > 0 || all.some((t) => fresh(t, Date.now())))
  const shown = [...live, ...all.filter((t) => fresh(t, now))]
  const ref = React.useRef<HTMLDivElement>(null)
  const close = () => { setOpen(false); for (const t of all) if (isDone(t) && !t.seen) dismissTrace(t.id) }
  React.useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('pointerdown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, all])
  if (!shown.length && !open) return null
  const lead = shown[0] ?? all[0]
  if (!lead) return null
  const w = phaseWords(lead, now)
  const more = shown.length - 1
  return (
    <div className="txtray" ref={ref}>
      {open && (
        <div className="txpanel" role="dialog" aria-label="Your transactions">
          <div className="txph"><span className="lbl">Transactions</span><span className="sp" /><button className="x" onClick={close} aria-label="Close">✕</button></div>
          <ul className="txlist">{all.slice(0, 8).map((t) => <TxRow key={t.id} t={t} now={now} />)}</ul>
        </div>
      )}
      <button className={`txpill ${w.tone}`} onClick={() => (open ? close() : setOpen(true))} aria-expanded={open} aria-live="polite">
        <Mark tone={w.tone} /><b>{lead.title}</b><span className="ph">{w.head}</span>{more > 0 && <span className="txmore">+{more}</span>}
      </button>
    </div>
  )
}
