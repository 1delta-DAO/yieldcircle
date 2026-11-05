import React from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg'
import type { PositionSeries, SeriesEvent } from '@yieldcircle/core/index/api'
import { FLAG_WORDS, MOVE_CLASS, daysTxt, day, earnedBefore, fmtAmt, holdingPeriods, isDebtSide, legHoldings, maturityMarks, moneyOfPosition, venueOf } from '@yieldcircle/core/model/positionRecord'
import { pct, usd, usdShort } from '@yieldcircle/core/model/format'
import { usePositionSeries } from '@yieldcircle/app/index/queries'
import { chainLabel } from '@yieldcircle/app/sdk/queries'
import { C } from '../src/theme'
import { Seg, Sk, Tok } from '../src/ui/bits'
import { IconBack } from '../src/ui/icons'
import { Txt } from '../src/ui/Txt'

/**
 * One position's record (the web's `PnlDrawer`; docs/pnl-series.md): its life cut at every
 * transaction into holding periods, what it made in them, and the APR on the capital-days it had at
 * work — stated only where every leg is the same money. A one-money position other than dollars is
 * valued in its own money, dollars one tap away. History, not the live position: `a` the account,
 * `k` the index's position key. The rules are core's (`model/positionRecord.ts`).
 */
export default function Position() {
  const insets = useSafeAreaInsets()
  const p = useLocalSearchParams<{ a: string; k: string; /** its name where it was tapped, so it keeps it here */ t?: string }>()
  // the key names the account for a position the index files under another (a desk's vault)
  const account = p.k?.split('|')[1] || p.a
  const [pick, setPick] = React.useState<'own' | 'USD'>('own')
  const base = usePositionSeries(account, p.k, 'USD')
  const money = base.data ? moneyOfPosition(base.data) : null
  const unit = pick === 'USD' || !money ? 'USD' : money.unit
  const inUnit = usePositionSeries(account, unit === 'USD' ? undefined : p.k, unit)
  const s = unit === 'USD' ? base.data : inUnit.data
  const loading = base.isLoading || (unit !== 'USD' && inUnit.isLoading)
  const err = base.error ?? (unit !== 'USD' ? inUnit.error : null)
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[st.bar, { paddingTop: insets.top, height: 60 + insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={6} style={st.back} accessibilityLabel="Back"><IconBack color={C.tx70} /></Pressable>
        <Txt s={16} w={600}>What it made</Txt>
      </View>
      <ScrollView contentContainerStyle={[st.page, { paddingBottom: insets.bottom + 40 }]}>
        {loading && <View style={{ gap: 10 }}><Sk w={220} h={20} /><Sk w={300} /><Sk w={260} /></View>}
        {err ? <View style={st.note}><Txt s={13} c={C.tx70}>The index could not build this record: {(err as Error).message}</Txt></View> : null}
        {s && !loading && <Body s={s} title={p.t} priceBet={!money} unit={unit} label={unit === 'USD' ? '$' : money?.label ?? unit}
          toggle={money && money.unit !== 'USD' ? { own: money.label, pick, setPick } : null} />}
      </ScrollView>
    </View>
  )
}

/** How the numbers read in the record's unit: dollars, or `1.25 ETH`. */
function fmtOf(unit: string, label: string) {
  const v = (x: number | null | undefined) => (x == null ? '—' : unit === 'USD' ? usd(x) : `${fmtAmt(x)} ${label}`)
  const vs = (x: number | null | undefined) => (x == null ? '—' : unit === 'USD' ? usdShort(x) : `${fmtAmt(x)} ${label}`)
  const sg = (x: number | null | undefined) => (x == null ? '—' : `${x >= 0 ? '+' : '−'}${v(Math.abs(x))}`)
  return { v, vs, sg }
}
type Fmt = ReturnType<typeof fmtOf>
const tone = (x: number | null | undefined) => ((x ?? 0) >= 0 ? C.ok : C.bad)
const moveTone: Record<string, string> = { 'k-in': C.ok, 'k-out': C.warn, 'k-borrow': C.violet, 'k-liq': C.bad }

function Body({ s, title, priceBet, unit, label, toggle }: { s: PositionSeries; title?: string; priceBet: boolean; unit: string; label: string; toggle: { own: string; pick: 'own' | 'USD'; setPick: (p: 'own' | 'USD') => void } | null }) {
  const f = React.useMemo(() => fmtOf(unit, label), [unit, label])
  const m = s.summary
  const last = s.points.at(-1)
  const syms = [...new Set(s.legs.map((l) => l.symbol ?? '?'))]
  const since = React.useMemo(() => earnedBefore(s.events), [s.events])
  const held = React.useMemo(() => legHoldings(s), [s])
  const periods = React.useMemo(() => holdingPeriods(s.intervals), [s.intervals])
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Txt s={18} w={700}>{title || syms.join(' / ')}</Txt>
        <Txt s={13} c={C.tx50}>{title ? `${syms.join(' / ')} · ` : ''}{venueOf(s.legs[0]?.lenderKey)} · {chainLabel(s.chainId)} · {s.since ? `older than the ledger — counted from ${day(s.since)}` : s.start ? `opened ${day(s.start)}` : 'no history'}</Txt>
      </View>

      <View style={st.card}>
        {priceBet ? (
          <>
            <Txt s={15} lh={22}><Txt s={15} w={700} c={tone(m.pnl)}>{f.sg(m.pnl)}</Txt> over {daysTxt(m.openDays)}: {f.sg(m.interest)} from interest, {f.sg(m.priceMove)} from prices.</Txt>
            {m.yield != null
              ? <Txt s={12.5} c={C.tx50} lh={18}>Without the moneys’ own moves it {m.yield >= 0 ? 'earned' : 'lost'} <Txt s={12.5} w={700} c={tone(m.yield)}>{f.sg(m.yield)}</Txt>{m.yieldAprPct != null ? ` — ${pct(m.yieldAprPct)} APR on the same equity` : ''}; the rest, {f.sg(m.directional ?? 0)}, is direction.</Txt>
              : <Txt s={12.5} c={C.tx50} lh={18}>No APR: its legs are different money, so this is a price position as much as a yield.</Txt>}
          </>
        ) : (
          <>
            <Txt s={15} lh={22}>Earned <Txt s={15} w={700} c={tone(m.pnl)}>{f.sg(m.pnl)}</Txt> on <Txt s={15} w={700}>{f.v(m.avgCapital)}</Txt> average equity over <Txt s={15} w={700}>{daysTxt(m.openDays)}</Txt>{m.aprPct != null ? <> — <Txt s={15} w={700} c={tone(m.aprPct)}>{pct(m.aprPct)} APR</Txt></> : null}</Txt>
            {m.yield != null && m.directional != null && Math.abs(m.directional) > Math.max(0.005 * Math.abs(m.pnl), 1e-9) && (
              <Txt s={12.5} c={C.tx50} lh={18}>{f.sg(m.directional)} of it is the moneys’ own move; without it, <Txt s={12.5} w={700} c={tone(m.yield)}>{f.sg(m.yield)}</Txt>{m.yieldAprPct != null ? ` — ${pct(m.yieldAprPct)} APR` : ''}.</Txt>
            )}
          </>
        )}
      </View>

      <View style={st.stats}>
        <Stat k="Value now" v={f.v(last?.nav)} />
        <Stat k="Average equity" v={f.v(m.avgCapital)} s={`${daysTxt(m.openDays)} at work · ${m.intervals} period${m.intervals === 1 ? '' : 's'}`} />
        {priceBet ? <Stat k="PnL" v={f.sg(m.pnl)} c={tone(m.pnl)} /> : <Stat k="APR" v={m.aprPct == null ? '—' : pct(m.aprPct)} c={tone(m.aprPct)} s="PnL ÷ equity × time" />}
      </View>

      <Txt s={12.5} c={s.exact ? C.ok : C.warn} lh={18}>
        {s.exact ? 'Exact: every leg walks on its own units and the lender’s own index.' : 'Approximate — open Legs below for why.'}
        <Txt s={12.5} c={C.tx50}>{m.coveredShare != null && m.coveredShare < 0.999 ? ` ${pct((1 - m.coveredShare) * 100, 1)} of the time had no price and is left out.` : ''} Rewards are not included.</Txt>
      </Txt>

      {toggle && <Seg items={[{ id: 'own', word: toggle.own }, { id: 'USD', word: 'USD' }]} value={toggle.pick} onChange={toggle.setPick} />}
      <Chart s={s} f={f} />

      <Fold title="Legs" sub="what it holds and owes" count={`${s.legs.length} · ${s.exact ? 'exact' : 'approx'}`}>
        {s.legs.map((l, i) => {
          const debt = isDebtSide(l.side)
          const h = held[i]
          return (
            <View key={i} style={[st.leg, i > 0 && st.line]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Tok sym={l.symbol ?? '?'} size={20} />
                <Txt s={14} w={700} numberOfLines={1} style={{ flexShrink: 1 }}>{l.symbol ?? '?'}</Txt>
                <Txt s={11.5} c={debt ? C.warn : C.ok}>{debt ? 'debt' : l.side}</Txt>
                <View style={{ flex: 1 }} />
                <Txt s={11.5} c={l.exact ? C.ok : C.warn}>{l.exact ? '✓ exact' : '≈ approx'}</Txt>
              </View>
              <Txt s={13} c={C.tx70}>{l.closed || h.amount == null || h.amount === 0 ? `0 ${l.symbol ?? ''}` : `${fmtAmt(Math.abs(h.amount))} ${l.symbol ?? ''}${h.value != null ? ` · ${f.v(h.value)}` : ''}`}</Txt>
              <Txt s={12} c={C.tx50}>{l.walk === 'units' ? 'units' : 'amount'} · {l.indexSource === 'log' ? 'lender’s index' : l.indexSource === 'cache' ? 'hourly index' : 'no index'}{l.priceSource === 'pendle' ? ' · priced at Pendle’s market' : l.priceSource === 'exponent' ? ' · priced at Exponent’s market' : ''} · {l.rows} row{l.rows === 1 ? '' : 's'}</Txt>
              {l.flags.map((x) => <Txt key={x} s={11.5} c={C.tx50} lh={16}>· {FLAG_WORDS[x] ?? x}</Txt>)}
              {(l.unpricedPoints ?? 0) > 0 && <Txt s={11.5} c={C.warn} lh={16}>· no price for {l.symbol ?? 'this asset'} on {l.unpricedPoints} day{l.unpricedPoints === 1 ? '' : 's'}, left out</Txt>}
            </View>
          )
        })}
        {s.unanchored.length > 0 && <Txt s={12} c={C.tx50} lh={17} style={{ padding: 12 }}>Not in the record: {s.unanchored.map((u) => `${u.rows} ${u.side} row${u.rows === 1 ? '' : 's'} in ${u.marketUid.split(':')[0]}`).join(', ')} — no read has anchored that leg yet.</Txt>}
      </Fold>

      {periods.length > 0 && (
        <Fold title="Holding periods" sub="from one transaction to the next, per day" count={String(periods.length)}>
          {periods.slice(0, 60).map((r, i) => (
            <View key={r.d} style={[st.row, i > 0 && st.line]}>
              <View style={{ flex: 1, gap: 1 }}>
                <Txt s={12.5} c={C.tx70}>{r.d} · {daysTxt(r.days)}{r.n > 1 ? ` · ${r.n} periods` : ''}</Txt>
                <Txt s={12} c={C.tx50}>{f.vs(r.start)} → {f.vs(r.end)}</Txt>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Txt s={13} w={600} c={tone(r.pnl)}>{f.sg(r.pnl)}</Txt>
                <Txt s={11.5} c={r.liquidation ? C.bad : C.tx50}>{r.liquidation ? 'liquidated' : r.ret == null ? '—' : pct(r.ret, 2)}{!r.complete && !r.liquidation ? ' · part unpriced' : ''}</Txt>
              </View>
            </View>
          ))}
        </Fold>
      )}

      <Fold title="Moves" sub="newest first · what it earned before each" count={(s.eventsTotal ?? s.events.length) > s.events.length ? `newest ${s.events.length} of ${s.eventsTotal}` : String(s.events.length)}>
        {[...s.events].reverse().slice(0, 100).map((e, i, all) => <Move key={i} e={e} s={s} f={f} first={i === 0} since={i > 0 && all[i - 1].t === e.t ? undefined : since.get(e.t)} />)}
      </Fold>
    </View>
  )
}

function Move({ e, s, f, first, since }: { e: SeriesEvent; s: PositionSeries; f: Fmt; first: boolean; since: number | null | undefined }) {
  const leg = s.legs[e.leg]
  return (
    <View style={[st.row, !first && st.line]}>
      <View style={{ flex: 1, gap: 1 }}>
        <Txt s={13}><Txt s={13} w={600} c={moveTone[MOVE_CLASS[e.kind] ?? ''] ?? C.tx70}>{e.kind.replace('_', ' ')}</Txt> {e.amount != null ? `${fmtAmt(e.amount)} ${leg?.symbol ?? ''}` : ''}</Txt>
        <Txt s={11.5} c={C.tx50}>{e.t.slice(0, 16).replace('T', ' ')} · {e.flow == null ? 'no price' : `${f.vs(e.value)} ${e.flow > 0 ? 'in' : e.flow < 0 ? 'out' : ''}`} · after {f.vs(e.nav)}</Txt>
      </View>
      {since !== undefined && <Txt s={13} w={600} c={since == null ? C.tx40 : tone(since)}>{since == null ? '?' : f.sg(since)}</Txt>}
    </View>
  )
}

function Stat({ k, v, s, c }: { k: string; v: string; s?: string; c?: string }) {
  return (
    <View style={st.stat}>
      <Txt s={12} c={C.tx50}>{k}</Txt>
      <Txt s={16} w={700} c={c ?? C.tx} numberOfLines={1} adjustsFontSizeToFit>{v}</Txt>
      {s && <Txt s={11} c={C.tx50} lh={15}>{s}</Txt>}
    </View>
  )
}

/** A closed section: the header is the button; the body is drawn on first open (hundreds of moves are not drawn for a glance). */
function Fold({ title, sub, count, children }: { title: string; sub?: string; count?: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <View style={st.fold}>
      <Pressable onPress={() => setOpen(!open)} style={st.foldH} accessibilityState={{ expanded: open }}>
        <View style={{ flex: 1, gap: 1 }}><Txt s={14} w={600}>{title}</Txt>{sub && <Txt s={11.5} c={C.tx50}>{sub}</Txt>}</View>
        {count && <Txt s={12} c={C.tx50}>{count}</Txt>}
        <Txt c={C.tx40}>{open ? '⌃' : '⌄'}</Txt>
      </Pressable>
      {open && <View style={{ borderTopWidth: 1, borderTopColor: C.line }}>{children}</View>}
    </View>
  )
}

/**
 * The PnL so far (the web's top chart, without the hover): one line over a fill to zero, green
 * when it ends up, red when down; a day with no price is a gap, never a straight line. A dashed
 * line where a PT the position held matured — from there it earns nothing.
 */
function Chart({ s, f }: { s: PositionSeries; f: Fmt }) {
  const W = 600, H = 160
  const pts = s.points
  if (pts.length < 2) return <Txt s={12.5} c={C.tx50}>Not enough history to draw yet.</Txt>
  const i0 = Math.max(0, pts.findIndex((p) => p.nav != null))
  const t0 = Date.parse(pts[i0].t), t1 = Date.parse(pts[pts.length - 1].t)
  const x = (t: number) => 4 + ((t - t0) / Math.max(1, t1 - t0)) * (W - 8)
  const vals = pts.map((p) => (p.nav == null ? null : p.pnl))
  const pv = vals.filter((v): v is number => v != null)
  let lo = Math.min(0, ...pv), hi = Math.max(0, ...pv)
  if (hi - lo < 1e-12) hi = lo + 1
  const y = (v: number) => 8 + ((hi - v) / (hi - lo)) * (H - 16)
  // the runs between gaps, each as a line and as an area closed to zero
  const runs: [number, number][][] = []
  let cur: [number, number][] | null = null
  vals.forEach((v, i) => { if (i < i0 || v == null) { cur = null; return } if (!cur) runs.push((cur = [])); cur.push([x(Date.parse(pts[i].t)), y(v)]) })
  const line = runs.map((r) => r.map(([X, Y], k) => `${k ? 'L' : 'M'}${X.toFixed(1)},${Y.toFixed(1)}`).join('')).join('')
  const z = y(0).toFixed(1)
  const area = runs.map((r) => `M${r[0][0].toFixed(1)},${z}` + r.map(([X, Y]) => `L${X.toFixed(1)},${Y.toFixed(1)}`).join('') + `L${r[r.length - 1][0].toFixed(1)},${z}Z`).join('')
  const c = (pv.at(-1) ?? 0) >= 0 ? C.ok : C.bad
  const marks = maturityMarks(s, t0, t1)
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Txt s={12} c={C.tx50} style={{ flex: 1 }}>PnL so far</Txt>
        <Txt s={12} c={C.tx50}>{f.vs(hi)} high · {f.vs(lo)} low</Txt>
      </View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Defs><LinearGradient id="pnlFill" x1="0" x2="0" y1="0" y2="1"><Stop offset="0" stopColor={c} stopOpacity={0.24} /><Stop offset="1" stopColor={c} stopOpacity={0} /></LinearGradient></Defs>
        <Line x1={4} x2={W - 4} y1={y(0)} y2={y(0)} stroke={C.line2} strokeDasharray="3 4" />
        {marks.map((m) => <Line key={m.t} x1={x(m.t)} x2={x(m.t)} y1={0} y2={H} stroke={C.warn} strokeOpacity={0.6} strokeDasharray="2 3" />)}
        <Path d={area} fill="url(#pnlFill)" />
        <Path d={line} fill="none" stroke={c} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
      </Svg>
      <View style={{ flexDirection: 'row' }}>
        <Txt s={11} c={C.tx40} style={{ flex: 1 }}>{day(pts[i0].t)}</Txt>
        <Txt s={11} c={C.tx40}>{day(pts[pts.length - 1].t)}</Txt>
      </View>
      {marks.length > 0 && <Txt s={11.5} c={C.tx50} lh={16}>Dashed: {marks.map((m) => m.symbol).join(', ')} matured — from there it earns nothing.</Txt>}
    </View>
  )
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.86)', borderBottomWidth: 1, borderBottomColor: '#1a1a1f' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  page: { paddingHorizontal: 16, paddingTop: 16 },
  note: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2, borderRadius: 14, padding: 14 },
  card: { backgroundColor: C.b200, borderRadius: 12, padding: 14, gap: 8 },
  stats: { flexDirection: 'row', gap: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: C.line },
  stat: { flex: 1, gap: 2, padding: 12, backgroundColor: C.b200 },
  fold: { backgroundColor: C.b200, borderRadius: 12, overflow: 'hidden' },
  foldH: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10 },
  leg: { padding: 12, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  line: { borderTopWidth: 1, borderTopColor: '#1a1a1f' },
})
