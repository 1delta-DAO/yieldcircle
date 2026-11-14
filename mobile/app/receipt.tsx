import { View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useTrace } from '@yieldcircle/app/sdk/txTrace'
import { C } from '../src/theme'
import { Btn } from '../src/ui/bits'
import { Txt } from '../src/ui/Txt'
import { OutcomeView } from '../src/ui/outcome/Outcome'

/**
 * One transaction's end screen, opened from the pill or Activity (docs/tx-feedback-plan.md §4.3):
 * the same screen the ticket shows, for an action whose sheet was closed while it went on. Nothing is
 * rebuilt from here — "Try again" opens the strategy's ticket.
 */
export default function Receipt() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const t = useTrace(id)
  const sid = t?.receipt?.strategyId
  if (!t) return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
      <Txt s={15} c={C.tx70} style={{ textAlign: 'center' }}>This transaction is no longer on this phone: the list keeps the last day.</Txt>
      <Btn title="Close" kind="plain" onPress={() => router.back()} />
    </View>
  )
  return (
    <OutcomeView id={id} onDone={() => router.back()} onLeave={() => router.back()}
      onAgain={sid ? () => router.replace({ pathname: '/strategy/[id]', params: { id: sid } }) : undefined}
      links={(h) => h ? [{ label: 'See it', onPress: () => router.replace({ pathname: '/strategy/[id]', params: { id: sid ?? '_', h: h.key } }) }] : []} />
  )
}
