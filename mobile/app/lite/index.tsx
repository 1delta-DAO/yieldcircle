import React from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useAppKit } from '@reown/appkit-react-native'
import { useQueryClient } from '@tanstack/react-query'
import { LENSES, liteCards, useDayLog, useLiteMenu, type Lens } from '@yieldcircle/app/lite'
import { useTrending } from '@yieldcircle/app/index/queries'
import { useSession } from '@yieldcircle/app/session'
import { totalsOf } from '@yieldcircle/core/model/positions'
import { leverTag } from '@yieldcircle/core/model/lite'
import { pct, usd, usdShort } from '@yieldcircle/core/model/format'
import { C } from '../../src/theme'
import { Btn, Seg, Sk, T } from '../../src/ui/bits'
import { LiteCard, LiteCardSk, openStrategy } from '../../src/ui/lite'

/**
 * Lite's home (docs/lite.md §1, the web's LiteHome): your balance and what it earns a day, then
 * cards through three lenses — proven, trending, most held. No wallet yet: what it is, and Connect.
 */
export default function LiteHome() {
  const { chainIds } = useSession()
  const L = useLiteMenu()
  const { b } = L
  const t = totalsOf(b)
  const day = useDayLog(b)
  const [lens, setLens] = React.useState<Lens>('proven')
  const trending = useTrending('7d', chainIds)
  const cards = React.useMemo(() => liteCards(lens, L.rows, L, trending.markets), [lens, L.rows, trending.markets, L.proofsHeld]) // eslint-disable-line react-hooks/exhaustive-deps
  const loading = (b.isLoading && !L.rows.length) || (lens === 'trending' && trending.isLoading)
  const idleBook = [...b.books].filter((x) => x.idleUsd >= 1).sort((x, y) => y.idleUsd - x.idleUsd)[0]
  const idleTo = idleBook ? L.rows.find((r) => r.s.group === idleBook.group && r.s.risk <= 2) : undefined
  const { open } = useAppKit()
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = React.useState(false)
  const refresh = async () => { setRefreshing(true); await qc.invalidateQueries(); setRefreshing(false) }

  return (
    <ScrollView contentContainerStyle={st.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.tx50} />}>
      <View style={st.hero}>
        {b.account ? (
          <>
            {b.positionsLoading && !b.books.length ? <Sk w={160} h={40} /> : <Text style={st.bal}>{usd(t.tot)}</Text>}
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              {t.yearly > 0 ? <Text style={T.body}><Text style={T.ok}>+{usd(t.yearly / 365)}</Text> a day</Text> : <Text style={T.dim}>nothing earning yet</Text>}
              {day.streak > 0 && <Text style={T.body}>🔥 {day.streak}</Text>}
            </View>
          </>
        ) : (
          <>
            <Text style={T.h1}>Make your money work.</Text>
            <Text style={[T.dim70, { fontSize: 15 }]}>The best rates on dollars, ether and bitcoin, in plain words. See what real wallets do.</Text>
            <View style={{ marginTop: 8 }}><Btn title="Connect a wallet" onPress={() => open()} /></View>
          </>
        )}
        {idleBook && idleTo && (
          <Pressable onPress={() => openStrategy(idleTo.s)} style={st.note}>
            <Text style={T.body}>
              <Text style={{ fontWeight: '700' }}>{usdShort(idleBook.idleUsd)}</Text> sits idle. {idleTo.title} pays <Text style={T.ok}>{pct(idleTo.s.rate)}</Text>
              {idleTo.s.kind === 'loop' ? ` ${leverTag(idleTo.s.tiers.balanced)}` : ''}: about <Text style={T.ok}>{usdShort(idleBook.idleUsd * idleTo.s.rate / 100)}</Text> a year.
            </Text>
          </Pressable>
        )}
      </View>

      <Seg items={LENSES.map((x) => ({ id: x.id, word: x.word }))} value={lens} onChange={setLens} />
      <Text style={T.dim}>{LENSES.find((x) => x.id === lens)!.why}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 16 }} style={{ marginHorizontal: -16, paddingLeft: 16 }}>
        {loading ? [0, 1, 2].map((i) => <LiteCardSk key={i} />)
          : !cards.length ? <Text style={[T.dim, { paddingVertical: 20 }]}>Nothing here right now.</Text>
          : cards.map((r) => <LiteCard key={r.s.id} r={r} get={L.get} proof={L.proof(r.s)} />)}
      </ScrollView>

      <Pressable onPress={() => router.push('/lite/earn')}><Text style={{ color: C.primary, fontWeight: '600' }}>Every category ›</Text></Pressable>
    </ScrollView>
  )
}

const st = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 40 },
  hero: { gap: 8, paddingVertical: 6 },
  bal: { color: C.tx, fontSize: 40, fontWeight: '800', fontVariant: ['tabular-nums'] },
  note: { marginTop: 6, backgroundColor: C.okBg, borderRadius: 12, padding: 12 },
})
