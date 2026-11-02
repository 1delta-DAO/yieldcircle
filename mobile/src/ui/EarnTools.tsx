import React from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { EARN_KINDS, EARN_RISKS, EARN_SORTS, MIN_TVLS, filtersOn } from '@yieldcircle/core/model/earnFilter'
import { usdShort } from '@yieldcircle/core/model/format'
import type { EarnFilterState } from '@yieldcircle/app/earnFilter'
import { C } from '../theme'
import { family } from '../fonts'
import { IconSearch } from './icons'
import { Seg } from './bits'
import { Txt } from './Txt'

/**
 * One bar over an Earn list (the web's `EarnTools`): search, the sort as chips, and Filters, which
 * opens kind, risk, size and exit. Counts what it kept and resets in one tap. The rule is core's
 * (`applyEarn`); the state is the shared `useEarnFilter`.
 */
export function EarnTools({ st: { f, set, reset, active }, n, total, kinds }: { st: EarnFilterState; n: number; total: number; kinds?: boolean }) {
  const nf = filtersOn(f)
  const [open, setOpen] = React.useState(nf > 0)
  return (
    <View style={{ gap: 10, marginBottom: 12 }}>
      <View style={st.row}>
        <View style={st.q}>
          <IconSearch color={C.tx40} size={14} />
          <TextInput value={f.q} onChangeText={(q) => set({ q })} placeholder="Search a token, venue or curator" placeholderTextColor={C.tx40} autoCapitalize="none" autoCorrect={false} style={st.input} returnKeyType="search" />
          {f.q ? <Pressable onPress={() => set({ q: '' })} hitSlop={8}><Txt s={16} c={C.tx50}>×</Txt></Pressable> : null}
        </View>
        <Pressable onPress={() => setOpen(!open)} style={[st.fbtn, nf > 0 && { borderColor: C.primary }]} accessibilityState={{ expanded: open }}>
          <Txt s={12.5} w={600} c={nf > 0 ? C.primary : C.tx70}>Filters{nf > 0 ? ` · ${nf}` : ''}</Txt>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {EARN_SORTS.map((o) => {
          const on = f.sort === o.id
          return <Pressable key={o.id} onPress={() => set({ sort: o.id })} style={[st.chip, on && st.chipOn]}><Txt s={12.5} c={on ? C.tx : C.tx70}>{o.word}</Txt></Pressable>
        })}
      </ScrollView>
      {open && (
        <View style={st.panel}>
          {kinds && <Group label="Kind"><Seg items={EARN_KINDS} value={f.kind} onChange={(kind) => set({ kind })} /></Group>}
          <Group label="Risk"><Seg items={EARN_RISKS.map((r) => ({ id: String(r.id), word: r.word }))} value={String(f.risk)} onChange={(v) => set({ risk: Number(v) as typeof f.risk })} /></Group>
          <Group label="Size"><Seg items={MIN_TVLS.map((x) => ({ id: String(x), word: x ? `${usdShort(x)}+` : 'Any' }))} value={String(f.minTvl)} onChange={(v) => set({ minTvl: Number(v) })} /></Group>
          <Group label="Exit" note="Any time: the money can leave in the same block — no cooldown, queue, lock or maturity.">
            <Seg items={[{ id: 'any', word: 'Any' }, { id: 'now', word: 'Any time' }]} value={f.instant ? 'now' : 'any'} onChange={(v) => set({ instant: v === 'now' })} />
          </Group>
        </View>
      )}
      {active && (
        <View style={st.row}>
          <Txt s={12.5} c={C.tx70} style={{ flex: 1 }}>{n === total ? `${n} row${n === 1 ? '' : 's'}` : `${n} of ${total}`}</Txt>
          <Pressable onPress={reset} hitSlop={8}><Txt s={12.5} c={C.primary}>Reset</Txt></Pressable>
        </View>
      )}
    </View>
  )
}

function Group({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt s={12} w={600} c={C.tx50}>{label}</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>{children}</ScrollView>
      {note && <Txt s={11.5} c={C.tx40} lh={16}>{note}</Txt>}
    </View>
  )
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  q: { flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.b300 },
  input: { flex: 1, color: C.tx, fontSize: 14, fontFamily: family(400), height: '100%' },
  fbtn: { height: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: C.line2, paddingVertical: 6, paddingHorizontal: 11 },
  chipOn: { borderColor: C.primary, backgroundColor: C.priBg },
  panel: { backgroundColor: C.b200, borderRadius: 12, padding: 14, gap: 12 },
})
