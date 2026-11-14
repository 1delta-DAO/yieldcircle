import React from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { derivePaperKeys, normName, PAPER_NAME, PAPER_PASSWORD_MIN, type PaperKeys } from '@yieldcircle/app/paper/keys'
import * as social from '@yieldcircle/core/social/api'
import { C } from '../src/theme'
import { family } from '../src/fonts'
import { lastPaperName, usePaper } from '../src/paper'
import { Btn, Seg } from '../src/ui/bits'
import { IconBack } from '../src/ui/icons'
import { PAPER } from '../src/ui/paper'
import { Txt } from '../src/ui/Txt'

type Mode = 'signup' | 'login'
type Step = { at: 'form' } | { at: 'working'; what: string } | { at: 'unreachable'; keys: PaperKeys }
const MODES: { id: Mode; word: string }[] = [{ id: 'signup', word: 'Sign up' }, { id: 'login', word: 'Log in' }]

/**
 * Sign up for — or log in to — a paper account (the web's `PaperSignIn`, tickets/0006 §H): one form
 * with the choice on top, "Log in" when this phone has had an account (`lastPaperName`), else
 * "Sign up". The keys are derived here, and the social service says whether that name already has
 * an account at those keys (in, whichever was chosen), has one at other keys (taken, or the
 * password is wrong), or is free (sign up creates it at once; log in says there is none). The
 * derivation is slow without a JIT (docs/mobile.md): a bar says how far it is, and the keys are
 * kept on the phone, so it is waited for once.
 */
export default function PaperSignIn() {
  const insets = useSafeAreaInsets()
  const paper = usePaper()
  const [last] = React.useState(lastPaperName)
  const [mode, setMode] = React.useState<Mode>(last ? 'login' : 'signup')
  const [name, setName] = React.useState(last ?? '')
  const [pw, setPw] = React.useState('')
  const [step, setStep] = React.useState<Step>({ at: 'form' })
  const [progress, setProgress] = React.useState(0)
  const [err, setErr] = React.useState<string | null>(null)
  const n = normName(name)
  const nameOk = PAPER_NAME.test(n), pwOk = pw.length >= PAPER_PASSWORD_MIN
  const signup = mode === 'signup'
  const pick = (m: Mode) => { if (step.at === 'working') return; setMode(m); setErr(null) }
  const done = () => { if (router.canDismiss()) router.dismissAll(); router.replace('/') }

  const enter = async (keys: PaperKeys, create: boolean) => {
    setStep({ at: 'working', what: create ? 'Creating your paper account…' : 'Logging in…' })
    try { await paper.signIn(keys, { create }); done() }
    catch (e) { setErr((e as Error).message); setStep({ at: 'form' }) }
  }
  const go = async () => {
    setErr(null); setProgress(0)
    setStep({ at: 'working', what: 'Deriving your keys…' })
    let keys: PaperKeys
    try { keys = await derivePaperKeys(n, pw, 0, setProgress) } catch (e) { setErr((e as Error).message); setStep({ at: 'form' }); return }
    try {
      // this name and password already are an account: in, whichever was chosen
      const prof = (await social.profiles([keys.evm]))[keys.evm]
      if (prof) return enter(keys, false)
      const h = await social.handleCheck(n, keys.evm)
      if (h.available && signup) return enter(keys, true)
      setErr(!h.available
        ? signup ? `The name “${n}” is taken. If it is yours, log in with its password; otherwise pick another name.` : `That is not the password “${n}” was made with.`
        : `There is no paper account “${n}” with this password. Check both, or sign up to create it.`)
      setStep({ at: 'form' })
    } catch {
      // logging in needs no answer (same name and password, same keys); creating one does
      if (signup) { setErr('The profile service did not answer, so the account cannot be created right now. Try again in a moment.'); setStep({ at: 'form' }) }
      else setStep({ at: 'unreachable', keys })
    }
  }

  if (paper.session) return (
    <Frame insets={insets}>
      {paper.active ? <>
        <Txt s={14} c={C.tx70} lh={20}>Signed in as <Txt s={14} w={700}>{paper.session.name}</Txt>. Everything you see is paper money until you use your wallet or sign out.</Txt>
        <Btn wide kind="plain" title="Use my wallet instead" onPress={() => { paper.use(false); done() }} />
      </> : <>
        <Txt s={14} c={C.tx70} lh={20}>Signed in as <Txt s={14} w={700}>{paper.session.name}</Txt>, not in use: what you see is your wallet. The keys stay on this phone, so switching back is instant.</Txt>
        <Btn wide kind="paper" title={`Use ${paper.session.name} on paper`} onPress={() => { paper.use(true); done() }} />
      </>}
      <Btn wide kind="plain" title="Sign out of paper" onPress={() => { paper.signOut(); done() }} />
    </Frame>
  )
  return (
    <Frame insets={insets}>
      {step.at === 'unreachable' ? (
        <View style={{ gap: 12 }}>
          <Txt s={14} lh={20}>The profile service did not answer, so it cannot say whether <Txt s={14} w={700}>{step.keys.name}</Txt> exists yet.</Txt>
          <Btn wide kind="paper" title="Continue anyway" onPress={() => void enter(step.keys, false)} />
          <Btn wide kind="plain" title="Back" onPress={() => setStep({ at: 'form' })} />
          <Txt s={12} c={C.tx50}>Same name and password, same account: nothing is lost by trying again later.</Txt>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Seg grow items={MODES} value={mode} onChange={pick} />
          <Txt s={14} c={C.tx70} lh={20}>{signup
            ? 'Try every strategy with play money — no wallet needed. A name and a password are the whole account.'
            : 'The same name and password open the same book on any device.'}</Txt>
          <Field label="Name" value={name} onChangeText={setName} placeholder={signup ? '3–20 letters, digits or _' : 'your paper name'} autoComplete="username" textContentType="username" />
          {!!name && !nameOk && <Txt s={12} c={C.warn}>3–20 characters: a–z, 0–9 and _.{signup ? ' It is also your public handle.' : ''}</Txt>}
          <Field label="Password" value={pw} onChangeText={setPw} placeholder={signup ? `at least ${PAPER_PASSWORD_MIN} characters` : 'password'} secureTextEntry autoComplete={signup ? 'new-password' : 'current-password'} textContentType={signup ? 'newPassword' : 'password'} />
          {signup && <>
            <Bullet>You start with 10,000 USDC and 1 SOL on Solana. Real rates, real quotes and real risks, but nothing is signed or sent on chain.</Bullet>
            <Bullet>The name is also your public handle.</Bullet>
            <Bullet warn>There is no password reset. A different password is a different account. Never send real money to it.</Bullet>
          </>}
          {err && <Txt s={12.5} c={C.bad} lh={18}>{err}</Txt>}
          {step.at === 'working' && (
            <View style={{ gap: 6 }}>
              <View style={st.track}><View style={[st.fill, { width: `${Math.round((step.what.startsWith('Deriving') ? progress : 1) * 100)}%` }]} /></View>
              <Txt s={12} c={C.tx50} lh={17}>{step.what}{step.what.startsWith('Deriving') ? ` ${Math.round(progress * 100)}% — slow on purpose, and only this once on this phone` : ''}</Txt>
            </View>
          )}
          <Btn wide kind="paper" title={step.at === 'working' ? 'Working…' : signup ? `Create ${nameOk ? `“${n}”` : 'account'}` : 'Log in'} disabled={!nameOk || !pwOk || step.at === 'working'} onPress={() => void go()} />
          <Txt s={12} c={C.tx50} lh={17}>Your password never leaves this phone; the keys made from it stay on it until you sign out.</Txt>
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
