import React from 'react'
import { Animated, Easing, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'
import type { OutcomeState } from '@yieldcircle/app/sdk/txOutcome'
import { C } from '../../theme'
import { Txt } from '../Txt'

const ACircle = Animated.createAnimatedComponent(Circle)
const APath = Animated.createAnimatedComponent(Path)

/**
 * The one mark every end draws (docs/tx-feedback-plan.md §4.1): a ring.
 *
 *   flying  it fills with the trace's stages, a comet running round it
 *   won     it snaps shut, turns green, the tick draws itself through it and it pops, a ring of
 *           light going out behind it
 *   soft    shut, amber, a tick — landed, not yet shown: no pop
 *   lost    it stops short and cracks at the gap, shakes twice and settles tilted, red (amber for
 *           an ending that is not a plain no)
 *
 * The arc and the tick are drawn on the JS thread (an SVG prop); scale, shake and spin on the native one.
 */
export function Ring({ state, progress = 0, tone, size = 112, still, mini }: { state: OutcomeState; /** 0..1, flying only */ progress?: number; tone?: 'run' | 'ok' | 'warn' | 'bad'; size?: number; still?: boolean; /** the pill's: thinner, no glow */ mini?: boolean }) {
  const sw = mini ? 2.5 : Math.max(5, size / 14)
  const r = (size - sw) / 2 - (mini ? 0 : 1)
  const circ = 2 * Math.PI * r
  const color = tone === 'bad' ? C.bad : tone === 'warn' ? C.warn : state === 'won' ? C.ok : C.primary
  const target = state === 'flying' ? Math.max(0.08, Math.min(0.94, progress)) : state === 'lost' ? 0.86 : 1
  const arc = React.useRef(new Animated.Value(still ? target : 0)).current
  const tick = React.useRef(new Animated.Value(still || state === 'flying' ? (state === 'flying' ? 0 : 1) : 0)).current
  const pop = React.useRef(new Animated.Value(1)).current
  const shake = React.useRef(new Animated.Value(0)).current
  const glow = React.useRef(new Animated.Value(0)).current
  const spin = React.useRef(new Animated.Value(0)).current

  React.useEffect(() => {
    if (still) { arc.setValue(target); tick.setValue(state === 'flying' ? 0 : 1); return }
    if (state === 'flying') { Animated.timing(arc, { toValue: target, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(); return }
    Animated.timing(arc, { toValue: target, duration: state === 'lost' ? 420 : 380, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start()
    if (state === 'lost') {
      Animated.sequence([
        Animated.delay(380),
        Animated.timing(shake, { toValue: 1, duration: 70, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, duration: 90, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0.7, duration: 80, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -0.5, duration: 80, useNativeDriver: true }),
        Animated.spring(shake, { toValue: -0.25, friction: 5, useNativeDriver: true }),
      ]).start()
      Animated.timing(tick, { toValue: 1, duration: 260, delay: 300, useNativeDriver: false }).start()
      return
    }
    Animated.timing(tick, { toValue: 1, duration: 360, delay: 300, easing: Easing.out(Easing.quad), useNativeDriver: false }).start()
    if (state === 'won') {
      Animated.sequence([Animated.delay(320), Animated.spring(pop, { toValue: 1.14, friction: 3, tension: 260, useNativeDriver: true }), Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true })]).start()
      Animated.sequence([Animated.delay(340), Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true })]).start()
    }
  }, [state, target, still])

  // the comet: a short bright arc going round while it is on its way
  React.useEffect(() => {
    if (state !== 'flying' || still) return
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: mini ? 1100 : 1600, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [state, still])

  const c = size / 2
  // the tick, and the lost mark (a bang): drawn through their length
  const tickD = `M${c - size * 0.17} ${c + size * 0.01} L${c - size * 0.04} ${c + size * 0.14} L${c + size * 0.19} ${c - size * 0.13}`
  const tickLen = size * 0.55
  const bangD = `M${c} ${c - size * 0.18} L${c} ${c + size * 0.05}`
  // the crack across the gap the ring stopped short of: a zigzag at 12 o'clock less a bit
  const gx = c + r * Math.sin(-0.14 * 2 * Math.PI), gy = c - r * Math.cos(-0.14 * 2 * Math.PI)
  const crackD = `M${gx - size * 0.06} ${gy - size * 0.07} l${size * 0.05} ${size * 0.05} l${-size * 0.03} ${size * 0.04} l${size * 0.06} ${size * 0.06}`
  return (
    <Animated.View style={{ width: size, height: size, transform: [{ scale: pop }, { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-size * 0.08, size * 0.08] }) }, { rotate: shake.interpolate({ inputRange: [-1, 1], outputRange: ['-8deg', '8deg'] }) }] }}>
      {!mini && state === 'won' && (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: C.ok, opacity: glow.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.7, 0] }), transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }] }} />
      )}
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={r} stroke={C.b400} strokeWidth={sw} fill={state === 'won' && !mini ? 'rgba(63,191,127,.10)' : 'none'} />
        <ACircle cx={c} cy={c} r={r} stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeDasharray={`${circ} ${circ}`}
          strokeDashoffset={arc.interpolate({ inputRange: [0, 1], outputRange: [circ, 0] })} transform={`rotate(-90 ${c} ${c})`} />
        {!mini && state !== 'flying' && (state === 'lost'
          ? <>
              <APath d={bangD} stroke={color} strokeWidth={sw * 1.1} strokeLinecap="round" fill="none" strokeDasharray={`${size * 0.23} ${size * 0.23}`} strokeDashoffset={tick.interpolate({ inputRange: [0, 1], outputRange: [size * 0.23, 0] })} />
              <Circle cx={c} cy={c + size * 0.16} r={sw * 0.62} fill={color} />
              <Path d={crackD} stroke={color} strokeWidth={sw * 0.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </>
          : <APath d={tickD} stroke={color} strokeWidth={sw * 1.1} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={`${tickLen} ${tickLen}`} strokeDashoffset={tick.interpolate({ inputRange: [0, 1], outputRange: [tickLen, 0] })} />)}
        {mini && state !== 'flying' && <Path d={state === 'lost' ? `M${c} ${c - size * 0.2} L${c} ${c + size * 0.06}` : tickD} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />}
      </Svg>
      {state === 'flying' && !still && (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
          <Svg width={size} height={size}>
            <Circle cx={c} cy={c} r={r} stroke="#fff" strokeOpacity={0.85} strokeWidth={sw} fill="none" strokeLinecap="round" strokeDasharray={`${circ * 0.06} ${circ}`} transform={`rotate(-90 ${c} ${c})`} />
          </Svg>
        </Animated.View>
      )}
    </Animated.View>
  )
}

/** A spinning arc around a mark: the balance chip's "something is on its way". */
export function Orbit({ size, color = C.primary }: { size: number; color?: string }) {
  const spin = React.useRef(new Animated.Value(0)).current
  React.useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }))
    loop.start()
    return () => loop.stop()
  }, [])
  const r = size / 2 - 1.5, circ = 2 * Math.PI * r
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', width: size, height: size, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
      <Svg width={size} height={size}><Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeDasharray={`${circ * 0.3} ${circ}`} /></Svg>
    </Animated.View>
  )
}

/** Two chain names and a dot travelling between them, by time against the quote: a bridge on its way. */
export function Route({ from, to, progress, still }: { from: string; to: string; progress: number; still?: boolean }) {
  const [w, setW] = React.useState(0)
  const x = React.useRef(new Animated.Value(progress)).current
  React.useEffect(() => { Animated.timing(x, { toValue: Math.max(0.04, Math.min(0.96, progress)), duration: still ? 0 : 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start() }, [progress, still])
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch' }}>
      <ChainWord name={from} />
      <View style={{ flex: 1, height: 14, justifyContent: 'center' }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        <View style={{ height: 2, borderRadius: 1, backgroundColor: C.line2 }} />
        <Animated.View style={{ position: 'absolute', left: -5, width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, w] }) }] }} />
      </View>
      <ChainWord name={to} />
    </View>
  )
}
function ChainWord({ name }: { name: string }) {
  return <View style={{ paddingHorizontal: 10, height: 28, borderRadius: 999, backgroundColor: C.b300, justifyContent: 'center' }}><Txt s={12.5} w={600} c={C.tx70}>{name}</Txt></View>
}
