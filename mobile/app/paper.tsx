import React from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { derivePaperKeys, normName, PAPER_NAME, PAPER_PASSWORD_MIN, type PaperKeys } from '@yieldcircle/app/paper/keys'
import * as social from '@yieldcircle/core/social/api'
import { C } from '../src/theme'
import { family } from '../src/fonts'
import { usePaper } from '../src/paper'
import { Btn } from '../src/ui/bits'
import { IconBack } from '../src/ui/icons'
import { PAPER } from '../src/ui/paper'
import { Txt } from '../src/ui/Txt'

type Step = { at: 'form' } | { at: 'working'; what: string } | { at: 'create'; keys: PaperKeys } | { at: 'unreachable'; keys: PaperKeys }

/**
 * Sign in to — or create — a paper account (the web's `PaperSignIn`, tickets/0006 §H): one form;
 * the keys are derived here, and the social service says whether that name already has an account
 * at those keys (sign in), has one at other keys (taken, or the password is wrong), or is free
 * (create). The derivation is slow without a JIT (docs/mobile.md): a bar says how far it is, and the
 * keys are kept on the phone, so it is waited for once.
 */
export default function PaperSignIn() {
  const insets = useSafeAreaInsets()
  const paper = usePaper()
  const [name, setName] = React.useState('')
  const [pw, setPw] = React.useState('')
  const [step, setStep] = React.useState<Step>({ at: 'form' })
  const [progress, setProgress] = React.useState(0)
  const [err, setErr] = React.useState<string | null>(null)
  const n = normName(name)
  const nameOk = PAPER_NAME.test(n), pwOk = pw.length >= PAPER_PASSWORD_MIN
  const done = () => { if (router.canDismiss()) router.dismissAll(); router.replace('/') }

  const enter = async (keys: PaperKeys, create: boolean) => {
    setStep({ at: 'working', what: create ? 'Creating your paper account…' : 'Signing in…' })
    try { await paper.signIn(keys, { create }); done() }
    catch (e) { setErr((e as Error).message); setStep({ at: 'form' }) }
  }
  const go = async () => {
    setErr(null); setProgress(0)
    setStep({ at: 'working', what: 'Deriving your keys…' })
    let keys: PaperKeys
    try { keys = await derivePaperKeys(n, pw, 0, setProgress) } catch (e) { setErr((e as Error).message); setStep({ at: 'form' }); return }
    try {
      const prof = (await social.profiles([keys.evm]))[keys.evm]
      if (prof) return enter(keys, false)
      const h = await social.handleCheck(n, keys.evm)
      if (!h.available) { setErr(`The name “${n}” is taken. If it is yours, the password is not the one it was made with; otherwise pick another name.`); setStep({ at: 'form' }); return }
      setStep({ at: 'create', keys })
    } catch {
      setStep({ at: 'unreachable', keys })
    }
  }

  if (paper.session) return (
    <Frame insets={insets}>
      <Txt s={14} c={C.tx70} lh={20}>Signed in as <Txt s={14} w={700}>{paper.session.name}</Txt>. Everything you see is paper money until you sign out.</Txt>
      <Btn wide kind="plain" title="Sign out of paper" onPress={() => { paper.signOut(); done() }} />
    </Frame>
  )
  return (
    <Frame insets={insets}>
      {step.at === 'create' ? (
        <View style={{ gap: 12 }}>
          <Txt s={14} lh={20}>No paper account for <Txt s={14} w={700}>{step.keys.name}</Txt> with this password yet. Create it?</Txt>
          <Bullet>You start with 10,000 USDC and 1 SOL on Solana. To use another chain, bridge there — real routes, real fees, real wait.</Bullet>
          <Bullet>Real rates, real quotes and real risks, but nothing is signed or sent on chain.</Bullet>
          <Bullet warn>There is no password reset. A different password is a different account. Never send real money to it.</Bullet>
          <Btn wide kind="paper" title={`Create “${step.keys.name}”`} onPress={() => void enter(step.keys, true)} />
          <Btn wide kind="plain" title="Back" onPress={() => setStep({ at: 'form' })} />
        </View>
      ) : step.at === 'unreachable' ? (
        <View style={{ gap: 12 }}>
          <Txt s={14} lh={20}>The profile service did not answer, so it cannot say whether <Txt s={14} w={700}>{step.keys.name}</Txt> exists yet.</Txt>
          <Btn wide kind="paper" title="Continue anyway" onPress={() => void enter(step.keys, false)} />
          <Btn wide kind="plain" title="Back" onPress={() => setStep({ at: 'form' })} />
          <Txt s={12} c={C.tx50}>Same name and password, same account: nothing is lost by trying again later.</Txt>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Txt s={14} c={C.tx70} lh={20}>Try every strategy with play money — no wallet needed. A name and a password are the whole account: the same two on any device open the same book.</Txt>
          <Field label="Name" value={name} onChangeText={setName} placeholder="3–20 letters, digits or _" autoComplete="username" textContentType="username" />
          {!!name && !nameOk && <Txt s={12} c={C.warn}>3–20 characters: a–z, 0–9 and _. It is also your public handle.</Txt>}
          <Field label="Password" value={pw} onChangeText={setPw} placeholder={`at least ${PAPER_PASSWORD_MIN} characters`} secureTextEntry autoComplete="password" textContentType="password" />
          {err && <Txt s={12.5} c={C.bad} lh={18}>{err}</Txt>}
          {step.at === 'working' && (
            <View style={{ gap: 6 }}>
              <View style={st.track}><View style={[st.fill, { width: `${Math.round((step.what.startsWith('Deriving') ? progress : 1) * 100)}%` }]} /></View>
              <Txt s={12} c={C.tx50} lh={17}>{step.what}{step.what.startsWith('Deriving') ? ` ${Math.round(progress * 100)}% — slow on purpose, and only this once on this phone` : ''}</Txt>
            </View>
          )}
          <Btn wide kind="paper" title={step.at === 'working' ? 'Working…' : 'Continue'} disabled={!nameOk || !pwOk || step.at === 'working'} onPress={() => void go()} />
          <Txt s={12} c={C.tx50} lh={17}>New name: you will be asked to create it. Your password never leaves this phone; the keys made from it stay on it until you sign out.</Txt>
        </View>
      )}
    </Frame>
  )
}

function Frame({ insets, children }: { insets: { top: number; bottom: number }; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[st.bar, { paddingTop: insets.top, height: 60 + insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={6} style={st.back} accessibilityLabel="Back"><IconBack color={C.tx70} /></Pressable>
        <View style={st.pill}><Txt s={11} w={600} c={PAPER.fg} lh={16.5}>paper</Txt></View>
        <Txt s={16} w={600}>Paper account</Txt>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 12 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

function Field({ label, ...input }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt s={12} w={600} c={C.tx50}>{label}</Txt>
      <TextInput {...input} autoCapitalize="none" autoCorrect={false} spellCheck={false} placeholderTextColor={C.tx40} style={st.input} />
    </View>
  )
}

function Bullet({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return <View style={{ flexDirection: 'row', gap: 8 }}><Txt s={13} c={warn ? C.warn : PAPER.fg}>•</Txt><Txt s={13} c={warn ? C.warn : C.tx70} lh={19} style={{ flex: 1 }}>{children}</Txt></View>
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.86)', borderBottomWidth: 1, borderBottomColor: '#1a1a1f' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pill: { backgroundColor: PAPER.bg, borderWidth: 1, borderColor: PAPER.line, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  input: { minHeight: 46, borderRadius: 10, backgroundColor: C.b300, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, color: C.tx, fontSize: 15, fontFamily: family(400) },
  track: { height: 6, borderRadius: 3, backgroundColor: C.b400, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: PAPER.fg },
})
