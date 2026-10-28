import React from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
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
import { Btn, Seg, Sk } from '../../src/ui/bits'
import { LiteCard, LiteCardSk } from '../../src/ui/cards'
import { openStrategy } from '../../src/ui/lite'
import { PaperOffer } from '../../src/ui/paper'
import { Txt } from '../../src/ui/Txt'
import { IconFlame } from '../../src/ui/icons'

/**
 * Lite's home (the web's LiteHome, docs/lite.md §1): your balance and what it earns a day, then
 * cards through three lenses — proven, trending, most held — each with the wallet that runs it
 * best. No wallet yet: what it is, Connect, and the paper bank to play the whole thing with.
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
  const empty = !!b.account && !b.paper && !b.positionsLoading && t.tot < 5
  const { open } = useAppKit()
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = React.useState(false)
  const refresh = async () => { setRefreshing(true); await qc.invalidateQueries(); setRefreshing(false) }

  return (
    <ScrollView contentContainerStyle={st.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.tx50} />}>
      <View style={st.hero}>
        {b.account ? (
          <>
            {b.positionsLoading && !b.books.length ? <Sk w={160} h={40} /> : <Txt s={40} w={700} lh={46} style={{ letterSpacing: -0.8, fontVariant: ['tabular-nums'] }}>{usd(t.tot)}</Txt>}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {b.positionsLoading && !b.books.length ? <Sk w={120} h={16} /> : t.yearly > 0 ? <Txt s={15} c={C.tx70}><Txt s={15} w={600} c={C.ok}>+{usd(t.yearly / 365)}</Txt> a day</Txt> : <Txt s={15} c={C.tx70}>nothing earning yet</Txt>}
              {day.streak > 0 && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><IconFlame color={C.warn} /><Txt s={14} w={600} c={C.warn}>{day.streak} days</Txt></View>}
            </View>
          </>
        ) : (
          <>
            <Txt s={32} w={700} lh={35.84} style={{ letterSpacing: -0.64 }}>Make your money work.</Txt>
            <Txt s={15} c={C.tx70} lh={22.5} style={{ marginVertical: 15 }}>The best rates on dollars, ether and bitcoin, in plain words. Copy what real wallets do, in one tap.</Txt>
            <Btn sm title="Connect wallet" onPress={() => open()} />
          </>
        )}
        {(!b.account || empty) && <View style={{ marginTop: 14 }}><PaperOffer empty={!!b.account} /></View>}
        {idleBook && idleTo && (
          <Pressable onPress={() => openStrategy(idleTo.s)} style={st.idle}>
            <Txt s={13} c={C.tx70} style={{ flex: 1 }}>
              <Txt s={13} w={700}>{usdShort(idleBook.idleUsd)}</Txt> sits idle. {idleTo.title} pays <Txt s={13} w={600} c={C.ok}>{pct(idleTo.s.rate)}</Txt>
              {idleTo.s.kind === 'loop' ? ` ${leverTag(idleTo.s.tiers.balanced)}` : ''}: about <Txt s={13} w={600} c={C.ok}>{usdShort(idleBook.idleUsd * idleTo.s.rate / 100)}</Txt> a year.
            </Txt>
            <Btn sm title="Put it to work" onPress={() => openStrategy(idleTo.s)} />
          </Pressable>
        )}
      </View>

      <View style={{ marginBottom: 4 }}><Seg items={LENSES.map((x) => ({ id: x.id, word: x.word }))} value={lens} onChange={setLens} /></View>
      <Txt s={12.5} c={C.tx50} style={{ marginTop: 6, marginBottom: 12 }}>{LENSES.find((x) => x.id === lens)!.why}</Txt>
      <View style={{ gap: 12 }}>
        {loading ? [0, 1, 2].map((i) => <LiteCardSk key={i} />)
          : !cards.length ? <Txt s={13} c={C.tx50} style={{ padding: 14 }}>Nothing here on these chains right now.</Txt>
          : cards.map((r) => <LiteCard key={r.s.id} r={r} get={L.get} proof={L.proof(r.s)} />)}
      </View>

      <Pressable onPress={() => router.push('/lite/earn')} style={{ marginTop: 22, marginBottom: 8 }}><Txt s={13} c={C.tx50}>Every category ›</Txt></Pressable>
    </ScrollView>
  )
}

const st = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40 },
  hero: { marginTop: 14, marginBottom: 22 },
  idle: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
})
