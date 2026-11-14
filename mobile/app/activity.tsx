import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useActivity } from '@yieldcircle/app/sdk/activity'
import { chainLabel } from '@yieldcircle/app/sdk/queries'
import { outcomeOf } from '@yieldcircle/app/sdk/txOutcome'
import { clearSettled, isDone, type Trace } from '@yieldcircle/app/sdk/txTrace'
import { C } from '../src/theme'
import { txUrl } from '../src/explorer'
import { Btn } from '../src/ui/bits'
import { IconBack } from '../src/ui/icons'
import { Txt } from '../src/ui/Txt'
import { progressOf } from '../src/ui/outcome/Outcome'
import { useReduceMotion } from '../src/ui/outcome/motion'
import { Ring } from '../src/ui/outcome/Ring'

/**
 * Every transaction of the last day, in flight first (the web's tray list, `TxRow`): its ring, what
 * it was, the route, where it is in words and its explorer link. A tap opens its receipt. Reached from
 * the pill when several are going, and from Profile and settings, so a finished bridge can be found
 * again after the pill has gone.
 */
export default function Activity() {
  const insets = useSafeAreaInsets()
  const a = useActivity()
  const rows = [...a.live, ...a.all.filter(isDone)]
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[st.bar, { paddingTop: insets.top, height: 60 + insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={6} style={st.back} accessibilityLabel="Back"><IconBack color={C.tx70} /></Pressable>
        <Txt s={16} w={600} style={{ flex: 1 }}>Activity</Txt>
        {a.all.some(isDone) && <Btn sm kind="plain" title="Clear finished" onPress={() => a.accounts.forEach(clearSettled)} />}
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120, gap: 8 }}>
        {!rows.length && <Txt s={13.5} c={C.tx50} lh={20}>Nothing in the last day. Every deposit, swap and bridge you send shows here while it is on its way, and for a day after.</Txt>}
        {rows.map((t) => <Row key={t.id} t={t} now={a.now} />)}
      </ScrollView>
    </View>
  )
}

function Row({ t, now }: { t: Trace; now: number }) {
  const still = useReduceMotion()
  const o = outcomeOf(t, { now, chain: chainLabel })
  const url = txUrl(t.chainId, t.hash)
  const where = `${chainLabel(t.chainId)}${t.bridge ? ` → ${chainLabel(t.bridge.toChainId)}` : ''}`
  return (
    <Pressable onPress={() => router.push({ pathname: '/receipt', params: { id: t.id } })} style={({ pressed }) => [st.row, pressed && { backgroundColor: C.b300 }]}>
      <Ring state={o.state} tone={o.tone} progress={progressOf(t, now)} size={30} mini still={still} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt s={14} w={600} numberOfLines={1}>{t.title}</Txt>
        <Txt s={12} c={C.tx50} numberOfLines={1}>{t.paper ? 'on paper · ' : ''}{where} · {ago(now - t.at)}</Txt>
        <Txt s={12.5} lh={17} c={o.tone === 'bad' ? C.bad : o.tone === 'warn' ? C.warn : o.state === 'won' ? C.ok : C.tx70} numberOfLines={2}>
          {o.state === 'flying' ? o.detail : o.state === 'lost' ? `${o.head} · ${o.money}` : o.detail ? `${o.head} · ${o.detail}` : o.head}
        </Txt>
      </View>
      {url && <Pressable onPress={() => void Linking.openURL(url)} hitSlop={8} accessibilityLabel="Open the transaction on the explorer"><Txt s={14} c={C.primary}>↗</Txt></Pressable>}
    </Pressable>
  )
}
const ago = (ms: number) => { const m = Math.round(ms / 60_000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago` }

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.86)', borderBottomWidth: 1, borderBottomColor: '#1a1a1f' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: C.b200, borderWidth: 1, borderColor: C.line },
})
