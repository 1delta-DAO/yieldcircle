/**
 * One knob of a new position, whatever it is: the rate a borrower sets, a band count, a liquidation
 * LTV. It renders a `PositionChoice` and knows no lender (`model/choices.ts`):
 *
 *   Interest rate — you set it, and it decides when you are redeemed
 *   [Cheapest 5.11 %  fills up to $120k · $110k ahead] [Protected 5.21 % ✓ …]
 *   [custom ────●──────]  5.15 %  → fills up to $293k · $284k ahead
 *   Changing it within 7 days pays the upfront fee again.
 *
 * Presets are the API's, at the ticket's size. The custom readout is the API's answer for that
 * value, or the live book's while it loads. Redemption is not a liquidation: collateral is taken at
 * par, so the borrower loses exposure, not dollars.
 */
import React from 'react'
import type { ChoiceEffects, PositionChoice, RatePickId } from '@yieldcircle/core/sdk/types'
import { effectLines, lockLine, presetWord, valueText } from '@yieldcircle/core/model/choices'
import { pressureLine } from '@yieldcircle/core/model/userSetRate'
import { Info, num, usdShort } from './bits'

const TITLE: Record<string, { head: string; note: string; info: string }> = {
  rate: { head: 'Interest rate', note: 'you set it, and it decides when you are redeemed', info: 'Every borrower here picks their own rate. Redemptions take the lowest rates first: collateral is taken at par to pay down the debt. It is not a liquidation and there is no penalty, but the position shrinks or goes. Where the market lends other people\'s money, a new loan can also only be filled by redeeming loans paying less than it, so the rate sets how much you can borrow.' },
  bands: { head: 'Liquidation range', note: 'how gradually a falling price converts your collateral', info: 'Your collateral is spread over this many price bands. Fewer bands allow a higher LTV, but a fast move converts the whole position at once. More bands lower the LTV and unwind it gradually. It is set when the loan opens.' },
  liqLtv: { head: 'Liquidation LTV', note: 'a higher line borrows more and leaves less room', info: 'You choose the LTV at which this position can be liquidated.' },
}

export function ChoicePicker({ choice: c, value, onValue, readout, debtSymbol, price, className = 'tsec ratepick' }: {
  choice: PositionChoice
  value: number
  onValue: (v: number) => void
  /** what `value` gets you */
  readout: ChoiceEffects
  debtSymbol: string
  /** USD per debt token, for the amounts */
  price?: number
  /** inside another section (the loop ticket): `ratepick` alone */
  className?: string
}) {
  const money = (x: number) => (price ? usdShort(x * price) : `${num(x, 0)} ${debtSymbol}`)
  const t = TITLE[c.id] ?? { head: c.id, note: '', info: '' }
  const range = 'min' in c.domain ? c.domain : null
  const top = c.presets?.at(-1)?.value
  // a slider to 250 % puts every sensible rate in its first pixel
  const hi = range ? (c.id === 'rate' ? Math.min(range.max, Math.max(range.min + 1, Number(top ?? range.min) * 3)) : range.max) : 0
  const lines = effectLines(c, readout, money)
  const pressure = pressureLine(c.pressure, debtSymbol)
  const lock = lockLine(c)
  return (
    <div className={className} style={className === 'ratepick' ? { marginTop: 14 } : undefined}>
      <span className="lbl">{t.head} {t.note && <span className="t50">— {t.note}</span>}
        {t.info && <Info label={`How ${t.head.toLowerCase()} works`}>{t.info}</Info>}
      </span>
      {!!c.presets?.length && (
        <div className="rp-presets" role="radiogroup" aria-label={`${t.head} presets`}>
          {c.presets.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={Math.abs(Number(p.value) - value) < 1e-9} className="rp-preset" onClick={() => onValue(Number(p.value))}>
              <span className="t50">{presetWord(c, p.id as RatePickId)}{p.id === c.recommended ? ' · suggested' : ''}</span>
              <b>{valueText(c, p.value)}</b>
              {effectLines(c, p.effects, money).map((l) => <span key={l} className="t50">{l}</span>)}
            </button>
          ))}
        </div>
      )}
      {range && (
        <div className="rp-row">
          <label htmlFor={`cp-${c.id}`} className="t50">Custom</label>
          <input id={`cp-${c.id}`} type="range" min={range.min} max={hi} step={range.step} value={value} onChange={(e) => onValue(Number(e.target.value))} />
          <span className="rp-read"><b>{valueText(c, value)}</b>{lines.length ? <> → {lines.join(' · ')}</> : null}</span>
        </div>
      )}
      {c.id === 'rate' && readout.ahead?.assets === 0 && <div className="bline warn">Nothing is ahead of this rate: any redemption on this market starts with your loan.</div>}
      {(lock || pressure) && <div className="bline t50">{lock} {pressure}</div>}
    </div>
  )
}
