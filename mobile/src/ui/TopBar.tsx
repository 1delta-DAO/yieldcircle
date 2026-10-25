import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useAppKit } from '@reown/appkit-react-native'
import { useBook } from '@yieldcircle/app/book'
import { totalsOf } from '@yieldcircle/core/model/positions'
import { usdShort } from '@yieldcircle/core/model/format'
import { C } from '../theme'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { IconMe, IconSearch } from './icons'
import { Txt } from './Txt'

/**
 * The web's top bar on a phone (app.css `.top` under 768px): the profile button left, Pro's search
 * in the middle, Connect — or your balance — right. 60px, every control a full 44px target.
 */
export function TopBar({ pro, on }: { pro?: boolean; /** You is open: the chip is lit */ on?: boolean }) {
  const insets = useSafeAreaInsets()
  const b = useBook()
  const { open } = useAppKit()
  const t = totalsOf(b)
  return (
    <View style={[st.bar, { paddingTop: insets.top, height: 60 + insets.top }]}>
      <Pressable onPress={() => router.push('/you')} hitSlop={4} style={st.me} accessibilityLabel="You">
        <IconMe color={C.tx50} />
      </Pressable>
      {pro ? (
        <Pressable onPress={() => router.push('/search')} style={st.search}>
          <IconSearch color={C.tx40} />
          <Txt s={16} c={C.tx40} numberOfLines={1} style={{ flex: 1 }}>Search wallets, vaults, protocols</Txt>
        </Pressable>
      ) : <View style={{ flex: 1 }} />}
      {b.account ? <BalanceChip tot={t.tot} perDay={t.yearly / 365} loading={b.positionsLoading && !b.books.length} on={!!on} />
        : (
        <Pressable onPress={() => open()} style={({ pressed }) => [st.pill, st.connect, pressed && { transform: [{ scale: 0.97 }] }]}>
          <Txt s={12.5} w={600} c={C.primaryInk}>Connect</Txt>
        </Pressable>
      )}
    </View>
  )
}

/** The web's balance chip (`.lite-chip`): a wallet mark, what you have, what it earns a day — You behind it. */
export function BalanceChip({ tot, perDay, loading, on }: { tot: number; perDay: number; loading: boolean; on: boolean }) {
  return (
    <Pressable onPress={() => router.push('/you')} style={[st.chip, on && { backgroundColor: C.priBg, borderColor: C.primary }]} accessibilityLabel="You">
      <View style={st.chipIc}>
        <Svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke={C.primary} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><Rect x="2.5" y="5" width="15" height="11" rx="2.5" /><Path d="M2.5 8.5h15" /><Circle cx="13.5" cy="12.3" r="1.2" fill={C.primary} stroke="none" /></Svg>
      </View>
      <View>
        <Txt s={14.5} w={600} lh={16.7}>{loading ? '…' : usdShort(tot)}</Txt>
        {perDay > 0 && <Txt s={11} w={500} c={C.ok} lh={12.7}>+{usdShort(perDay)} a day</Txt>}
      </View>
      <Svg width={10} height={10} viewBox="0 0 12 12" fill="none" stroke={C.primary} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><Path d="M4.5 2.5 8 6l-3.5 3.5" /></Svg>
    </Pressable>
  )
}

const st = StyleSheet.create({
  chip: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 3, paddingLeft: 4, paddingRight: 10, borderRadius: 999, backgroundColor: C.b300, borderWidth: 1, borderColor: 'transparent' },
  chipIc: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.priBg, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.86)', borderBottomWidth: 1, borderBottomColor: '#1a1a1f' },
  me: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.b300, alignItems: 'center', justifyContent: 'center' },
  search: { flex: 1, height: 44, borderRadius: 999, backgroundColor: C.b300, flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 11, paddingRight: 8 },
  pill: { height: 44, borderRadius: 999, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  connect: { backgroundColor: C.primary, borderColor: C.primary, minWidth: 70 },
})
