import React from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppKit } from '@reown/appkit-react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Svg, { Defs, G, Line, LinearGradient, Path, Stop } from 'react-native-svg'
import * as idx from '@yieldcircle/core/index/api'
import { useDayLog, useLiteMenu } from '@yieldcircle/app/lite'
import { pnlNotReadYet } from '@yieldcircle/core/model/holdingPnl'
import { pnlWaiting, unsupportedLine, useAccountsPnlBook, useHoldingPnl } from '@yieldcircle/app/index/pnl'
import { useAccountSync } from '@yieldcircle/app/index/queries'
import { isSolAddr, normAddr } from '@yieldcircle/core/model/address'
import { totalsOf, type Holding } from '@yieldcircle/core/model/positions'
import { holdingRow, holdingTitle, pnlSummary, signedMoney, streakWord, type BoardPosition, type PnlSummary } from '@yieldcircle/core/model/lite'
import { owedOf } from '@yieldcircle/core/model/borrow'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import type { Accounts } from '@yieldcircle/app/book'
import { pct, usd, usdShort } from '@yieldcircle/core/model/format'
import { useNav } from '@yieldcircle/app/nav'
import { useClosedRecord, useBoardNames } from '@yieldcircle/app/board'
import { useChains } from '../src/chains'
import { C } from '../src/theme'
import { ChainChip } from '../src/ui/ChainChip'
import { Btn, Sk, Tok } from '../src/ui/bits'
import { Character } from '../src/ui/Character'
import { BalanceChip } from '../src/ui/TopBar'
import { IconBack, IconFlame } from '../src/ui/icons'
import { openStrategy } from '../src/ui/lite'
import { PAPER, PaperNotice, PaperOffer, paperStatusWord } from '../src/ui/paper'
import { usePaperDaily } from '@yieldcircle/app/social/queries'
import { usePaper } from '../src/paper'
import { paperPnlBook } from '@yieldcircle/core/model/paperView'
import { Txt } from '../src/ui/Txt'
import { Details } from '../src/ticket/parts'
import { LinkedWallets, LiteMoves, PendingChanges } from '../src/ui/social'
import { useProfile } from '@yieldcircle/app/social/queries'
import { useSocialWrite } from '@yieldcircle/app/social/sign'

/**
 * You (the web's LiteYou, docs/lite.md §6; docs/you-unified.md): your streak and rank, one card
 * with what you have beside what you made, then ONE row per position — its value, what it made and
 * what it earns a day, each opening its own ticket — the closed ones folded under them, and what
 * the people you follow did. The card totals and the rows itemise: no position is listed twice.
 * Your profile, wallets and settings are behind the face (`profile.tsx`).
 */
export default function You() {
  const insets = useSafeAreaInsets()
  const L = useLiteMenu()
  const { b } = L
  const t = totalsOf(b)
  const day = useDayLog(b)
  const rank = useRank(b.paper ? undefined : b.account)
  const { open } = useAppKit()
  const p = useProfile(b.account).data?.profile ?? null
  const mine = b.holdings.filter((h) => !h.putUp).sort((x, y) => y.valueUsd - x.valueUsd)
  // a paper position's figure is the paper ledger's (the index never holds one): keyed as its holding is
  const paper = usePaper()
  const paperMade = React.useMemo(() => new Map<string, number>(b.paper && paper.ledger ? paperPnlBook(paper.ledger, paper.viewNow, paper.price).positions.map((x) => [`paper:${x.key}`, x.pnlUsd] as const) : []), [b.paper, paper.ledger, paper.viewNow, paper.price])
  const perDay = t.yearly / 365
  const have = (
    <View style={{ flex: 1, gap: 3 }}>
      <Txt s={12} w={600} c={C.tx50}>You have</Txt>
      {b.positionsLoading && !b.books.length ? <Sk w={110} h={26} /> : <Txt s={26} w={700} lh={32} style={{ letterSpacing: -0.52 }}>{usd(t.tot)}</Txt>}
      <Txt s={12} c={C.tx50} lh={16}>{signedMoney(perDay)} a day{t.idle >= 1 ? ` · ${usdShort(t.idle)} idle` : ''}</Txt>
    </View>
  )
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[st.bar, { paddingTop: insets.top, height: 60 + insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={6} style={st.back} accessibilityLabel="Back"><IconBack color={C.tx70} /></Pressable>
        {b.account ? <Pressable onPress={() => router.push('/profile')} accessibilityLabel="Profile and settings"><Character addr={b.account} avatarUrl={p?.avatarUrl} size={44} /></Pressable> : <View style={{ width: 44 }} />}
        <View style={{ flex: 1 }} />
        {b.account && <BalanceChip tot={t.tot} perDay={t.yearly / 365} loading={b.positionsLoading && !b.books.length} on />}
      </View>
      <ScrollView contentContainerStyle={[st.page, { paddingBottom: insets.bottom + 40 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, marginBottom: 16 }}>
          <Txt s={18} w={700} lh={26} style={{ letterSpacing: -0.36 }}>You</Txt>
          {b.paper && <PaperPill />}
          <View style={{ flex: 1 }} />
          <ChainChip />
        </View>
        {!b.account ? (
          <View style={{ gap: 14 }}>
            <View style={st.note}><Txt s={12.5} c={C.tx50}>Connect a wallet to see what you have, your streak and your rank — or play the whole thing with paper money first.</Txt></View>
            <Btn sm title="Connect wallet" onPress={() => open()} />
            <PaperOffer lite />
          </View>
        ) : (
          <>
            <View style={st.stats}>
              <Stat k="Streak" v={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><IconFlame color={C.warn} size={18} /><Txt s={22} w={600}>{day.streak}</Txt></View>} s={day.streak ? `${streakWord(day.streak)} in a row with money at work` : 'put money to work to start one'} wide={b.paper} />
              {!b.paper && <Stat k="Rank ›" v={rank.rank != null ? `#${rank.rank}` : '—'} s={rank.rank != null ? `on the board · ${usdShort(rank.perDay)}/day` : 'top 100 by what they earn a day'} onPress={() => router.push('/lite/board')} />}
            </View>

            {b.paper ? <PaperMade account={b.account} have={have} /> : <Made account={b.account} accounts={b.accounts} have={have} positions={b.positionsLoading || b.isFetching ? undefined : mine.filter((h) => h.kind !== 'borrow').length} />}

            <Txt s={16} w={600} style={{ letterSpacing: -0.16, marginTop: 26, marginBottom: 10 }}>Positions</Txt>
            {b.positionsError && <Txt s={12.5} c={C.bad}>Positions could not be read: {b.positionsError.message}</Txt>}
            <View style={{ gap: 6 }}>
              {b.positionsLoading && !mine.length ? [0, 1].map((i) => <View key={i} style={st.row}><Sk w={28} h={28} r={14} /><Sk w={120} /></View>)
                : !mine.length ? <Txt s={13} c={C.tx50} style={{ padding: 14 }}>Nothing at work yet.</Txt>
                : mine.map((h) => <Position key={h.key} h={h} s={L.runs(h) ?? null} made={paperMade.get(h.key)} />)}
            </View>
            {!b.paper && <Closed account={b.accounts.evm} />}
            <LiteMoves rows={L.rows} account={b.account} limit={12} title="What the people you follow did" followingOnly />
          </>
        )}
      </ScrollView>
    </View>
  )
}

const unreadWallet = (a: string) => `your ${isSolAddr(a) ? 'Solana' : 'EVM'} wallet’s record (the index did not answer just now)`

const PaperPill = () => <View style={st.paperPill}><Txt s={11} w={600} c={PAPER.fg} lh={16.5}>paper</Txt></View>

/**
 * What you made on paper (the web's `PaperMade`): the same figure, farming / price split and
 * sentence as the real one, off the paper ledger (`paperPnlBook`) — nothing waits to be drawn —
 * plus what went on fees, swaps and bridges, the return on what was put in, the server's daily line,
 * and "Every number" (`/paper-book`: the bank, what is at work, what it cost).
 */
function PaperMade({ account, have }: { account: string; have: React.ReactNode }) {
  const paper = usePaper()
  const daily = usePaperDaily(account, 90)
  // accrual moves the figure by the second: re-folded twice a minute
  const [, tick] = React.useReducer((x: number) => x + 1, 0)
  React.useEffect(() => { const t = setInterval(tick, 30_000); return () => clearInterval(t) }, [])
  const l = paper.ledger, b = paper.book
  if (!l || !b) return <View style={[st.pnl, st.pnlTop]}>{have}</View>
  const pb = paperPnlBook(l, paper.viewNow, paper.price)
  const s = pnlSummary(pb)
  const pts = (daily.data?.days ?? []).map((d) => d.pnlUsd)
  const sync = paperStatusWord(paper)
  return (
    <>
      <Txt s={12.5} c={C.tx50} style={{ marginTop: 22, marginBottom: 8 }}>on paper{paper.skewDays ? ` · previewing +${paper.skewDays} days` : ''}{sync ? ` · ${sync}` : ''}</Txt>
      <PaperNotice />
      <View style={[st.pnl, { marginTop: 0, borderWidth: 1, borderColor: PAPER.line }]}>
        <MadeTop have={have} s={s} />
        {!s ? <Txt s={13} c={C.tx50} lh={19}>Nothing made yet. Open a deposit or a loop on paper and its figure shows on its row at once, accruing by the minute.</Txt> : <>
          <Split s={s} />
          <Txt s={13} c={C.tx50}>{pct(b.returnPct, 2)} of what was put in{b.frictionUsd > 0.005 ? ` · ${usdShort(b.frictionUsd)} went on fees, swaps and bridges` : ''}</Txt>
          {pts.length > 1 ? <PnlLine pts={pts} up={s.total >= 0} /> : <Txt s={12.5} c={C.tx50}>The day-by-day line starts after a second day.</Txt>}
          <View style={{ marginHorizontal: -16, marginTop: -10, marginBottom: -14 }}><Details title="Every number" what="each position, what is at work, what it cost" onOpen={() => router.push('/paper-book')} /></View>
        </>}
      </View>
    </>
  )
}

/**
 * The card's head: what you have beside what your open positions made — the two totals a reader
 * came for, once each (the bar's chip carries the first while the page is scrolled).
 */
function MadeTop({ have, s, of }: { have: React.ReactNode; s: PnlSummary | null; /** "on 2 of 3 positions", where the index has not drawn them all */ of?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {have}
      {s && (
        <View style={{ alignItems: 'flex-end', gap: 3, flexShrink: 1 }}>
          <Txt s={12} w={600} c={C.tx50}>Made · open positions</Txt>
          <Txt s={26} w={700} lh={32} c={s.total >= 0 ? C.ok : C.bad} style={{ letterSpacing: -0.52 }}>{signedMoney(s.total)}</Txt>
          <Txt s={12} c={C.tx50} lh={16} style={{ textAlign: 'right' }}>{[s.aprPct != null ? `${pct(s.aprPct, 1)} a year` : '', of && s.on < s.of ? `on ${s.on} of ${s.of}` : ''].filter(Boolean).join(' · ')}</Txt>
        </View>
      )}
    </View>
  )
}

/**
 * How much of it was farming and how much the coin's price: the bar and its two figures. The
 * sentence is kept for a mixed or a losing split — where one side made nearly all of a gain, the
 * bar has already said it.
 */
function Split({ s }: { s: PnlSummary }) {
  if (s.yield == null || s.price == null) return <Txt s={13.5} lh={19.6}>{s.word}</Txt>
  const plain = !!s.split && s.yield >= 0 && s.price >= 0 && Math.max(s.split.yield, s.split.price) >= 0.8
  return (
    <>
      {s.split && <View style={st.bar2}>
        <Seg2 neg={s.yield < 0} color={C.ok} flex={`${Math.round(s.split.yield * 100)}%`} />
        <Seg2 neg={s.price < 0} color={C.violet} grow />
      </View>}
      <View style={{ flexDirection: 'row', gap: 18 }}>
        <Txt s={12.5} c={C.tx70}><Dot c={C.ok} />  Farming <Txt s={12.5} w={700} c={s.yield >= 0 ? C.ok : C.bad}>{signedMoney(s.yield)}</Txt></Txt>
        <Txt s={12.5} c={C.tx70}><Dot c={C.violet} />  Price <Txt s={12.5} w={700} c={s.price >= 0 ? C.ok : C.bad}>{signedMoney(s.price)}</Txt></Txt>
      </View>
      {!plain && <Txt s={13.5} lh={19.6}>{s.word}</Txt>}
    </>
  )
}

/** A stat card (`.lstat`). */
function Stat({ k, v, s, onPress, wide }: { k: string; v: React.ReactNode; s: string; onPress?: () => void; /** alone on its row */ wide?: boolean }) {
  const body = (
    <>
      <Txt s={12} w={600} c={C.tx50}>{k}</Txt>
      {typeof v === 'string' ? <Txt s={22} w={600} lh={32}>{v}</Txt> : v}
      <Txt s={11.5} c={C.tx50} lh={15.5}>{s}</Txt>
    </>
  )
  return onPress ? <Pressable onPress={onPress} style={st.stat}>{body}</Pressable> : <View style={[st.stat, wide && { width: '100%', maxWidth: '100%' }]}>{body}</View>
}

/** Where you rank on the wallet board — the web's `useMyStats` rank, off the same board answer. */
function useRank(account: string | undefined) {
  const board = useQuery({ enabled: !!account, queryKey: ['earners-me'], queryFn: () => idx.walletEarners({ sort: 'perDay', people: true, limit: 100 }), staleTime: 5 * 60_000, retry: false })
  const a = normAddr(account)
  const i = a ? (board.data?.rows ?? []).findIndex((r) => normAddr(r.account) === a) : -1
  return { rank: i >= 0 ? i + 1 : null, perDay: i >= 0 ? board.data!.rows[i].perDayUsd : null }
}

/**
 * The card (the web's `LitePnl`, real accounts): what you have beside what your open positions
 * made, the farming / price bar, the day-by-day line. Each position's own figure is on its row
 * below (`useHoldingPnl`), never listed here a second time (docs/you-unified.md).
 */
function Made({ account, accounts, have, positions }: { account: string; /** every wallet of the owner's, one per VM (`useBook`): what they made is summed over all of them */ accounts: Accounts; have: React.ReactNode; positions?: number }) {
  const q = useAccountsPnlBook(accounts, { own: true })
  // the live book's legs go to each index as hints, and the book is re-read once a sync lands (both indexes, pos-indexer tickets/0099)
  const { evm, sol } = accounts
  const sync = useAccountSync(evm)
  const solSync = useAccountSync(sol)
  const qc = useQueryClient()
  React.useEffect(() => { if (sync.data && evm) void qc.invalidateQueries({ queryKey: ['pnl-book', evm.toLowerCase()] }) }, [sync.data, evm, qc])
  React.useEffect(() => { if (solSync.data && sol) void qc.invalidateQueries({ queryKey: ['pnl-book', sol] }) }, [solSync.data, sol, qc])
  const b = q.data
  const s = b ? pnlSummary(b) : null
  if (q.isLoading) return <View style={[st.pnl, st.pnlTop]}><MadeTop have={have} s={null} /><Sk w={240} h={12} /></View>
  const syncing = (!!evm && !sync.data && !sync.isError) || (!!sol && !solSync.data && !solSync.isError)
  // no book, or one with nothing in it: say so while there is money at work, instead of a blank
  if (!b || !b.coverage.positions) return (
    <View style={[st.pnl, st.pnlTop]}>
      <MadeTop have={have} s={null} />
      {!!positions && <Txt s={13} c={C.tx50} lh={19}>{pnlNotReadYet(positions, syncing, q.isError)}{!q.isError && q.failed.length ? ` Not in this yet: ${q.failed.map(unreadWallet).join(' · ')}.` : ''}</Txt>}
    </View>
  )
  const w = pnlWaiting(b)
  const notIn = [w.drawing ? `${w.drawing} drawing now` : '', w.waiting ? `${w.waiting} waiting` : '', unsupportedLine(b), ...q.failed.map(unreadWallet)].filter(Boolean)
  return (
    <View style={[st.pnl, st.pnlTop]}>
      <MadeTop have={have} s={s} of />
      {!s ? <Txt s={13} c={C.tx50} lh={19}>What you made: no record yet. {positions != null && positions > b.coverage.positions ? `${positions - b.coverage.positions} of your ${positions} the index has not read yet. ` : ''}The index draws one per position within a few hours of opening.</Txt> : <>
        <Split s={s} />
        {notIn.length > 0 && <Txt s={13} c={C.tx50} lh={19}>Not in what you made: {notIn.join(' · ')}.</Txt>}
        {b.series.length > 1 && <PnlLine pts={b.series.map((p) => p.pnl)} up={s.total >= 0} />}
        <View style={{ marginHorizontal: -16, marginTop: -10, marginBottom: -14 }}><Details title="Every number" what="the day-by-day line, yield against price, each position" onOpen={() => router.push(`/made?${new URLSearchParams({ a: account, ...(sol && sol !== account ? { s: sol } : {}) })}` as Href)} /></View>
      </>}
    </View>
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

const TONE = { bad: C.bad, warn: C.warn, ok: C.ok, '': C.tx50 } as Record<string, string>

/**
 * A position, once (the web's You `Position`; docs/you-unified.md): its name in Lite's words, its
 * token and how it is held, how far from the line on a line of its own; its value, what it MADE —
 * a fact, so it wears the colour — and what it earns a day, a forecast, in grey. Its ticket
 * (manage, share) is a tap away. No figure from the index is no line, never a zero.
 */
function Position({ h, s, made }: { h: Holding; s: Strategy | null; /** a paper position's figure, off the paper ledger */ made?: number }) {
  const title = holdingTitle(h)
  const row = holdingRow(h, title)
  // what it made since it was opened, the index's figure for it
  const pnl = useHoldingPnl(h)
  const m = made ?? pnl?.pnlUsd ?? null
  const perDay = h.apr != null && h.kind !== 'borrow' && Math.abs(h.valueUsd * h.apr / 100 / 365) >= 0.01 ? h.valueUsd * h.apr / 100 / 365 : null
  const nav = useNav()
  const open = () => {
    // a price bet (a debt in another money) is Pro's alone (docs/lite.md §6): the web's Pro opens it
    if (h.directional) return nav.pro(`#/${h.group}?${new URLSearchParams({ ...(s ? { s: s.id } : {}), k: h.kind, h: h.key, m: 'manage' })}`)
    openStrategy(s ?? { id: '_', kind: h.kind, group: h.group }, { h: h.key })
  }
  return (
    <Pressable onPress={open} style={({ pressed }) => [st.row, pressed && { backgroundColor: C.b300 }]}>
      <Tok sym={h.symbol} logo={h.logo} size={28} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt s={14.5} w={600} numberOfLines={1}>{title}</Txt>
        <Txt s={12} c={C.tx50} numberOfLines={1}>{h.kind === 'borrow' ? row.what.replace(/A loan$/, `owes ${usd(owedOf(h))}`) : row.what}{h.directional ? ' · managed in Pro' : ''}</Txt>
        {row.risk && <Txt s={12} c={TONE[row.risk.tone] ?? C.tx50} numberOfLines={1}>{row.risk.text}</Txt>}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 1 }}>
        <Txt w={700}>{usd(h.valueUsd)}</Txt>
        {m != null && <Txt s={12} w={600} c={m >= 0 ? C.ok : C.bad}>{signedMoney(m)} made</Txt>}
        {/* what it earns in dollars a day (hidden under a cent) */}
        {perDay != null && <Txt s={12} c={C.tx50}>{signedMoney(perDay)} a day</Txt>}
      </View>
      <Txt c={C.tx40}>›</Txt>
    </Pressable>
  )
}

/** How many closed positions the fold lists; the older ones are Pro's (as on the board). */
const CLOSED_SHOWN = 5
const dayOf = (t: string) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/**
 * What you HAD, folded under what you have (docs/you-unified.md): the closed positions on the
 * chains in scope, the same row with what each made where a live one has its value. The fold's
 * head counts them off their keys (one request); each one's record is read only once it is
 * opened, and then the head says what they made together. EVM only — the Solana index keeps no
 * list of closed positions. A row opens its record (`/position`).
 */
function Closed({ account }: { account: string | undefined }) {
  const [open, setOpen] = React.useState(false)
  const names = useBoardNames()
  const { chainIds, allChains } = useChains()
  const nav = useNav()
  const { had, count, more, isLoading } = useClosedRecord(account, names, CLOSED_SHOWN, { enabled: open, chainIds: allChains ? undefined : chainIds })
  if (!account || !count) return null
  const sum = had.reduce((n, p) => n + p.pnlUsd, 0)
  const loaded = open && !isLoading
  return (
    <View style={{ marginTop: 18 }}>
      <Pressable onPress={() => setOpen((o) => !o)} style={st.fold} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Txt s={14} w={600} c={C.tx70} style={{ flex: 1 }}>Closed · {loaded && !more ? had.length : count}</Txt>
        {loaded && had.length > 0 && <Txt s={13} w={600} c={sum >= 0 ? C.ok : C.bad}>{signedMoney(sum)} made{more ? ` on the last ${had.length}` : ''}</Txt>}
        <Txt c={C.tx40}>{open ? '⌃' : '⌄'}</Txt>
      </Pressable>
      {open && (
        <View style={{ gap: 6, marginTop: 6 }}>
          {isLoading && !had.length ? [0, 1].map((i) => <View key={i} style={st.row}><Sk w={28} h={28} r={14} /><Sk w={140} /></View>)
            : !had.length ? <Txt s={13} c={C.tx50} style={{ padding: 14 }}>Nothing that was ever at work.</Txt>
            : had.map((p) => <ClosedRow key={p.key} p={p} account={account} logo={logoOf(names.get(p.strategyKey.toLowerCase())?.s)} />)}
          {more > 0 && <Pressable onPress={() => nav.pro(`#/w/${account}`)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 }}><Txt s={12.5} c={C.tx50}>{more} older closed position{more === 1 ? '' : 's'}, in Pro ›</Txt></Pressable>}
        </View>
      )}
    </View>
  )
}
const logoOf = (s: Strategy | undefined) => (s ? (s.kind === 'loop' ? s.logoLong : s.tokenLogo ?? s.logo) : undefined)

function ClosedRow({ p, account, logo }: { p: BoardPosition; account: string; logo?: string }) {
  const yearly = p.aprPct != null && Number.isFinite(p.aprPct) && Math.abs(p.aprPct) <= 100
  return (
    <Pressable onPress={() => router.push(`/position?${new URLSearchParams({ a: account, k: p.key, t: p.title })}` as Href)} style={({ pressed }) => [st.row, pressed && { backgroundColor: C.b300 }]} accessibilityHint="What this position made, day by day">
      <View style={{ opacity: 0.6 }}><Tok sym={p.held[0] ?? '?'} logo={logo} size={28} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt s={14.5} w={600} c={C.tx70} numberOfLines={1}>{p.title}</Txt>
        <Txt s={12} c={C.tx50} numberOfLines={1}>{p.closed ? `Closed ${dayOf(p.closed.at)}` : p.sub}{p.closed?.avgUsd != null ? ` · ${usdShort(p.closed.avgUsd)} at work on average` : ''}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 1 }}>
        <Txt w={700} c={p.pnlUsd >= 0 ? C.ok : C.bad}>{signedMoney(p.pnlUsd)}</Txt>
        {yearly && <Txt s={12} c={C.tx50}>{pct(p.aprPct!, 1)} a year</Txt>}
      </View>
      <Txt c={C.tx40}>›</Txt>
    </Pressable>
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
  paperPill: { backgroundColor: PAPER.bg, borderWidth: 1, borderColor: PAPER.line, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pnlTop: { marginTop: 14 },
  fold: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.b200 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: C.b200, borderRadius: 12 },
})
