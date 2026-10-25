import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { C } from '../theme'
import { Btn } from './bits'
import { Txt } from './Txt'

export const PAPER = { fg: '#f4b740', bg: 'rgba(244,183,64,0.13)', line: '#5a4512', ink: '#2a1d00' }

/** The paper-money offer (the web's `PaperOffer`, `.paper-card`): $10,000 of play money behind a name and a password. */
export function PaperOffer({ empty }: { empty?: boolean }) {
  return (
    <View style={st.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={st.pill}><Txt s={11} w={600} c={PAPER.fg} lh={16.5}>paper</Txt></View>
        <Txt w={700} style={{ flexShrink: 1 }}>{empty ? 'Nothing in this wallet yet' : 'No wallet? Try it on paper'}</Txt>
      </View>
      <Txt s={13} c={C.tx70} lh={18.85}>$10,000 of play money on Solana — bridge it to any chain a strategy lives on, at real routes, real rates and real risks. Nothing is signed or sent on chain. A name and a password are the whole account.</Txt>
      <View style={{ marginTop: 4 }}><Btn kind="paper" title="Try with paper money" onPress={() => router.push('/paper')} /></View>
    </View>
  )
}

const st = StyleSheet.create({
  card: { backgroundColor: PAPER.bg, borderWidth: 1, borderColor: PAPER.line, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  pill: { backgroundColor: PAPER.bg, borderWidth: 1, borderColor: PAPER.line, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
})
