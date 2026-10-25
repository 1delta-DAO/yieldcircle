import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import Svg, { Defs, RadialGradient, Rect, Stop, Path } from 'react-native-svg'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import * as idx from '@yieldcircle/core/index/api'
import { useAccountPnlBook } from '@yieldcircle/app/index/pnl'
import { useLiteMenu } from '@yieldcircle/app/lite'
import { useSession } from '@yieldcircle/app/session'
import { normAddr } from '@yieldcircle/core/model/address'
import { bookKeyOf } from '@yieldcircle/core/model/uid'
import { GROUPS } from '@yieldcircle/core/model/assets'
import { boardPositions, boardStrategies, boardWallets, type BoardSort, type BoardStrategy, type BoardWallet, type LiteRow } from '@yieldcircle/core/model/lite'
import { pct, usd, usdShort } from '@yieldcircle/core/model/format'
import { C, alpha, mix } from '../theme'
import { Btn, Seg, Sk, Tok } from './bits'
import { Character, Who } from './Character'
import { openStrategy } from './lite'
import { Txt } from './Txt'

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
 * The leaderboard (the web's LiteBoard, docs/lite.md §6): Strategies first — what is run, before
 * who runs it — then Wallets. Real wallets, read off the chain, one number each.
 */
export function Board() {
  const [by, setBy] = React.useState<'strategy' | 'wallet'>('strategy')
  const [sort, setSort] = React.useState<BoardSort>('apr')
  const L = useLiteMenu()
  const liteByKey = React.useMemo(() => {
    const m = new Map<string, LiteRow>()
    for (const r of L.rows) { const k = bookKeyOf(r.s); if (k) m.set(k.toLowerCase(), r) }
    return m
  }, [L.rows])
  return (
    <View>
      <View style={st.head}>
        <Txt s={18} w={700} lh={26} style={{ letterSpacing: -0.36 }}>Leaderboard</Txt>
        <Seg items={[{ id: 'strategy', word: 'Strategies' }, { id: 'wallet', word: 'Wallets' }]} value={by} onChange={setBy} />
      </View>
      <Seg items={SORTS} value={sort} onChange={setSort} />
      <Txt s={12.5} c={C.tx50} style={{ marginTop: 6, marginBottom: 12 }}>
        {by === 'strategy' ? `${STRAT_WHY[sort]}. Copy opens the same strategy at the best holder’s leverage, your own size.` : `${WALLET_WHY[sort]}. Tap a wallet to see each position and what it made.`}
      </Txt>
      {by === 'strategy' ? <Strategies sort={sort} liteByKey={liteByKey} /> : <Wallets sort={sort} liteByKey={liteByKey} />}
    </View>
  )
}

// ------------------------------------------------------------------ strategies

function Strategies({ sort, liteByKey }: { sort: BoardSort; liteByKey: Map<string, LiteRow> }) {
  const { account } = useSession()
  const q = useQuery({
    // the web's key: one cached answer for both
    queryKey: ['earners', 'strategy', sort, 'default', true, 'all', 'all', 'all', 'all', 50] as const,
    queryFn: () => idx.strategyBoard({ sort, people: true, limit: 50 }),
    staleTime: 60_000,
    retry: 1,
  })
  const colorOf = (g: string) => GROUPS.find((x) => x.id === g)?.color ?? '#8fa6ff'
  const rows = React.useMemo(() => boardStrategies(q.data?.rows ?? [], sort, (k) => {
    const r = liteByKey.get(k.toLowerCase())
    if (!r) return null
    const s = r.s
    return { title: r.title, sub: r.sub, color: colorOf(s.group), held: s.kind === 'loop' ? { symbol: s.holds, logo: s.logoLong } : { symbol: s.assetSymbol, logo: s.tokenLogo ?? s.logo }, debt: s.kind === 'loop' ? { symbol: s.debt, logo: s.logoShort } : null }
  }), [q.data, sort, liteByKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const top = rows[0]
  const fmt = (v: number) => (sort === 'apr' ? pct(v, 1) : usdShort(v))
  const unit = sort === 'apr' ? 'a year' : 'a day'
  const copy = (s: BoardStrategy) => { const r = liteByKey.get(s.key.toLowerCase()); if (r) openStrategy(r.s, s.best ? { copy: s.best.account } : {}) }
  const canCopy = (s: BoardStrategy) => liteByKey.has(s.key.toLowerCase()) && (!account || normAddr(s.best?.account ?? '') !== normAddr(account))
  const holder = (s: BoardStrategy) => s.best && router.push({ pathname: '/w/[account]', params: { account: s.best.account } })
  if (q.isLoading) return <View style={{ gap: 8 }}><View style={[st.hero, { gap: 12 }]}><Sk w={120} h={12} /><Sk w={220} h={26} /><Sk w={140} h={40} /></View>{[0, 1, 2].map((i) => <View key={i} style={st.lsRow}><Sk w={24} h={18} /><Sk w={36} h={36} r={18} /><Sk w={160} /></View>)}</View>
  if (q.error) return <Txt s={13} c={C.tx50} style={{ padding: 14 }}>The board could not be read right now.</Txt>
  if (!top) return <Txt s={13} c={C.tx50} style={{ padding: 14 }}>Nothing on the board right now.</Txt>
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
      {rows.slice(1, 40).map((s, i) => (
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

function Wallets({ sort, liteByKey }: { sort: BoardSort; liteByKey: Map<string, LiteRow> }) {
  const { account } = useSession()
  const q = useQuery({
    // `earners-me` is the $/day board the header and You already read on the web: one request for both
    queryKey: sort === 'perDay' ? ['earners-me'] : ['earners-lite', sort],
    queryFn: () => idx.walletEarners({ sort, people: true, limit: 100 }),
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const rows = boardWallets(q.data?.rows ?? [], sort).slice(0, 50)
  const me = account ? rows.find((r) => normAddr(r.account) === normAddr(account)) : undefined
  const [open, setOpen] = React.useState<string | null>(null)
  return (
    <View style={{ gap: 6 }}>
      {me && <View style={st.meNote}><Txt s={12.5} c={C.tx70}>You are <Txt s={12.5} w={700}>#{me.rank}</Txt> · {sort === 'apr' ? `${pct(me.value, 1)} a year` : `${usdShort(me.value)} a day`}</Txt></View>}
      {q.isLoading ? [0, 1, 2, 3, 4, 5].map((i) => <View key={i} style={[st.lbItem, st.lbRow]}><Sk w={24} h={18} /><Sk w={26} h={26} r={13} /><Sk w={140} /></View>)
        : q.error ? <Txt s={13} c={C.tx50} style={{ padding: 14 }}>The board could not be read right now.</Txt>
        : !rows.length ? <Txt s={13} c={C.tx50} style={{ padding: 14 }}>Nobody on the board right now.</Txt>
        : rows.map((r) => <WalletRow key={r.account} r={r} sort={sort} me={!!me && me.account === r.account} open={open === r.account} onToggle={() => setOpen(open === r.account ? null : r.account)} liteByKey={liteByKey} />)}
    </View>
  )
}

function WalletRow({ r, sort, me, open, onToggle, liteByKey }: { r: BoardWallet; sort: BoardSort; me: boolean; open: boolean; onToggle: () => void; liteByKey: Map<string, LiteRow> }) {
  return (
    <View style={[st.lbItem, me && { borderLeftWidth: 3, borderLeftColor: C.primary }]}>
      <Pressable onPress={onToggle} style={({ pressed }) => [st.lbRow, pressed && { backgroundColor: C.b300 }]}>
        <Rank n={r.rank} />
        <View style={{ flex: 1 }}><Who account={r.account} idx={{ accountLabel: r.label }} size={28} sub={`${r.positions} position${r.positions === 1 ? '' : 's'} · on ${usdShort(r.navUsd)}`} /></View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt s={17} w={600} c={C.ok} style={{ fontVariant: ['tabular-nums'] }}>{sort === 'apr' ? pct(r.value, 1) : usdShort(r.value)}</Txt>
          <Txt s={11} c={C.tx50}>{sort === 'apr' ? 'a year' : 'a day'}</Txt>
        </View>
        <Svg width={12} height={12} viewBox="0 0 12 12" style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}><Path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke={C.tx40} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </Pressable>
      {open && <WalletPositions account={r.account} liteByKey={liteByKey} me={me} />}
    </View>
  )
}

/** One wallet's positions, opened on a tap: each with what it made, and a Copy where Lite carries it. */
function WalletPositions({ account, liteByKey, me }: { account: string; liteByKey: Map<string, LiteRow>; me: boolean }) {
  const q = useAccountPnlBook(account)
  const ps = q.data ? boardPositions(q.data, (k) => liteByKey.get(k.toLowerCase())?.title ?? null) : []
  return (
    <View style={st.lbPos}>
      {q.isLoading ? <ActivityIndicator color={C.tx50} style={{ padding: 10 }} />
        : !ps.length ? <Txt s={12.5} c={C.tx50} style={st.lbP}>No position with a record yet. The index draws each one within a few hours of opening.</Txt>
        : ps.map((p) => {
          const row = liteByKey.get(p.strategyKey.toLowerCase())
          return (
            <View key={p.key} style={st.lbP}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt w={700} numberOfLines={1}>{p.title}</Txt>
                <Txt s={12} c={C.tx50} numberOfLines={1}>{p.sub}{p.equityUsd != null ? ` · ${usdShort(p.equityUsd)} in it` : ''}{p.since ? ` · since ${new Date(p.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</Txt>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt w={700} c={p.pnlUsd >= 0 ? C.ok : C.bad}>{p.pnlUsd >= 0 ? '+' : '−'}{usd(Math.abs(p.pnlUsd))}</Txt>
                {p.aprPct != null && <Txt s={11.5} c={C.tx50}>{pct(p.aprPct, 1)} a year</Txt>}
              </View>
              {row && !me && <Btn sm title="Copy" onPress={() => openStrategy(row.s, { copy: account })} />}
            </View>
          )
        })}
      <View style={[st.lbP, { paddingTop: 6 }]}>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => router.push({ pathname: '/w/[account]', params: { account } })}><Txt s={12.5} c={C.tx50}>Their whole page ›</Txt></Pressable>
      </View>
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
  meNote: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
})
