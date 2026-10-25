import React from 'react'
import { Image, Pressable, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { SvgUri } from 'react-native-svg'
import { assetLogo, colorOf, short, subscribeWideLogos, wideLogosReady } from '@yieldcircle/core/model/assets'
import { liveLogo, pct } from '@yieldcircle/core/model/format'
import { isSpike, seriesFor, type HistoryGet } from '@yieldcircle/core/model/rateHistory'
import type { Risk, Strategy } from '@yieldcircle/core/model/strategies'
import { C, RISK, alpha, mix } from '../theme'
import { family } from '../fonts'
import { Txt } from './Txt'

// React Native's <Image> draws no SVG; react-native-svg's SvgUri does (many token-list logos are SVG)
const isSvg = (u: string) => /\.svg(\?|#|$)/i.test(u)

/**
 * A token's mark (the web's `Tok`, app.css `.tok`): the strategy's own pictures in order, then the
 * token list's, then a lettered disc in the token's colour — 22px, a faint ring outside it.
 * `ring` replaces the ring: the second of a pair wears the card's colour (`.toks .tok+.tok`).
 */
export function Tok({ sym, logo, size = 22, ring }: { sym: string; logo?: string | (string | undefined)[]; size?: number; ring?: { w: number; color: string } }) {
  const wide = React.useSyncExternalStore(subscribeWideLogos, wideLogosReady)
  const urls = React.useMemo(() => [...new Set([...[logo].flat(), assetLogo(sym)].filter(liveLogo))], [String(logo), sym, wide]) // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = React.useState(0)
  React.useEffect(() => setI(0), [urls.join()])
  const r = ring ?? { w: 1, color: 'rgba(255,255,255,0.16)' }
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', top: -r.w, left: -r.w, width: size + 2 * r.w, height: size + 2 * r.w, borderRadius: size, backgroundColor: r.color }} />
      {i < urls.length
        ? isSvg(urls[i])
          ? <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#111' }}><SvgUri uri={urls[i]} width={size} height={size} onError={() => setI((n) => n + 1)} /></View>
          : <Image source={{ uri: urls[i] }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#111' }} onError={() => setI((n) => n + 1)} />
        : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colorOf(sym), alignItems: 'center', justifyContent: 'center' }}>
            <Txt s={size * 0.41} w={600} mono c="#000" lh={size * 0.6}>{short(sym)}</Txt>
          </View>}
    </View>
  )
}

/** A loop's pair (the web's `Toks`): the debt's token over the collateral's, 6px in, ringed in the card's colour. */
export function Toks({ a, b, logoA, logoB, size = 22, on = C.b200 }: { a: string; b?: string; logoA?: string; logoB?: string; size?: number; on?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Tok sym={a} logo={logoA} size={size} />
      {b && <View style={{ marginLeft: -6 }}><Tok sym={b} logo={logoB} size={size} ring={{ w: 2, color: on }} /></View>}
    </View>
  )
}

/** A strategy's face (the web's `LiteFace`): a deposit's token at 28, a loop's pair at 22 — never a venue badge. */
export function Face({ s, size = 28, on }: { s: Strategy; size?: number; on?: string }) {
  return s.kind === 'loop' ? <Toks a={s.holds} b={s.debt} logoA={s.logoLong} logoB={s.logoShort} on={on} /> : <Tok sym={s.assetSymbol} logo={[s.tokenLogo, s.logo]} size={size} />
}

const GLYPH: Record<string, string> = { USD: '$', ETH: 'Ξ', BTC: '₿', STOCKS: '↗', MORE: '+' }
/** A money's mark (the web's `GroupIcon`, `.gic`): its glyph in Plex Mono on a rounded square tinted with its colour. */
export function GroupIcon({ id, color, size = 20 }: { id: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, borderWidth: 1, borderColor: alpha(color, 0.4), backgroundColor: mix(color, 0.1, '#0b0b0b'), alignItems: 'center', justifyContent: 'center' }}>
      <Txt s={size * 0.56} w={600} mono c={color} lh={size * 0.75}>{GLYPH[id] ?? id[0]}</Txt>
    </View>
  )
}

/** Pro's risk word as a dot (`.risk i`): 9px. */
export function RiskDot({ r, size = 9 }: { r: Risk; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: RISK[r] }} />
}

/** The rate (`.lite-rate`): 17 / 600, green from 3%, amber when tonight's is a spike against its own month. */
export function Rate({ s, get, size = 17, w = 600, style }: { s: Strategy; get: HistoryGet; size?: number; w?: 600 | 700; style?: StyleProp<TextStyle> }) {
  const spike = isSpike(s.rate, seriesFor(s, get, true))
  return <Txt s={size} w={w} c={spike ? C.warn : s.rate >= 3 ? C.ok : C.tx} style={[{ fontVariant: ['tabular-nums'] }, style]}>{pct(s.rate)}</Txt>
}

/** A lever tag (`.pill.lever`): ×5.6 in violet on its tint. */
export function LeverPill({ text }: { text: string }) {
  return <View style={st.lever}><Txt s={11} w={600} c={C.violet} lh={16.5}>{text}</Txt></View>
}

/** A small pill (`.pill`): 10px caps in a hairline border, or a tone. */
export function Pill({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'ok' | 'pri' | 'warn' }) {
  const fg = tone === 'ok' ? C.ok : tone === 'pri' ? C.primary : tone === 'warn' ? C.warn : C.tx50
  const border = tone === 'ok' ? '#1f4a35' : tone === 'pri' ? '#14454f' : tone === 'warn' ? '#4a3a1a' : C.line2
  return <View style={{ borderWidth: 1, borderColor: border, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 }}><Txt s={10} w={600} c={fg} lh={15} style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>{children}</Txt></View>
}

/** A grey block where something is loading (`.sk`). */
export function Sk({ w, h = 14, r = 6, style }: { w: number | `${number}%`; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ width: w, height: h, borderRadius: r, backgroundColor: C.b300 }, style]} />
}

/** The web's segmented control (the refit `.seg`): a dark pill track, the chosen word on a raised pill. */
export function Seg<T extends string>({ items, value, onChange, grow }: { items: { id: T; word: string }[]; value: T; onChange: (v: T) => void; grow?: boolean }) {
  return (
    <View style={[st.seg, grow && { alignSelf: 'stretch' }]}>
      {items.map((x) => {
        const on = value === x.id
        return (
          <Pressable key={x.id} onPress={() => onChange(x.id)} style={[st.segItem, grow && { flex: 1 }, on && st.segOn]}>
            <Txt s={12.5} c={on ? C.tx : C.tx70}>{x.word}</Txt>
          </Pressable>
        )
      })}
    </View>
  )
}

/** The web's button (`.btn`, `.btn.pri`): a 999px pill, the primary one filled. */
export function Btn({ title, onPress, kind = 'pri', disabled, sm, wide }: { title: string; onPress?: () => void; kind?: 'pri' | 'plain' | 'paper' | 'risky'; disabled?: boolean; sm?: boolean; wide?: boolean }) {
  // `risky`: a loss the reader accepted (`.btn.pri.risky`)
  const bg = kind === 'pri' ? C.primary : kind === 'risky' ? C.bad : kind === 'paper' ? '#f4b740' : 'transparent'
  const fg = kind === 'pri' ? C.primaryInk : kind === 'risky' ? '#fff' : kind === 'paper' ? '#2a1d00' : C.tx
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [st.btn, { backgroundColor: bg, borderColor: kind === 'plain' ? C.line2 : bg }, sm && st.btnSm, wide && { alignSelf: 'stretch', minHeight: 46 }, pressed && { transform: [{ scale: 0.97 }] }, disabled && { opacity: 0.45 }]}>
      <Txt s={sm ? 12.5 : wide ? 15 : 13} w={600} c={fg}>{title}</Txt>
    </Pressable>
  )
}

/**
 * TRANSITIONAL — text styles for the screens not yet matched to the web (Pro's tabs, the strategy
 * screen, You). Each is rebuilt with `Txt` and the web's measured values in its phase of
 * docs/mobile-plan.md; delete this once the last one is.
 */
export const T = StyleSheet.create({
  h1: { color: C.tx, fontSize: 28, fontFamily: family(700) },
  h2: { color: C.tx, fontSize: 18, fontFamily: family(700) },
  body: { color: C.tx, fontSize: 15, fontFamily: family(400) },
  dim: { color: C.tx50, fontSize: 13, fontFamily: family(400) },
  dim70: { color: C.tx70, fontSize: 13, fontFamily: family(400) },
  ok: { color: C.ok, fontFamily: family(700) },
})

const st = StyleSheet.create({
  lever: { backgroundColor: alpha(C.violet, 0.14), borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  seg: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: C.b300, borderRadius: 999, padding: 3, gap: 2, borderWidth: 1, borderColor: 'transparent' },
  segItem: { minHeight: 28, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.b200, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  btn: { minHeight: 36, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  btnSm: { minHeight: 30, paddingHorizontal: 12 },
})
