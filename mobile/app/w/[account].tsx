import React from 'react'
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type * as idx from '@yieldcircle/core/index/api'
import { boardWallets } from '@yieldcircle/core/model/lite'
import { normAddr } from '@yieldcircle/core/model/address'
import { labelFor, shortAddr } from '@yieldcircle/core/identity/name'
import { rowOfTx } from '@yieldcircle/core/model/moves'
import { ago, pct, usdShort } from '@yieldcircle/core/model/format'
import { useFeedPage, useRateLeaders, useTopEarners } from '@yieldcircle/app/index/queries'
import { useHeldPositions } from '@yieldcircle/app/board'
import { useLiteMenu } from '@yieldcircle/app/lite'
import { useNav } from '@yieldcircle/app/nav'
import { useSession } from '@yieldcircle/app/session'
import { useAccountMessages, useFollowers, useMyFollows, useProfile, useProfiles } from '@yieldcircle/app/social/queries'
import { C } from '../../src/theme'
import { Sk } from '../../src/ui/bits'
import { Character } from '../../src/ui/Character'
import { IconBack } from '../../src/ui/icons'
import { useLiteByKey, WalletPositions } from '../../src/ui/board'
import { FollowButton, Moves, ProfileWallets } from '../../src/ui/social'
import { Txt } from '../../src/ui/Txt'

/**
 * A wallet's profile (the web's `LiteProfile`, docs/lite-social-search.md §4.3): who it is, who
 * follows it — the people you follow first — one number from the board, what it runs with a Copy
 * on each, what it said and what it did lately. Every face on the phone opens it. Rates and
 * dollars a day, never a balance. Your own address is You: the index never serves the connected
 * wallet's own positions (docs/apis.md).
 */
export default function WalletPage() {
  const insets = useSafeAreaInsets()
  const nav = useNav()
  const addr = String(useLocalSearchParams<{ account: string }>().account ?? '')
  const me = normAddr(addr) ?? addr
  const { account } = useSession()
  const own = !!account && normAddr(account) === me
  React.useEffect(() => { if (own) router.replace('/you') }, [own])
  const p = useProfile(addr).data?.profile ?? null
  const name = labelFor(addr, p)
  const followers = useFollowers(addr)
  const f = useMyFollows(account)
  const mutual = (followers.data?.followers ?? []).map((x) => normAddr(x.account)).filter((a) => f.wallets.includes(a))
  const { profile } = useProfiles(mutual.slice(0, 3))
  // the board has no one-wallet read: the wallet is looked for on its rate board (ranked as Lite's
  // board ranks it), then on the dollars-a-day top 100, and ranked on the first it is on
  const byRate = useRateLeaders()
  const byDay = useTopEarners()
  const ir = boardWallets(byRate.data?.rows ?? [], 'apr').findIndex((r) => normAddr(r.account) === me)
  const id = (byDay.data?.rows ?? []).findIndex((r) => normAddr(r.account) === me)
  const find = (rows: idx.WalletEarnerRow[] | undefined) => (rows ?? []).find((r) => normAddr(r.account) === me) ?? null
  const row = find(byRate.data?.rows) ?? find(byDay.data?.rows)
  const rank = ir >= 0 ? { n: ir + 1, by: 'by rate' } : id >= 0 ? { n: id + 1, by: 'by dollars a day' } : null
  const liteByKey = useLiteByKey()
  const L = useLiteMenu()
  const feed = useFeedPage({ accounts: me }, 12)
  const moves = (feed.data?.txs ?? []).map((t) => ({ t, r: rowOfTx(t, L.rows) })).slice(0, 6)
  // what it holds now: the index's positions, as Pro lists them (the book draws few of them)
  const held = useHeldPositions(addr, liteByKey)
  const said = useAccountMessages(addr)
  const msgs = (said.data?.messages ?? []).filter((m) => !m.deleted).slice(0, 4)
  if (own) return null
  const nFollowers = followers.data?.followers.length
  // a wallet the index has drawn nothing for (docs/lite-design-review.md §3.7): one plain line, not two empty boxes
  const runsNothing = !held.isLoading && !held.open.length
  const nothingYet = runsNothing && !row && !byRate.isLoading && !byDay.isLoading && !moves.length && !msgs.length
  const lately = moves.length > 0 && <Sec title="Lately"><View style={st.card}><Moves txs={moves} hideWho /></View></Sec>
  const mutualWords = mutual.length === 1 ? labelFor(mutual[0], profile(mutual[0])).label : `${labelFor(mutual[0] ?? '', profile(mutual[0] ?? '')).label} and ${mutual.length - 1} more`
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[st.bar, { paddingTop: insets.top, height: 60 + insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={6} style={st.back} accessibilityLabel="Back"><IconBack color={C.tx70} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={[st.page, { paddingBottom: insets.bottom + 40 }]}>
        <View style={st.head}>
          <Character addr={addr} avatarUrl={p?.avatarUrl} size={64} />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt s={24} w={700} lh={30} numberOfLines={2} style={{ letterSpacing: -0.48 }}>{name.label}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {/* the share sheet is the phone's copy: the address, to paste anywhere */}
              <Pressable onPress={() => void Share.share({ message: addr }).catch(() => {})} hitSlop={6}><Txt s={13} c={C.tx50} style={{ fontVariant: ['tabular-nums'] }}>{shortAddr(addr)}</Txt></Pressable>
              {p?.xHandle && <><Txt s={13} c={C.tx40}>·</Txt><Pressable onPress={() => void Linking.openURL(`https://x.com/${p.xHandle}`)} hitSlop={6}><Txt s={13} c={C.primary}>@{p.xHandle}</Txt></Pressable></>}
            </View>
          </View>
          <FollowButton kind="wallet" target={addr} sm={false} />
        </View>
        <View style={{ gap: 10, marginTop: 10 }}>
          <ProfileWallets addr={addr} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <Txt s={14} c={C.tx70}><Txt s={14} w={700}>{nFollowers ?? '–'}</Txt> follower{nFollowers === 1 ? '' : 's'}</Txt>
            {mutual.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                <View style={{ flexDirection: 'row' }}>{mutual.slice(0, 3).map((a, i) => <View key={a} style={{ marginLeft: i ? -6 : 0 }}><Character addr={a} avatarUrl={profile(a)?.avatarUrl} size={18} /></View>)}</View>
                <Txt s={13} c={C.tx70} numberOfLines={1} style={{ flexShrink: 1 }}>followed by {mutualWords} you follow</Txt>
              </View>
            )}
          </View>
        </View>

        {nothingYet ? (
          <View style={[st.card, { marginTop: 16, padding: 16, gap: 6 }]}>
            <Txt s={16} w={600}>Nothing on record for this wallet yet</Txt>
            <Txt s={14} c={C.tx50} lh={21}>The index has drawn no position for it. A new one shows here within a few hours of opening.</Txt>
          </View>
        ) : <>
          <View style={st.stats}>
            {byRate.isLoading && byDay.isLoading ? <View style={st.stat}><Sk w={220} h={40} /></View> : row ? <>
              <Stat v={row.netAprPct != null ? pct(row.netAprPct, 1) : '–'} s="a year on all its money" ok />
              <Stat v={row.perDayUsd != null ? usdShort(row.perDayUsd) : '–'} s="a day" ok />
              <Stat v={`#${rank!.n}`} s={`on the board, ${rank!.by}`} />
            </> : <View style={st.stat}><Txt s={14} c={C.tx50}>Not in the board’s top 100 today.</Txt></View>}
          </View>
          {runsNothing && lately}
          <Sec title="What it runs">
            <View style={st.card}><WalletPositions account={addr} liteByKey={liteByKey} me={false} foot={false} /></View>
          </Sec>
        </>}

        {msgs.length > 0 && (
          <Sec title="What it said">
            <View style={st.card}>
              {msgs.map((m, i) => (
                <View key={m.id} style={[st.said, i > 0 && { borderTopWidth: 1, borderTopColor: '#1a1a1f' }]}>
                  <Txt s={14} lh={20} style={{ flex: 1, fontStyle: 'italic' }}>“{m.body}”</Txt>
                  <Txt s={12} c={C.tx50}>{ago(m.signedAt)}</Txt>
                </View>
              ))}
            </View>
          </Sec>
        )}

        {!runsNothing && lately}

        <Pressable onPress={() => nav.pro(`#/w/${addr}`)} style={{ marginTop: 24, alignItems: 'center' }}><Txt s={13} c={C.tx50}>Every number on this wallet, in Pro ›</Txt></Pressable>
      </ScrollView>
    </View>
  )
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={{ marginTop: 26 }}><Txt s={16} w={600} style={{ letterSpacing: -0.16, marginBottom: 10 }}>{title}</Txt>{children}</View>
}

/** One cell of the board's numbers (`.lite-prof-stats`). */
function Stat({ v, s, ok }: { v: string; s: string; ok?: boolean }) {
  return <View style={[st.stat, { flex: 1 }]}><Txt s={22} w={600} c={ok ? C.ok : C.tx} style={{ fontVariant: ['tabular-nums'] }}>{v}</Txt><Txt s={12} c={C.tx50} lh={16}>{s}</Txt></View>
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.86)', borderBottomWidth: 1, borderBottomColor: '#1a1a1f' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  page: { paddingHorizontal: 16, paddingTop: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  card: { backgroundColor: C.b200, borderRadius: 12, overflow: 'hidden' },
  stats: { flexDirection: 'row', gap: 1, marginTop: 16, borderRadius: 12, overflow: 'hidden', backgroundColor: C.line },
  stat: { gap: 2, paddingVertical: 14, paddingHorizontal: 14, backgroundColor: C.b200, flexGrow: 1 },
  said: { flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
})
