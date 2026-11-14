import React from 'react'
import { Animated, Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useActivity } from '@yieldcircle/app/sdk/activity'
import { chainLabel } from '@yieldcircle/app/sdk/queries'
import { outcomeOf } from '@yieldcircle/app/sdk/txOutcome'
import { dismissTrace, isDone } from '@yieldcircle/app/sdk/txTrace'
import { C } from '../theme'
import { Txt } from './Txt'
import { Confetti } from './outcome/Confetti'
import { useReduceMotion } from './outcome/motion'
import { progressOf } from './outcome/Outcome'
import { Ring } from './outcome/Ring'

/** the pill's own bursts: one per trace, apart from the receipt's */
const popped = new Set<string>()

/**
 * Something is still going (docs/tx-feedback-plan.md §4.5): a pill just above the tab bar on every
 * page while a transaction is in flight — a bridge, mostly, whose sheet was closed — with its ring
 * and how long is left. It ends with a small burst and the outcome's headline for a few seconds, or
 * turns red and stays until opened or dismissed. A tap opens the receipt (one) or Activity (several).
 * The web's tray reads the same activity (`@yieldcircle/app/sdk/activity`).
 */
export function ActivityPill({ bottom }: { bottom: number }) {
  const a = useActivity()
  const still = useReduceMotion()
  const lead = a.lead
  const rise = React.useRef(new Animated.Value(0)).current
  const [burst, setBurst] = React.useState<string | null>(null)
  const o = lead ? outcomeOf(lead, { now: a.now, chain: chainLabel }) : null
  React.useEffect(() => { Animated.spring(rise, { toValue: lead ? 1 : 0, friction: 7, tension: 90, useNativeDriver: true }).start() }, [!!lead])
  React.useEffect(() => { if (lead && o?.state === 'won' && !still && !popped.has(lead.id)) { popped.add(lead.id); setBurst(lead.id) } }, [lead?.id, o?.state])
  if (!lead || !o) return null
  const more = a.shown.length - 1
  const open = () => (more > 0 ? router.push('/activity') : router.push({ pathname: '/receipt', params: { id: lead.id } }))
  const words = o.state === 'flying' ? (o.detail ?? '') : o.state === 'lost' ? o.head : `${o.head} ›`
  const border = o.tone === 'bad' ? 'rgba(229,83,75,.7)' : o.tone === 'warn' ? 'rgba(226,163,58,.6)' : o.state === 'won' ? 'rgba(63,191,127,.6)' : C.line2
  return (
    <View pointerEvents="box-none" style={[st.slot, { bottom }]}>
      <Animated.View style={{ opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}>
        <Pressable onPress={open} style={({ pressed }) => [st.pill, { borderColor: border }, pressed && { backgroundColor: C.b300 }]} accessibilityRole="button" accessibilityLabel={`${lead.title}: ${words}`} accessibilityLiveRegion="polite">
          <Ring state={o.state} tone={o.tone} progress={progressOf(lead, a.now)} size={24} mini still={still} />
          <View style={{ flexShrink: 1 }}>
            <Txt s={13} w={600} lh={16} numberOfLines={1}>{lead.title}</Txt>
            <Txt s={11.5} lh={14} numberOfLines={1} c={o.tone === 'bad' ? C.bad : o.tone === 'warn' ? C.warn : o.state === 'won' ? C.ok : C.tx50}>{words}</Txt>
          </View>
          {more > 0 && <View style={st.more}><Txt s={11} w={600} c={C.tx70}>+{more}</Txt></View>}
          {isDone(lead) && (
            <Pressable onPress={() => dismissTrace(lead.id)} hitSlop={10} style={st.x} accessibilityLabel="Dismiss"><Txt s={13} c={C.tx50}>✕</Txt></Pressable>
          )}
        </Pressable>
        {burst === lead.id && <Confetti small origin={{ x: 22, y: 22 }} onEnd={() => setBurst(null)} />}
      </Animated.View>
    </View>
  )
}

const st = StyleSheet.create({
  slot: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, maxWidth: 420, paddingVertical: 7, paddingLeft: 10, paddingRight: 12, borderRadius: 999, borderWidth: 1, backgroundColor: 'rgba(14,14,17,0.97)', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  more: { minWidth: 26, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: C.b400, alignItems: 'center', justifyContent: 'center' },
  x: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
})
