import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import type { ChoiceEffects, PositionChoice, RatePickId } from '@yieldcircle/core/sdk/types'
import { fromUnits, unitsOf, type Amount } from '@yieldcircle/core/model/amount'
import { effectLines, lockLine, presetWord, valueText } from '@yieldcircle/core/model/choices'
import { num, usdShort } from '@yieldcircle/core/model/format'
import { pressureLine } from '@yieldcircle/core/model/userSetRate'
import { C } from '../theme'
import { Txt } from '../ui/Txt'
import { AmountBox, Lbl, Sec } from './parts'

const TITLE: Record<string, { head: string; note: string; info: string }> = {
  rate: { head: 'Interest rate', note: 'you set it, and it decides when you are redeemed', info: 'Redemptions take the lowest rates first: collateral is taken at par to pay the debt down. It is not a liquidation and costs no penalty, but the loan shrinks or goes.' },
  bands: { head: 'Liquidation range', note: 'how gradually a falling price converts your collateral', info: 'Fewer bands borrow more, and a fast move converts it all at once. More bands borrow less and unwind gradually. It is set when the loan opens.' },
  liqLtv: { head: 'Liquidation LTV', note: 'a higher line borrows more and leaves less room', info: '' },
}

/**
 * One knob of a new position (the web's `ChoicePicker`): the rate a borrower sets, a band count, a
 * liquidation LTV. It draws a `PositionChoice` and knows no lender (`model/choices.ts`). The presets
 * are the API's, at the ticket's size, the suggested one already picked; a value of one's own is
 * typed (a rate) or stepped (a count) — the phone has no slider.
 */
export function ChoicePicker({ choice: c, value, onValue, readout, debtSymbol, price }: {
  choice: PositionChoice
  value: number
  onValue: (v: number) => void
  /** what `value` gets you */
  readout: ChoiceEffects
  debtSymbol: string
  /** USD per debt token, for the amounts */
  price?: number
}) {
  const money = (x: number) => (price ? usdShort(x * price) : `${num(x, 0)} ${debtSymbol}`)
  const t = TITLE[c.id] ?? { head: c.id, note: '', info: '' }
  const range = 'min' in c.domain ? c.domain : null
  // the box keeps what was typed ("5." stays "5."); a preset shows its own value
  const [typed, setTyped] = React.useState<Amount | null>(null)
  const set = (v: number) => { setTyped(null); onValue(v) }
  const lines = effectLines(c, readout, money)
  const pressure = pressureLine(c.pressure, debtSymbol)
  const lock = lockLine(c)
  return (
    <Sec>
      <Lbl>{t.head}{t.note ? ` · ${t.note}` : ''}</Lbl>
      {!!c.presets?.length && (
        <View style={st.presets} accessibilityRole="radiogroup">
          {c.presets.map((p) => {
            const on = Math.abs(Number(p.value) - value) < 1e-9
            return (
              <Pressable key={p.id} onPress={() => set(Number(p.value))} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[st.preset, on && { borderColor: C.primary, backgroundColor: C.priBg }]}>
                <Txt s={11.5} c={C.tx50} numberOfLines={1}>{presetWord(c, p.id as RatePickId)}{p.id === c.recommended ? ' · suggested' : ''}</Txt>
                <Txt s={15} mono>{valueText(c, p.value)}</Txt>
                {effectLines(c, p.effects, money).map((l) => <Txt key={l} s={10.5} c={C.tx50} lh={14}>{l}</Txt>)}
              </Pressable>
            )
          })}
        </View>
      )}
      {range && c.id === 'rate' && (
        <View style={st.custom}>
          <Txt s={12.5} c={C.tx50}>Or your own</Txt>
          <View style={{ flex: 1 }}><AmountBox soft unit="%" value={typed ?? fromUnits(Math.round(value * 100) / 100)} onChange={(a) => { setTyped(a); if (unitsOf(a) > 0) onValue(unitsOf(a)) }} /></View>
        </View>
      )}
      {range && c.id === 'bands' && (
        <View style={st.custom}>
          <Txt s={12.5} c={C.tx50} style={{ flex: 1 }}>Or your own</Txt>
          <Pressable accessibilityRole="button" accessibilityLabel="Fewer" disabled={value <= range.min} onPress={() => set(Math.max(range.min, value - range.step))} style={[st.step, value <= range.min && { opacity: 0.4 }]}><Txt s={18} w={700}>−</Txt></Pressable>
          <Txt s={15} mono style={{ minWidth: 84, textAlign: 'center' }}>{valueText(c, value)}</Txt>
          <Pressable accessibilityRole="button" accessibilityLabel="More" disabled={value >= range.max} onPress={() => set(Math.min(range.max, value + range.step))} style={[st.step, value >= range.max && { opacity: 0.4 }]}><Txt s={18} w={700}>+</Txt></Pressable>
        </View>
      )}
      {lines.length > 0 && <Txt s={12} c={C.tx70} lh={17} style={{ marginTop: 8 }}>{valueText(c, value)} → {lines.join(' · ')}</Txt>}
      {c.id === 'rate' && typed != null && range && (unitsOf(typed) < range.min || unitsOf(typed) > range.max) && <Txt s={12} c={C.warn} lh={17} style={{ marginTop: 4 }}>Between {valueText(c, range.min)} and {valueText(c, range.max)} here: {valueText(c, value)} is used.</Txt>}
      {c.id === 'rate' && readout.ahead?.assets === 0 && <Txt s={12.5} c={C.warn} lh={18} style={{ marginTop: 6 }}>Nothing is ahead of this rate: any redemption on this market starts with your loan.</Txt>}
      {(t.info || lock || pressure) && <Txt s={12} c={C.tx50} lh={17} style={{ marginTop: 6 }}>{[t.info, lock, pressure].filter(Boolean).join(' ')}</Txt>}
    </Sec>
  )
}

const st = StyleSheet.create({
  presets: { flexDirection: 'row', gap: 6 },
  preset: { flex: 1, gap: 2, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: C.b300, backgroundColor: '#0d0d0d' },
  custom: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  step: { width: 40, height: 40, borderRadius: 999, backgroundColor: C.b300, alignItems: 'center', justifyContent: 'center' },
})
