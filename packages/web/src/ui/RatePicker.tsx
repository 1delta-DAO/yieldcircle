/**
 * The rate picker of a loan whose rate the borrower sets (the Liquity family, Flex).
 *
 *   Interest rate — you set it, and it decides when you are redeemed
 *   [Cheapest 2.61 %  $0.4m ahead] [Balanced 2.81 % ✓  $3.2m ahead] [Protected 3.01 %  $6.4m ahead]
 *   [custom ────●──────]  2.95 %  → $2.7m (21 %) ahead of you
 *   Upfront fee 0.06 % · changing it within 7 days pays that again
 *   Redemptions here happen when BOLD trades under $1.
 *
 * The presets are the API's picks; the slider is any rate in the market's range, and "ahead of
 * you" is read off the live queue book (`pricing: 'queue'`) in the browser. Redemption is not a
 * liquidation — the collateral is taken at par, so the borrower loses exposure, not dollars — but
 * the lowest rate goes first, so the cheapest rate is never free. `model/userSetRate.ts`.
 */
import React from 'react'
import type { LendingBook, RatePickId } from '@yieldcircle/core/sdk/types'
import { PICK_WORD, clampRate, debtAheadAt, pressureLine, recommendedOf, type UserSetRate } from '@yieldcircle/core/model/userSetRate'
import { Info, num, pct, usdShort } from './bits'

export function RatePicker({ u, book, rate, onRate, debtSymbol, price, feePct, className = 'tsec ratepick' }: {
  u: UserSetRate
  /** the live queue (fresher levels than the row); null while it loads */
  book: LendingBook | null
  rate: number
  onRate: (apr: number) => void
  debtSymbol: string
  /** USD per debt token, for the "ahead" amounts */
  price?: number
  feePct?: number
  /** inside another section (the loop ticket): `ratepick` alone */
  className?: string
}) {
  const money = (x: number) => (price ? usdShort(x * price) : `${num(x, 0)} ${debtSymbol}`)
  const total = book?.totalDebt ?? book?.levels.at(-1)?.cumulativeAssets ?? 0
  const ahead = book ? debtAheadAt(book, rate) : u.picks.find((p) => Math.abs(p.apr - rate) < 1e-9)?.debtAhead
  const share = ahead != null && total > 0 ? ahead / total : null
  const onPick = (id: RatePickId) => { const p = u.picks.find((x) => x.id === id); if (p) onRate(p.apr) }
  const fee = feePct ?? recommendedOf(u)?.upfrontFeePct
  const days = u.cooldownSecs ? Math.round(u.cooldownSecs / 86400) : null
  const line = pressureLine(u.pressure, debtSymbol)
  return (
    <div className={className} style={className === 'ratepick' ? { marginTop: 14 } : undefined}>
      <span className="lbl">Interest rate <span className="t50">— you set it, and it decides when you are redeemed</span>
        <Info label="How a rate you set works">
          On {debtSymbol} loans here every borrower picks their own rate. When the market redeems, it takes the <b>lowest</b> rates first: their collateral is taken at par to pay down their debt — not a liquidation, no penalty, but the position is gone. Picking a higher rate puts more debt ahead of yours. You can raise it later; doing so {days ? `within ${days} days of the last change` : 'too soon'} pays the upfront fee again.
        </Info>
      </span>
      {u.picks.length > 0 && (
        <div className="rp-presets" role="radiogroup" aria-label="Preset rates">
          {u.picks.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={Math.abs(p.apr - rate) < 1e-9} className="rp-preset" onClick={() => onPick(p.id)}>
              <span className="t50">{PICK_WORD[p.id]}{p.id === u.recommended ? ' · suggested' : ''}</span>
              <b>{pct(p.apr)}</b>
              <span className="t50">{money(p.debtAhead)} ahead ({Math.round(p.share * 100)} %)</span>
            </button>
          ))}
        </div>
      )}
      <div className="rp-row">
        <label htmlFor="rp-custom" className="t50">Custom</label>
        <input id="rp-custom" type="range" min={u.min} max={Math.min(u.max, Math.max(u.min + 1, (u.picks.at(-1)?.apr ?? u.min) * 3))} step={0.01} value={rate} onChange={(e) => onRate(clampRate(u, Number(e.target.value)))} />
        <span className="rp-read"><b>{pct(rate)}</b>{ahead != null ? <> → {money(ahead)}{share != null ? ` (${Math.round(share * 100)} %)` : ''} ahead of you</> : null}</span>
      </div>
      {ahead === 0 && <div className="bline warn">Nothing is ahead of this rate: any redemption on this market starts with your loan.</div>}
      <div className="bline t50">{fee != null && fee > 0 ? <>Upfront fee {pct(fee, 3)} of the loan{days ? ` · changing the rate within ${days} days pays it again` : ''}. </> : null}{line}</div>
    </div>
  )
}
