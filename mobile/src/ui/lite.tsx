import React from 'react'
import { Pressable, Share, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { GROUPS } from '@yieldcircle/core/model/assets'
import { canShare, heldBy, leverTag, shareOf, splitTitle, type LiteRow } from '@yieldcircle/core/model/lite'
import type { Holding } from '@yieldcircle/core/model/positions'
import { usdShort } from '@yieldcircle/core/model/format'
import type { Proof } from '@yieldcircle/core/model/activity'
import type { HistoryGet } from '@yieldcircle/core/model/rateHistory'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { C, alpha } from '../theme'
import { Face, GroupIcon, LeverPill, Rate, Sk, spikeOf } from './bits'
import { Txt } from './Txt'

/** Opening a row is opening its strategy, wherever the list is. */
export const openStrategy = (s: Strategy, params: Record<string, string> = {}) => router.push({ pathname: '/strategy/[id]', params: { id: s.id, ...params } })

/** A row's name (the web's `LiteTitle`, `.lite-title`): the money's mark, then whose it is — or, where categories mix (`full`), the whole phrase. */
export function LiteTitle({ r, size = 14, icon = 14, full }: { r: LiteRow; size?: number; icon?: number; full?: boolean }) {
  const g = GROUPS.find((x) => x.id === r.s.group)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
      {g && <GroupIcon id={g.id} color={g.color} size={icon} />}
      <Txt s={size} w={600} numberOfLines={2} style={{ flexShrink: 1 }}>{full ? r.title : splitTitle(r.title).short}</Txt>
    </View>
  )
}

/** One list row (the web's `LiteRowView`, `.lrow`): a card of its own — face · name and who runs it · yours · lever · rate in its risk's colour. */
export function LiteRowView({ r, get, proof, yoursUsd, full }: { r: LiteRow; get: HistoryGet; proof: Proof | null; yoursUsd?: number; full?: boolean }) {
  const s = r.s
  const who = heldBy(proof)
  const spike = spikeOf(s, get)
  return (
    <Pressable onPress={() => openStrategy(s)} style={({ pressed }) => [st.row, pressed && { backgroundColor: C.b300 }]}>
      <Face s={s} />
      <View style={{ flex: 1, gap: 2 }}>
        <LiteTitle r={r} full={full} />
        <Txt s={12} c={C.tx70} numberOfLines={2}>{r.sub}{spike ? ' · higher than usual' : ''}{who ? ` · ${who}` : ''}</Txt>
      </View>
      {yoursUsd != null && yoursUsd > 0 && <View style={st.run}><Txt s={11} w={600} c={C.ok} lh={16.5}>yours {usdShort(yoursUsd)}</Txt></View>}
      {s.kind === 'loop' && <LeverPill text={leverTag(s.tiers.balanced)} />}
      <Rate s={s} />
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

/**
 * Sharing a position (the head of its ticket, the web's `useSharePosition`): a Copy link to the
 * same strategy with this wallet as the one copied. What may be shared and what it says are core's
 * (`canShare`, `shareOf`). Null when there is nothing to share.
 */
export function sharePosition(s: Strategy | null, h: Holding | null, account: string | undefined): (() => void) | null {
  if (!canShare(s, h, account)) return null
  return () => {
    const { text, url } = shareOf(s!, h!, account!)
    void Share.share({ message: `${text} ${url}` }).catch(() => { /* closed */ })
  }
}
