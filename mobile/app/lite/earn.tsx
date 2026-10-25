import React from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { useLiteMenu } from '@yieldcircle/app/lite'
import { GROUPS, type GroupId } from '@yieldcircle/core/model/assets'
import { LITE_GROUPS, LITE_LIST_ROWS, LITE_NAME } from '@yieldcircle/core/model/lite'
import { pct, usd, usdShort } from '@yieldcircle/core/model/format'
import { C } from '../../src/theme'
import { GroupIcon, Sk, T } from '../../src/ui/bits'
import { LiteRowSk, LiteRowView } from '../../src/ui/lite'

/** How many of the best rows Earn shows before a category is picked (the web's TOP_ROWS). */
const TOP_ROWS = 10

/**
 * Lite's Earn (docs/lite.md §1, §4; the web's LiteEarn): four money tiles, and below them the
 * highest steady rates anywhere or, with a tile picked, that money's rows — deposits and loops
 * mixed, one per thing in words, the safest first.
 */
export default function LiteEarn() {
  const L = useLiteMenu()
  const { b } = L
  const [group, setGroup] = React.useState<GroupId | null>(null)
  const [all, setAll] = React.useState(false)
  React.useEffect(() => setAll(false), [group])
  const groups = GROUPS.filter((g) => LITE_GROUPS.includes(g.id))
  const top = React.useMemo(() => [...L.rows].filter((r) => r.s.risk <= 2).sort((x, y) => L.rank(y.s) - L.rank(x.s)).slice(0, TOP_ROWS), [L.rows, L.rank])
  const rows = group ? L.rows.filter((r) => r.s.group === group) : top
  const shown = group && !all ? rows.slice(0, LITE_LIST_ROWS) : rows
  const valueOf = (id: string) => b.holdings.filter((h) => L.runs(h)?.id === id).reduce((a, h) => a + h.valueUsd, 0)
  const name = group ? LITE_NAME[group] : null
  const yours = group ? b.books.filter((x) => x.group === group) : []
  const work = yours.reduce((a, x) => a + x.atWorkUsd, 0), yearly = yours.reduce((a, x) => a + x.yearlyUsd, 0), idle = yours.reduce((a, x) => a + x.idleUsd, 0)
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = React.useState(false)
  const refresh = async () => { setRefreshing(true); await qc.invalidateQueries(); setRefreshing(false) }

  return (
    <ScrollView contentContainerStyle={st.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.tx50} />}>
      <View style={st.tiles}>
        {groups.map((g) => {
          const gr = L.rows.filter((r) => r.s.group === g.id)
          const best = gr.reduce((m, r) => Math.max(m, r.s.rate), 0)
          const mine = b.books.filter((x) => x.group === g.id).reduce((a, x) => a + x.totalUsd, 0)
          const on = group === g.id
          return (
            <Pressable key={g.id} onPress={() => setGroup(on ? null : g.id)} style={[st.tile, on && { borderColor: g.color, backgroundColor: `${g.color}14` }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <GroupIcon id={g.id} color={g.color} size={26} />
                <Text style={{ color: C.tx, fontWeight: '700', fontSize: 16 }}>{LITE_NAME[g.id].name}</Text>
              </View>
              {b.isLoading && !gr.length ? <Sk w={70} h={16} /> : <Text style={T.dim70}>{best > 0 ? <>up to <Text style={T.ok}>{pct(best)}</Text></> : '—'}</Text>}
              <Text style={[T.dim, { fontSize: 12 }]}>{mine >= 1 ? `you have ${usdShort(mine)}` : `${gr.length} way${gr.length === 1 ? '' : 's'} to earn`}</Text>
            </Pressable>
          )
        })}
      </View>

      <View style={{ gap: 4 }}>
        <Text style={T.h2}>{name ? name.name : 'Highest steady rates'}</Text>
        <Text style={T.dim}>{name ? name.line : 'across every category, the riskiest left out'}</Text>
      </View>
      {group && (work >= 1 || idle >= 1) && (
        <View style={st.note}>
          <Text style={T.body}>
            {work >= 1 ? <>Your {usd(work)} here earns about <Text style={T.ok}>{usd(yearly)}</Text> a year. </> : null}
            {idle >= 1 ? <>{usd(idle)} sits idle{rows[0] ? <> — the top row would pay <Text style={T.ok}>{pct(rows[0].s.rate)}</Text></> : null}.</> : null}
          </Text>
        </View>
      )}
      <View style={st.list}>
        {b.isLoading && !rows.length ? [0, 1, 2, 3, 4].map((i) => <LiteRowSk key={i} />)
          : !rows.length ? <Text style={[T.dim, { padding: 16 }]}>Nothing {name ? `in ${name.name.toLowerCase()} ` : ''}clears Lite’s bar right now. Pro lists everything.</Text>
          : shown.map((r) => <LiteRowView key={r.s.id} r={r} get={L.get} proof={L.proof(r.s)} yoursUsd={r.yours ? valueOf(r.s.id) : undefined} />)}
        {rows.length > shown.length && (
          <Pressable onPress={() => setAll(true)} style={{ padding: 14, alignItems: 'center' }}>
            <Text style={{ color: C.primary, fontWeight: '600' }}>Show all {rows.length} ways to earn on {name!.name.toLowerCase()}</Text>
          </Pressable>
        )}
      </View>
      {rows.length > 0 && <Text style={[T.dim, { fontSize: 12 }]}>Rates are a year, before compounding. Each row is the best of its kind on the chains you use; Pro lists every venue.</Text>}
    </ScrollView>
  )
}

const st = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 40 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', flexGrow: 1, backgroundColor: C.b200, borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 12, gap: 6 },
  note: { backgroundColor: C.okBg, borderRadius: 12, padding: 12 },
  list: { backgroundColor: C.b200, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
})
