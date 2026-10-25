import React from 'react'
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppKit, AppKitButton } from '@reown/appkit-react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Svg, { Defs, G, Line, LinearGradient, Path, Stop } from 'react-native-svg'
import * as idx from '@yieldcircle/core/index/api'
import { useDayLog, useLiteMenu } from '@yieldcircle/app/lite'
import { pnlWaiting, unsupportedLine, useAccountPnlBook } from '@yieldcircle/app/index/pnl'
import { useAccountSync } from '@yieldcircle/app/index/queries'
import { isEvmAddr, normAddr } from '@yieldcircle/core/model/address'
import { bookKeyOf } from '@yieldcircle/core/model/uid'
import { totalsOf, type Holding } from '@yieldcircle/core/model/positions'
import { boardPositions, holdingLine, liteEligible, moneyWord, pnlSummary, signedMoney, streakWord, type LiteRow } from '@yieldcircle/core/model/lite'
import { owedOf } from '@yieldcircle/core/model/borrow'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { pct, usd, usdShort } from '@yieldcircle/core/model/format'
import { setMode, useMode, type Mode } from '../src/mode'
import { C } from '../src/theme'
import { Btn, Seg, Sk, Tok } from '../src/ui/bits'
import { Character } from '../src/ui/Character'
import { BalanceChip } from '../src/ui/TopBar'
import { IconBack } from '../src/ui/icons'
import { openStrategy } from '../src/ui/lite'
import { PaperOffer } from '../src/ui/paper'
import { Txt } from '../src/ui/Txt'
import { Details } from '../src/ticket/parts'

/**
 * You (the web's LiteYou, docs/lite.md §6): what you have and what it earns, your streak, points
 * and rank, what you made, every position — each opens its own ticket — and the switch to Pro.
 */
export default function You() {
  const insets = useSafeAreaInsets()
  const L = useLiteMenu()
  const { b } = L
  const t = totalsOf(b)
  const day = useDayLog(b)
  const rank = useRank(b.paper ? undefined : b.account)
  const { open } = useAppKit()
  const mine = b.holdings.filter((h) => !h.putUp).sort((x, y) => y.valueUsd - x.valueUsd)
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[st.bar, { paddingTop: insets.top, height: 60 + insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={6} style={st.back} accessibilityLabel="Back"><IconBack color={C.tx70} /></Pressable>
        {b.account ? <Character addr={b.account} size={44} /> : <View style={{ width: 44 }} />}
        <View style={{ flex: 1 }} />
        {b.account && <BalanceChip tot={t.tot} perDay={t.yearly / 365} loading={b.positionsLoading && !b.books.length} on />}
      </View>
      <ScrollView contentContainerStyle={[st.page, { paddingBottom: insets.bottom + 40 }]}>
        <Txt s={18} w={700} lh={26} style={{ letterSpacing: -0.36, marginTop: 2, marginBottom: 16 }}>You</Txt>
        {!b.account ? (
          <View style={{ gap: 14 }}>
            <View style={st.note}><Txt s={12.5} c={C.tx50}>Connect a wallet to see what you have, your streak and your rank — or play the whole thing with paper money first.</Txt></View>
            <Btn sm title="Connect wallet" onPress={() => open()} />
            <PaperOffer />
          </View>
        ) : (
          <>
            <View style={st.stats}>
              <Stat k="You have" v={b.positionsLoading && !b.books.length ? <Sk w={80} h={20} /> : usd(t.tot)} s={t.idle >= 1 ? `${usdShort(t.idle)} idle` : 'all of it at work'} />
              <Stat k="Earning" v={<Txt s={22} w={600} c={C.ok}>+{usd(t.yearly / 365)}</Txt>} s={`a day · ${usdShort(t.yearly)} a year`} />
              <Stat k="Streak" v={`🔥 ${day.streak}`} s={day.streak ? `${streakWord(day.streak)} in a row with money at work` : 'put money to work to start one'} />
              <Stat k="Points" v={day.points.toLocaleString('en-US')} s="preview · a point a day per $100 at work" />
              {!b.paper && <Stat k="Rank ›" v={rank.rank != null ? `#${rank.rank}` : '—'} s={rank.rank != null ? `on the board · ${usdShort(rank.perDay)}/day` : 'top 100 by what they earn a day'} onPress={() => router.push('/lite/board')} />}
            </View>

            <Made account={b.account} rows={L.rows} positions={b.positionsLoading || b.isFetching ? undefined : mine.filter((h) => h.kind !== 'borrow').length} />

            <Txt s={16} w={600} style={{ letterSpacing: -0.16, marginTop: 26, marginBottom: 10 }}>Your money</Txt>
            {b.positionsError && <Txt s={12.5} c={C.bad}>Positions could not be read: {b.positionsError.message}</Txt>}
            <View style={{ gap: 6 }}>
              {b.positionsLoading && !mine.length ? [0, 1].map((i) => <View key={i} style={st.row}><Sk w={28} h={28} r={14} /><Sk w={120} /></View>)
                : !mine.length ? <Txt s={13} c={C.tx50} style={{ padding: 14 }}>Nothing at work yet.</Txt>
                : mine.map((h) => <Position key={h.key} h={h} s={L.runs(h) ?? null} account={b.account!} />)}
            </View>
            <View style={{ marginTop: 14, alignItems: 'flex-start' }}><AppKitButton /></View>
          </>
        )}
        <ModeSwitch />
      </ScrollView>
    </View>
  )
}

/** A stat card (`.lstat`). */
function Stat({ k, v, s, onPress }: { k: string; v: React.ReactNode; s: string; onPress?: () => void }) {
  const body = (
    <>
      <Txt s={12} w={600} c={C.tx50}>{k}</Txt>
      {typeof v === 'string' ? <Txt s={22} w={600} lh={32}>{v}</Txt> : v}
      <Txt s={11.5} c={C.tx50} lh={15.5}>{s}</Txt>
    </>
  )
  return onPress ? <Pressable onPress={onPress} style={st.stat}>{body}</Pressable> : <View style={st.stat}>{body}</View>
}

/** Where you rank on the wallet board — the web's `useMyStats` rank, off the same board answer. */
function useRank(account: string | undefined) {
  const board = useQuery({ enabled: !!account, queryKey: ['earners-me'], queryFn: () => idx.walletEarners({ sort: 'perDay', people: true, limit: 100 }), staleTime: 5 * 60_000, retry: false })
  const a = normAddr(account)
  const i = a ? (board.data?.rows ?? []).findIndex((r) => normAddr(r.account) === a) : -1
  return { rank: i >= 0 ? i + 1 : null, perDay: i >= 0 ? board.data!.rows[i].perDayUsd : null }
}

/** What you made (the web's `LitePnl`, real accounts): one number, one bar, one sentence, each position's own figure. */
function Made({ account, rows, positions }: { account: string; rows: LiteRow[]; positions?: number }) {
  const q = useAccountPnlBook(account, { own: true })
  const sync = useAccountSync(isEvmAddr(account) ? account : undefined)
  const qc = useQueryClient()
  React.useEffect(() => { if (sync.data) void qc.invalidateQueries({ queryKey: ['pnl-book', account.toLowerCase()] }) }, [sync.data, account, qc])
  const liteByKey = React.useMemo(() => {
    const m = new Map<string, LiteRow>()
    for (const r of rows) { const k = bookKeyOf(r.s); if (k) m.set(k.toLowerCase(), r) }
    return m
  }, [rows])
  const b = q.data
  const s = b ? pnlSummary(b) : null
  const head = <View style={{ marginTop: 26, marginBottom: 10, gap: 4 }}><Txt s={16} w={600} style={{ letterSpacing: -0.16 }}>What you made</Txt><Txt s={12.5} c={C.tx50}>since each position opened · from the index’s records</Txt></View>
  if (q.isLoading) return <>{head}<View style={st.pnl}><Sk w={160} h={34} /><Sk w={240} h={12} /></View></>
  if (!b || !b.coverage.positions) return null
  const ps = boardPositions(b, (k) => liteByKey.get(k.toLowerCase())?.title ?? null)
  const w = pnlWaiting(b)
  const notIn = [w.drawing ? `${w.drawing} drawing now` : '', w.waiting ? `${w.waiting} waiting` : '', unsupportedLine(b)].filter(Boolean)
  return (
    <>
      {head}
      <View style={st.pnl}>
        {!s ? <Txt s={13} c={C.tx50}>No record yet. {positions != null && positions > b.coverage.positions ? `${positions - b.coverage.positions} of your ${positions} the index has not read yet. ` : ''}The index draws one per position within a few hours of opening.</Txt> : <>
          <View style={{ gap: 4 }}>
            <Txt s={36} w={700} lh={38} c={s.total >= 0 ? C.ok : C.bad} style={{ letterSpacing: -0.72 }}>{signedMoney(s.total)}</Txt>
            <Txt s={12.5} c={C.tx50}>{s.aprPct != null ? `${pct(s.aprPct, 1)} a year on what was in` : ''}{s.on < s.of ? ` · on ${s.on} of ${s.of} positions` : ''}</Txt>
          </View>
          {s.split && s.yield != null && s.price != null && (
            <>
              <View style={st.bar2}>
                <Seg2 neg={s.yield < 0} color={C.ok} flex={`${Math.round(s.split.yield * 100)}%`} />
                <Seg2 neg={s.price < 0} color={C.violet} grow />
              </View>
              <View style={{ flexDirection: 'row', gap: 18 }}>
                <Txt s={12.5} c={C.tx70}><Dot c={C.ok} />  Farming <Txt s={12.5} w={700} c={s.yield >= 0 ? C.ok : C.bad}>{signedMoney(s.yield)}</Txt></Txt>
                <Txt s={12.5} c={C.tx70}><Dot c={C.violet} />  Price <Txt s={12.5} w={700} c={s.price >= 0 ? C.ok : C.bad}>{signedMoney(s.price)}</Txt></Txt>
              </View>
            </>
          )}
          <Txt s={13.5} lh={19.6}>{s.word}</Txt>
          {notIn.length > 0 && <Txt s={13.5} c={C.tx50} lh={19.6}>Not in this figure: {notIn.join(' · ')}.</Txt>}
          {b.series.length > 1 && <PnlLine pts={b.series.map((p) => p.pnl)} up={s.total >= 0} />}
          {ps.length > 0 && (
            <View style={{ borderTopWidth: 1, borderTopColor: '#1a1a1f', paddingTop: 6 }}>
              {ps.slice(0, 4).map((p) => (
                <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 }}>
                  <View style={{ flex: 1 }}>
                    <Txt s={13.5} w={700} numberOfLines={1}>{p.title}</Txt>
                    <Txt s={12} c={C.tx50} numberOfLines={1}>{p.sub}{p.equityUsd != null ? ` · ${usdShort(p.equityUsd)} in it` : ''}</Txt>
                  </View>
                  <Txt w={700} c={p.pnlUsd >= 0 ? C.ok : C.bad}>{signedMoney(p.pnlUsd)}</Txt>
                </View>
              ))}
              {ps.length > 4 && <Txt s={12} c={C.tx50} style={{ paddingVertical: 7 }}>and {ps.length - 4} more</Txt>}
            </View>
          )}
          <View style={{ marginHorizontal: -16, marginTop: -10, marginBottom: -14 }}><Details title="Every number" what="the day-by-day line, yield against price, each strategy" onOpen={() => router.push('/details')} /></View>
        </>}
      </View>
    </>
  )
}
const Dot = ({ c }: { c: string }) => <Txt s={12.5} c={c}>●</Txt>
/** One part of the farming / price bar: solid when it made money, striped red when it lost. */
function Seg2({ neg, color, flex, grow }: { neg: boolean; color: string; flex?: `${number}%`; grow?: boolean }) {
  const style = [{ height: 10, backgroundColor: neg ? 'rgba(229,83,75,0.4)' : color }, grow ? { flex: 1 } : { width: flex }]
  return (
    <View style={style}>
      {neg && <Svg width="100%" height={10}><G>{Array.from({ length: 80 }, (_, i) => <Line key={i} x1={i * 8 - 10} y1={10} x2={i * 8} y2={0} stroke={C.bad} strokeWidth={4} />)}</G></Svg>}
    </View>
  )
}
/** The day-by-day line (`.lpnl-spark`): what was made, against zero. */
function PnlLine({ pts, up }: { pts: number[]; up: boolean }) {
  const w = 600, h = 56
  const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts), span = hi - lo || 1
  const x = (i: number) => 2 + (i * (w - 4)) / Math.max(1, pts.length - 1), y = (v: number) => 3 + ((hi - v) * (h - 6)) / span
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const c = up ? C.ok : C.bad
  return (
    <Svg width="100%" height={56} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <Defs><LinearGradient id="lpnl" x1="0" x2="0" y1="0" y2="1"><Stop offset="0" stopColor={c} stopOpacity={0.22} /><Stop offset="1" stopColor={c} stopOpacity={0} /></LinearGradient></Defs>
      <Line x1={2} x2={w - 2} y1={y(0)} y2={y(0)} stroke={C.line2} strokeDasharray="3 4" />
      <Path d={`${d}L${x(pts.length - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`} fill="url(#lpnl)" />
      <Path d={d} fill="none" stroke={c} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
    </Svg>
  )
}

/** A position (the web's You `Position`): what it is, how far from the line, its value and rate — its ticket a tap away. */
function Position({ h, s, account }: { h: Holding; s: Strategy | null; account: string }) {
  const line = holdingLine(h)
  const shareable = !!s && liteEligible(s) && h.kind !== 'borrow' && !h.directional
  const open = () => {
    // a price bet (a debt in another money) and loans are Pro's on the phone for now
    if (h.directional) return router.push('/details')
    openStrategy(s ?? ({ id: '_' } as Strategy), { h: h.key })
  }
  const share = async () => {
    if (!s) return
    const word = moneyWord(h.asset, h.group)
    const url = `https://app.yieldcircle.io/#/lite/${s.group}?s=${encodeURIComponent(s.id)}&k=${s.kind}&copy=${account}`
    try { await Share.share({ message: `Earning ${pct(h.apr ?? s.rate)} on ${word.startsWith('Dollars') ? 'dollars' : word} with YieldCircle ${url}` }) } catch { /* closed */ }
  }
  return (
    <Pressable onPress={open} style={({ pressed }) => [st.row, pressed && { backgroundColor: C.b300 }]}>
      <Tok sym={h.symbol} logo={h.logo} size={28} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt s={14.5} w={600} numberOfLines={1}>{moneyWord(h.asset, h.group)}{h.kind === 'borrow' ? ' loan' : ''}</Txt>
        <Txt s={12} c={line.tone === 'bad' ? C.bad : line.tone === 'warn' ? C.warn : C.tx50} numberOfLines={1}>{h.kind === 'borrow' ? line.text.replace(/^A loan/, `owes ${usd(owedOf(h))}`) : line.text}{h.directional ? ' · managed in Pro' : ''}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Txt w={700}>{usd(h.valueUsd)}</Txt>
        {h.apr != null && <Txt s={12} c={h.apr >= 0 ? C.ok : C.bad}>{pct(h.apr)}</Txt>}
      </View>
      {shareable && <Pressable onPress={share} style={st.share}><Txt s={12.5} w={500} c={C.tx70}>Share</Txt></Pressable>}
      <Txt c={C.tx40}>›</Txt>
    </Pressable>
  )
}

/** Lite / Pro (the web's ModeSwitch): saved, and `/` opens the saved one. */
function ModeSwitch() {
  const mode = useMode()
  const choose = (m: Mode) => { setMode(m); if (router.canDismiss()) router.dismissAll(); router.replace(m === 'pro' ? '/pro' : '/lite') }
  return (
    <View style={{ alignItems: 'center', gap: 12, marginTop: 28 }}>
      <Seg items={[{ id: 'lite', word: 'Lite' }, { id: 'pro', word: 'Pro' }]} value={mode} onChange={choose} />
      <Txt s={12.5} c={C.tx50} style={{ textAlign: 'center' }}>{mode === 'lite' ? 'The best rates in plain words. Pro has every venue, chain, tier and borrowing.' : 'Every venue, chain, tier and borrowing. Lite has the best rates in plain words.'}</Txt>
      <Pressable onPress={() => router.push('/probe')}><Txt s={12} c={C.tx40}>Wallet probe ›</Txt></Pressable>
    </View>
  )
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.86)', borderBottomWidth: 1, borderBottomColor: '#1a1a1f' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  page: { paddingHorizontal: 16, paddingTop: 14 },
  note: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  stat: { width: '48.5%', flexGrow: 1, maxWidth: '48.6%', backgroundColor: C.b200, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, gap: 3 },
  pnl: { backgroundColor: C.b200, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 20, gap: 12, overflow: 'hidden' },
  bar2: { flexDirection: 'row', height: 10, borderRadius: 999, overflow: 'hidden', backgroundColor: C.b400, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: C.b200, borderRadius: 12 },
  share: { minHeight: 30, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center' },
})
