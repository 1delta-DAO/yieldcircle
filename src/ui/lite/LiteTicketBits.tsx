import React from 'react'
import { proHref } from '../../state/AppState'
import type { Line, ThreeLines } from '../../model/lite'

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

/** The way into Pro for this one strategy: the same ticket, every number and choice, the same amount. */
export function LiteDetails({ what, href }: { what: string; /** where Pro shows it; the page being read, in Pro, by default */ href?: string }) {
  return (
    <a className="lite-details" href={href ?? proHref()}>
      <span><b>Details</b><small>{what}</small></span>
      <span aria-hidden>›</span>
    </a>
  )
}
