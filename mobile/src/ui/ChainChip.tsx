import React from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { CHAINS, useChainMeta } from '@yieldcircle/app/sdk/queries'
import { useChains } from '../chains'
import { C } from '../theme'
import { Tok } from './bits'
import { Txt } from './Txt'

/** The scope in words: every chain, the one, or how many (the web's `chainLabelFor`). */
export function useChainLabel() {
  const { chains, allChains } = useChains()
  return allChains ? 'All chains' : chains.length === 1 ? CHAINS.find((c) => c.id === chains[0])?.label ?? '1 chain' : `${chains.length} chains`
}

/** A chain's mark: the API's logo (`/v1/data/chains`), else its name's letters on a disc (`Tok`'s fallback). */
export function ChainMark({ id, size = 16 }: { id: string; size?: number }) {
  const meta = useChainMeta()
  const label = CHAINS.find((c) => c.id === id)?.label ?? id
  return <Tok sym={label} logo={meta[id]?.logo} size={size} ring={{ w: 1, color: C.b200 }} />
}

/**
 * The chain scope as a filter chip (the web's `ChainChip`), on the pages whose lists it narrows: the
 * marks of what is in scope, overlapped, and its name; a tap opens the list. The scope is global —
 * one world every page agrees on — and the profile's Chains is the same list.
 */
export function ChainChip() {
  const { chains, allChains } = useChains()
  const label = useChainLabel()
  const [open, setOpen] = React.useState(false)
  const picked = (allChains ? CHAINS.slice(0, 3) : CHAINS.filter((c) => chains.includes(c.id))).slice(0, 3)
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={6} style={[st.chip, !allChains && st.chipOn]} accessibilityRole="button" accessibilityLabel={`Chains — ${label}`}>
        <View style={{ flexDirection: 'row' }}>
          {picked.map((c, i) => <View key={c.id} style={{ marginLeft: i ? -5 : 0 }}><ChainMark id={c.id} size={15} /></View>)}
        </View>
        <Txt s={12.5} w={600} c={allChains ? C.tx70 : C.primary} numberOfLines={1}>{label}</Txt>
        <Svg width={9} height={9} viewBox="0 0 12 12"><Path d="M2 4.2 6 8.2 10 4.2" fill="none" stroke={allChains ? C.tx50 : C.primary} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </Pressable>
      <ChainSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function ChainSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[st.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={st.grab} />
        <View style={st.sheetH}>
          <Txt s={16} w={600} style={{ flex: 1 }}>Chains</Txt>
          <Pressable onPress={onClose} hitSlop={8}><Txt s={14} w={600} c={C.primary}>Done</Txt></Pressable>
        </View>
        <ScrollView style={{ maxHeight: 460 }}><ChainList /></ScrollView>
      </View>
    </Modal>
  )
}

/**
 * Every chain, with a tick — the chip's sheet and the profile both draw this. "All" is the absence
 * of a selection, so a chain added later is in scope; ticking one from All narrows to it.
 */
export function ChainList() {
  const { chains, allChains, setChains, toggleChain } = useChains()
  return (
    <View style={{ paddingBottom: 6 }}>
      <Row label="All chains" on={allChains} onPress={() => setChains([])} />
      <View style={st.sep} />
      {CHAINS.map((c) => <Row key={c.id} id={c.id} label={c.label} on={chains.includes(c.id)} onPress={() => toggleChain(c.id)} />)}
    </View>
  )
}

function Row({ id, label, on, onPress }: { id?: string; label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={st.row} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <Txt s={14} w={700} c={C.primary} style={{ width: 18 }}>{on ? '✓' : ''}</Txt>
      {id && <ChainMark id={id} size={18} />}
      <Txt s={14} c={on ? C.tx : C.tx70}>{label}</Txt>
    </Pressable>
  )
}

const st = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingLeft: 8, paddingRight: 10, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.b200, flexShrink: 1 },
  chipOn: { borderColor: C.primary, backgroundColor: C.priBg },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: C.b200, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: 1, borderColor: C.line },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 8 },
  sheetH: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 14 },
  sep: { height: 1, backgroundColor: C.line, marginHorizontal: 14, marginVertical: 4 },
})
