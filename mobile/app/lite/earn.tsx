import React from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'
import { useLiteMenu } from '@yieldcircle/app/lite'
import { GROUPS, type Group, type GroupId } from '@yieldcircle/core/model/assets'
import { LITE_GROUPS, LITE_LIST_ROWS, LITE_NAME, safestFirst, tileRates } from '@yieldcircle/core/model/lite'
import { applyEarn } from '@yieldcircle/core/model/earnFilter'
import { chainLabel } from '@yieldcircle/app/sdk/queries'
import { useEarnFilter } from '@yieldcircle/app/earnFilter'
import { useMyFollows } from '@yieldcircle/app/social/queries'
import { EarnTools } from '../../src/ui/EarnTools'
import { pct, usd, usdShort } from '@yieldcircle/core/model/format'
import { C, alpha, mix } from '../../src/theme'
import { ChainChip } from '../../src/ui/ChainChip'
import { GroupIcon, Sk } from '../../src/ui/bits'
import { LiteRowSk, LiteRowView, rowStyles } from '../../src/ui/lite'
import { Txt } from '../../src/ui/Txt'

/** How many of the best rows Earn shows before a category is picked (the web's TOP_ROWS). */
const TOP_ROWS = 10

/**
 * Lite's Earn (the web's LiteEarn, `#/lite/earn` and `#/lite/<GROUP>`): four money tiles, and below
 * them the highest steady rates anywhere or, with a tile picked, that money's rows — deposits and
 * loops mixed, one per thing in words, the safest first (`safestFirst`). Search, sort and filters
 * over it (`EarnTools`); asked with no tile picked, they search every row, not only the best few.
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
  const top = React.useMemo(() => [...L.rows].filter((r) => r.s.risk <= 2).sort(safestFirst(L.rank)).slice(0, TOP_ROWS), [L.rows, L.rank])
  const everything = React.useMemo(() => [...L.rows].sort(safestFirst(L.rank)), [L.rows, L.rank])
  const ef = useEarnFilter('lite')
  const base = group ? L.rows.filter((r) => r.s.group === group) : ef.active ? everything : top
  const rows = ef.active ? applyEarn(base, ef.f, (r) => r.s, { extra: (r) => [r.title, r.sub, chainLabel(r.s.chainId)], rank: L.rank }) : base
  const shown = group && !all && !ef.active ? rows.slice(0, LITE_LIST_ROWS) : rows
  const f = useMyFollows(b.account)
  const isFollowed = (s: (typeof rows)[number]['s']) => { const a = L.proof(s)?.best?.account; return !!a && f.isFollowing('wallet', a) }
  const valueOf = (id: string) => b.holdings.filter((h) => L.runs(h)?.id === id).reduce((a, h) => a + h.valueUsd, 0)
  const name = group ? LITE_NAME[group] : null
  const yours = group ? b.books.filter((x) => x.group === group) : []
  const work = yours.reduce((a, x) => a + x.atWorkUsd, 0), yearly = yours.reduce((a, x) => a + x.yearlyUsd, 0), idle = yours.reduce((a, x) => a + x.idleUsd, 0)
  const qc = useQueryClient()
  const [refreshing, setRefreshing] = React.useState(false)
  const refresh = async () => { setRefreshing(true); await qc.invalidateQueries(); setRefreshing(false) }

  return (
    <ScrollView contentContainerStyle={st.page} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.tx50} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2, marginBottom: 16 }}>
        <Txt s={18} w={700} lh={26} style={[st.h1, { flex: 1, marginTop: 0, marginBottom: 0 }]}>Earn</Txt>
        <ChainChip />
      </View>
      <View style={st.tiles}>
        {groups.map((g) => {
          const gr = L.rows.filter((r) => r.s.group === g.id)
          return <Tile key={g.id} g={g} on={group === g.id} dim={!!group && group !== g.id} rates={tileRates(gr)} n={gr.length} mine={b.books.filter((x) => x.group === g.id).reduce((a, x) => a + x.totalUsd, 0)} loading={b.isLoading && !gr.length} onPress={() => setGroup(group === g.id ? null : g.id)} />
        })}
      </View>

      <View style={st.secH}>
        <Txt s={16} w={600} style={{ letterSpacing: -0.16 }}>{name ? name.name : ef.active ? 'Every way to earn' : 'Best rates, safest first'}</Txt>
        <Txt s={12.5} c={C.tx50}>{name ? name.line : ef.active ? 'across every category' : 'across every category, the riskiest left out'}</Txt>
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
      <EarnTools st={ef} n={rows.length} total={base.length} kinds />
      <View style={rowStyles.rows}>
        {b.isLoading && !rows.length ? [0, 1, 2, 3, 4].map((i) => <LiteRowSk key={i} />)
          : !rows.length && base.length ? <Txt s={13} c={C.tx50} style={{ padding: 14 }}>Nothing here matches{ef.f.q.trim() ? ` “${ef.f.q.trim()}”` : ''} with these filters. <Txt s={13} c={C.primary} onPress={ef.reset}>Reset</Txt></Txt>
          : !rows.length ? <Txt s={13} c={C.tx50} style={{ padding: 14 }}>Nothing {name ? `in ${name.name.toLowerCase()} ` : ''}clears Lite’s bar on these chains right now.</Txt>
          : shown.map((r) => <LiteRowView key={r.s.id} r={r} get={L.get} proof={L.proof(r.s)} full={!group} yoursUsd={r.yours ? valueOf(r.s.id) : undefined} followed={isFollowed(r.s)} />)}
        {rows.length > shown.length && (
          <Pressable onPress={() => setAll(true)} style={st.showAll}><Txt s={13} c={C.tx70}>Show all {rows.length} ways to earn on {name!.name.toLowerCase()}</Txt></Pressable>
        )}
      </View>
      {rows.length > 0 && <Txt s={12} c={C.tx50} lh={17} style={{ marginVertical: 14, marginHorizontal: 2 }}><Txt s={12} c={C.ok}>●</Txt> low risk  <Txt s={12} c={C.warn}>●</Txt> medium · <Txt s={12} w={700} c={C.tx70}>×</Txt> borrows to earn more. Rates are a year, before compounding. Each row is the best of its kind on the chains you use; Pro lists every venue.</Txt>}
    </ScrollView>
  )
}

/**
 * A money tile (`.ltile`): its colour bleeding in from the corner, the best deposit rate large and
 * the levered one beside it (`tileRates`) — a loop's alone only when there is nothing else; the
 * picked one ringed, the rest dimmed.
 */
function Tile({ g, on, dim, rates: { best, bestLoop }, n, mine, loading, onPress }: { g: Group; on: boolean; dim: boolean; rates: { best: number; bestLoop: number }; n: number; mine: number; loading: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[st.tileWrap, dim && { opacity: 0.55 }]}>
      {on && <View pointerEvents="none" style={[st.ring, { borderColor: alpha(g.color, 0.18) }]} />}
      <LinearGradient colors={[mix(g.color, on ? 0.28 : 0.16), C.b200]} locations={[0, on ? 0.8 : 0.72]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.tile, { borderColor: on ? alpha(g.color, 0.6) : 'transparent' }]}>
        <GroupIcon id={g.id} color={g.color} size={on ? 40 : 36} />
        <Txt s={16} w={700} style={{ marginTop: 4 }}>{LITE_NAME[g.id].name}</Txt>
        {loading ? <Sk w={90} h={22} /> : (
          <Txt s={13} c={C.tx70} lh={29}>{best > 0 ? <>up to <Txt s={20} w={700} c={C.ok} lh={29}>{pct(best)}</Txt></> : bestLoop > 0 ? <>up to <Txt s={20} w={700} c={C.warn} lh={29}>{pct(bestLoop)}</Txt></> : '—'}</Txt>
        )}
        {best > 0 && bestLoop > best && <Txt s={12} c={C.tx70}>or {pct(bestLoop, 0)} levered</Txt>}
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
