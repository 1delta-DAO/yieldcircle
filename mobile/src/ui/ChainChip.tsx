import React from 'react'
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { CHAINS, useChainMeta } from '@yieldcircle/app/sdk/queries'
import { useChains } from '../chains'
import { C } from '../theme'
import { Btn, Tok } from './bits'
import { Txt } from './Txt'

/** The scope in words: every chain, the one, or how many (the web's `chainLabelFor`). */
export function useChainLabel() {
  const { chains, allChains } = useChains()
  return allChains ? 'All chains' : chains.length === 1 ? CHAINS.find((c) => c.id === chains[0])?.label ?? '1 chain' : `${chains.length} chains`
}

/**
 * A chain's mark: the API's logo (`/v1/data/chains`), else its name's letters on a disc (`Tok`'s
 * fallback). `ring` is the colour of what it sits on, so overlapped marks cut cleanly into each other.
 */
export function ChainMark({ id, size = 16, ring = C.b200 }: { id: string; size?: number; ring?: string }) {
  const meta = useChainMeta()
  const label = CHAINS.find((c) => c.id === id)?.label ?? id
  return <Tok sym={label} logo={meta[id]?.logo} size={size} ring={{ w: 1.5, color: ring }} />
}

/**
 * The chain scope as a filter chip (the web's `ChainChip`), on the pages whose lists it narrows: the
 * marks of what is in scope, overlapped like a stack of coins, and its name; a tap opens the sheet.
 * The scope is global — one world every page agrees on — and the profile's Chains is the same list.
 */
export function ChainChip() {
  const { chains, allChains } = useChains()
  const label = useChainLabel()
  const [open, setOpen] = React.useState(false)
  const picked = (allChains ? CHAINS.slice(0, 3) : CHAINS.filter((c) => chains.includes(c.id))).slice(0, 3)
  const ring = allChains ? C.b300 : '#0f2a30' // `priBg` laid over `b200`, as an opaque colour
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={6} style={({ pressed }) => [st.chip, !allChains && st.chipOn, pressed && { opacity: 0.75 }]} accessibilityRole="button" accessibilityLabel={`Chains — ${label}`}>
        <View style={{ flexDirection: 'row' }}>
          {picked.map((c, i) => <View key={c.id} style={{ marginLeft: i ? -6 : 0, zIndex: 3 - i }}><ChainMark id={c.id} size={16} ring={ring} /></View>)}
        </View>
        <Txt s={12.5} w={600} c={allChains ? C.tx70 : C.primary} numberOfLines={1}>{label}</Txt>
        <Svg width={9} height={9} viewBox="0 0 12 12"><Path d="M2 4.2 6 8.2 10 4.2" fill="none" stroke={allChains ? C.tx50 : C.primary} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </Pressable>
      <ChainSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/**
 * The sheet: it rises on a spring over a fading scrim (RN's Animated — no gesture library on the
 * phone), says the scope in its head, and its one button names what tapping it will show.
 */
function ChainSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const { chains, allChains } = useChains()
  const label = useChainLabel()
  const [shown, setShown] = React.useState(open)
  const y = React.useRef(new Animated.Value(1)).current // 1 = below the screen, 0 = in place
  React.useEffect(() => {
    if (open) {
      setShown(true)
      y.setValue(1)
      Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 22, stiffness: 240, mass: 0.9 }).start()
    } else if (shown) {
      Animated.timing(y, { toValue: 1, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setShown(false))
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null
  const scope = allChains ? `Every list reads all ${CHAINS.length} chains` : `${chains.length} of ${CHAINS.length} chains`
  const cta = allChains ? 'Show all chains' : chains.length === 1 ? `Show ${label}` : `Show ${chains.length} chains`
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[st.scrim, { opacity: y.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View style={[st.sheet, { maxHeight: height * 0.86, paddingBottom: insets.bottom + 10, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, height] }) }] }]}>
        <View style={st.grab} />
        <View style={st.sheetH}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt s={18} w={700}>Chains</Txt>
            <Txt s={12.5} c={allChains ? C.tx50 : C.primary}>{scope}</Txt>
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={st.x} accessibilityLabel="Close"><Txt s={15} c={C.tx50} lh={18}>✕</Txt></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8 }} showsVerticalScrollIndicator={false} bounces={false}>
          <ChainList />
        </ScrollView>
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          <Btn title={cta} onPress={onClose} wide />
        </View>
      </Animated.View>
    </Modal>
  )
}

/**
 * Every chain as a tile, two to a row, a tick badge on the ones in scope — the sheet and the profile
 * both draw this. "All" is the absence of a selection, so a chain added later is in scope; ticking one
 * from All narrows to it, and a long press on any tile narrows to just that one.
 */
export function ChainList() {
  const { chains, allChains, setChains, toggleChain } = useChains()
  const rows: typeof CHAINS[] = []
  for (let i = 0; i < CHAINS.length; i += 2) rows.push(CHAINS.slice(i, i + 2))
  return (
    <View style={{ gap: 8 }}>
      <Pressable onPress={() => setChains([])} style={({ pressed }) => [st.all, allChains && st.tileOn, pressed && st.pressed]} accessibilityRole="radio" accessibilityState={{ checked: allChains }}>
        <View style={{ flexDirection: 'row' }}>
          {CHAINS.slice(0, 4).map((c, i) => <View key={c.id} style={{ marginLeft: i ? -7 : 0, zIndex: 4 - i }}><ChainMark id={c.id} size={22} ring={allChains ? '#0f2a30' : C.b300} /></View>)}
        </View>
        <View style={{ flex: 1 }}>
          <Txt s={14} w={600}>All chains</Txt>
          <Txt s={12} c={C.tx50} lh={16}>Everything, including chains added later</Txt>
        </View>
        <Radio on={allChains} />
      </Pressable>
      <View style={st.sep} />
      {rows.map((pair, r) => (
        <View key={r} style={{ flexDirection: 'row', gap: 8 }}>
          {pair.map((c) => <Tile key={c.id} id={c.id} label={c.label} on={chains.includes(c.id)} onPress={() => toggleChain(c.id)} onSolo={() => setChains([c.id])} />)}
          {pair.length === 1 && <View style={{ flex: 1 }} />}
        </View>
      ))}
    </View>
  )
}

function Tile({ id, label, on, onPress, onSolo }: { id: string; label: string; on: boolean; onPress: () => void; onSolo: () => void }) {
  return (
    <Pressable onPress={onPress} onLongPress={onSolo} delayLongPress={320} style={({ pressed }) => [st.tile, on && st.tileOn, pressed && st.pressed]}
      accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} accessibilityHint="Double tap to toggle, hold to show only this chain">
      <View>
        <ChainMark id={id} size={28} ring={on ? '#0f2a30' : C.b300} />
        {on && (
          <View style={st.badge}>
            <Svg width={8} height={8} viewBox="0 0 12 12"><Path d="M2.5 6.5 5 9l4.5-6" fill="none" stroke={C.primaryInk} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </View>
        )}
      </View>
      <Txt s={13.5} w={on ? 600 : 400} c={on ? C.tx : C.tx70} numberOfLines={1} style={{ flex: 1 }}>{label}</Txt>
    </Pressable>
  )
}

/** A radio ring: filled with a dot when on. */
function Radio({ on }: { on: boolean }) {
  return (
    <View style={[st.radio, on && { borderColor: C.primary }]}>
      {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary }} />}
    </View>
  )
}

const st = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingLeft: 8, paddingRight: 10, borderRadius: 999, borderWidth: 1, borderColor: 'transparent', backgroundColor: C.b300, flexShrink: 1 },
  chipOn: { borderColor: C.primary, backgroundColor: '#0f2a30' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.b200, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: C.line, overflow: 'hidden' },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.line2, marginTop: 8 },
  sheetH: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 14 },
  x: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: C.b300 },
  all: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: 'transparent', backgroundColor: C.b300 },
  tile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: 'transparent', backgroundColor: C.b300 },
  tileOn: { borderColor: C.primary, backgroundColor: '#0f2a30' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  badge: { position: 'absolute', right: -3, bottom: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: C.primary, borderWidth: 2, borderColor: '#0f2a30', alignItems: 'center', justifyContent: 'center' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  sep: { height: 1, backgroundColor: C.line, marginVertical: 2 },
})
