import React from 'react'
import { Info } from './bits'

/**
 * What a trade is worth at market prices: dollars in against dollars out, so a bad fill (a thin pool,
 * a greedy bridge, an oracle the market does not honour) shows as money before it is signed. Used by
 * every ticket that swaps — Get <asset>, a loop's open and its close.
 *
 * Quiet while the fill is fair; amber past `WARN`; past `ACK` (and at least `ACK_MIN_USD`) the loss is
 * confirmed with a checkbox before the action unlocks — once per quote: a re-quote asks again.
 */
export const WARN = 0.01, ACK = 0.03
/** …unless the loss is pocket change: 4 % of a $10 swap is not worth a checkbox. */
export const ACK_MIN_USD = 1

export type Sev = 'unk' | 'up' | 'ok' | 'warn' | 'bad'
export interface ValueCheck {
  inUsd: number; outUsd: number; priced: boolean
  /** out − in, in dollars; negative is a loss */
  diff: number
  /** out / in − 1 */
  impact: number
  sev: Sev
  /** a loss large enough to confirm */
  severe: boolean
  /** severe and not yet confirmed for this quote: the action stays disabled */
  blocked: boolean
  acked: boolean
  setAcked: (b: boolean) => void
}

/** `inUsd` / `outUsd` 0 = no price on that side. `quoteKey` changes with every quote, so a confirmation never carries over. */
export function useValueCheck(inUsd: number, outUsd: number, quoteKey: string): ValueCheck {
  const [ackedKey, setAckedKey] = React.useState('')
  const priced = inUsd > 0 && outUsd > 0
  const diff = outUsd - inUsd, impact = priced ? outUsd / inUsd - 1 : 0
  const sev: Sev = !priced ? 'unk' : impact <= -ACK ? 'bad' : impact <= -WARN ? 'warn' : impact > 0.001 ? 'up' : 'ok'
  const severe = sev === 'bad' && -diff >= ACK_MIN_USD
  const acked = ackedKey === quoteKey
  return { inUsd, outUsd, priced, diff, impact, sev, severe, blocked: severe && !acked, acked, setAcked: (b) => setAckedKey(b ? quoteKey : '') }
}

/**
 * The row: `in → out | change`. `labels` name the three cells; `info` explains the change; `missing`
 * names what has no price when one side is unpriced.
 */
export function ValueRow({ v, labels, info, missing }: { v: ValueCheck; labels: [string, string, string]; info: React.ReactNode; missing?: string }) {
  return (
    <div className={`qval ${v.sev}`}>
      <span className="qv"><small>{labels[0]}</small><b>{v.inUsd > 0 ? cents(v.inUsd) : '—'}</b></span>
      <i aria-hidden>→</i>
      <span className="qv"><small>{labels[1]}</small><b>{v.outUsd > 0 ? cents(v.outUsd) : '—'}</b></span>
      <span className="qv imp">
        <small>{labels[2]} <Info label={`About ${labels[2].toLowerCase()}`}>{info} Over {pctAbs(WARN)} it turns amber; over {pctAbs(ACK)} you confirm the loss before signing.</Info></small>
        <b>{v.priced ? <>{v.diff < 0 ? '−' : '+'}{cents(Math.abs(v.diff))} · {v.impact < 0 ? '−' : '+'}{pctAbs(v.impact)}</> : missing ? `no price for ${missing}` : 'no price'}</b>
      </span>
    </div>
  )
}

/** The confirmation under a severe row. `what` is the subject ("This swap"), `advice` what to try instead. */
export function LossAck({ v, what, advice }: { v: ValueCheck; what: string; advice: string }) {
  if (!v.severe) return null
  return (
    <label className="qack">
      <span><b>{what} loses {cents(-v.diff)} ({pctAbs(v.impact)})</b> of what you put in. {advice}</span>
      <span className="qck"><input type="checkbox" checked={v.acked} onChange={(e) => v.setAcked(e.target.checked)} /> I accept losing {cents(-v.diff)}</span>
    </label>
  )
}

export const cents = (x: number) => '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pctAbs = (x: number) => { const a = Math.abs(x); return `${(a * 100).toFixed(a < 0.1 ? 2 : 1)}%` }
