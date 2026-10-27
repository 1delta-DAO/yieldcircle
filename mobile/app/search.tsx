import React from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLiteMenu } from '@yieldcircle/app/lite'
import { usePeopleFind, useTopEarners } from '@yieldcircle/app/index/queries'
import { liteFind } from '@yieldcircle/core/model/lite'
import { normAddr } from '@yieldcircle/core/model/address'
import { pct, usdShort } from '@yieldcircle/core/model/format'
import { C } from '../src/theme'
import { IconBack, IconSearch } from '../src/ui/icons'
import { Sk } from '../src/ui/bits'
import { LiteRowView, rowStyles } from '../src/ui/lite'
import { Who } from '../src/ui/Character'
import { Txt } from '../src/ui/Txt'

/**
 * Search (the web's Lite search, `#/lite/search`; docs/lite-social-search.md §4.1): things to earn
 * in Lite's words (`liteFind`) and people by name (`usePeopleFind`) — the top earners before a word
 * is typed. A person opens their wallet page; Follow waits for the social layer here (docs/mobile.md).
 */
export default function Search() {
  const insets = useSafeAreaInsets()
  const [q, setQ] = React.useState('')
  const L = useLiteMenu()
  const needle = q.trim()
  const rows = React.useMemo(() => liteFind(needle, L.rows), [needle, L.rows])
  const people = usePeopleFind(needle)
  const board = useTopEarners()
  const openWallet = (a: string) => router.push({ pathname: '/w/[account]', params: { account: a } })
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <View style={st.bar}>
        <Pressable onPress={() => router.back()} hitSlop={8} style={st.back} accessibilityLabel="Back"><IconBack color={C.tx70} /></Pressable>
        <View style={st.box}>
          <IconSearch color={C.tx40} size={16} />
          <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Search dollars, ETH, people…" placeholderTextColor={C.tx40} autoCapitalize="none" autoCorrect={false} style={st.input} returnKeyType="search" />
          {q ? <Pressable onPress={() => setQ('')} hitSlop={8}><Txt s={18} c={C.tx50}>×</Txt></Pressable> : null}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 + insets.bottom, gap: 10 }} keyboardShouldPersistTaps="handled">
        {!needle ? (
          <>
            <Txt s={15} w={600}>Top earners this week</Txt>
            <View style={st.card}>
              {board.isLoading ? <View style={st.person}><Sk w={200} /></View>
                : (board.data?.rows ?? []).slice(0, 8).map((r) => (
                  <Pressable key={r.account} onPress={() => openWallet(r.account)} style={st.person}>
                    <View style={{ flex: 1 }}><Who account={r.account} size={28} sub={r.perDayUsd != null ? `${usdShort(r.perDayUsd)} a day` : undefined} /></View>
                    {r.netAprPct != null && <Txt s={14} w={600} c={C.ok}>{pct(r.netAprPct, 1)}</Txt>}
                  </Pressable>
                ))}
            </View>
          </>
        ) : (
          <>
            <Txt s={15} w={600}>Earn</Txt>
            {rows.length ? <View style={rowStyles.rows}>{rows.map((r) => <LiteRowView key={r.s.id} r={r} get={L.get} proof={L.proof(r.s)} />)}</View>
              : <Txt s={13} c={C.tx50}>{L.rows.length ? `Nothing to earn on called “${needle}”.` : 'Reading the rates…'}</Txt>}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 12 }}>
              <Txt s={15} w={600} style={{ flex: 1 }}>People</Txt>
              {people.loading && <Txt s={12} c={C.tx50}>looking…</Txt>}
            </View>
            {people.hits.length ? (
              <View style={st.card}>{people.hits.map((h) => (
                <Pressable key={h.docId} onPress={() => openWallet(h.key)} style={st.person}>
                  <View style={{ flex: 1 }}><Who account={h.key} profile={{ displayName: h.title }} size={28} sub={h.weightUsd > 0 ? `${usdShort(h.weightUsd)} held` : undefined} /></View>
                  {(() => { const r = board.data?.rows.find((x) => normAddr(x.account) === normAddr(h.key)); return r?.netAprPct != null ? <Txt s={14} w={600} c={C.ok}>{pct(r.netAprPct, 1)}</Txt> : null })()}
                </Pressable>
              ))}</View>
            ) : !people.loading && <Txt s={13} c={C.tx50}>{needle.length < 2 ? 'Type a name, an ENS or an address.' : `Nobody called “${needle}”.`}</Txt>}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  back: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  box: { flex: 1, height: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.b300, borderWidth: 1, borderColor: C.primary },
  input: { flex: 1, color: C.tx, fontSize: 16, height: '100%' },
  card: { backgroundColor: C.b200, borderRadius: 12, overflow: 'hidden' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
})
