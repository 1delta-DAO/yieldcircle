import React from 'react'
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { assetLogo, colorOf, short, subscribeWideLogos, wideLogosReady } from '@yieldcircle/core/model/assets'
import { liveLogo, pct } from '@yieldcircle/core/model/format'
import { isSpike, seriesFor, type HistoryGet } from '@yieldcircle/core/model/rateHistory'
import type { Risk, Strategy } from '@yieldcircle/core/model/strategies'
import { C, RISK } from '../theme'

// React Native's <Image> draws no SVG: such a logo is skipped for the next one, then the lettered disc
const drawable = (u: string) => !/\.svg(\?|#|$)/i.test(u)

/** A token's mark: the strategy's own pictures in order, then the token list's, then a lettered disc (the web's `Tok`). */
export function Tok({ sym, logo, size = 26 }: { sym: string; logo?: string | (string | undefined)[]; size?: number }) {
  const wide = React.useSyncExternalStore(subscribeWideLogos, wideLogosReady)
  const urls = React.useMemo(() => [...new Set([...[logo].flat(), assetLogo(sym)].filter(liveLogo).filter(drawable))], [String(logo), sym, wide]) // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = React.useState(0)
  React.useEffect(() => setI(0), [urls.join()])
  const box = { width: size, height: size, borderRadius: size / 2 }
  if (i < urls.length) return <Image source={{ uri: urls[i] }} style={[box, s.tok]} onError={() => setI((n) => n + 1)} />
  return (
    <View style={[box, s.tok, { backgroundColor: colorOf(sym), alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ color: '#000', fontSize: size * 0.34, fontWeight: '700' }}>{short(sym)}</Text>
    </View>
  )
}

/** A loop's two tokens, the debt's tucked under the collateral's. */
export function Toks({ a, b, logoA, logoB, size = 26 }: { a: string; b: string; logoA?: string; logoB?: string; size?: number }) {
  return (
    <View style={{ width: size * 1.45, height: size }}>
      <View style={{ position: 'absolute', left: size * 0.45, top: 0 }}><Tok sym={b} logo={logoB} size={size} /></View>
      <Tok sym={a} logo={logoA} size={size} />
    </View>
  )
}

/** A strategy's face: the token the money sits in, a loop's debt beside it — never a venue badge. */
export function Face({ s, size = 26 }: { s: Strategy; size?: number }) {
  return s.kind === 'loop' ? <Toks a={s.holds} b={s.debt} logoA={s.logoLong} logoB={s.logoShort} size={size} /> : <Tok sym={s.assetSymbol} logo={[s.tokenLogo, s.logo]} size={size} />
}

const GLYPH: Record<string, string> = { USD: '$', ETH: 'Ξ', BTC: '₿', STOCKS: '↗', MORE: '+' }
/** A money's mark: its glyph in its colour on a tinted disc (the web's `GroupIcon`). */
export function GroupIcon({ id, color, size = 20 }: { id: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: `${color}66`, backgroundColor: `${color}1a`, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontSize: size * 0.56, fontWeight: '700', lineHeight: size * 0.75 }}>{GLYPH[id] ?? id[0]}</Text>
    </View>
  )
}

export function RiskDot({ r, size = 8 }: { r: Risk; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: RISK[r] }} />
}

/** The rate, amber when tonight's is a spike against its own month (ranked by the steady one). */
export function Rate({ s, get, style }: { s: Strategy; get: HistoryGet; style?: StyleProp<TextStyle> }) {
  const spike = isSpike(s.rate, seriesFor(s, get, true))
  return <Text style={[s.rate >= 3 || spike ? { color: spike ? C.warn : C.ok } : { color: C.tx }, { fontWeight: '700', fontVariant: ['tabular-nums'] }, style]}>{pct(s.rate)}</Text>
}

/** A grey block where something is loading. */
export function Sk({ w, h = 14, style }: { w: number | `${number}%`; h?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: w, height: h, borderRadius: 6, backgroundColor: C.b300 }, style]} />
}

export function Pill({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'ok' | 'pri' }) {
  const bg = tone === 'ok' ? C.okBg : tone === 'pri' ? C.priBg : C.b400
  const fg = tone === 'ok' ? C.ok : tone === 'pri' ? C.primary : C.tx70
  return <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}><Text style={{ color: fg, fontSize: 11, fontWeight: '600' }}>{children}</Text></View>
}

/** A segmented control: one of a few words. */
export function Seg<T extends string>({ items, value, onChange }: { items: { id: T; word: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={s.seg}>
      {items.map((x) => (
        <Pressable key={x.id} onPress={() => onChange(x.id)} style={[s.segItem, value === x.id && s.segOn]}>
          <Text style={{ color: value === x.id ? C.tx : C.tx50, fontWeight: '600', fontSize: 13 }}>{x.word}</Text>
        </Pressable>
      ))}
    </View>
  )
}

export function Btn({ title, onPress, kind = 'pri', disabled }: { title: string; onPress?: () => void; kind?: 'pri' | 'plain'; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.btn, kind === 'pri' ? { backgroundColor: C.primary } : { backgroundColor: C.b400 }, (pressed || disabled) && { opacity: disabled ? 0.45 : 0.8 }]}>
      <Text style={{ color: kind === 'pri' ? C.primaryInk : C.tx, fontWeight: '700' }}>{title}</Text>
    </Pressable>
  )
}

export const T = StyleSheet.create({
  h1: { color: C.tx, fontSize: 28, fontWeight: '700' },
  h2: { color: C.tx, fontSize: 18, fontWeight: '700' },
  body: { color: C.tx, fontSize: 15 },
  dim: { color: C.tx50, fontSize: 13 },
  dim70: { color: C.tx70, fontSize: 13 },
  ok: { color: C.ok, fontWeight: '700' },
})

const s = StyleSheet.create({
  tok: { backgroundColor: C.b300 },
  seg: { flexDirection: 'row', backgroundColor: C.b200, borderRadius: 10, padding: 3, gap: 3, borderWidth: 1, borderColor: C.line },
  segItem: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  segOn: { backgroundColor: C.b400 },
  btn: { paddingVertical: 13, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center' },
})
