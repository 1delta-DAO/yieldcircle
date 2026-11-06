import React from 'react'
import { type GestureResponderEvent, type LayoutChangeEvent, View, StyleSheet } from 'react-native'
import Svg, { Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg'
import { bookOf } from '@yieldcircle/core/model/paper'
import { marksAt, nearestPoint, paperChartMarks, paperChartPoints, paperChartRange, paperChartScale } from '@yieldcircle/core/model/paperChart'
import { signedMoney } from '@yieldcircle/core/model/lite'
import { usd, usdShort } from '@yieldcircle/core/model/format'
import { usePaperDaily, usePaperHourly, usePaperOps } from '@yieldcircle/app/social/queries'
import { usePaper } from '../paper'
import { C } from '../theme'
import { Seg } from './bits'
import { Txt } from './Txt'

const H = 150
const RANGES = [{ id: '7', word: '7d' }, { id: '30', word: '30d' }, { id: 'all', word: 'All' }] as const
type Range = (typeof RANGES)[number]['id']
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const TONE = { in: C.ok, out: C.warn, move: C.tx50 }

/**
 * What the paper account's strategies earned over time: the web's `PaperPnlChart`, off the same
 * `model/paperChart.ts`. Drag along the line to read a point; real time only, like the web's.
 */
export function PaperPnlChart({ account }: { account: string }) {
  const paper = usePaper()
  const daily = usePaperDaily(account, 365)
  const hourly = usePaperHourly(account)
  const ops = usePaperOps(account)
  const [range, setRange] = React.useState<Range>('all')
  const [hover, setHover] = React.useState<number | null>(null)
  const [W, setW] = React.useState(0)
  const now = Date.now()
  const book = paper.ledger ? bookOf(paper.ledger, now, paper.price) : null
  const all = paperChartPoints(daily.data?.days ?? [], hourly.data?.points ?? [], now, book?.priced ? book : null, paper.ledger?.createdAt)
  const pts = paperChartRange(all, range === 'all' ? null : Number(range), now)
  if (pts.length < 2) return <Txt s={12.5} c={C.tx50}>{daily.isLoading ? '' : 'The line starts at the next hourly valuation.'}</Txt>
  const end = pts[pts.length - 1].pnlUsd
  const c = end >= 0 ? C.ok : C.bad
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)
  if (!W) return <View onLayout={onLayout} style={st.box} />
  const s = paperChartScale(pts, W, H, 4, 8)
  const marks = paperChartMarks(ops.data?.ops ?? []).filter((m) => m.t >= s.t0 && m.t <= s.t1)
  const read = (e: GestureResponderEvent) => setHover(nearestPoint(pts, s.at(e.nativeEvent.locationX)))
  const i = hover != null && hover < pts.length ? hover : pts.length - 1
  const p = pts[i]
  const moved = marksAt(marks, pts, i)
  return (
    <View style={st.wrap}>
      <View style={st.read}>
        <Txt s={22} w={700} c={p.pnlUsd < 0 ? C.bad : C.ok}>{signedMoney(p.pnlUsd)}</Txt>
        <Txt s={12.5} c={C.tx70}>{day(p.t)} · account value {usd(p.navUsd)}</Txt>
        <Txt s={12} c={C.tx50} numberOfLines={1}>{moved.length ? moved.map((m) => m.label).join(' · ') : p.priceUsd != null ? `farming ${signedMoney(p.pnlUsd - p.priceUsd)} · price ${signedMoney(p.priceUsd)}` : ' '}</Txt>
      </View>
      <View
        onLayout={onLayout}
        style={st.box}
        onStartShouldSetResponder={() => true}
        onResponderGrant={read}
        onResponderMove={read}
        onResponderRelease={() => setHover(null)}
        onResponderTerminate={() => setHover(null)}
        accessibilityLabel={`what the strategies earned, ${signedMoney(end)}`}
      >
        <Svg width={W} height={H} pointerEvents="none">
          <Defs><LinearGradient id="paperpnl" x1="0" x2="0" y1="0" y2="1"><Stop offset="0" stopColor={c} stopOpacity={0.22} /><Stop offset="1" stopColor={c} stopOpacity={0} /></LinearGradient></Defs>
          <Path d={s.area} fill="url(#paperpnl)" />
          <Line x1={4} x2={W - 4} y1={s.y(0)} y2={s.y(0)} stroke={C.line2} strokeDasharray="3 4" />
          {marks.map((m, k) => <Line key={k} x1={s.x(m.t)} x2={s.x(m.t)} y1={H - 11} y2={H - 3} stroke={TONE[m.tone]} strokeWidth={2} />)}
          <Path d={s.line} fill="none" stroke={c} strokeWidth={1.8} />
          {hover != null && <Line x1={s.x(p.t)} x2={s.x(p.t)} y1={4} y2={H - 4} stroke={C.tx50} strokeDasharray="2 3" />}
        </Svg>
        <Txt s={10.5} c={C.tx50} style={[st.ax, { top: 2 }]}>{s.hi > 0 ? `+${usdShort(s.hi)}` : ''}</Txt>
        <Txt s={10.5} c={C.tx50} style={[st.ax, { bottom: 14 }]}>{s.lo < 0 ? `−${usdShort(-s.lo)}` : ''}</Txt>
      </View>
      <View style={st.foot}>
        <Txt s={11.5} c={C.tx50}>{day(s.t0)} → {day(s.t1)}</Txt>
        <Seg items={[...RANGES]} value={range} onChange={(v) => { setRange(v); setHover(null) }} />
      </View>
    </View>
  )
}

const st = StyleSheet.create({
  wrap: { gap: 6 },
  read: { gap: 1 },
  box: { height: H, borderRadius: 10, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  ax: { position: 'absolute', right: 6 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
})
