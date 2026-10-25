import { Pressable, Text } from 'react-native'
import { router } from 'expo-router'
import { useBook } from '@yieldcircle/app/book'
import { totalsOf } from '@yieldcircle/core/model/positions'
import { usdShort } from '@yieldcircle/core/model/format'
import { C } from '../theme'

/** The header's top right: your balance, or Connect — and "You" behind it, as on the web. */
export function BalanceChip() {
  const b = useBook()
  const t = totalsOf(b)
  const label = !b.account ? 'Connect' : b.positionsLoading && !b.books.length ? '…' : usdShort(t.tot)
  return (
    <Pressable onPress={() => router.push('/you')} hitSlop={8} style={({ pressed }) => ({ marginRight: 14, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: b.account ? C.b400 : C.primary, opacity: pressed ? 0.8 : 1 })}>
      <Text style={{ color: b.account ? C.tx : C.primaryInk, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  )
}
