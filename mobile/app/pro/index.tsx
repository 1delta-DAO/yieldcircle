import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useBook } from '@yieldcircle/app/book'
import { useRateHistory } from '@yieldcircle/app/sdk/queries'
import { GROUPS } from '@yieldcircle/core/model/assets'
import { totalsOf } from '@yieldcircle/core/model/positions'
import { usd } from '@yieldcircle/core/model/format'
import { C } from '../../src/theme'
import { GroupIcon, T } from '../../src/ui/bits'
import { ProRow } from '../../src/ui/pro'

/** Pro's home, first cut: your money, then the best rate in each money (the full lists are under Earn). */
export default function ProHome() {
  const b = useBook()
  const get = useRateHistory(b.all, !b.isFetching)
  const t = totalsOf(b)
  return (
    <ScrollView contentContainerStyle={st.page}>
      {b.account && (
        <View style={st.card}>
          <Text style={T.dim}>Your money</Text>
          <Text style={st.bal}>{usd(t.tot)}</Text>
          <Text style={T.dim70}>{usd(t.work)} at work · <Text style={T.ok}>{usd(t.yearly)}</Text> a year · {usd(t.idle)} idle</Text>
        </View>
      )}
      {GROUPS.map((g) => {
        const best = b.all.filter((s) => s.group === g.id).sort((x, y) => y.rate - x.rate).slice(0, 3)
        if (!best.length) return null
        return (
          <View key={g.id} style={{ gap: 6 }}>
            <Pressable onPress={() => router.push('/pro/earn')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <GroupIcon id={g.id} color={g.color} size={20} /><Text style={T.h2}>{g.name}</Text><Text style={T.dim}>›</Text>
            </Pressable>
            <View style={st.list}>{best.map((s) => <ProRow key={s.id} s={s} get={get} />)}</View>
          </View>
        )
      })}
    </ScrollView>
  )
}

const st = StyleSheet.create({
  page: { padding: 16, gap: 18, paddingBottom: 40 },
  card: { backgroundColor: C.b200, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14, gap: 6 },
  bal: { color: C.tx, fontSize: 30, fontWeight: '800', fontVariant: ['tabular-nums'] },
  list: { backgroundColor: C.b200, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
})
