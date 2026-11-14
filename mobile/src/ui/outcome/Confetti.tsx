import React from 'react'
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native'
import { C } from '../../theme'

const COLORS = [C.primary, C.ok, C.violet, '#ffffff', '#f4b740', C.primary, C.ok]
type Piece = { x0: number; vx: number; vy: number; spin: number; flips: number; w: number; h: number; r: number; color: string; delay: number }

/**
 * The burst over a success (docs/tx-feedback-plan.md §4.1), as a trading app throws it over a filled
 * order: paper strips and dots shot up out of the mark and drifting down with spin and flutter, once,
 * about two and a half seconds, then gone. One clock on the native thread drives every piece; each
 * piece's fall is a parabola sampled into its interpolation. `small`: the pill's — a dozen, close by.
 */
export function Confetti({ origin, small, onEnd }: { origin: { x: number; y: number }; small?: boolean; onEnd?: () => void }) {
  const { width, height } = useWindowDimensions()
  const t = React.useRef(new Animated.Value(0)).current
  const T = small ? 1.1 : 2.6
  const pieces = React.useMemo<Piece[]>(() => Array.from({ length: small ? 14 : 110 }, (_, i) => {
    const strip = i % 3 !== 0
    const a = -Math.PI / 2 + (Math.random() - 0.5) * (small ? 2.4 : 2.1)
    const v = (small ? 140 : 520) + Math.random() * (small ? 90 : 520)
    const s = small ? 0.5 : 1
    return {
      x0: (Math.random() - 0.5) * (small ? 10 : 40), vx: Math.cos(a) * v * (small ? 1 : 0.75), vy: Math.sin(a) * v,
      spin: (Math.random() - 0.5) * 1440, flips: 2 + Math.floor(Math.random() * 5),
      w: (strip ? 6 : 7) * s, h: (strip ? 13 : 7) * s, r: strip ? 1.5 : 4, color: COLORS[i % COLORS.length], delay: Math.random() * 0.08,
    }
  }), [small])
  React.useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: T * 1000, easing: Easing.linear, useNativeDriver: true }).start(() => onEnd?.())
  }, [])
  const g = small ? 520 : 1350 // px / s²
  const steps = [0, 0.08, 0.16, 0.26, 0.38, 0.52, 0.68, 0.84, 1]
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        // seconds since its own start, at each sample; air slows it sideways
        const at = (k: number) => Math.max(0, k * T - p.delay * T)
        const xs = steps.map((k) => p.x0 + p.vx * (1 - Math.exp(-1.6 * at(k))) / 1.6)
        const ys = steps.map((k) => { const s = at(k); return Math.min(height + 40 - origin.y, p.vy * s + 0.5 * g * s * s) })
        return (
          <Animated.View key={i} style={{
            position: 'absolute', left: Math.min(width, Math.max(0, origin.x)) - p.w / 2, top: origin.y - p.h / 2, width: p.w, height: p.h, borderRadius: p.r, backgroundColor: p.color,
            opacity: t.interpolate({ inputRange: [0, p.delay, p.delay + 0.02, 0.75, 1], outputRange: [0, 0, 1, 1, 0] }),
            transform: [
              { translateX: t.interpolate({ inputRange: steps, outputRange: xs }) },
              { translateY: t.interpolate({ inputRange: steps, outputRange: ys }) },
              { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
              // the flutter of a strip of paper turning over
              { scaleY: t.interpolate({ inputRange: Array.from({ length: p.flips * 2 + 1 }, (_, k) => k / (p.flips * 2)), outputRange: Array.from({ length: p.flips * 2 + 1 }, (_, k) => (k % 2 ? -0.35 : 1)) }) },
            ],
          }} />
        )
      })}
    </View>
  )
}
