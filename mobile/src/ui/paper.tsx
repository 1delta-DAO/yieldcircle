import { Share, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { C, alpha } from '../theme'
import { usePaper } from '../paper'
import { Btn } from './bits'
import { Txt } from './Txt'

export const PAPER = { fg: '#f4b740', bg: 'rgba(244,183,64,0.13)', line: '#5a4512', ink: '#2a1d00' }

/** The way onto paper: back to the account kept on this phone, else the sign-in form. */
export function useGoPaper() {
  const paper = usePaper()
  return {
    word: paper.session ? `Continue as ${paper.session.name}` : 'Try with paper money',
    go: () => (paper.session ? paper.use(true) : router.push('/paper')),
  }
}

/**
 * The paper-money offer (the web's `PaperOffer`, `.paper-card`): $10,000 of play money behind a name
 * and a password. Gone while paper is in use; `lite` says it in Lite's words (no chain, bridge or route).
 */
export function PaperOffer({ empty, lite }: { empty?: boolean; lite?: boolean }) {
  const paper = usePaper()
  const p = useGoPaper()
  if (paper.active) return null
  return (
    <View style={st.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={st.pill}><Txt s={11} w={600} c={PAPER.fg} lh={16.5}>paper</Txt></View>
        <Txt w={700} style={{ flexShrink: 1 }}>{empty ? 'Nothing in this wallet yet' : 'No wallet? Try it on paper'}</Txt>
      </View>
      <Txt s={lite ? 14 : 13} c={C.tx70} lh={lite ? 20 : 18.85}>{lite
        ? 'Play with $10,000 of paper money at real rates. Nothing touches a chain, and a name and a password are the whole account.'
        : '$10,000 of play money on Solana — bridge it to any chain a strategy lives on, at real routes, real rates and real risks. Nothing is signed or sent on chain. A name and a password are the whole account.'}</Txt>
      <View style={{ marginTop: 4 }}><Btn kind="paper" title={p.word} onPress={p.go} /></View>
    </View>
  )
}

/** Where the paper book stands with the server (the web's paper head): saved, syncing, or offline with what is queued. */
export function paperStatusWord(p: { status: string; pending: number }) {
  return p.status === 'syncing' ? 'syncing…' : p.status === 'offline' ? `offline${p.pending ? ` · ${p.pending} queued` : ''}` : p.status === 'ok' ? 'saved' : ''
}

/** An op the server refused (its book wins), said once until dismissed. */
export function PaperNotice() {
  const paper = usePaper()
  if (!paper.notice) return null
  return (
    <View style={st.notice}>
      <Txt s={12.5} c={C.bad} lh={18} style={{ flex: 1 }}>{paper.notice}</Txt>
      <Btn sm kind="plain" title="OK" onPress={paper.clearNotice} />
    </View>
  )
}

/**
 * The paper account in profile and settings (the web's `PaperSettings`): signed in — in use or
 * stepped aside for the wallet —, its book to export, the way out; signed out, the way in.
 */
export function PaperAccount({ walletConnected }: { walletConnected: boolean }) {
  const paper = usePaper()
  const p = useGoPaper()
  const s = paper.session
  const exportBook = () => void Share.share({ title: `paper-${s?.name ?? 'book'}.json`, message: JSON.stringify({ ledger: paper.ledger, exportedAt: new Date().toISOString() }, null, 2) }).catch(() => {})
  return (
    <View style={{ padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={st.pill}><Txt s={11} w={600} c={PAPER.fg} lh={16.5}>paper</Txt></View>
        <Txt s={14} w={600} style={{ flex: 1 }}>Paper account</Txt>
        {s && paper.active && <Txt s={11.5} c={C.tx50}>{paperStatusWord(paper)}</Txt>}
      </View>
      {s ? <>
        <Txt s={13} c={C.tx70} lh={19}>Signed in as <Txt s={13} w={700}>{s.name}</Txt>{paper.active ? '' : walletConnected ? ' — your wallet is in use now' : ' — not in use'}. The same name and password open the same account on any device.</Txt>
        <PaperNotice />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {paper.active
            ? walletConnected && <Btn sm kind="plain" title="Use my wallet" onPress={() => paper.use(false)} />
            : <Btn sm kind="paper" title="Use it" onPress={() => paper.use(true)} />}
          {paper.active && <Btn sm kind="plain" title="Every number" onPress={() => router.push('/paper-book')} />}
          <Btn sm kind="plain" title="Export the book" disabled={!paper.ledger} onPress={exportBook} />
          <Btn sm kind="plain" title="Sign out" onPress={paper.signOut} />
        </View>
      </> : <>
        <Txt s={13} c={C.tx70} lh={19}>Every strategy with play money, no wallet needed. Optional: your wallet stays as it is.</Txt>
        <View style={{ flexDirection: 'row' }}><Btn sm kind="paper" title={p.word} onPress={p.go} /></View>
      </>}
    </View>
  )
}

const st = StyleSheet.create({
  card: { backgroundColor: PAPER.bg, borderWidth: 1, borderColor: PAPER.line, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  pill: { backgroundColor: PAPER.bg, borderWidth: 1, borderColor: PAPER.line, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: alpha(C.bad, 0.08) },
})
