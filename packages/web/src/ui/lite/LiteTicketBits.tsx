import React from 'react'
import { proHref } from '../../state/AppState'
import type { Line, ThreeLines } from '@yieldcircle/core/model/lite'
import { Drawer } from '../Drawer'

/** The three lines (docs/lite.md §5): what you earn, what you can lose, what it costs to get in. */
export function LiteLines({ l }: { l: ThreeLines }) {
  return (
    <div className="tsec"><div className="lite-lines">
      <LineRow l={l.earn} hero />
      <LineRow l={l.lose} />
      <LineRow l={l.cost} />
    </div></div>
  )
}
function LineRow({ l, hero }: { l: Line; hero?: boolean }) {
  return (
    <div className={`ll${hero ? ' hero' : ''}`}>
      <span className="k">{l.k}</span>
      <span className={`v ${l.tone}`}>{l.v}</span>
      <span className="s">{l.s}</span>
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

/**
 * The way to every number and choice for this one strategy: Pro's own ticket, opened here in a
 * drawer (`LiteDetailsDrawer`) with the same amount and leverage — the two tickets share their
 * sticky keys — so nothing jumps to another page. The drawer's foot still offers the Pro page.
 */
export function LiteDetails({ what, onOpen }: { what: string; onOpen: () => void }) {
  return (
    <button type="button" className="lite-details" onClick={onOpen}>
      <span><b>Details</b><small>{what}</small></span>
      <span aria-hidden>›</span>
    </button>
  )
}
export function LiteDetailsDrawer({ open, onClose, pro, children }: { open: boolean; onClose: () => void; /** the same thing as a Pro page */ pro?: string; children: React.ReactNode }) {
  return (
    <Drawer open={open} onClose={onClose} side="right" label="Every number" cls="lite-details-drawer">
      {children}
      <a className="lite-details-pro t50" href={pro ?? proHref()}>Open this in Pro, with the whole catalogue ›</a>
    </Drawer>
  )
}
