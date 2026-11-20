/**
 * The end of an action on the web (docs/tx-feedback-plan.md §5), the phone's `OutcomeView` in the
 * ticket's column: the ring, one bold line, the amount counted up, the order in a few rows, one
 * button — and confetti over the page when it has landed. Still on its way, the ring fills and says
 * where it is; gone wrong, where the money is and one thing to do about it. Driven by the trace alone
 * (`@yieldcircle/app/sdk/txOutcome`), so the ticket, *Get* and the tray's receipt say the same.
 */
import React from 'react'
import { createPortal } from 'react-dom'
import { useBook } from '@yieldcircle/app/book'
import { chainLabel } from '@yieldcircle/app/sdk/queries'
import { dismissTrace, isDone, recheck, useTrace, type Trace } from '@yieldcircle/app/sdk/txTrace'
import { earnedSince, holdingFor, outcomeOf, receiptRows, rowText, tickerText, trackerOf, type Next, type OutcomeState, type Row } from '@yieldcircle/app/sdk/txOutcome'
import { useTween } from '@yieldcircle/app/sdk/activity'
import { reached, stages, useNow } from '@yieldcircle/app/sdk/txWords'
import type { Holding } from '@yieldcircle/core/model/positions'
import { liteHash } from '@yieldcircle/core/model/liteLinks'
import { txUrl } from './ChainMark'
import { usd } from './bits'

const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** How far along a trace is, 0..1: its stages, and a bridge by time against its quote. */
export function progressOf(t: Trace, now: number) {
  const st = stages(t).length, n = reached(t)
  if (t.phase === 'bridging' && t.arrivesAt && t.arrivesAt > t.at) return Math.min(st - 0.1, n + Math.min(0.95, (now - t.at) / (t.arrivesAt - t.at))) / st
  return n / st
}

/** The mark: a ring that fills, snaps shut with a tick and a pop, or stops short, cracks and shakes. */
export function Ring({ state, tone, progress = 0, size = 96, mini }: { state: OutcomeState; tone?: string; progress?: number; size?: number; mini?: boolean }) {
  const sw = mini ? 2.5 : Math.max(5, size / 14)
  const r = (size - sw) / 2 - 1, c = size / 2, circ = 2 * Math.PI * r
  const p = state === 'flying' ? Math.max(0.08, Math.min(0.94, progress)) : state === 'lost' ? 0.86 : 1
  // drawn empty first, then to its value: the transition is the fill
  const [drawn, setDrawn] = React.useState(still() ? p : 0)
  React.useEffect(() => { const f = requestAnimationFrame(() => setDrawn(p)); return () => cancelAnimationFrame(f) }, [p])
  const tick = `M${c - size * 0.17} ${c + size * 0.01} L${c - size * 0.04} ${c + size * 0.14} L${c + size * 0.19} ${c - size * 0.13}`
  const gx = c + r * Math.sin(-0.14 * 2 * Math.PI), gy = c - r * Math.cos(-0.14 * 2 * Math.PI)
  return (
    <span className={`oring ${state} ${tone ?? ''}${mini ? ' mini' : ''}`} style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="trk" cx={c} cy={c} r={r} strokeWidth={sw} />
        <circle className="arc" cx={c} cy={c} r={r} strokeWidth={sw} strokeDasharray={`${circ} ${circ}`} strokeDashoffset={circ * (1 - drawn)} transform={`rotate(-90 ${c} ${c})`} />
        {state === 'flying' && <circle className="comet" cx={c} cy={c} r={r} strokeWidth={sw} strokeDasharray={`${circ * 0.06} ${circ}`} />}
        {state !== 'flying' && (state === 'lost'
          ? <><path className="mk" d={`M${c} ${c - size * 0.18} L${c} ${c + size * 0.05}`} strokeWidth={mini ? 2 : sw * 1.1} style={{ ['--len' as string]: size * 0.23 }} />
              {!mini && <circle className="dot" cx={c} cy={c + size * 0.16} r={sw * 0.62} />}
              {!mini && <path className="crack" d={`M${gx - size * 0.06} ${gy - size * 0.07} l${size * 0.05} ${size * 0.05} l${-size * 0.03} ${size * 0.04} l${size * 0.06} ${size * 0.06}`} strokeWidth={sw * 0.5} />}</>
          : <path className="mk" d={tick} strokeWidth={mini ? 2 : sw * 1.1} style={{ ['--len' as string]: size * 0.55 }} />)}
      </svg>
      {state === 'won' && !mini && <i className="glow" />}
    </span>
  )
}

const COLORS = ['var(--primary)', 'var(--success)', 'var(--violet)', '#fff', 'var(--paper)']
/**
 * The burst over a success, as a trading app throws it over a filled order: strips and dots shot up
 * from `at` (a point on the page) and falling past the bottom with spin and flutter, once. Fixed to
 * the window, under nothing a tap needs; none under reduced motion.
 */
export function Confetti({ at, small, onEnd }: { at: { x: number; y: number }; small?: boolean; onEnd?: () => void }) {
  const pieces = React.useMemo(() => Array.from({ length: small ? 14 : 120 }, (_, i) => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * (small ? 2.4 : 2.1)
    const v = (small ? 60 : 260) + Math.random() * (small ? 50 : 300)
    return { i, x: Math.cos(a) * v * 1.4, up: Math.sin(a) * v, fall: (small ? 80 : innerHeight - at.y + 60) * (0.7 + Math.random() * 0.5), spin: (Math.random() - 0.5) * 1440, d: (small ? 0.9 : 2.2) + Math.random() * 0.8, delay: Math.random() * 0.12, strip: i % 3 !== 0, color: COLORS[i % COLORS.length] }
  }), [small])
  React.useEffect(() => { const t = setTimeout(() => onEnd?.(), (small ? 1.9 : 3.2) * 1000); return () => clearTimeout(t) }, [])
  return createPortal(
    <div className="confetti" aria-hidden style={{ left: at.x, top: at.y }}>
      {pieces.map((p) => (
        <i key={p.i} style={{ ['--x' as string]: `${p.x}px`, ['--up' as string]: `${p.up}px`, ['--fall' as string]: `${p.fall}px`, ['--spin' as string]: `${p.spin}deg`, ['--d' as string]: `${p.d}s`, ['--delay' as string]: `${p.delay}s` }}>
          <b className={p.strip ? 'strip' : 'dot'} style={{ background: p.color }} />
        </i>
      ))}
    </div>,
    document.body,
  )
}

/** Celebrated already on this page load: a ticket that remounts shows the end, not a second burst. */
const cheered = new Set<string>()

function useCountUp(to: number, on: boolean, ms = 900) {
  const [v, setV] = React.useState(on && !still() ? 0 : to)
  React.useEffect(() => {
    if (!on || still()) { setV(to); return }
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => { const k = Math.min(1, (now - t0) / ms); setV(to * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, on])
  return v
}

/** The position's page, for "See it": Lite's You with it open, or its group in Pro with its row picked (`s`: its strategy, so the row is lit). */
export const holdingHref = (h: Holding, lite: boolean, s?: string) => (lite ? `#/lite/you?h=${encodeURIComponent(h.key)}` : `#/pro/${h.group}?${new URLSearchParams({ ...(s ? { s } : {}), k: h.kind, h: h.key })}`)

export function OutcomeCard({ id, onDone, onAgain, onFail, partial, links, compact, steps, children }: {
  id: string
  onDone: () => void
  onAgain?: () => void
  onFail?: string
  partial?: boolean
  /** under the button on a success: See it · Do another */
  links?: (h: Holding | undefined) => { label: string; href?: string; onClick?: () => void }[]
  compact?: { done: string }
  /** what was signed, behind a fold: the ticket's steps, and whether they went as one transaction */
  steps?: { labels: string[]; batched: boolean }
  children?: React.ReactNode
}) {
  const t = useTrace(id)
  const now = useNow(!!t && !isDone(t))
  const b = useBook()
  const ring = React.useRef<HTMLDivElement>(null)
  const [burst, setBurst] = React.useState<{ x: number; y: number } | null>(null)
  const o = t ? outcomeOf(t, { now, chain: chainLabel, onFail, partial }) : null
  React.useEffect(() => {
    if (!o) return
    if (o.state === 'won' && !still() && !cheered.has(id) && ring.current) {
      cheered.add(id)
      const r = ring.current.getBoundingClientRect()
      setBurst({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    }
    if (o.state !== 'flying') dismissTrace(id)
  }, [o?.state])
  const r = t?.receipt
  const h = t && o && (o.state === 'won' || o.state === 'soft') && r && !['swap', 'bridge'].includes(r.kind) ? holdingFor(b.holdings, t) : undefined
  const counted = useCountUp(r?.usd ?? 0, !!o && o.state !== 'lost')
  // what money put to work has made since it landed, by the second
  const earning = !!t && t.phase === 'settled' && !t.note && ['deposit', 'open', 'collateral'].includes(r?.kind ?? '')
  const tick = useNow(earning)
  if (!t || !o) return null
  const earned = earning && o.state === 'won' ? earnedSince(t, h, tick) : null
  const tracker = o.state !== 'won' ? trackerOf(t) : undefined
  const hero = o.state === 'lost' ? undefined : r?.usd != null && r.usd > 0 ? usd(counted) : r?.amount
  const rows = o.state === 'lost' ? [] : receiptRows(t, h, { chain: chainLabel, compact: !!compact })
  const url = txUrl(t.chainId, t.hash)
  const btn = (n: Next, k: number) => {
    const cls = `btn wide${k === 0 ? (o.tone === 'bad' ? ' risky pri' : ' pri') : ''}`
    switch (n) {
      case 'again': return onAgain ? <button key={n} className={cls} onClick={onAgain}>{partial ? 'Send it again' : 'Try again'}</button> : null
      case 'view': return tracker ? <a key={n} className={cls.replace(' risky', '')} href={tracker.url} target="_blank" rel="noreferrer">Track it on {tracker.name} ↗</a>
        : url ? <a key={n} className={cls.replace(' risky', '')} href={url} target="_blank" rel="noreferrer">View transaction ↗</a> : null
      case 'check': return <button key={n} className={cls} onClick={() => recheck(id)}>Check again</button>
      case 'done': return <button key={n} className={cls} onClick={onDone}>{compact?.done ?? 'Done'}</button>
    }
  }
  const nexts = o.state === 'flying' ? [] : [...o.next, ...(o.next.includes('done') ? [] : ['done' as const])]
  return (
    <div className={`outcome ${o.state}${compact ? ' compact' : ''}`} role="status" aria-live="polite">
      <div className="o-mark" ref={ring}><Ring state={o.state} tone={o.tone} size={compact ? 64 : 96} progress={progressOf(t, now)} /></div>
      <div className="o-head"><b>{o.head}</b>{t.paper && <span className="pill paper">paper</span>}</div>
      {hero && <div className="o-amt mono">{hero}</div>}
      {earned != null && !compact && <div className="o-tick mono" aria-label="earned since it landed">{tickerText(earned)} earned so far</div>}
      {o.state === 'flying' && t.bridge && (
        <div className="o-route"><span>{chainLabel(t.chainId)}</span><span className="o-line"><i style={{ left: `${Math.max(4, Math.min(96, progressOf(t, now) * 100))}%` }} /></span><span>{chainLabel(t.bridge.toChainId)}</span></div>
      )}
      {o.state === 'flying' && tracker && <a className="o-track" href={tracker.url} target="_blank" rel="noreferrer">Track it on {tracker.name} ↗</a>}
      {o.detail && o.state !== 'lost' && <div className={`o-sub${o.tone === 'warn' ? ' warn' : ''}`}>{o.detail}</div>}
      {o.state === 'lost' && <div className="o-money" data-tone={o.tone}><span className="lbl">Your money</span><b>{o.money}</b>{o.detail && <small>{o.detail}</small>}</div>}
      {rows.length > 0 && (
        <dl className="o-rows">
          {rows.map((x) => <RowView key={x.k} r={x} />)}
          {url && !compact && <div><dt>Transaction</dt><dd><a className="mono" href={url} target="_blank" rel="noreferrer">{t.hash.slice(0, 6)}…{t.hash.slice(-4)} ↗</a></dd></div>}
        </dl>
      )}
      <div className="o-acts">
        {o.state === 'flying' ? <span className="t40">It keeps going if you close this: the pill in the corner follows it.</span> : nexts.map(btn)}
      </div>
      {steps && steps.labels.length > 1 && o.state !== 'flying' && (
        <details className="o-steps"><summary>{steps.labels.length} steps{steps.batched ? ' in one transaction' : ''}</summary><ol>{steps.labels.map((l, i) => <li key={i}>{l}</li>)}</ol></details>
      )}
      {o.state === 'won' && links && <div className="o-links">{links(h).map((x) => x.href ? <a key={x.label} href={x.href} onClick={x.onClick}>{x.label}</a> : <button key={x.label} className="lnk" onClick={x.onClick}>{x.label}</button>)}</div>}
      {o.state !== 'flying' && o.state !== 'lost' && children}
      {burst && <Confetti at={burst} small={!!compact} onEnd={() => setBurst(null)} />}
    </div>
  )
}

/** One row of the order: a figure moves to its new value as the synced position replaces the quote; a transaction links to its explorer. */
function RowView({ r }: { r: Row }) {
  const n = useTween(r.n ?? 0)
  const url = r.tx ? txUrl(r.tx.chainId, r.tx.hash) : undefined
  const v = r.n != null && r.f ? rowText(r.f, n) : r.v
  return <div><dt>{r.k}</dt><dd className={r.tone ?? ''}>{url ? <a className="mono" href={url} target="_blank" rel="noreferrer">{v} ↗</a> : v}</dd></div>
}

/** One trace's end, over the page: what the tray opens for an action whose ticket was closed. */
export function ReceiptDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const lite = location.hash.startsWith('#/lite') || !location.hash.startsWith('#/pro')
  // "Try again" goes back to the ticket it was sent from: nothing is rebuilt from here
  const t = useTrace(id)
  const s = useBook().all.find((x) => x.id === t?.receipt?.strategyId)
  const again = s ? () => { onClose(); location.hash = lite ? liteHash({ to: 'strategy', s }) : `#/pro/${s.group}?${new URLSearchParams({ s: s.id, ...(s.kind === 'simple' ? {} : { k: s.kind }) })}` } : undefined
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; addEventListener('keydown', k); return () => removeEventListener('keydown', k) }, [])
  return createPortal(
    <div className="o-dialog" role="dialog" aria-modal="true" aria-label="Transaction" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="o-card">
        <button className="x" onClick={onClose} aria-label="Close">✕</button>
        <OutcomeCard id={id} onDone={onClose} onAgain={again} links={(h) => (h ? [{ label: 'See it', href: holdingHref(h, lite, t?.receipt?.strategyId), onClick: onClose }] : [])} />
      </div>
    </div>,
    document.body,
  )
}
