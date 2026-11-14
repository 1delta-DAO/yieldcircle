import React from 'react'
import { Linking, Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBook } from '@yieldcircle/app/book'
import { chainLabel } from '@yieldcircle/app/sdk/queries'
import { dismissTrace, isDone, recheck, useTrace, type Trace } from '@yieldcircle/app/sdk/txTrace'
import { earnedSince, holdingFor, outcomeOf, receiptRows, rowText, tickerText, trackerOf, type Next, type Row } from '@yieldcircle/app/sdk/txOutcome'
import { useTween } from '@yieldcircle/app/sdk/activity'
import { reached, stages, useNow } from '@yieldcircle/app/sdk/txWords'
import { usd } from '@yieldcircle/core/model/format'
import type { Holding } from '@yieldcircle/core/model/positions'
import { C } from '../../theme'
import { txUrl } from '../../explorer'
import { Btn, Pill } from '../bits'
import { Txt } from '../Txt'
import { Confetti } from './Confetti'
import { feel } from '../../feel'
import { firstCheer, useCountUp, useReduceMotion } from './motion'
import { Ring, Route } from './Ring'

/** How far along a trace is, 0..1: its stages, and a bridge by time against its quote. */
export function progressOf(t: Trace, now: number) {
  const st = stages(t).length, n = reached(t)
  if (t.phase === 'bridging' && t.arrivesAt && t.arrivesAt > t.at) return Math.min(st - 0.1, n + Math.min(0.95, (now - t.at) / (t.arrivesAt - t.at))) / st
  return n / st
}

/**
 * The end of an action, as a trading app shows a filled order (docs/tx-feedback-plan.md §4.3–4.4):
 * the whole screen is the answer — the ring, one bold line, the amount, the order in a few rows,
 * one button — and confetti over it. Still on its way: the ring fills and says where it is. Gone
 * wrong: where the money is, big, and one thing to do about it.
 *
 * Driven by the trace alone, so the ticket, the pill's receipt and *Get* draw the same screen, and it
 * survives the ticket remounting under it. `compact`: *Get*'s, inside its sheet — a step, not the end.
 */
export function OutcomeView({ id, onDone, onAgain, onLeave, onFail, partial, links, compact, steps, children }: {
  id: string
  onDone: () => void
  /** "Try again": the ticket rebuilds; absent where nothing can be rebuilt from here */
  onAgain?: () => void
  /** while it is on its way: close the sheet, the pill takes over */
  onLeave?: () => void
  onFail?: string
  partial?: boolean
  /** under the button on a success: See it · Share */
  links?: (h: Holding | undefined) => { label: string; onPress: () => void }[]
  compact?: { done: string }
  /** what was signed, behind a fold: the ticket's steps, and whether they went as one transaction */
  steps?: { labels: string[]; batched: boolean }
  children?: React.ReactNode
}) {
  const t = useTrace(id)
  const insets = useSafeAreaInsets()
  const still = useReduceMotion()
  const now = useNow(!!t && !isDone(t))
  const b = useBook()
  const [burst, setBurst] = React.useState(false)
  const [ringAt, setRingAt] = React.useState({ x: 0, y: 0 })
  const [topY, setTopY] = React.useState(0)
  const o = t ? outcomeOf(t, { now, chain: chainLabel, onFail, partial }) : null
  React.useEffect(() => {
    if (!o) return
    if (o.state === 'won' && firstCheer(id)) { if (!still) setBurst(true); feel.won() }
    if (o.state === 'lost' && firstCheer(id)) feel.lost()
    // seen here: the pill does not say it again
    if (o.state !== 'flying') dismissTrace(id)
  }, [o?.state])
  const r = t?.receipt
  const h = t && o && (o.state === 'won' || o.state === 'soft') && r && !['swap', 'bridge'].includes(r.kind) ? holdingFor(b.holdings, t) : undefined
  const counted = useCountUp(r?.usd ?? 0, !!o && o.state !== 'lost', still)
  // what money put to work has made since it landed, by the second
  const earning = !!t && t.phase === 'settled' && !t.note && ['deposit', 'open', 'collateral'].includes(r?.kind ?? '')
  const tick = useNow(earning)
  const [stepsOpen, setStepsOpen] = React.useState(false)
  if (!t || !o) return null
  const earned = earning && o.state === 'won' ? earnedSince(t, h, tick) : null
  const tracker = o.state !== 'won' ? trackerOf(t) : undefined
  const ringSize = compact ? 76 : 116
  const hero = o.state === 'lost' ? undefined : r?.usd != null && r.usd > 0 ? usd(counted) : r?.amount
  const rows = o.state === 'lost' ? [] : receiptRows(t, h, { chain: chainLabel, compact: !!compact })
  const url = txUrl(t.chainId, t.hash)
  const btn = (n: Next, k: number) => {
    const kind = k === 0 ? (o.tone === 'bad' ? 'risky' : 'pri') : 'plain'
    switch (n) {
      case 'again': return onAgain ? <Btn key={n} wide kind={kind} title={partial ? 'Send it again' : 'Try again'} onPress={onAgain} /> : null
      case 'view': return tracker ? <Btn key={n} wide kind={kind === 'risky' ? 'plain' : kind} title={`Track it on ${tracker.name}`} onPress={() => void Linking.openURL(tracker.url)} />
        : url ? <Btn key={n} wide kind={kind === 'risky' ? 'plain' : kind} title="View transaction" onPress={() => void Linking.openURL(url)} /> : null
      case 'check': return <Btn key={n} wide kind={kind} title="Check again" onPress={() => recheck(id)} />
      case 'done': return <Btn key={n} wide kind={kind} title={compact?.done ?? 'Done'} onPress={onDone} />
    }
  }
  const nexts = o.state === 'flying' ? [] : [...o.next, ...(o.next.includes('done') ? [] : ['done' as const])]
  const shown = nexts.map((n, i) => btn(n, i)).filter(Boolean)
  return (
    <View style={[compact ? st.compact : [st.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]]}>
      <View style={compact ? st.compactTop : st.top} onLayout={(e) => setTopY(e.nativeEvent.layout.y)}>
        <View onLayout={(e) => { const l = e.nativeEvent.layout; setRingAt({ x: l.x + l.width / 2, y: l.y + l.height / 2 }) }}>
          <Ring state={o.state} tone={o.tone} size={ringSize} progress={progressOf(t, now)} still={still} />
        </View>
        <View style={{ alignItems: 'center', gap: 6, marginTop: compact ? 10 : 22 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt s={compact ? 18 : 24} w={700} lh={compact ? 23 : 30} style={{ textAlign: 'center' }}>{o.head}</Txt>
            {t.paper && <Pill tone="warn">paper</Pill>}
          </View>
          {!!hero && <Txt s={compact ? 26 : 44} w={600} mono lh={compact ? 32 : 52} c={o.state === 'flying' ? C.tx70 : C.tx} style={{ fontVariant: ['tabular-nums'] }}>{hero}</Txt>}
          {earned != null && !compact && <Txt s={13} mono c={C.ok} style={{ fontVariant: ['tabular-nums'] }} accessibilityLabel="earned since it landed">{tickerText(earned)} earned so far</Txt>}
          {o.state === 'flying' && t.bridge && <View style={{ alignSelf: 'stretch', marginTop: 8 }}><Route from={chainLabel(t.chainId)} to={chainLabel(t.bridge.toChainId)} progress={progressOf(t, now)} still={still} /></View>}
          {o.state === 'flying' && tracker && <Pressable onPress={() => void Linking.openURL(tracker.url)} hitSlop={8} accessibilityRole="link"><Txt s={12.5} c={C.primary}>Track it on {tracker.name} ↗</Txt></Pressable>}
          {!!o.detail && o.state !== 'lost' && <Txt s={13.5} c={o.tone === 'warn' ? C.warn : C.tx50} lh={19} style={{ textAlign: 'center', marginTop: 2 }}>{o.detail}</Txt>}
        </View>
        {o.state === 'lost' && (
          <View style={[st.money, { borderColor: o.tone === 'bad' ? 'rgba(229,83,75,.45)' : 'rgba(226,163,58,.45)' }]}>
            <Txt s={11} w={600} c={C.tx50} style={st.k}>Your money</Txt>
            <Txt s={17} w={600} lh={24}>{o.money}</Txt>
            {!!o.detail && <Txt s={12.5} c={C.tx50} lh={17}>{o.detail}</Txt>}
          </View>
        )}
        {rows.length > 0 && (
          <View style={[st.rows, compact && { marginTop: 12 }]}>
            {rows.map((x, i) => <RowView key={x.k} r={x} first={i === 0} />)}
            {url && !compact && (
              <Pressable onPress={() => void Linking.openURL(url)} style={[st.row, { borderTopWidth: 1, borderTopColor: C.line }]} accessibilityRole="link">
                <Txt s={13} c={C.tx50}>Transaction</Txt>
                <Txt s={13} mono c={C.primary} style={{ flex: 1, textAlign: 'right' }}>{t.hash.slice(0, 6)}…{t.hash.slice(-4)} ↗</Txt>
              </Pressable>
            )}
          </View>
        )}
      </View>
      <View style={{ gap: 8, marginTop: compact ? 14 : 0 }}>
        {o.state === 'flying'
          ? <>
              {onLeave && <Btn wide kind="plain" title="Keep browsing — we’ll tell you" onPress={onLeave} />}
              <Txt s={12} c={C.tx40} lh={17} style={{ textAlign: 'center' }}>It keeps going if you close this. Your transactions are on the pill above the tabs.</Txt>
            </>
          : shown}
        {steps && steps.labels.length > 1 && o.state !== 'flying' && (
          <Pressable onPress={() => setStepsOpen((x) => !x)} style={st.fold} accessibilityRole="button" accessibilityState={{ expanded: stepsOpen }}>
            <Txt s={12.5} c={C.tx50} style={{ textAlign: 'center' }}>{steps.labels.length} steps{steps.batched ? ' in one transaction' : ''} {stepsOpen ? '▴' : '▾'}</Txt>
            {stepsOpen && steps.labels.map((l, i) => <Txt key={i} s={12.5} c={C.tx70} style={{ textAlign: 'center' }}>{i + 1}. {l}</Txt>)}
          </Pressable>
        )}
        {o.state === 'won' && links && (
          <View style={st.links}>
            {links(h).map((x) => <Pressable key={x.label} onPress={x.onPress} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }} accessibilityRole="button"><Txt s={13.5} w={600} c={C.primary}>{x.label}</Txt></Pressable>)}
          </View>
        )}
        {o.state !== 'flying' && o.state !== 'lost' && children}
      </View>
      {burst && <Confetti origin={{ x: ringAt.x, y: topY + ringAt.y }} small={!!compact} onEnd={() => setBurst(false)} />}
    </View>
  )
}

/**
 * One row of the order. A figure moves to its new value as the synced position replaces the quote
 * (greyed → white), rather than swapping its text; a transaction opens on its explorer.
 */
function RowView({ r, first }: { r: Row; first: boolean }) {
  const n = useTween(r.n ?? 0)
  const url = r.tx ? txUrl(r.tx.chainId, r.tx.hash) : undefined
  const v = r.n != null && r.f ? rowText(r.f, n) : r.v
  const body = (
    <>
      <Txt s={13} c={C.tx50}>{r.k}</Txt>
      <Txt s={13.5} w={500} mono={!!url} c={url ? C.primary : r.tone === 'dim' ? C.tx50 : r.tone === 'ok' ? C.ok : r.tone === 'bad' ? C.bad : C.tx} style={{ flex: 1, textAlign: 'right' }} numberOfLines={2}>{v}{url ? ' ↗' : ''}</Txt>
    </>
  )
  const style = [st.row, !first && { borderTopWidth: 1, borderTopColor: C.line }]
  return url ? <Pressable onPress={() => void Linking.openURL(url)} style={style} accessibilityRole="link">{body}</Pressable> : <View style={style}>{body}</View>
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20 },
  top: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  compact: { paddingVertical: 8 },
  compactTop: { alignItems: 'center' },
  money: { alignSelf: 'stretch', marginTop: 22, padding: 16, gap: 6, borderRadius: 16, borderWidth: 1, backgroundColor: C.b200 },
  k: { letterSpacing: 0.6, textTransform: 'uppercase' },
  rows: { alignSelf: 'stretch', marginTop: 26, borderRadius: 16, backgroundColor: C.b200, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46, paddingVertical: 10, paddingHorizontal: 14 },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 22 },
  fold: { minHeight: 36, justifyContent: 'center', gap: 2, paddingVertical: 4 },
})
