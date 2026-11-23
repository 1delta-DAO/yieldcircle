import React from 'react'
import { Animated, Easing, Pressable, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Svg, { Path } from 'react-native-svg'
import { C } from '../theme'
import { Txt } from './Txt'

const KEY = 'yc.fold.'
/** what is folded, read once from the phone and kept for the session, so a section opens the way it was left without a flicker past the first */
const folded = new Map<string, boolean>()

/**
 * A page section that folds to its heading (the web's `FoldSec`): a tap on the heading slides the
 * body shut under it and turns the chevron. The body stays mounted and keeps what it loaded. The
 * height is the body's own, measured, and let go of once it is open and at rest, so a list that
 * grows later is never clipped. The choice is kept per section (`id`), across wallets.
 */
export function FoldSec({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(() => !folded.get(id))
  const [moving, setMoving] = React.useState(false)
  const [h, setH] = React.useState<number | null>(null)
  const a = React.useRef(new Animated.Value(open ? 1 : 0)).current // 1 = open
  React.useEffect(() => {
    if (folded.has(id)) return
    let live = true
    AsyncStorage.getItem(KEY + id).then((v) => {
      folded.set(id, v === '1')
      if (live && v === '1') { a.setValue(0); setOpen(false) }
    }).catch(() => { /* no storage: open */ })
    return () => { live = false }
  }, [id, a])
  const toggle = () => {
    const to = !open
    folded.set(id, !to)
    void (to ? AsyncStorage.removeItem(KEY + id) : AsyncStorage.setItem(KEY + id, '1')).catch(() => { /* not kept */ })
    setOpen(to); setMoving(true)
    Animated.timing(a, { toValue: to ? 1 : 0, duration: 300, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: false }).start(({ finished }) => { if (finished) setMoving(false) })
  }
  const fixed = (moving || !open) && h != null
  return (
    <View style={{ marginTop: 26 }}>
      <Pressable onPress={toggle} hitSlop={10} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start' }}>
        <Txt s={16} w={600} style={{ letterSpacing: -0.16 }}>{title}</Txt>
        <Animated.View style={{ transform: [{ rotate: a.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] }) }] }}>
          <Svg width={12} height={12} viewBox="0 0 12 12"><Path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke={C.tx40} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </Animated.View>
      </Pressable>
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[{ overflow: 'hidden', opacity: a.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.35, 1] }) }, fixed ? { height: a.interpolate({ inputRange: [0, 1], outputRange: [0, h!] }) } : !open && { height: 0 }]}
      >
        {/* the 10 above the body is part of what slides, so a shut section is its heading alone */}
        <Animated.View onLayout={(e) => setH(e.nativeEvent.layout.height)} style={{ paddingTop: 10, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }}>
          {children}
        </Animated.View>
      </Animated.View>
    </View>
  )
}
