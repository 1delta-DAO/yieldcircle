import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useLiteMenu } from '@yieldcircle/app/lite'
import { CHAINS } from '@yieldcircle/app/sdk/queries'
import { brandOf, heldBy, leverTag, plainName, trustKind } from '@yieldcircle/core/model/lite'
import { pct, usd, usdShort } from '@yieldcircle/core/model/format'
import { isSpike, seriesFor } from '@yieldcircle/core/model/rateHistory'
import { C, RISK } from '../../src/theme'
import { Btn, Face, Rate, Sk, T } from '../../src/ui/bits'

/**
 * One strategy, read-only: what it is in words, what it pays, how risky, who runs it, and yours.
 * The ticket (the web's three lines and one button) is the next step on the phone; until then
 * this says so rather than offering a button that does nothing.
 */
export default function StrategyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const L = useLiteMenu()
  const { b } = L
  const s = b.all.find((x) => x.id === id) ?? b.hidden.find((x) => x.id === id) ?? b.overflow.find((x) => x.id === id)
  const row = L.rows.find((r) => r.s.id === id)
  if (!s) {
    return (
      <View style={st.page}>
        {b.isLoading ? <><Sk w={200} h={24} /><Sk w={140} /></> : <Text style={T.dim}>This strategy is not in the catalogue right now.</Text>}
      </View>
    )
  }
  const name = row ? { title: row.title, sub: row.sub } : plainName(s)
  const spike = isSpike(s.rate, seriesFor(s, L.get, true))
  const chain = CHAINS.find((c) => c.id === s.chainId)?.label ?? s.chainId
  const mine = L.holdingsOf(s).reduce((a, h) => a + h.valueUsd, 0)
  const who = heldBy(L.proof(s))
  const facts: [string, string][] = [
    ['Risk', `${s.riskLabel}${s.riskScore ? ` · ${s.riskScore} of 5` : ''}`],
    ['What it is', trustKind(s)],
    ['Run by', brandOf(s)],
    ['On', chain],
    ['Size', usdShort(s.tvlUsd)],
  ]
  if (s.kind === 'loop') facts.splice(1, 0, ['Leverage', `${leverTag(s.tiers.balanced)} — borrows ${s.debt} against ${s.holds}`])
  return (
    <ScrollView contentContainerStyle={st.page}>
      <Stack.Screen options={{ title: name.title }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Face s={s} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={[T.h2, { fontSize: 20 }]}>{name.title}</Text>
          <Text style={T.dim}>{name.sub}</Text>
        </View>
      </View>

      <View style={st.card}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Rate s={s} get={L.get} style={{ fontSize: 36 }} />
          <Text style={T.dim70}>a year</Text>
        </View>
        {spike && <Text style={{ color: C.warn }}>Higher than this month’s usual — the list ranks by the steady rate.</Text>}
        <Text style={T.dim70}>On {usd(1000)} that is about <Text style={T.ok}>{usd(10 * s.rate)}</Text> a year, before compounding.</Text>
        {who ? <Text style={T.dim70}>{who}</Text> : null}
      </View>

      {mine >= 1 && (
        <View style={[st.card, { backgroundColor: C.okBg, borderColor: 'transparent' }]}>
          <Text style={T.body}>You have <Text style={{ fontWeight: '700' }}>{usd(mine)}</Text> in this, earning about <Text style={T.ok}>{usd(mine * s.rate / 100)}</Text> a year.</Text>
        </View>
      )}

      <View style={st.card}>
        {facts.map(([k, v]) => (
          <View key={k} style={st.fact}>
            <Text style={[T.dim, { width: 92 }]}>{k}</Text>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {k === 'Risk' && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: RISK[s.risk] }} />}
              <Text style={[T.body, { flexShrink: 1 }]}>{v}</Text>
            </View>
          </View>
        ))}
        {row && row.also > 0 && <Text style={[T.dim, { marginTop: 6 }]}>Also on {row.also} other venue{row.also === 1 ? '' : 's'} at a lower rate — Pro lists them.</Text>}
      </View>

      <Btn title="Earn this" disabled />
      <Text style={[T.dim, { textAlign: 'center' }]}>Opening a position from the phone is the next step. Until then, open it on the web — rates and rows are the same.</Text>
      <Text style={[T.dim, { fontSize: 11, textAlign: 'center' }]}>{pct(s.rate, 2)} · {s.venue} · id {s.id}</Text>
    </ScrollView>
  )
}

const st = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 48 },
  card: { backgroundColor: C.b200, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14, gap: 8 },
  fact: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
})
