import React from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { useBook } from '@yieldcircle/app/book'
import { useRateHistory } from '@yieldcircle/app/sdk/queries'
import { GROUPS, type GroupId } from '@yieldcircle/core/model/assets'
import { C } from '../../src/theme'
import { Seg, T } from '../../src/ui/bits'
import { ProRow } from '../../src/ui/pro'
import { LiteRowSk } from '../../src/ui/lite'

/** Pro's Earn: the whole curated catalogue of one money, every venue and chain, best rate first. */
export default function ProEarn() {
  const b = useBook()
  const get = useRateHistory(b.all, !b.isFetching)
  const [group, setGroup] = React.useState<GroupId>('USD')
  const rows = React.useMemo(() => b.all.filter((s) => s.group === group).sort((x, y) => y.rate - x.rate), [b.all, group])
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = React.useState(false)
  const refresh = async () => { setRefreshing(true); await qc.invalidateQueries(); setRefreshing(false) }
  return (
    <FlatList
      data={rows}
      keyExtractor={(s) => s.id}
      renderItem={({ item }) => <ProRow s={item} get={get} />}
      initialNumToRender={20}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.tx50} />}
      ListHeaderComponent={
        <View style={{ padding: 16, gap: 10 }}>
          <Seg items={GROUPS.map((g) => ({ id: g.id, word: g.id === 'USD' ? '$' : g.id === 'STOCKS' ? 'Stocks' : g.id === 'MORE' ? 'More' : g.id }))} value={group} onChange={setGroup} />
          <Text style={T.dim}>{rows.length} ways to earn{b.isFetching ? ' · updating…' : ''} · {GROUPS.find((g) => g.id === group)?.desc}</Text>
        </View>
      }
      ListEmptyComponent={b.isLoading ? <View>{[0, 1, 2, 3, 4, 5].map((i) => <LiteRowSk key={i} />)}</View> : <Text style={[T.dim, { padding: 16 }]}>Nothing here on these chains right now.</Text>}
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={st.list}
    />
  )
}

const st = StyleSheet.create({ list: { paddingBottom: 40 } })
