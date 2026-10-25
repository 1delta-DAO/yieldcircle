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
export { ACK, ACK_MIN_USD, WARN, useValueCheck, type Sev, type ValueCheck } from '@yieldcircle/app/tickets/valueCheck'
import { ACK, WARN, type ValueCheck } from '@yieldcircle/app/tickets/valueCheck'
import { cents, pctAbs } from '@yieldcircle/core/model/format'
export { cents }

export function ValueRow({ v, labels, info, missing, third }: { v: ValueCheck; labels: [string, string, string]; info: React.ReactNode; missing?: string; third?: { value: React.ReactNode; cls?: string; title?: string } }) {
  return (
    <div className={`qval ${v.sev}`} title={third?.title}>
      <span className="qv"><small>{labels[0]}</small><b>{v.inUsd > 0 ? cents(v.inUsd) : '—'}</b></span>
      <i aria-hidden>→</i>
      <span className="qv"><small>{labels[1]}</small><b>{v.outUsd > 0 ? cents(v.outUsd) : '—'}</b></span>
      <span className="qv imp">
        <small>{labels[2]} <Info label={`About ${labels[2].toLowerCase()}`}>{info} {third ? <>The value change is {v.priced ? <>{v.diff < 0 ? '−' : '+'}{cents(Math.abs(v.diff))} ({v.impact < 0 ? '−' : '+'}{pctAbs(v.impact)})</> : 'not priced'}; over</> : 'Over'} {pctAbs(WARN)} it turns amber; over {pctAbs(ACK)} you confirm the loss before signing.</Info></small>
        <b className={third?.cls}>{third ? third.value : v.priced ? <>{v.diff < 0 ? '−' : '+'}{cents(Math.abs(v.diff))} · {v.impact < 0 ? '−' : '+'}{pctAbs(v.impact)}</> : missing ? `no price for ${missing}` : 'no price'}</b>
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

