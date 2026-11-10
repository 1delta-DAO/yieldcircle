import React from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop, Path } from 'react-native-svg'
import { router, type Href } from 'expo-router'
import { useBoardNames, useLiteByKey, useStrategyBoard, useWalletBoard, useWalletRecord } from '@yieldcircle/app/board'
import { useNav } from '@yieldcircle/app/nav'
import { useSession } from '@yieldcircle/app/session'
import { useMyFollows, useProfiles } from '@yieldcircle/app/social/queries'
import type { Profile } from '@yieldcircle/core/social/types'
import { normAddr } from '@yieldcircle/core/model/address'
import { GROUPS, groupOf } from '@yieldcircle/core/model/assets'
import { BOARD_HELD, boardHeld, boardStrategies, boardWallets, leverTag, type BoardSort, type BoardStrategy, type BoardWallet, type HeldPosition, type LiteRow } from '@yieldcircle/core/model/lite'
import { pct, usd, usdShort } from '@yieldcircle/core/model/format'
import { C, alpha, mix } from '../theme'
import { ChainChip } from './ChainChip'
import { useChains } from '../chains'
import { Btn, LeverPill, Pill, Seg, Sk, Tok } from './bits'
import { Character, Who } from './Character'
import { openStrategy, openWallet } from './lite'
import { FollowButton } from './social'
import { Txt } from './Txt'

type Held = (typeof BOARD_HELD)[number]['id']
const SORTS: { id: BoardSort; word: string }[] = [{ id: 'apr', word: 'Best rate' }, { id: 'perDay', word: 'Most a day' }]
const WALLET_WHY: Record<BoardSort, string> = {
  apr: 'what each wallet earns a year on all its money, at today’s rates',
  perDay: 'the dollars each wallet’s money earns a day, at today’s rates',
}
const STRAT_WHY: Record<BoardSort, string> = {
  apr: 'what everyone in the strategy earns together, a year, at today’s rates',
  perDay: 'the dollars a day everyone in the strategy earns together: where the money is',
}
/** the podium's colours (tokens `--gold`, `--silver`, `--bronze`) */
const MEDAL = ['#f5c542', '#c9d1d9', '#d08a4e']

/**
 * The leaderboard (the web's LiteBoard, docs/lite.md §6): Wallets first — every row a person — then
 * Strategies. Real wallets, read off the chain, one number each, in one money or all of them
 * (`BOARD_HELD`). A link may open it on either (`by`), on dollars a day (`t=perDay`) and on a
 * money (`x=usd`).
 */
export function Board({ by0, t0, x0 }: { by0?: string; t0?: string; x0?: string } = {}) {
  const [by, setBy] = React.useState<'strategy' | 'wallet'>(by0 === 'strategy' ? 'strategy' : 'wallet')
  const [sort, setSort] = React.useState<BoardSort>(t0 === 'perDay' ? 'perDay' : 'apr')
  const [held, setHeld] = React.useState(boardHeld(x0))
  const liteByKey = useLiteByKey()
  return (
    <View>
      <View style={st.head}>
        <Txt s={18} w={700} lh={26} style={{ letterSpacing: -0.36 }}>Leaderboard</Txt>
        <Seg items={[{ id: 'strategy', word: 'Strategies' }, { id: 'wallet', word: 'Wallets' }]} value={by} onChange={setBy} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}><Seg items={SORTS} value={sort} onChange={setSort} /></View>
        <ChainChip />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 10 }}>
        {BOARD_HELD.map((c) => {
          const on = held === c.id
          return <Pressable key={c.word} onPress={() => setHeld(c.id)} style={[st.chip, on && st.chipOn]} accessibilityLabel={`${c.word}: ${c.title}`} accessibilityState={{ selected: on }}><Txt s={12.5} c={on ? C.tx : C.tx70}>{c.word}</Txt></Pressable>
        })}
      </ScrollView>
      <Txt s={12.5} c={C.tx50} style={{ marginTop: 8, marginBottom: 12 }}>
        {by === 'strategy' ? `${STRAT_WHY[sort]}. Copy opens the same strategy at the best holder’s leverage, your own size.` : `${WALLET_WHY[sort]}. Tap a wallet to see each position and what it made.`}
      </Txt>
      {by === 'strategy' ? <Strategies sort={sort} held={held} liteByKey={liteByKey} /> : <Wallets sort={sort} held={held} liteByKey={liteByKey} />}
    </View>
  )
}

export { useLiteByKey } from '@yieldcircle/app/board'

// ------------------------------------------------------------------ strategies

/** How many a board shows before "Show more": a ranking reads in its top; the rest is one tap. */
const BOARD_ROWS = 20
/** How many closed positions a wallet's list carries; the rest are Pro's. */
const CLOSED_SHOWN = 6

/**
 * What is RUN (docs/board-strategies.md): one row per strategy in Lite's words — the catalogue's
 * words where Lite does not list it (`useBoardNames`), Copy only where it does. A strategy the
 * catalogue does not hold has only a ticker: it stays Pro's, and the foot counts it.
 */
/** The chain scope as the index takes it: absent for every chain. */
function useChainScope() {
  const { allChains, chainIds } = useChains()
  return allChains ? undefined : chainIds.join(',')
}

function Strategies({ sort, held, liteByKey }: { sort: BoardSort; held: Held; liteByKey: Map<string, LiteRow> }) {
  const { account } = useSession()
  const chains = useChainScope()
  const nav = useNav()
  const names = useBoardNames()
  const [many, setMany] = React.useState(false)
  const q = useStrategyBoard({ sort, held, chains })
  const colorOf = (g: string) => GROUPS.find((x) => x.id === g)?.color ?? '#8fa6ff'
  const ranked = React.useMemo(() => boardStrategies(q.data?.rows ?? [], sort, (k) => {
    const n = names.get(k.toLowerCase())
    if (!n) return null
    const s = n.s
    return { title: n.title, sub: n.sub, color: colorOf(s.group), held: s.kind === 'loop' ? { symbol: s.holds, logo: s.logoLong } : { symbol: s.assetSymbol, logo: s.tokenLogo ?? s.logo }, debt: s.kind === 'loop' ? { symbol: s.debt, logo: s.logoShort } : null }
  }), [q.data, sort, names]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = ranked.filter((r) => names.has(r.key.toLowerCase()))
  const unnamed = ranked.length - rows.length
  const top = rows[0]
  const fmt = (v: number) => (sort === 'apr' ? pct(v, 1) : usdShort(v))
  const unit = sort === 'apr' ? 'a year' : 'a day'
  const copy = (s: BoardStrategy) => { const r = liteByKey.get(s.key.toLowerCase()); if (r) openStrategy(r.s, s.best ? { copy: s.best.account } : {}) }
  const canCopy = (s: BoardStrategy) => liteByKey.has(s.key.toLowerCase()) && (!account || normAddr(s.best?.account ?? '') !== normAddr(account))
  const holder = (s: BoardStrategy) => s.best && openWallet(s.best.account)
  if (q.isLoading) return <View style={{ gap: 8 }}><View style={[st.hero, { gap: 12 }]}><Sk w={120} h={12} /><Sk w={220} h={26} /><Sk w={140} h={40} /></View>{[0, 1, 2].map((i) => <View key={i} style={st.lsRow}><Sk w={24} h={18} /><Sk w={36} h={36} r={18} /><Sk w={160} /></View>)}</View>
  if (q.error) return <Txt s={13} c={C.tx50} style={{ padding: 14 }}>The board could not be read right now.</Txt>
  if (!top) return <Txt s={13} c={C.tx50} style={{ padding: 14 }}>{chains ? (held ? 'Nothing in this money on these chains right now.' : 'Nothing on the board on these chains right now.') : held ? 'Nothing on the board in this money right now.' : 'Nothing on the board right now.'}</Txt>
  const gc = top.color ?? C.primary
  return (
    <View style={{ gap: 8 }}>
      <View style={st.hero}>
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="lsHero" cx="0" cy="0" rx="1.2" ry="1.4" fx="0" fy="0" gradientUnits="objectBoundingBox">
              <Stop offset="0" stopColor={mix(gc, 0.34)} />
              <Stop offset="0.62" stopColor={C.b200} />
            </RadialGradient>
          </Defs>
          <Rect width="100" height="100" fill="url(#lsHero)" />
        </Svg>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 24, borderWidth: 1, borderColor: alpha(gc, 0.35) }]} />
        <View>
          <Txt s={11} w={700} c={mix(gc, 0.8, '#ffffff')} style={{ letterSpacing: 0.88, textTransform: 'uppercase' }}>#1 · {sort === 'apr' ? 'best rate' : 'most a day'}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, marginBottom: 2 }}>
            <Marks s={top} size={34} />
            <Txt s={22} w={600} lh={24} numberOfLines={2} style={{ letterSpacing: -0.22, flexShrink: 1 }}>{top.title}</Txt>
          </View>
          <Txt s={13.5} c={C.tx70}>{top.sub}{top.levRange && !top.sub.includes('×') ? ` · ${top.levRange}` : ''}</Txt>
        </View>
        <View>
          <Txt s={40} w={700} lh={40} c={C.ok} style={{ letterSpacing: -0.8, fontVariant: ['tabular-nums'] }}>{fmt(top.value)}</Txt>
          <Txt s={12.5} c={C.tx50} style={{ marginTop: 4 }}>{unit} · everyone in it together</Txt>
        </View>
        <View style={{ gap: 14, marginTop: 4 }}>
          <Faces faces={top.faces} size={28} />
          <Txt s={13} c={C.tx70}>
            <Txt s={13} w={700}>{top.wallets}</Txt> {top.wallets === 1 ? 'person runs' : 'people run'} this · <Txt s={13} w={700}>{usdShort(top.equityUsd)}</Txt> in it
            {top.best && sort === 'apr' ? <> · the best earns <Txt s={13} w={700}>{pct(top.best.aprPct, 1)}</Txt> on {usdShort(top.best.equityUsd)}</> : null}
          </Txt>
          {canCopy(top) ? <Btn title="Copy" onPress={() => copy(top)} /> : top.best ? <Btn kind="plain" title="See the best holder" onPress={() => holder(top)} /> : null}
        </View>
      </View>
      {rows.slice(1, many ? 40 : BOARD_ROWS).map((s, i) => (
        <View key={s.key} style={st.lsRow}>
          <View pointerEvents="none" style={[st.bar, { width: `${Math.max(4, Math.min(100, (s.value / top.value) * 100))}%`, backgroundColor: alpha(s.color ?? C.primary, 0.09) }]} />
          <Rank n={i + 2} />
          <View style={{ minWidth: 40 }}><Marks s={s} size={26} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt s={14.5} w={700} numberOfLines={1}>{s.title}</Txt>
            <Txt s={12} c={C.tx50} numberOfLines={1}>{s.sub} · {s.wallets} {s.wallets === 1 ? 'person' : 'people'} · {usdShort(s.equityUsd)}</Txt>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Txt s={17} w={600} c={C.ok} style={{ fontVariant: ['tabular-nums'] }}>{fmt(s.value)}</Txt>
            {canCopy(s) ? <Btn sm title="Copy" onPress={() => copy(s)} /> : s.best ? <Btn sm kind="plain" title="Who" onPress={() => holder(s)} /> : null}
          </View>
        </View>
      ))}
      {rows.length > BOARD_ROWS && !many && <Pressable onPress={() => setMany(true)} style={st.more}><Txt s={13} c={C.tx70}>Show the top {Math.min(rows.length, 40)}</Txt></Pressable>}
      {unnamed > 0 && (
        <Pressable onPress={() => nav.pro(`#/board${held ? `?x=${held}` : ''}`)} style={{ marginTop: 6 }}>
          <Txt s={12.5} c={C.tx50} lh={18}>{unnamed} more on the board hold coins Lite does not list. <Txt s={12.5} c={C.primary}>See them in Pro ›</Txt></Txt>
        </Pressable>
      )}
    </View>
  )
}

function Rank({ n }: { n: number }) {
  if (n > 3) return <View style={{ width: 24, alignItems: 'center' }}><Txt w={600} c={C.tx50}>{n}</Txt></View>
  const c = MEDAL[n - 1]
  return (
    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: alpha(c, 0.16), borderWidth: 1.5, borderColor: alpha(c, 0.55), alignItems: 'center', justifyContent: 'center' }}>
      <Txt s={12} w={700} c={c} lh={14}>{n}</Txt>
    </View>
  )
}

/** Faces of who runs it (`.ls-faces`): overlapping, ringed in the card's colour. */
function Faces({ faces, size }: { faces: string[]; size: number }) {
  if (!faces.length) return null
  return (
    <View style={{ flexDirection: 'row' }}>
      {faces.slice(0, 3).map((a, i) => (
        <View key={a} style={{ marginLeft: i ? -8 : 0, borderWidth: 2, borderColor: C.b200, borderRadius: 999 }}><Character addr={a} size={size} /></View>
      ))}
    </View>
  )
}

function Marks({ s, size }: { s: BoardStrategy; size: number }) {
  return s.debt
    ? <View style={{ flexDirection: 'row' }}><Tok sym={s.held.symbol} logo={s.held.logo ?? undefined} size={size} /><View style={{ marginLeft: -6 }}><Tok sym={s.debt.symbol} logo={s.debt.logo ?? undefined} size={size} ring={{ w: 2, color: C.b200 }} /></View></View>
    : <Tok sym={s.held.symbol} logo={s.held.logo ?? undefined} size={size} />
}

// ------------------------------------------------------------------ wallets

function Wallets({ sort, held, liteByKey }: { sort: BoardSort; held: Held; liteByKey: Map<string, LiteRow> }) {
  const { account } = useSession()
  const chains = useChainScope()
  const q = useWalletBoard({ sort, held, chains })
  // Everyone, or only the people you follow (and you)
  const f = useMyFollows(account)
  const [mine, setMine] = React.useState(false)
  const only = mine ? new Set([...f.wallets, ...(account ? [normAddr(account)] : [])].map((a) => a.toLowerCase())) : undefined
  const all = boardWallets(q.data?.rows ?? [], sort, only).slice(0, 50)
  const [many, setMany] = React.useState(false)
  const rows = many ? all : all.slice(0, BOARD_ROWS)
  const me = account ? rows.find((r) => normAddr(r.account) === normAddr(account)) : undefined
  const { profile } = useProfiles(rows.map((r) => r.account))
  const [open, setOpen] = React.useState<string | null>(null)
  return (
    <View style={{ gap: 6 }}>
      {!!account && f.wallets.length > 0 && <View style={{ marginBottom: 6 }}><Seg items={[{ id: 'all', word: 'Everyone' }, { id: 'mine', word: 'People you follow' }]} value={mine ? 'mine' : 'all'} onChange={(v) => setMine(v === 'mine')} /></View>}
      {me && !mine && <View style={st.meNote}><Txt s={12.5} c={C.tx70}>You are <Txt s={12.5} w={700}>#{me.rank}</Txt> · {sort === 'apr' ? `${pct(me.value, 1)} a year` : `${usdShort(me.value)} a day`}</Txt></View>}
      {q.isLoading ? [0, 1, 2, 3, 4, 5].map((i) => <View key={i} style={[st.lbItem, st.lbRow]}><Sk w={24} h={18} /><Sk w={26} h={26} r={13} /><Sk w={140} /></View>)
        : q.error ? <Txt s={13} c={C.tx50} style={{ padding: 14 }}>The board could not be read right now.</Txt>
        : !rows.length ? <Txt s={13} c={C.tx50} style={{ padding: 14 }}>{mine ? 'Nobody you follow is on the board yet.' : chains ? (held ? 'Nobody in this money on these chains right now.' : 'Nobody on the board on these chains right now.') : held ? 'Nobody on the board in this money right now.' : 'Nobody on the board right now.'}</Txt>
        : rows.map((r) => <WalletRow key={r.account} r={r} sort={sort} profile={profile(r.account)} me={!!account && normAddr(r.account) === normAddr(account)} open={open === r.account} onToggle={() => setOpen(open === r.account ? null : r.account)} liteByKey={liteByKey} />)}
      {all.length > rows.length && <Pressable onPress={() => setMany(true)} style={st.more}><Txt s={13} c={C.tx70}>Show the top {all.length}</Txt></Pressable>}
    </View>
  )
}

function WalletRow({ r, sort, profile, me, open, onToggle, liteByKey }: { r: BoardWallet; sort: BoardSort; profile: Profile | null; me: boolean; open: boolean; onToggle: () => void; liteByKey: Map<string, LiteRow> }) {
  return (
    <View style={[st.lbItem, me && { borderLeftWidth: 3, borderLeftColor: C.primary }]}>
      <Pressable onPress={onToggle} style={({ pressed }) => [st.lbRow, pressed && { backgroundColor: C.b300 }]}>
        <Rank n={r.rank} />
        <View style={{ flex: 1 }}><Who account={r.account} profile={profile} idx={{ accountLabel: r.label }} size={28} sub={`${usdShort(r.navUsd)} · ${r.positions} position${r.positions === 1 ? '' : 's'}`} /></View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt s={17} w={600} c={C.ok} style={{ fontVariant: ['tabular-nums'] }}>{sort === 'apr' ? pct(r.value, r.value >= 10 ? 0 : 1) : usdShort(r.value)}</Txt>
          <Txt s={11} c={C.tx50}>{sort === 'apr' ? 'a year' : 'a day'}</Txt>
        </View>
        <Svg width={12} height={12} viewBox="0 0 12 12" style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><Path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke={C.tx40} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </Pressable>
      {open && <WalletPositions account={r.account} liteByKey={liteByKey} me={me} />}
    </View>
  )
}

/**
 * One wallet's positions, opened on a tap (and the profile's "What it runs"), as the web's: each
 * with its money's marks, a slim bar in its money's colour for its share of the wallet, what it
 * made, and a Copy where Lite carries it; then what it HAD (its newest closed positions, the rest
 * in Pro). A tap opens the position's record (`/position`). `foot` — Follow and the way to the
 * profile — is off on the profile itself.
 */
export function WalletPositions({ account, liteByKey, me, foot = true }: { account: string; liteByKey: Map<string, LiteRow>; me: boolean; foot?: boolean }) {
  const nav = useNav()
  const { isLoading, open, had, moreClosed } = useWalletRecord(account, liteByKey, CLOSED_SHOWN, { me })
  const ps: HeldPosition[] = [...open, ...had]
  const colorOf = (g: string) => GROUPS.find((x) => x.id === g)?.color ?? null
  const since = (t: string) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return (
    <View style={st.lbPos}>
      {isLoading ? <ActivityIndicator color={C.tx50} style={{ padding: 10 }} />
        : !ps.length ? <Txt s={12.5} c={C.tx50} style={st.lbP}>No position with a record yet. The index draws each one within a few hours of opening.</Txt>
        : ps.map((p) => {
          const row = liteByKey.get(p.strategyKey.toLowerCase())
          const s = row?.s
          const held = s ? (s.kind === 'loop' ? { symbol: s.holds, logo: s.logoLong } : { symbol: s.assetSymbol, logo: s.tokenLogo ?? s.logo }) : { symbol: p.held[0] ?? '?', logo: undefined }
          const debt = s?.kind === 'loop' ? { symbol: s.debt, logo: s.logoShort } : p.debt[0] ? { symbol: p.debt[0], logo: undefined } : null
          const color = (s ? colorOf(s.group) : colorOf(groupOf(held.symbol))) ?? C.primary
          const up = (p.pnlUsd ?? p.rateNowPct ?? 0) >= 0
          const share = p.share != null && ps.length > 1 ? p.share : null
          return (
            <Pressable key={p.key} onPress={() => router.push(`/position?${new URLSearchParams({ a: account, k: p.key })}` as Href)} style={({ pressed }) => [st.lbP, p.closed && { opacity: 0.75 }, pressed && { backgroundColor: C.b300 }]} accessibilityHint="What this position made, day by day">
              {debt
                ? <View style={{ flexDirection: 'row' }}><Tok sym={held.symbol} logo={held.logo} size={28} /><View style={{ marginLeft: -8 }}><Tok sym={debt.symbol} logo={debt.logo} size={28} ring={{ w: 2, color: C.b200 }} /></View></View>
                : <Tok sym={held.symbol} logo={held.logo} size={28} />}
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Txt w={700} numberOfLines={1} style={{ flexShrink: 1 }}>{p.title}</Txt>
                  {p.kind === 'loop' && s?.kind === 'loop' && <LeverPill text={leverTag(s.tiers.balanced)} />}
                  {p.closed && <Pill>closed</Pill>}
                </View>
                <Txt s={12} c={C.tx50} numberOfLines={1}>{p.sub}{p.since ? ` · since ${since(p.since)}` : ''}{p.closed ? ` · closed ${since(p.closed.at)}` : ''}</Txt>
                {p.closed?.avgUsd != null && <Txt s={11.5} c={C.tx70}><Txt s={11.5} w={700}>{usdShort(p.closed.avgUsd)}</Txt> was at work</Txt>}
                {p.equityUsd != null && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {share != null && <View style={st.track}><View style={[st.fill, { width: `${Math.max(1.5, share * 100)}%`, backgroundColor: color }]} /></View>}
                    <Txt s={11.5} c={C.tx70}><Txt s={11.5} w={700}>{usdShort(p.equityUsd)}</Txt> in it{share != null ? <Txt s={11.5} c={C.tx50}> · {share < 0.01 ? '<1' : Math.round(share * 100)}%</Txt> : null}</Txt>
                  </View>
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {p.pnlUsd != null ? <>
                  <Txt w={700} c={up ? C.ok : C.bad}>{up ? '+' : '−'}{usd(Math.abs(p.pnlUsd))}</Txt>
                  <Txt s={11.5} c={C.tx50}>{p.aprPct != null ? `${pct(p.aprPct, 1)} a year` : 'made so far'}</Txt>
                </> : <>
                  {/* no drawn figure yet: what it earns now */}
                  <Txt w={700} c={p.rateNowPct == null ? C.tx50 : up ? C.ok : C.bad}>{p.rateNowPct != null ? pct(p.rateNowPct, 1) : '–'}</Txt>
                  <Txt s={11.5} c={C.tx50}>a year now</Txt>
                </>}
              </View>
              {row && !me ? <Btn sm title="Copy" onPress={() => openStrategy(row.s, { copy: account })} /> : null}
              <Txt c={C.tx40}>›</Txt>
            </Pressable>
          )
        })}
      {moreClosed > 0 && <Pressable onPress={() => nav.pro(`#/w/${account}`)} style={st.lbP}><Txt s={12.5} c={C.tx50}>{moreClosed} older closed position{moreClosed === 1 ? '' : 's'}, in Pro ›</Txt></Pressable>}
      {foot && (
        <View style={[st.lbP, { paddingTop: 6 }]}>
          {!me && <FollowButton kind="wallet" target={account} />}
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => openWallet(account)} hitSlop={8}><Txt s={12.5} c={C.tx50}>Their profile ›</Txt></Pressable>
        </View>
      )}
    </View>
  )
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2, marginBottom: 16 },
  hero: { borderRadius: 24, padding: 18, gap: 14, overflow: 'hidden', backgroundColor: C.b200 },
  lsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.b200, overflow: 'hidden' },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  lbItem: { backgroundColor: C.b200, borderRadius: 12, overflow: 'hidden' },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, paddingHorizontal: 14 },
  lbPos: { borderTopWidth: 1, borderTopColor: '#1a1a1f', paddingTop: 4, paddingBottom: 8 },
  lbP: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 14 },
  more: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: C.line2, paddingVertical: 6, paddingHorizontal: 12 },
  chipOn: { borderColor: C.primary, backgroundColor: C.priBg },
  track: { width: 56, height: 4, borderRadius: 2, backgroundColor: C.b400, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  meNote: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
})
