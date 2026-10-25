import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { heldBy, leverTag, type LiteRow } from '@yieldcircle/core/model/lite'
import type { Proof } from '@yieldcircle/core/model/activity'
import type { HistoryGet } from '@yieldcircle/core/model/rateHistory'
import { C } from '../theme'
import { Btn, Face, LeverPill, Rate, RiskDot, Sk } from './bits'
import { Who } from './Character'
import { LiteTitle, openStrategy } from './lite'
import { Txt } from './Txt'

/**
 * A home card (the web's `LiteCard`, `.lcard`): face and risk, the name, the rate large, then the
 * wallet that runs it best with Copy — or, with no holder yet, "Earn this".
 */
export function LiteCard({ r, get, proof }: { r: LiteRow; get: HistoryGet; proof: Proof | null }) {
  const s = r.s
  const best = proof?.best
  return (
    <Pressable onPress={() => openStrategy(s)} style={({ pressed }) => [st.card, pressed && { backgroundColor: C.b300 }]}>
      <View style={st.h}>
        <Face s={s} size={30} />
        <RiskDot r={s.risk} />
        {s.kind === 'loop' && <LeverPill text={leverTag(s.tiers.balanced)} />}
      </View>
      <View style={{ gap: 2 }}>
        <LiteTitle r={r} size={15} icon={15} />
        <Txt s={12} c={C.tx50} numberOfLines={1}>{r.sub}</Txt>
      </View>
      <View style={st.rate}>
        <Rate s={s} get={get} size={28} />
        <Txt c={C.tx50}>a year</Txt>
      </View>
      {best ? (
        <View style={st.proof}>
          <Pressable onPress={() => router.push({ pathname: '/w/[account]', params: { account: best.account } })} style={{ flexShrink: 1 }}>
            <Who account={best.account} size={20} sub={heldBy(proof)} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Btn sm title="Copy" onPress={() => openStrategy(s, { copy: best.account })} />
        </View>
      ) : (
        <View style={st.proof}>
          <Txt s={12} c={C.tx40} style={{ flex: 1 }}>steadiest rate of its kind this month</Txt>
          <Btn sm kind="plain" title="Earn this" onPress={() => openStrategy(s)} />
        </View>
      )}
    </Pressable>
  )
}

export function LiteCardSk() {
  return (
    <View style={st.card}>
      <Sk w={30} h={30} r={15} />
      <View style={{ gap: 6 }}><Sk w={110} /><Sk w={140} h={10} /></View>
      <Sk w={90} h={28} />
      <Sk w={160} h={12} />
    </View>
  )
}

const st = StyleSheet.create({
  card: { backgroundColor: C.b200, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 18, gap: 10 },
  h: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 30 },
  rate: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  proof: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 },
})
