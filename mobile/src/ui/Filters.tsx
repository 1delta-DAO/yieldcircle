import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { FILTER_CONTROLS, SLIPPAGE_OPTS, useSettings, type FilterControl } from '@yieldcircle/app/state/Settings'
import { LITE_CONTROLS, LITE_FLOORS, liteWidened } from '@yieldcircle/core/model/lite'
import { C } from '../theme'
import { Seg } from './bits'
import { Txt } from './Txt'

/**
 * The menu's filters on the phone (the web's `SettingsPanel` / `LiteFilters`), drawn from core's
 * control lists: in Lite the four Lite reads, in Pro all of them. Then the slippage every trade
 * carries. One store with the web's shape, kept on the device.
 */
export function Filters({ lite }: { lite: boolean }) {
  const { st: cur, set, reset, widened } = useSettings()
  const n = lite ? liteWidened(cur) : widened
  const controls = lite ? LITE_CONTROLS : FILTER_CONTROLS
  return (
    <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
      <View style={st.head}>
        <Txt s={13.5} w={600} style={{ flex: 1 }}>{lite ? 'What Lite shows' : 'What the menu shows'}</Txt>
        <Pressable disabled={!n} onPress={() => (lite ? set(LITE_FLOORS) : reset())} hitSlop={8}><Txt s={12.5} c={n ? C.primary : C.tx40}>Reset</Txt></Pressable>
      </View>
      <Txt s={12.5} c={C.tx50} lh={18}>{lite ? 'Big, rated savings that pay more than they cost. Widen it here.' : 'Curated by default: real size, a collateral that earns on its own, a carry that pays more than it costs.'}</Txt>
      {controls.map((c) => <Control key={c.kind === 'seg' ? c.key : c.id} c={c} />)}
      <Txt s={13.5} w={600} style={{ marginTop: 8 }}>Trading</Txt>
      <View style={{ gap: 8 }}>
        <Txt s={13} c={C.tx70}>Max slippage <Txt s={11.5} c={C.tx40}>how far a swap may fill from its quote</Txt></Txt>
        <Seg grow items={SLIPPAGE_OPTS.map((o) => ({ id: String(o), word: o == null ? 'Auto' : `${o / 100}%` }))}
          value={String(cur.slippageBp)} onChange={(v) => set({ slippageBp: v === 'null' ? null : Number(v) })} />
      </View>
    </View>
  )
}

function Control({ c }: { c: FilterControl }) {
  const { st: cur, set } = useSettings()
  if (c.kind === 'seg') return (
    <View style={{ gap: 8 }}>
      <Txt s={13} c={C.tx70}>{c.label}{c.note ? <Txt s={11.5} c={C.tx40}>  {c.note}</Txt> : null}</Txt>
      <Seg grow items={c.opts.map((o) => ({ id: String(o.v), word: o.word }))} value={String(cur[c.key])} onChange={(v) => set({ [c.key]: Number(v) })} />
    </View>
  )
  const on = c.on(cur)
  return (
    <Pressable onPress={() => set(c.to(!on))} style={st.check} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <View style={[st.tick, on && { backgroundColor: C.primary, borderColor: C.primary }]}>{on && <Txt s={12} w={700} c={C.primaryInk} lh={14}>✓</Txt>}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt s={13.5} w={600} c={on ? C.tx : C.tx70}>{c.label}</Txt>
        <Txt s={12} c={C.tx50} lh={17}>{c.sub}</Txt>
      </View>
    </Pressable>
  )
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 44, paddingVertical: 6 },
  tick: { width: 18, height: 18, marginTop: 1, borderRadius: 5, borderWidth: 1.5, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
})
