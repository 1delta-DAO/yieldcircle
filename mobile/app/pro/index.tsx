import React from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { useBook } from '@yieldcircle/app/book'
import { useRateHistory } from '@yieldcircle/app/sdk/queries'
import { GROUPS, type GroupId } from '@yieldcircle/core/model/assets'
import { holdingMatches } from '@yieldcircle/core/model/lite'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { C } from '../../src/theme'
import { ChainChip } from '../../src/ui/ChainChip'
import { Seg, T } from '../../src/ui/bits'
import { ProRow } from '../../src/ui/pro'
import { LiteRowSk } from '../../src/ui/lite'

/** Pro's Earn, and the page it opens on: the whole curated catalogue of one money, every venue and chain, best rate first. */
export default function ProEarn() {
  // room for the activity pill while it shows (src/ui/TabBar.tsx)
  const { bottom } = useSafeAreaInsets()
  const b = useBook()
  const get = useRateHistory(b.all, !b.isFetching)
  const [group, setGroup] = React.useState<GroupId>('USD')
  // what you hold leads (ticket 0016 §3), then the best rate
  const yoursOf = React.useCallback((s: Strategy) => b.holdings.filter((h) => holdingMatches(s, h)).reduce((a, h) => a + h.valueUsd, 0), [b.holdings])
  const rows = React.useMemo(() => b.all.filter((s) => s.group === group).sort((x, y) => Number(yoursOf(y) > 0) - Number(yoursOf(x) > 0) || y.rate - x.rate), [b.all, group, yoursOf])
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = React.useState(false)
  const refresh = async () => { setRefreshing(true); await qc.invalidateQueries(); setRefreshing(false) }
  return (
    <FlatList
      data={rows}
      keyExtractor={(s) => s.id}
      renderItem={({ item }) => <ProRow s={item} get={get} yoursUsd={yoursOf(item)} />}
      initialNumToRender={20}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.tx50} />}
      ListHeaderComponent={
        <View style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}><Seg items={GROUPS.map((g) => ({ id: g.id, word: g.id === 'USD' ? '$' : g.id === 'STOCKS' ? 'Stocks' : g.id === 'MORE' ? 'More' : g.id }))} value={group} onChange={setGroup} /></View>
            <ChainChip />
          </View>
          <Text style={T.dim}>{rows.length} ways to earn{b.isFetching ? ' · updating…' : ''} · {GROUPS.find((g) => g.id === group)?.desc}</Text>
        </View>
      }
      ListEmptyComponent={b.isLoading ? <View>{[0, 1, 2, 3, 4, 5].map((i) => <LiteRowSk key={i} />)}</View> : <Text style={[T.dim, { padding: 16 }]}>Nothing here on these chains right now.</Text>}
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={[st.list, { paddingBottom: 40 + bottom }]}
    />
  )
}

const st = StyleSheet.create({ list: { paddingBottom: 40 } })
