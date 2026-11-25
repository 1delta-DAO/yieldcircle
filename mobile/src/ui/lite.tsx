import React from 'react'
import { Animated, Pressable, Share, StyleSheet, View } from 'react-native'
import { router, type Href } from 'expo-router'
import { GROUPS } from '@yieldcircle/core/model/assets'
import { canShare, heldBy, leverTag, riskScoreText, riskTag, shareOf, rowName, type LiteRow } from '@yieldcircle/core/model/lite'
import type { Holding } from '@yieldcircle/core/model/positions'
import { pct, usdShort } from '@yieldcircle/core/model/format'
import type { Proof } from '@yieldcircle/core/model/activity'
import type { HistoryGet } from '@yieldcircle/core/model/rateHistory'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { C, RISK, alpha } from '../theme'
import { Face, GroupIcon, LeverPill, Rate, Sk, usualWords } from './bits'
import { Txt } from './Txt'
import { pathOf } from '../nav'

/** Opening a row is opening its strategy, wherever the list is: core's route map (`pathOf`). */
export const openStrategy = (s: { id: string; kind: string; group: string }, more: { copy?: string; lev?: string; h?: string; m?: string } = {}) => router.push(pathOf({ to: 'strategy', s, ...more }) as Href)
/** A wallet's page, from any face. */
export const openWallet = (account: string) => router.push(pathOf({ to: 'wallet', account }) as Href)
/** An asset's page: what it is, who issues it. */
export const openAsset = (group: string) => router.push(pathOf({ to: 'asset', group }) as Href)

/** A row's name (the web's `LiteTitle`, `.lite-title`): the money's mark, then whose it is and where it sits (`liteName`). */
export function LiteTitle({ r, size = 14, icon = 14 }: { r: LiteRow; size?: number; icon?: number }) {
  const g = GROUPS.find((x) => x.id === r.s.group)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
      {g && <GroupIcon id={g.id} color={g.color} size={icon} />}
      <Txt s={size} w={600} numberOfLines={2} style={{ flexShrink: 1 }}>{rowName(r)}</Txt>
    </View>
  )
}

/**
 * One list row (the web's `LiteRowView`, `.lrow`): a card of its own — face · name and who runs it
 * · yours · lever · rate in its risk's colour. `followed`: the proof's face is someone the reader
 * follows, said first (docs/lite-social-search.md §4.6).
 */
export function LiteRowView({ r, get, proof, yoursUsd, yoursApr, arrived, onArrivedAt, followed, onOpen }: { r: LiteRow; get: HistoryGet; proof: Proof | null; yoursUsd?: number; /** what the reader's own position here earns, beside its value */ yoursApr?: number; /** an action just landed in it: one glow (ticket 0016 §3) */ arrived?: boolean; /** where it sits in its list, once, when it has arrived: the page scrolls to it */ onArrivedAt?: (y: number) => void; followed?: boolean; /** before it opens: search remembers the pick */ onOpen?: () => void }) {
  const s = r.s
  const friend = followed && proof?.best ? proof.wallets : 0
  const who = friend ? `you follow${friend > 1 ? ` + ${friend - 1}` : ''}` : heldBy(proof)
  const usual = usualWords(s, get)
  const yours = yoursUsd != null && yoursUsd > 0
  const glow = React.useRef(new Animated.Value(0)).current
  React.useEffect(() => {
    if (!arrived) return
    glow.setValue(1)
    Animated.sequence([Animated.delay(800), Animated.timing(glow, { toValue: 0, duration: 2000, useNativeDriver: true })]).start()
  }, [arrived])
  return (
    <Pressable onPress={() => { onOpen?.(); openStrategy(s) }} onLayout={arrived && onArrivedAt ? (e) => onArrivedAt(e.nativeEvent.layout.y) : undefined} style={({ pressed }) => [st.row, pressed && { backgroundColor: C.b300 }]}>
      <Animated.View pointerEvents="none" style={[st.glow, { opacity: glow }]} />
      <Face s={s} />
      <View style={{ flex: 1, minWidth: 80, gap: 2 }}>
        <LiteTitle r={r} />
        <Txt s={12} c={C.tx70} numberOfLines={2}>{r.sub}{usual ? <Txt s={12} c={C.warn}> · {usual}</Txt> : ''}{who ? <Txt s={12} c={friend ? C.ok : C.tx70}> · {who}</Txt> : ''}</Txt>
        {/* the pills have a line of their own (the web's `.lrow-p` on a phone): beside the name they took its width — `Loop ed…` */}
        {(yours || s.kind === 'loop') && (
          <View style={st.pills}>
            {yours && <View style={st.run}><Txt s={11} w={600} c={C.ok} lh={16.5}>yours {usdShort(yoursUsd!)}{yoursApr != null && yoursApr > 0 ? ` · ${pct(yoursApr, 1)}` : ''}</Txt></View>}
            {s.kind === 'loop' && <LeverPill text={leverTag(s.tiers.balanced)} />}
          </View>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}><Rate s={s} /><Txt s={11} w={500} c={RISK[s.risk]} style={{ opacity: 0.85 }}>{riskScoreText(s) ? `risk ${riskScoreText(s)}` : riskTag(s)}</Txt></View>
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
  pills: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 3 },
  run: { backgroundColor: alpha(C.ok, 0.13), borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  glow: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 12, borderWidth: 2, borderColor: C.primary, backgroundColor: C.priBg },
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
