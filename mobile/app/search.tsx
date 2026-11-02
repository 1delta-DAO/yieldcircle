import React from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { router, useLocalSearchParams, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLiteMenu, useRecentPicks } from '@yieldcircle/app/lite'
import { usePeopleFind, useRateLeaders } from '@yieldcircle/app/index/queries'
import { useMyFollows, useProfiles } from '@yieldcircle/app/social/queries'
import { useNav } from '@yieldcircle/app/nav'
import { useSession } from '@yieldcircle/app/session'
import { LITE_GROUPS, LITE_NAME, boardWallets, liteFind, type LiteRow } from '@yieldcircle/core/model/lite'
import { liteHash } from '@yieldcircle/core/model/liteLinks'
import { GROUPS } from '@yieldcircle/core/model/assets'
import { NAME_CLAIM, shortAddr } from '@yieldcircle/core/identity/name'
import { normAddr } from '@yieldcircle/core/model/address'
import { pct, usdShort } from '@yieldcircle/core/model/format'
import type { FindHit } from '@yieldcircle/core/index/api'
import { C } from '../src/theme'
import { family } from '../src/fonts'
import { pathOfLink } from '../src/nav'
import { IconBack, IconSearch } from '../src/ui/icons'
import { GroupIcon, Sk } from '../src/ui/bits'
import { LiteRowView, openWallet, rowStyles } from '../src/ui/lite'
import { Character, Who } from '../src/ui/Character'
import { Txt } from '../src/ui/Txt'
import { FollowButton } from '../src/ui/social'

/**
 * Search (the web's Lite search, `#/lite/search`; docs/lite-social-search.md §4.1): things to earn
 * in Lite's words (`liteFind`) and people by name (`usePeopleFind`), nothing else. Before a word is
 * typed: recent picks, the people you follow, the best rates and the four categories. A person
 * opens their profile and is followed from the row; vaults, protocols and markets are Pro's.
 */
export default function Search() {
  const insets = useSafeAreaInsets()
  const nav = useNav()
  const p = useLocalSearchParams<{ q?: string }>()
  const [q, setQ] = React.useState(p.q ?? '')
  const { account } = useSession()
  const { recent, remember, clear } = useRecentPicks()
  const L = useLiteMenu()
  const needle = q.trim()
  const rows = React.useMemo(() => liteFind(needle, L.rows), [needle, L.rows])
  const people = usePeopleFind(needle)
  const f = useMyFollows(account)
  // the best rates, not the biggest wallets (docs/rate-boards.md), in the board's own order
  const board = useRateLeaders()
  const byAccount = React.useMemo(() => new Map((board.data?.rows ?? []).map((r) => [normAddr(r.account), r])), [board.data])
  const leaders = React.useMemo(() => boardWallets(board.data?.rows ?? [], 'apr').filter((r) => normAddr(r.account) !== normAddr(account ?? '')).slice(0, 5), [board.data, account])
  const { profile } = useProfiles([...people.hits.map((h) => h.key), ...f.wallets.slice(0, 8), ...leaders.map((r) => r.account)])
  // a pick is kept as the web's Lite address (core's `liteHash`), so the list reads the same on both apps
  const pickRow = (r: LiteRow) => remember({ id: `r:${r.s.id}`, title: r.title, href: liteHash({ to: 'strategy', s: r.s }) })
  const pickWallet = (h: FindHit) => { remember({ id: `w:${h.key}`, title: h.title, href: liteHash({ to: 'wallet', account: h.key }), addr: h.key }); openWallet(h.key) }
  const openPick = (href: string) => { const to = pathOfLink(href); if (to) router.push(to as Href) }
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
            {recent.length > 0 && (
              <Sec title="Recent" right={<Pressable onPress={clear} hitSlop={8}><Txt s={12.5} c={C.tx50}>Clear</Txt></Pressable>}>
                <View style={st.chips}>{recent.map((r) => (
                  <Pressable key={r.id} onPress={() => openPick(r.href)} style={st.chip}>
                    {r.addr && <Character addr={r.addr} avatarUrl={profile(r.addr)?.avatarUrl} size={16} />}
                    <Txt s={13} c={C.tx70} numberOfLines={1}>{r.title}</Txt>
                  </Pressable>
                ))}</View>
              </Sec>
            )}
            {f.wallets.length > 0 && (
              <Sec title="People you follow">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {f.wallets.slice(0, 8).map((a) => (
                    <Pressable key={a} onPress={() => openWallet(a)} accessibilityLabel={shortAddr(a)}><Character addr={a} avatarUrl={profile(a)?.avatarUrl} size={44} /></Pressable>
                  ))}
                </ScrollView>
              </Sec>
            )}
            <Sec title="Best rates right now" right={<Pressable onPress={() => router.push('/lite/board')} hitSlop={8}><Txt s={12.5} c={C.tx50}>Board ›</Txt></Pressable>}>
              <View style={st.card}>
                {board.isLoading ? <View style={st.person}><Sk w={200} /></View>
                  : leaders.map((r) => {
                    const day = byAccount.get(normAddr(r.account))?.perDayUsd
                    return (
                      <Pressable key={r.account} onPress={() => openWallet(r.account)} style={st.person}>
                        <View style={{ flex: 1 }}><Who account={r.account} profile={profile(r.account)} idx={{ accountLabel: r.label }} size={28} sub={`${r.positions} position${r.positions === 1 ? '' : 's'}${day != null ? ` · ${usdShort(day)} a day` : ''}`} /></View>
                        <View style={{ alignItems: 'flex-end' }}><Txt s={14} w={600} c={C.ok}>{pct(r.value, 1)}</Txt><Txt s={11} c={C.tx50}>a year</Txt></View>
                        <FollowButton kind="wallet" target={r.account} quiet />
                      </Pressable>
                    )
                  })}
              </View>
            </Sec>
            <Sec title="Earn on">
              <View style={st.chips}>{GROUPS.filter((g) => LITE_GROUPS.includes(g.id)).map((g) => (
                <Pressable key={g.id} onPress={() => nav.go({ to: 'earn', group: g.id })} style={st.chip}>
                  <GroupIcon id={g.id} color={g.color} size={16} /><Txt s={13} c={C.tx70}>{LITE_NAME[g.id]?.name ?? g.name}</Txt>
                </Pressable>
              ))}</View>
            </Sec>
          </>
        ) : (
          <>
            <Sec title="Earn">
              {rows.length ? <View style={rowStyles.rows}>{rows.map((r) => <LiteRowView key={r.s.id} r={r} get={L.get} proof={L.proof(r.s)} full onOpen={() => pickRow(r)} />)}</View>
                : <Txt s={13} c={C.tx50}>{L.rows.length ? `Nothing to earn on called “${needle}”.` : 'Reading the rates…'}</Txt>}
            </Sec>
            <Sec title="People" right={people.loading ? <Txt s={12} c={C.tx50}>looking…</Txt> : undefined}>
              {people.hits.length ? (
                <View style={st.card}>{people.hits.map((h) => {
                  // what the name rests on: a name is not an identity
                  const claim = h.match.typo ? 'did you mean' : NAME_CLAIM[h.match.source]
                  const rate = byAccount.get(normAddr(h.key))?.netAprPct
                  return (
                    <Pressable key={h.docId} onPress={() => pickWallet(h)} style={st.person}>
                      <Character addr={h.key} avatarUrl={profile(h.key)?.avatarUrl} size={28} />
                      <View style={{ flex: 1, gap: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Txt s={13.5} w={500} numberOfLines={1} style={{ flexShrink: 1 }}>{h.title}</Txt>
                          {claim && <View style={st.claim}><Txt s={10} c={C.tx50} lh={14}>{claim}</Txt></View>}
                        </View>
                        <Txt s={11} c={C.tx40}>{shortAddr(h.key)}{h.weightUsd > 0 ? ` · ${usdShort(h.weightUsd)} held` : ''}</Txt>
                      </View>
                      {rate != null && <View style={{ alignItems: 'flex-end' }}><Txt s={14} w={600} c={C.ok}>{pct(rate, rate >= 10 ? 0 : 1)}</Txt><Txt s={11} c={C.tx50}>a year</Txt></View>}
                      <FollowButton kind="wallet" target={h.key} quiet />
                    </Pressable>
                  )
                })}</View>
              ) : !people.loading && <Txt s={13} c={C.tx50}>{needle.length < 2 ? 'Type a name, an ENS or an address.' : `Nobody called “${needle}”. A wallet is also found by its address.`}</Txt>}
            </Sec>
            <Pressable onPress={() => nav.pro(`#/?q=${encodeURIComponent(needle)}`)} style={{ marginTop: 8, alignItems: 'center' }}>
              <Txt s={13} c={C.tx50}>Vaults, protocols and markets for “{needle}”, in Pro ›</Txt>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  )
}

function Sec({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10, marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><Txt s={15} w={600} style={{ flex: 1 }}>{title}</Txt>{right}</View>
      {children}
    </View>
  )
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  back: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  box: { flex: 1, height: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.b300, borderWidth: 1, borderColor: C.primary },
  input: { flex: 1, color: C.tx, fontSize: 16, fontFamily: family(400), height: '100%' },
  card: { backgroundColor: C.b200, borderRadius: 12, overflow: 'hidden' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', borderRadius: 999, borderWidth: 1, borderColor: C.line2, backgroundColor: C.b200, paddingVertical: 7, paddingHorizontal: 12 },
  claim: { borderRadius: 999, borderWidth: 1, borderColor: C.line2, paddingHorizontal: 6 },
})
