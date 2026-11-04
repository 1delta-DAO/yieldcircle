import React from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Line, Path } from 'react-native-svg'
import type { PnlBookPoint } from '@yieldcircle/core/index/types'
import { boardPositions, pnlSummary, signedMoney } from '@yieldcircle/core/model/lite'
import { day } from '@yieldcircle/core/model/positionRecord'
import { pct, usdShort } from '@yieldcircle/core/model/format'
import { useAccountsPnlBook } from '@yieldcircle/app/index/pnl'
import { isEvmAddr, isSolAddr } from '@yieldcircle/core/model/address'
import { useBoardNames, useLiteByKey } from '@yieldcircle/app/board'
import { useNav } from '@yieldcircle/app/nav'
import { C } from '../src/theme'
import { Sk } from '../src/ui/bits'
import { IconBack } from '../src/ui/icons'
import { Txt } from '../src/ui/Txt'

/**
 * Every number of what you made (the web's "Every number" under You's "What you made"): the
 * day-by-day line — all of it, and what farming made of it — then each strategy's figures, then
 * every position, each opening its own record (`/position`). The index's books, summed as on You:
 * `a` the account, `s` the owner's Solana wallet beside it (tickets/0018).
 */
export default function Made() {
  const insets = useSafeAreaInsets()
  const nav = useNav()
  const { a, s: sol } = useLocalSearchParams<{ a: string; s?: string }>()
  const q = useAccountsPnlBook({ evm: isEvmAddr(a) ? a : undefined, sol: sol ?? (isSolAddr(a) ? a : undefined) }, { own: true })
  const liteByKey = useLiteByKey()
  const names = useBoardNames()
  const b = q.data
  const s = b ? pnlSummary(b) : null
  const ps = b ? boardPositions(b, (k) => liteByKey.get(k.toLowerCase())?.title ?? null) : []
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[st.bar, { paddingTop: insets.top, height: 60 + insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={6} style={st.back} accessibilityLabel="Back"><IconBack color={C.tx70} /></Pressable>
        <Txt s={16} w={600}>Every number</Txt>
      </View>
      <ScrollView contentContainerStyle={[st.page, { paddingBottom: insets.bottom + 40 }]}>
        {q.isLoading ? <View style={{ gap: 10 }}><Sk w={200} h={30} /><Sk w={280} /></View>
          : !b || !s ? <Txt s={13} c={C.tx50}>No record yet. The index draws one per position within a few hours of opening.</Txt>
          : <>
            <View style={{ gap: 4 }}>
              <Txt s={32} w={700} c={s.total >= 0 ? C.ok : C.bad} style={{ letterSpacing: -0.64 }}>{signedMoney(s.total)}</Txt>
              <Txt s={13} c={C.tx50}>{s.aprPct != null ? `${pct(s.aprPct, 1)} a year on what was in` : ''}{s.on < s.of ? ` · on ${s.on} of ${s.of} positions` : ''}</Txt>
              <Txt s={13.5} c={C.tx70} lh={20}>Farming <Txt s={13.5} w={700} c={(s.yield ?? 0) >= 0 ? C.ok : C.bad}>{s.yield != null ? signedMoney(s.yield) : '–'}</Txt> · price <Txt s={13.5} w={700} c={(s.price ?? 0) >= 0 ? C.ok : C.bad}>{s.price != null ? signedMoney(s.price) : '–'}</Txt></Txt>
            </View>
            {b.series.length > 1 && <Lines pts={b.series} />}

            {b.strategies.length > 0 && <>
              <Txt s={16} w={600} style={st.h}>By strategy</Txt>
              <View style={st.card}>
                {[...b.strategies].sort((x, y) => Math.abs(y.pnlUsd) - Math.abs(x.pnlUsd)).map((g, i) => {
                  const n = names.get(g.key.toLowerCase())
                  return (
                    <View key={g.key} style={[st.row, i > 0 && st.line]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Txt s={14} w={700} numberOfLines={1}>{n?.title ?? [...g.held, ...g.debt].join(' / ')}</Txt>
                        <Txt s={12} c={C.tx50} numberOfLines={1}>{usdShort(g.equityUsd)} in it{g.since ? ` · since ${day(g.since)}` : ''} · farming {signedMoney(g.yieldUsd)}</Txt>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Txt w={700} c={g.pnlUsd >= 0 ? C.ok : C.bad}>{signedMoney(g.pnlUsd)}</Txt>
                        {g.pnlAprPct != null && <Txt s={11.5} c={C.tx50}>{pct(g.pnlAprPct, 1)} a year</Txt>}
                      </View>
                    </View>
                  )
                })}
              </View>
            </>}

            {ps.length > 0 && <>
              <Txt s={16} w={600} style={st.h}>Each position</Txt>
              <View style={st.card}>
                {ps.map((p, i) => (
                  <Pressable key={p.key} onPress={() => router.push(`/position?${new URLSearchParams({ a, k: p.key })}` as Href)} style={({ pressed }) => [st.row, i > 0 && st.line, pressed && { backgroundColor: C.b300 }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt s={14} w={700} numberOfLines={1}>{p.title}</Txt>
                      <Txt s={12} c={C.tx50} numberOfLines={1}>{p.sub}{p.equityUsd != null ? ` · ${usdShort(p.equityUsd)} in it` : ''}</Txt>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Txt w={700} c={p.pnlUsd >= 0 ? C.ok : C.bad}>{signedMoney(p.pnlUsd)}</Txt>
                      {p.aprPct != null && <Txt s={11.5} c={C.tx50}>{pct(p.aprPct, 1)} a year</Txt>}
                    </View>
                    <Txt c={C.tx40}>›</Txt>
                  </Pressable>
                ))}
              </View>
            </>}
          </>}
        <Pressable onPress={() => nav.pro(`#/w/${a}`)} style={{ marginTop: 24, alignItems: 'center' }}><Txt s={13} c={C.tx50}>Open this in Pro, with every venue and setting ›</Txt></Pressable>
      </ScrollView>
    </View>
  )
}

/** The day-by-day line: all it made (solid) and what farming made of it (dashed), against zero. */
function Lines({ pts }: { pts: PnlBookPoint[] }) {
  const W = 600, H = 150
  const vs = pts.flatMap((p) => [p.pnl, p.yield])
  const lo = Math.min(0, ...vs), hi = Math.max(0, ...vs), span = hi - lo || 1
  const x = (i: number) => 4 + (i * (W - 8)) / Math.max(1, pts.length - 1)
  const y = (v: number) => 6 + ((hi - v) * (H - 12)) / span
  const d = (f: (p: PnlBookPoint) => number) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(f(p)).toFixed(1)}`).join('')
  const up = (pts.at(-1)?.pnl ?? 0) >= 0
  return (
    <View style={{ gap: 6, marginTop: 16 }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Line x1={4} x2={W - 4} y1={y(0)} y2={y(0)} stroke={C.line2} strokeDasharray="3 4" />
        <Path d={d((p) => p.yield)} fill="none" stroke={C.ok} strokeOpacity={0.7} strokeWidth={1.4} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <Path d={d((p) => p.pnl)} fill="none" stroke={up ? C.ok : C.bad} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
      </Svg>
      <View style={{ flexDirection: 'row' }}>
        <Txt s={11} c={C.tx40} style={{ flex: 1 }}>{day(pts[0].t)}</Txt>
        <Txt s={11} c={C.tx40}>solid: all of it · dashed: farming</Txt>
        <Txt s={11} c={C.tx40} style={{ flex: 1, textAlign: 'right' }}>{day(pts[pts.length - 1].t)}</Txt>
      </View>
    </View>
  )
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.86)', borderBottomWidth: 1, borderBottomColor: '#1a1a1f' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  page: { paddingHorizontal: 16, paddingTop: 16 },
  h: { letterSpacing: -0.16, marginTop: 26, marginBottom: 10 },
  card: { backgroundColor: C.b200, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  line: { borderTopWidth: 1, borderTopColor: '#1a1a1f' },
})
