import React from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Line, Path } from 'react-native-svg'
import { MAX_TOPUPS, type PaperBook } from '@yieldcircle/core/model/paper'
import { metaKey, paperHoldings, paperPnlBook } from '@yieldcircle/core/model/paperView'
import { signedMoney } from '@yieldcircle/core/model/lite'
import { num, pct, usd, usdShort } from '@yieldcircle/core/model/format'
import { chainLabel } from '@yieldcircle/app/sdk/queries'
import { usePaperDaily } from '@yieldcircle/app/social/queries'
import { usePaper } from '../src/paper'
import { C } from '../src/theme'
import { Btn, Seg } from '../src/ui/bits'
import { IconBack } from '../src/ui/icons'
import { PAPER, PaperNotice, paperStatusWord } from '../src/ui/paper'
import { Txt } from '../src/ui/Txt'

const DAYS = ['0', '7', '30', '90'] as const

/**
 * Every number of the paper account (the web's paper head and `PaperWalletBook`): what the
 * strategies earned, what is at work, what was put in, what moving the money cost; the daily line;
 * each position with what it made; the bank and what is still bridging; the paper clock.
 */
export default function PaperBookScreen() {
  const insets = useSafeAreaInsets()
  const paper = usePaper()
  const daily = usePaperDaily(paper.session?.evm, 90)
  const [bank, setBank] = React.useState(false)
  React.useEffect(() => { if (paper.active) void paper.sync() }, [paper.active]) // eslint-disable-line react-hooks/exhaustive-deps
  const l = paper.ledger, b = paper.book
  const at = paper.viewNow
  const rows = l ? paperHoldings(l, at, paper.price) : []
  const made = new Map((l ? paperPnlBook(l, at, paper.price).positions : []).map((p) => [`paper:${p.key}`, p]))
  const balances = l ? Object.entries(l.bank).flatMap(([c, toks]) => Object.entries(toks).map(([t, u]) => ({ c, t, u, m: paper.tokens[metaKey(c, t)], p: paper.price(c, t) }))).filter((r) => r.u > 0).sort((a, z) => (z.p ?? 0) * z.u - (a.p ?? 0) * a.u) : []
  const pts = (daily.data?.days ?? []).map((d) => d.pnlUsd)
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[st.bar, { paddingTop: insets.top, height: 60 + insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={6} style={st.back} accessibilityLabel="Back"><IconBack color={C.tx70} /></Pressable>
        <View style={st.pill}><Txt s={11} w={600} c={PAPER.fg} lh={16.5}>paper</Txt></View>
        <Txt s={16} w={600} style={{ flex: 1 }} numberOfLines={1}>{paper.session?.name ?? 'Paper account'}</Txt>
        <Txt s={11.5} c={C.tx50}>{paperStatusWord(paper)}</Txt>
      </View>
      <ScrollView contentContainerStyle={[st.page, { paddingBottom: insets.bottom + 40 }]}>
        {!paper.active || !l || !b ? <Txt s={13} c={C.tx50} lh={19}>{paper.active ? 'Reading the paper book…' : 'Paper is not in use. Turn it on in Profile and settings.'}</Txt> : <>
          <PaperNotice />
          <View style={st.stats}>
            <Stat k="Earned by strategies" v={signedMoney(b.pnlUsd)} tone={b.pnlUsd >= 0 ? C.ok : C.bad} s={`${pct(b.returnPct, 3)} of what was put in`} />
            <Stat k="At work" v={usd(b.deployedUsd)} s={`${b.positions} position${b.positions === 1 ? '' : 's'}${b.netAprPct != null ? ` · ${pct(b.netAprPct)} net` : ''}`} />
            <Stat k="Put in" v={usd(l.putInUsd)} s={l.topups ? `${l.topups} of ${MAX_TOPUPS} top-ups` : 'the starting bank'} />
            <Friction b={b} />
          </View>

          <Txt s={16} w={600} style={st.h}>Day by day</Txt>
          {pts.length > 1 ? <Spark pts={pts} /> : <Txt s={12.5} c={C.tx50}>{daily.isLoading ? '' : 'The daily line starts after a second day.'}</Txt>}

          <Txt s={16} w={600} style={st.h}>Each position</Txt>
          {!rows.length && <Txt s={13} c={C.tx50}>Nothing at work yet — it is all in the paper bank.</Txt>}
          {rows.map((h) => {
            const m = made.get(h.key)
            return (
              <View key={h.key} style={st.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt s={14} w={700} numberOfLines={1}>{h.label}</Txt>
                  <Txt s={12} c={C.tx50} numberOfLines={1}>{h.venue} · {chainLabel(h.chainId)}{h.health != null ? ` · health ${h.health.toFixed(2)}` : ''}</Txt>
                  {h.health != null && h.health < 1 && <Txt s={12} c={C.bad}>Would have been liquidated. On paper it stays open — close it to see what is left.</Txt>}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Txt w={700}>{usd(h.valueUsd)}</Txt>
                  <Txt s={12} c={C.tx50}>{h.apr != null ? <Txt s={12} c={C.ok}>{pct(h.apr)}</Txt> : '—'}{h.leverage && h.leverage > 1.05 ? ` · ${h.leverage.toFixed(1)}×` : ''}</Txt>
                  {m && <Txt s={12} w={600} c={m.pnlUsd >= 0 ? C.ok : C.bad}>{signedMoney(m.pnlUsd)} made</Txt>}
                </View>
              </View>
            )
          })}

          <Pressable onPress={() => setBank(!bank)} style={[st.row, { marginTop: 18 }]} accessibilityState={{ expanded: bank }}>
            <Txt s={16} w={600} style={{ flex: 1 }}>The bank</Txt>
            <Txt s={13} c={C.tx50}>{usdShort(b.bankUsd)} · {balances.length} balance{balances.length === 1 ? '' : 's'} {bank ? '⌃' : '⌄'}</Txt>
          </Pressable>
          {bank && <>
            {balances.map((r) => (
              <View key={r.c + r.t} style={st.bk}>
                <Txt s={13} style={{ flex: 1 }} numberOfLines={1}>{r.m?.symbol ?? r.t.slice(0, 8)} <Txt s={12} c={C.tx50}>{chainLabel(r.c)}</Txt></Txt>
                <Txt s={13} style={{ fontVariant: ['tabular-nums'] }}>{num(r.u, 4)}</Txt>
                <Txt s={12.5} c={C.tx50} style={{ minWidth: 72, textAlign: 'right' }}>{r.p != null ? usd(r.u * r.p) : '—'}</Txt>
              </View>
            ))}
            {l.inflight.map((t) => (
              <View key={t.id} style={st.bk}>
                <Txt s={13} style={{ flex: 1 }} numberOfLines={1}>{paper.tokens[metaKey(t.toChainId, t.token)]?.symbol ?? 'token'} <Txt s={12} c={C.tx50}>{t.fromChainId === t.toChainId ? `${t.bridge ?? 'exit queue'} on ${chainLabel(t.toChainId)}` : `bridging to ${chainLabel(t.toChainId)}`}</Txt></Txt>
                <Txt s={13} style={{ fontVariant: ['tabular-nums'] }}>{num(t.units, 4)}</Txt>
                <Txt s={12.5} c={C.tx50} style={{ minWidth: 72, textAlign: 'right' }}>lands {new Date(t.arrivesAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Txt>
              </View>
            ))}
          </>}

          <Txt s={16} w={600} style={st.h}>Paper clock</Txt>
          <Seg grow items={DAYS.map((d) => ({ id: d, word: d === '0' ? 'Today' : `+${d} days` }))} value={String(paper.skewDays) as typeof DAYS[number]} onChange={(d) => paper.setSkewDays(Number(d))} />
          <Txt s={12} c={C.tx50} lh={17} style={{ marginTop: 8 }}>{paper.skewDays > 0
            ? `A preview: every position accrued ${paper.skewDays} days ahead at today's rates. Trading waits until the clock is back at today, and the board always counts real time.`
            : 'See where your positions would be in a week, a month or three, at today’s rates.'}</Txt>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 22 }}>
            <Btn sm kind="paper" title="Find a strategy" onPress={() => { if (router.canDismiss()) router.dismissAll(); router.replace('/lite/earn') }} />
          </View>
        </>}
      </ScrollView>
    </View>
  )
}

function Stat({ k, v, s, tone }: { k: string; v: string; s: string; tone?: string }) {
  return (
    <View style={st.stat}>
      <Txt s={12} w={600} c={C.tx50}>{k}</Txt>
      <Txt s={19} w={700} c={tone ?? C.tx}>{v}</Txt>
      <Txt s={11.5} c={C.tx50} lh={15.5}>{s}</Txt>
    </View>
  )
}

/** Friction so far (the web's `FrictionStat`): swaps, bridges, network fees, loop entries and exits — already inside what was earned. */
const costWord = (x: number) => (x < 0.01 ? '<$0.01' : x < 10 ? `$${x.toFixed(2)}` : usdShort(x))
function Friction({ b }: { b: PaperBook }) {
  const f = b.friction
  const parts = ([['swaps', f.tradeUsd], ['bridges', f.bridgeUsd], ['network fees', f.gasUsd], ['loop entries', f.entryUsd], ['exits', f.exitUsd]] as const).filter(([, v]) => v > 0.005)
  return <Stat k="Friction so far" v={b.frictionUsd > 0 ? `−${costWord(b.frictionUsd)}` : '$0'} tone={b.frictionUsd > 0 ? C.warn : undefined}
    s={parts.length ? parts.slice().sort((a, z) => z[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} ${costWord(v)}`).join(' · ') : 'fees, slippage, bridges'} />
}

/** What the strategies earned, one point a day as the server valued it, with its zero. */
function Spark({ pts }: { pts: number[] }) {
  const w = 340, h = 64
  const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts), span = hi - lo || 1
  const x = (i: number) => 2 + (i * (w - 4)) / Math.max(1, pts.length - 1), y = (v: number) => 3 + ((hi - v) * (h - 6)) / span
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  return (
    <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <Line x1={2} x2={w - 2} y1={y(0)} y2={y(0)} stroke={C.line} strokeDasharray="3 4" />
      <Path d={d} fill="none" stroke={PAPER.fg} strokeWidth={1.8} />
    </Svg>
  )
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.86)', borderBottomWidth: 1, borderBottomColor: '#1a1a1f' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pill: { backgroundColor: PAPER.bg, borderWidth: 1, borderColor: PAPER.line, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  page: { paddingHorizontal: 16, paddingTop: 18, gap: 4 },
  h: { letterSpacing: -0.16, marginTop: 24, marginBottom: 8 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '47%', flexGrow: 1, gap: 2, padding: 12, borderRadius: 12, backgroundColor: C.b200, borderWidth: 1, borderColor: PAPER.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#1a1a1f' },
  bk: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
})
