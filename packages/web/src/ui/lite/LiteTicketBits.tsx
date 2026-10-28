import React from 'react'
import { proHref } from '../../state/AppState'
import type { Line, ThreeLines } from '@yieldcircle/core/model/lite'
import { Drawer } from '../Drawer'

/**
 * Lite's lines (docs/lite.md §5): a word, a value, what it means. The open ticket's three — what you
 * earn, what you can lose, what it costs — and the same shape for a withdrawal, a safer loop or a
 * close, so every Lite body speaks one language. The first line leads.
 */
export function LiteLines({ l }: { l: ThreeLines | Line[] }) {
  const rows = Array.isArray(l) ? l : [l.earn, l.lose, l.cost]
  return (
    <div className="tsec"><div className="lite-lines">
      {rows.map((x, i) => <LineRow key={x.k} l={x} hero={i === 0} />)}
    </div></div>
  )
}
function LineRow({ l, hero }: { l: Line; hero?: boolean }) {
  return (
    <div className={`ll${hero ? ' hero' : ''}`}>
      <span className="k">{l.k}</span>
      <span className={`v ${l.tone}`}>{l.v}</span>
      {l.s && <span className="s">{l.s}</span>}
    </div>
  )
}

/** A quarter, half or all of what the wallet holds, in one tap. */
export function LitePresets({ onPick }: { onPick: (pct: number) => void }) {
  return (
    <div className="lite-presets" role="group" aria-label="How much of what you have">
      {[25, 50, 100].map((p) => <button key={p} type="button" className="pctb" onClick={() => onPick(p)}>{p === 100 ? 'All' : `${p}%`}</button>)}
    </div>
  )
}

/** Under the amount, one line in words: what the wallet holds here, and when the amount is more. */
export function LiteAmtSub({ have, usdOf, more, account }: { /** "38.19 USDC", or null when none */ have: string | null; /** "≈ $1,000" when the box is not in dollars */ usdOf?: string; more: boolean; account?: string }) {
  if (!account) return usdOf ? <div className="lite-amt-sub">{usdOf}</div> : null
  return (
    <div className="lite-amt-sub">
      {usdOf && <span>{usdOf} · </span>}
      <span>{have ? `You have ${have} here` : 'You have none here'}</span>
      {more && <span className="warn"> · more than you have</span>}
    </div>
  )
}

/**
 * "More choices" (docs/lite-design-review.md §3.3): what Lite decides for the reader, offered back
 * in Lite's words — never Pro's ticket. Each body (deposit, loop) renders its own sheet with its own
 * values; the head's button only opens it, through this context.
 */
export const LiteMoreCtx = React.createContext<{ open: boolean; close: () => void; pro: string } | null>(null)

/** The sheet itself: a drawer whose foot still offers the same thing in Pro. */
export function LiteMoreSheet({ children }: { children: React.ReactNode }) {
  const m = React.useContext(LiteMoreCtx)
  if (!m) return null
  return <LiteDetailsDrawer open={m.open} onClose={m.close} pro={m.pro} label="More choices">{<div className="lite-more-b">{children}</div>}</LiteDetailsDrawer>
}

/** A choice of a few, each a word, what it earns and how far from liquidation. */
export function LiteChoices<T extends string>({ label, items, on, onPick }: { label: string; items: { id: T; word: string; line: string; side?: string; tone?: string }[]; on: T | null; onPick: (id: T) => void }) {
  return (
    <section className="lite-more-s">
      <h3>{label}</h3>
      <div className="lite-safer" role="radiogroup" aria-label={label}>
        {items.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={on === x.id} className={on === x.id ? 'on' : ''} onClick={() => onPick(x.id)}>
            <b>{x.word}</b><span>{x.line}</span>{x.side && <small className={x.tone ?? ''}>{x.side}</small>}
          </button>
        ))}
      </div>
    </section>
  )
}

/** The numbers Pro's cells hold, as a plain list: a word and a value each. */
export function LiteNumbers({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <section className="lite-more-s">
      <h3>The numbers</h3>
      <dl className="lite-nums">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </section>
  )
}

/** The button under the ticket that opens "More choices" (or, on a held position, Pro's ticket). */
export function LiteDetails({ what, label = 'More choices', onOpen }: { what: string; label?: string; onOpen: () => void }) {
  return (
    <button type="button" className="lite-details" onClick={onOpen}>
      <span><b>{label}</b><small>{what}</small></span>
      <span aria-hidden>›</span>
    </button>
  )
}
export function LiteDetailsDrawer({ open, onClose, pro, label = 'Every number', children }: { open: boolean; onClose: () => void; /** the same thing as a Pro page */ pro?: string; label?: string; children: React.ReactNode }) {
  return (
    <Drawer open={open} onClose={onClose} side="right" label={label} cls="lite-details-drawer">
      {children}
      <a className="lite-details-pro" href={pro ?? proHref()}>Open this in Pro, with every venue and setting ›</a>
    </Drawer>
  )
}
