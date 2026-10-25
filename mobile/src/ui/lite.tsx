import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { GROUPS } from '@yieldcircle/core/model/assets'
import { heldBy, leverTag, splitTitle, type LiteRow } from '@yieldcircle/core/model/lite'
import { usdShort } from '@yieldcircle/core/model/format'
import type { Proof } from '@yieldcircle/core/model/activity'
import type { HistoryGet } from '@yieldcircle/core/model/rateHistory'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { C, alpha } from '../theme'
import { Face, GroupIcon, LeverPill, Rate, RiskDot, Sk } from './bits'
import { Txt } from './Txt'

/** Opening a row is opening its strategy, wherever the list is. */
export const openStrategy = (s: Strategy, params: Record<string, string> = {}) => router.push({ pathname: '/strategy/[id]', params: { id: s.id, ...params } })

/** A row's name (the web's `LiteTitle`, `.lite-title`): the money's mark, then whose it is — 14.5 / 600. */
export function LiteTitle({ r, size = 14.5, icon = 14 }: { r: LiteRow; size?: number; icon?: number }) {
  const g = GROUPS.find((x) => x.id === r.s.group)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
      {g && <GroupIcon id={g.id} color={g.color} size={icon} />}
      <Txt s={size} w={600} numberOfLines={1} style={{ flexShrink: 1 }}>{splitTitle(r.title).short}</Txt>
    </View>
  )
}

/** One list row (the web's `LiteRowView`, `.lrow`): a card of its own — face · name and who runs it · lever · risk · rate · ›. */
export function LiteRowView({ r, get, proof, yoursUsd }: { r: LiteRow; get: HistoryGet; proof: Proof | null; yoursUsd?: number }) {
  const s = r.s
  const who = heldBy(proof)
  return (
    <Pressable onPress={() => openStrategy(s)} style={({ pressed }) => [st.row, pressed && { backgroundColor: C.b300 }]}>
      <Face s={s} />
      <View style={{ flex: 1, gap: 2 }}>
        <LiteTitle r={r} />
        <Txt s={12} c={C.tx50} numberOfLines={1}>{r.sub}{who ? ` · ${who}` : ''}</Txt>
      </View>
      {yoursUsd != null && yoursUsd > 0 && <View style={st.run}><Txt s={11} w={600} c={C.ok} lh={16.5}>yours {usdShort(yoursUsd)}</Txt></View>}
      {s.kind === 'loop' && <LeverPill text={leverTag(s.tiers.balanced)} />}
      <RiskDot r={s.risk} />
      <Rate s={s} get={get} />
      <Txt c={C.tx40}>›</Txt>
    </Pressable>
  )
}

export function LiteRowSk() {
  return (
    <View style={st.row}>
      <Sk w={28} h={28} r={14} />
      <View style={{ flex: 1, gap: 6 }}><Sk w={120} /><Sk w={180} h={10} /></View>
      <Sk w={60} h={18} />
    </View>
  )
}

export const rowStyles = StyleSheet.create({
  /** `.lrows`: the rows' column, 6px apart */
  rows: { gap: 6 },
})

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: C.b200, borderRadius: 12 },
  run: { backgroundColor: alpha(C.ok, 0.13), borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
})
