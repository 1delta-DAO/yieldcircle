import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { AppKitButton } from '@reown/appkit-react-native'
import { useBook } from '@yieldcircle/app/book'
import { GROUPS } from '@yieldcircle/core/model/assets'
import { totalsOf } from '@yieldcircle/core/model/positions'
import { pct, usd } from '@yieldcircle/core/model/format'
import { setMode, useMode, type Mode } from '../src/mode'
import { C } from '../src/theme'
import { GroupIcon, Seg, T } from '../src/ui/bits'

/**
 * You (behind the balance chip): the wallet, what your money does in each currency, and the switch
 * between Lite and Pro — the web's profile sheet row, which rewrites where `/` goes.
 */
export default function You() {
  const b = useBook()
  const t = totalsOf(b)
  const mode = useMode()
  const choose = (m: Mode) => { setMode(m); if (router.canDismiss()) router.dismissAll(); router.replace(m === 'pro' ? '/pro' : '/lite') }
  return (
    <ScrollView contentContainerStyle={st.page}>
      <View style={{ alignItems: 'flex-start' }}><AppKitButton /></View>

      {b.account && (
        <View style={st.card}>
          <Text style={T.dim}>Your money</Text>
          <Text style={st.bal}>{usd(t.tot)}</Text>
          <Text style={T.dim70}>{usd(t.work)} at work, earning <Text style={T.ok}>{usd(t.yearly)}</Text> a year · {usd(t.idle)} idle</Text>
          {b.books.filter((x) => x.totalUsd >= 1).sort((x, y) => y.totalUsd - x.totalUsd).map((x) => {
            const g = GROUPS.find((gg) => gg.id === x.group)
            return (
              <View key={x.asset} style={st.line}>
                {g && <GroupIcon id={g.id} color={g.color} size={18} />}
                <Text style={[T.body, { flex: 1 }]}>{x.asset}</Text>
                <Text style={T.dim70}>{x.atWorkUsd >= 1 ? `${pct(x.blended, 1)} · ` : ''}</Text>
                <Text style={[T.body, { fontVariant: ['tabular-nums'] }]}>{usd(x.totalUsd)}</Text>
              </View>
            )
          })}
        </View>
      )}

      <View style={st.card}>
        <Text style={T.h2}>Mode</Text>
        <Seg items={[{ id: 'lite', word: 'Lite' }, { id: 'pro', word: 'Pro' }]} value={mode} onChange={choose} />
        <Text style={T.dim}>{mode === 'lite' ? 'Lite: the best rates in plain words, the safest first.' : 'Pro: every venue, every chain, borrowing and the feed.'}</Text>
      </View>

      <Pressable onPress={() => router.push('/probe')}><Text style={{ color: C.primary }}>Wallet probe (what your wallet can batch) ›</Text></Pressable>
    </ScrollView>
  )
}

const st = StyleSheet.create({
  page: { padding: 16, gap: 16, paddingBottom: 48 },
  card: { backgroundColor: C.b200, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14, gap: 8 },
  bal: { color: C.tx, fontSize: 32, fontWeight: '800', fontVariant: ['tabular-nums'] },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
})
