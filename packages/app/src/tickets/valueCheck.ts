import React from 'react'

/**
 * What an action gives back against what goes in, at market prices — the check every ticket runs
 * before a swap-sized action (a loop's open, a close): a loss over 1 % turns amber, over 3 % must be
 * confirmed before signing. The web's `ValueRow` / `LossAck` and the phone's draw it.
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
/** `third`: another figure in the last cell instead of the value change (a loop's break-even); `title` then carries the change on hover. */
