import React from 'react'
import type { Trace } from './txTrace'

/** A transaction's progress in words — the tray's, the ticket's steps', on every app. */
export function useNow(on: boolean) {
  const [now, setNow] = React.useState(Date.now)
  React.useEffect(() => { if (!on) return; setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [on])
  return now
}
const ago = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s` }
const blk = (n?: number) => (n != null ? n.toLocaleString('en-US') : '')
/** What came back into the wallet — a withdrawal, or the few units a loop's swap left over. */
const gained = (r: NonNullable<Trace['received']>) => `to your wallet: ${r.map((x) => `+${trim(x.amount)} ${x.symbol}`.trim()).join(', ')}`
/** Six significant digits at most: dust is still readable as dust (0.001484), a withdrawal as 1,250.5. */
const trim = (a: string) => { const n = parseFloat(a); return n >= 1 ? n.toLocaleString('en-US', { maximumFractionDigits: 4 }) : n.toPrecision(Math.min(6, a.replace(/^0\.0*/, '').length || 1)).replace(/\.?0+$/, '') }

export type Tone = 'run' | 'ok' | 'warn' | 'bad'
/** The one sentence for where a trace is: a head for the pill, a detail for the line under it. */
export function phaseWords(t: Trace, now = Date.now()): { head: string; detail?: string; tone: Tone } {
  switch (t.phase) {
    case 'pending': return { head: 'Waiting for a block', detail: t.note ?? `sent ${ago(now - t.at)} ago`, tone: t.note ? 'warn' : 'run' }
    case 'included': return t.need > 1
      ? { head: `In block ${blk(t.block)}`, detail: `${t.conf ?? 1} of ${t.need} confirmations`, tone: 'run' }
      : { head: 'In a block', detail: 'confirming', tone: 'run' }
    case 'final': return { head: 'Final', detail: 'refreshing your balances', tone: 'run' }
    case 'syncing': return t.moves === 'positions'
      ? { head: 'Updating your positions', detail: `final in block ${blk(t.block)}`, tone: 'run' }
      : { head: 'Updating your balance', detail: t.bridge ? `${t.bridge.name}: delivered` : `final in block ${blk(t.block)}`, tone: 'run' }
    case 'bridging': if (t.paper) return { head: t.bridge?.toChainId === t.chainId ? 'Exit queued on paper' : 'Bridging on paper', detail: `${t.bridge?.name ?? 'the route'}: lands ${t.arrivesAt && t.arrivesAt > now ? `in ${ago(t.arrivesAt - now)}` : 'now'}`, tone: 'run' }
      return { head: 'Bridging', detail: !t.bridge?.status || t.bridge.status === 'NOT_FOUND' ? 'waiting for the bridge to pick it up' : `${t.bridge.name}: ${t.bridge.status.toLowerCase().replace(/_/g, ' ')}`, tone: 'run' }
    case 'settled': if (t.paper) return { head: 'Done on paper', detail: 'nothing was sent on chain', tone: 'ok' }
      return { head: 'Done', detail: t.note ?? (t.received?.length ? gained(t.received) : t.block ? `final in block ${blk(t.block)}` : undefined), tone: t.note ? 'warn' : 'ok' }
    case 'reverted': return { head: 'Reverted', detail: t.err, tone: 'bad' }
    case 'dropped': return { head: 'Dropped', detail: t.err, tone: 'bad' }
    case 'failed': return { head: 'Failed', detail: t.err, tone: 'bad' }
  }
}

/** The stages this trace goes through: a chain with one-block finality has no separate "in block". */
export function stages(t: Trace): string[] {
  return ['Sent', ...(t.need > 1 ? ['In block', 'Final'] : ['Final']), ...(t.bridge ? ['Arrived'] : t.moves === 'positions' || t.watch ? ['Synced'] : [])]
}
/** How many stages are behind it. */
export function reached(t: Trace): number {
  const chain = t.need > 1 ? 3 : 2
  switch (t.phase) {
    case 'pending': return 1
    case 'included': return t.need > 1 ? 2 : 1
    case 'final': case 'syncing': case 'bridging': return chain
    case 'settled': return stages(t).length
    // a revert is IN a block: the chain said no
    case 'reverted': return t.need > 1 ? 2 : 1
    default: return t.block ? chain : 1
  }
}
