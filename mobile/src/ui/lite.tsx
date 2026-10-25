import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { GROUPS } from '@yieldcircle/core/model/assets'
import { heldBy, leverTag, splitTitle, type LiteRow } from '@yieldcircle/core/model/lite'
import { usdShort } from '@yieldcircle/core/model/format'
import type { Proof } from '@yieldcircle/core/model/activity'
import type { HistoryGet } from '@yieldcircle/core/model/rateHistory'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { C } from '../theme'
import { Face, GroupIcon, Pill, Rate, RiskDot, Sk } from './bits'

/** Opening a row is opening its strategy, wherever the list is. */
export const openStrategy = (s: Strategy) => router.push({ pathname: '/strategy/[id]', params: { id: s.id } })

/** A row's name: the money's mark, then whose it is (the web's `LiteTitle`). */
export function LiteTitle({ r, size = 15 }: { r: LiteRow; size?: number }) {
  const g = GROUPS.find((x) => x.id === r.s.group)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 }}>
      {g && <GroupIcon id={g.id} color={g.color} size={size} />}
      <Text style={{ color: C.tx, fontWeight: '700', fontSize: size, flexShrink: 1 }} numberOfLines={1}>{splitTitle(r.title).short}</Text>
    </View>
  )
}

/** One list row: face · what it is · held by · rate · risk · lever · yours (the web's `LiteRowView`). */
export function LiteRowView({ r, get, proof, yoursUsd }: { r: LiteRow; get: HistoryGet; proof: Proof | null; yoursUsd?: number }) {
  const s = r.s
  const who = heldBy(proof)
  return (
    <Pressable onPress={() => openStrategy(s)} style={({ pressed }) => [st.row, pressed && { backgroundColor: C.b300 }]}>
      <Face s={s} />
      <View style={{ flex: 1, gap: 2 }}>
        <LiteTitle r={r} />
        <Text style={{ color: C.tx50, fontSize: 12 }} numberOfLines={1}>{r.sub}{who ? ` · ${who}` : ''}</Text>
      </View>
      {yoursUsd != null && yoursUsd > 0 && <Pill tone="ok">yours {usdShort(yoursUsd)}</Pill>}
      {s.kind === 'loop' && <Pill tone="pri">{leverTag(s.tiers.balanced)}</Pill>}
      <RiskDot r={s.risk} />
      <Rate s={s} get={get} style={{ minWidth: 58, textAlign: 'right' }} />
    </Pressable>
  )
}

export function LiteRowSk() {
  return (
    <View style={st.row}>
      <Sk w={26} h={26} style={{ borderRadius: 13 }} />
      <View style={{ flex: 1, gap: 6 }}><Sk w={120} /><Sk w={180} h={10} /></View>
      <Sk w={56} h={18} />
    </View>
  )
}

/** A card for the home's lenses: the row with who runs it (the web's `LiteCard`, without Copy until the ticket comes). */
export function LiteCard({ r, get, proof }: { r: LiteRow; get: HistoryGet; proof: Proof | null }) {
  const s = r.s
  return (
    <Pressable onPress={() => openStrategy(s)} style={({ pressed }) => [st.card, pressed && { backgroundColor: C.b300 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Face s={s} size={30} />
        <View style={{ flex: 1 }} />
        <RiskDot r={s.risk} />
        {s.kind === 'loop' && <Pill tone="pri">{leverTag(s.tiers.balanced)}</Pill>}
      </View>
      <LiteTitle r={r} />
      <Text style={{ color: C.tx50, fontSize: 12 }} numberOfLines={1}>{r.sub}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Rate s={s} get={get} style={{ fontSize: 22 }} />
        <Text style={{ color: C.tx50, fontSize: 12 }}>a year</Text>
      </View>
      <Text style={{ color: C.tx70, fontSize: 12 }} numberOfLines={1}>{heldBy(proof) || 'steadiest rate of its kind this month'}</Text>
    </Pressable>
  )
}

export function LiteCardSk() {
  return <View style={[st.card, { gap: 8 }]}><Sk w={30} h={30} style={{ borderRadius: 15 }} /><Sk w={110} /><Sk w={140} h={10} /><Sk w={80} h={22} /></View>
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  card: { width: 210, backgroundColor: C.b200, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14, gap: 5 },
})
