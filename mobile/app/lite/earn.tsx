import React from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { useLiteMenu } from '@yieldcircle/app/lite'
import { GROUPS, type Group, type GroupId } from '@yieldcircle/core/model/assets'
import { LITE_GROUPS, LITE_LIST_ROWS, LITE_NAME } from '@yieldcircle/core/model/lite'
import { pct, usd, usdShort } from '@yieldcircle/core/model/format'
import { C, alpha, mix } from '../../src/theme'
import { GroupIcon, Sk } from '../../src/ui/bits'
import { LiteRowSk, LiteRowView, rowStyles } from '../../src/ui/lite'
import { Txt } from '../../src/ui/Txt'

/** How many of the best rows Earn shows before a category is picked (the web's TOP_ROWS). */
const TOP_ROWS = 10

/**
 * Lite's Earn (the web's LiteEarn, `#/lite/earn` and `#/lite/<GROUP>`): four money tiles, and below
 * them the highest steady rates anywhere or, with a tile picked, that money's rows — deposits and
 * loops mixed, one per thing in words, the safest first.
 */
export default function LiteEarn() {
  const L = useLiteMenu()
  const { b } = L
  // a link's category (`?g=USD`, core's route map), else every category
  const { g } = useLocalSearchParams<{ g?: string }>()
  const [group, setGroup] = React.useState<GroupId | null>(g && LITE_GROUPS.includes(g as GroupId) ? (g as GroupId) : null)
  React.useEffect(() => { if (g && LITE_GROUPS.includes(g as GroupId)) setGroup(g as GroupId) }, [g])
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
      <Txt s={18} w={700} lh={26} style={st.h1}>Earn</Txt>
      <View style={st.tiles}>
        {groups.map((g) => {
          const gr = L.rows.filter((r) => r.s.group === g.id)
          return <Tile key={g.id} g={g} on={group === g.id} dim={!!group && group !== g.id} best={gr.reduce((m, r) => Math.max(m, r.s.rate), 0)} n={gr.length} mine={b.books.filter((x) => x.group === g.id).reduce((a, x) => a + x.totalUsd, 0)} loading={b.isLoading && !gr.length} onPress={() => setGroup(group === g.id ? null : g.id)} />
        })}
      </View>

      <View style={st.secH}>
        <Txt s={16} w={600} style={{ letterSpacing: -0.16 }}>{name ? name.name : 'Highest steady rates'}</Txt>
        <Txt s={12.5} c={C.tx50}>{name ? name.line : 'across every category, the riskiest left out'}</Txt>
        {group && <Pressable onPress={() => setGroup(null)} style={{ alignSelf: 'flex-end' }}><Txt s={12.5} c={C.primary}>every category ›</Txt></Pressable>}
      </View>
      {group && (work >= 1 || idle >= 1) && (
        <View style={st.note}>
          <Txt s={12.5} c={C.tx50}>
            {work >= 1 ? <>Your {usd(work)} here earns about <Txt s={12.5} w={600} c={C.ok}>{usd(yearly)}</Txt> a year{work ? ` (${pct(yearly / work * 100, 1)})` : ''}.</> : null}
            {idle >= 1 ? <> {usd(idle)} sits idle{rows[0] ? <> — the top row would pay <Txt s={12.5} w={600} c={C.ok}>{pct(rows[0].s.rate)}</Txt></> : null}.</> : null}
          </Txt>
        </View>
      )}
      <View style={rowStyles.rows}>
        {b.isLoading && !rows.length ? [0, 1, 2, 3, 4].map((i) => <LiteRowSk key={i} />)
          : !rows.length ? <Txt s={13} c={C.tx50} style={{ padding: 14 }}>Nothing {name ? `in ${name.name.toLowerCase()} ` : ''}clears Lite’s bar on these chains right now.</Txt>
          : shown.map((r) => <LiteRowView key={r.s.id} r={r} get={L.get} proof={L.proof(r.s)} full={!group} yoursUsd={r.yours ? valueOf(r.s.id) : undefined} />)}
        {rows.length > shown.length && (
          <Pressable onPress={() => setAll(true)} style={st.showAll}><Txt s={13} c={C.tx70}>Show all {rows.length} ways to earn on {name!.name.toLowerCase()}</Txt></Pressable>
        )}
      </View>
      {rows.length > 0 && <Txt s={12} c={C.tx50} style={{ marginVertical: 14, marginHorizontal: 2 }}>Rates are a year, before compounding. Each row is the best of its kind on the chains you use; Pro lists every venue.</Txt>}
    </ScrollView>
  )
}

/** A money tile (`.ltile`): its colour bleeding in from the corner, the best rate large; the picked one ringed, the rest dimmed. */
function Tile({ g, on, dim, best, n, mine, loading, onPress }: { g: Group; on: boolean; dim: boolean; best: number; n: number; mine: number; loading: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[st.tileWrap, dim && { opacity: 0.55 }]}>
      {on && <View pointerEvents="none" style={[st.ring, { borderColor: alpha(g.color, 0.18) }]} />}
      <LinearGradient colors={[mix(g.color, on ? 0.28 : 0.16), C.b200]} locations={[0, on ? 0.8 : 0.72]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.tile, { borderColor: on ? alpha(g.color, 0.6) : 'transparent' }]}>
        <GroupIcon id={g.id} color={g.color} size={on ? 40 : 36} />
        <Txt s={16} w={700} style={{ marginTop: 4 }}>{LITE_NAME[g.id].name}</Txt>
        {loading ? <Sk w={90} h={22} /> : (
          <Txt s={13} c={C.tx70} lh={29}>{best > 0 ? <>up to <Txt s={20} w={700} c={C.ok} lh={29}>{pct(best)}</Txt></> : '—'}</Txt>
        )}
        <Txt s={12} c={C.tx50}>{mine >= 1 ? `you have ${usdShort(mine)}` : `${n} way${n === 1 ? '' : 's'} to earn`}</Txt>
      </LinearGradient>
    </Pressable>
  )
}

const st = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  h1: { letterSpacing: -0.36, marginTop: 2, marginBottom: 16 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tileWrap: { width: '48.3%', flexGrow: 1 },
  tile: { borderRadius: 18, borderWidth: 1, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 16, gap: 6 },
  ring: { position: 'absolute', top: -3, left: -3, right: -3, bottom: -3, borderRadius: 21, borderWidth: 3 },
  secH: { marginTop: 26, marginBottom: 10, gap: 10 },
  note: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 10 },
  showAll: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
})
