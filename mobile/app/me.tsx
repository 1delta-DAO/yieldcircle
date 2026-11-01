import React from 'react'
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, TextInput, View, type TextInputProps } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppKit } from '@reown/appkit-react-native'
import { isEvmAddr } from '@yieldcircle/core/model/address'
import { autoName, shortAddr } from '@yieldcircle/core/identity/name'
import * as api from '@yieldcircle/core/social/api'
import { GATED, LAYERS, LAYER_COUNTS, MAX_PICTURE_URL, formatSpec, parseSpec, pictureUrl, rollSpec, specOf, unearned, type Spec } from '@yieldcircle/app/identity/character'
import { useBatchSupported, usePending } from '@yieldcircle/app/social/pending'
import { useHandleCheck, useProfile, useSocialRefresh } from '@yieldcircle/app/social/queries'
import { profileOpOf, useSocialWrite, xLinkNonce, type Envelope, type ProfileOp } from '@yieldcircle/app/social/sign'
import { C } from '../src/theme'
import { family } from '../src/fonts'
import { Btn, Seg } from '../src/ui/bits'
import { Character } from '../src/ui/Character'
import { IconBack } from '../src/ui/icons'
import { LinkedWallets, writeError } from '../src/ui/social'
import { Txt } from '../src/ui/Txt'

/**
 * Your name and face (the web's profile editor, Pro's `#/me`, in Lite's look): a face — a character
 * drawn from six layers, or a picture you host — a handle, a name, a line about you and a few tags,
 * all of it ONE signed `Profile` message. Save queues it with your follows, signed together from You
 * (docs/social.md §17); "Save and sign now" signs the queue at once. Then the X link and your
 * linked wallets. Earned layers are shown but marked: the index is the gatekeeper, not the app.
 */
export default function Me() {
  const insets = useSafeAreaInsets()
  const { open } = useAppKit()
  const { account: addr, profile: write } = useSocialWrite()
  const p = useProfile(addr)
  const saved = p.data?.profile ?? null
  const refresh = useSocialRefresh()
  const pending = usePending()
  const batched = useBatchSupported()
  const draft = pending.queue.profile

  const [spec, setSpec] = React.useState<Spec | null>(null)
  const [mode, setMode] = React.useState<'character' | 'picture'>('character')
  const [pic, setPic] = React.useState('')
  const [handle, setHandle] = React.useState('')
  const [displayName, setDisplayName] = React.useState('')
  const [bio, setBio] = React.useState('')
  const [tags, setTags] = React.useState('')
  const [unlisted, setUnlisted] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const [ok, setOk] = React.useState<string | null>(null)

  /** Put a profile into the fields: the pending draft when there is one, else what is signed. */
  const fill = React.useCallback((src: ProfileOp | null) => {
    if (!addr) return
    setSpec(parseSpec(src?.avatarUrl) ?? specOf(addr))
    const isPic = !!pictureUrl(src?.avatarUrl)
    setMode(isPic ? 'picture' : 'character'); setPic(isPic ? src!.avatarUrl : '')
    setHandle(src?.handle ?? '')
    setDisplayName(src?.displayName ?? '')
    setBio(src?.bio ?? '')
    setTags((src?.tags ?? []).join(', '))
    setUnlisted(src?.visibility === 'unlisted')
  }, [addr])
  const savedOp = React.useMemo(() => profileOpOf(saved), [saved])
  // load once the service has answered; a field the user has touched is never overwritten
  const loaded = React.useRef(false)
  React.useEffect(() => {
    if (loaded.current || !p.data || !addr) return
    loaded.current = true
    fill(draft ?? savedOp)
  }, [p.data, addr, draft, savedOp, fill])
  const handleQ = useHandleCheck(handle, addr, saved?.handle ?? null)

  const bar = (
    <View style={[st.bar, { paddingTop: insets.top, height: 60 + insets.top }]}>
      <Pressable onPress={() => router.back()} hitSlop={6} style={st.back} accessibilityLabel="Back"><IconBack color={C.tx70} /></Pressable>
      <Txt s={16} w={600}>Your name and face</Txt>
    </View>
  )
  if (!addr) return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {bar}
      <View style={[st.page, { gap: 14 }]}>
        <View style={st.note}><Txt s={13} c={C.tx70} lh={19}>Connect a wallet to make a profile. The wallet <Txt s={13} w={700}>is</Txt> the account — there is nothing else to sign up for.</Txt></View>
        <Btn sm title="Connect wallet" onPress={() => open()} />
      </View>
    </View>
  )
  const s = spec ?? specOf(addr)
  const earned = saved?.systemTags ?? []
  const claims = unearned(s, earned)
  const picOk = pictureUrl(pic) != null

  const op = (): ProfileOp => ({
    handle: handle.trim().toLowerCase(),
    displayName: displayName.trim(),
    bio: bio.trim(),
    avatarUrl: mode === 'picture' ? pic.trim() : formatSpec(s),
    tags: tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 5),
    visibility: unlisted ? 'unlisted' : 'public',
  })
  const check = () => {
    if (mode === 'picture' && !picOk) { setErr('the picture needs an https:// or ipfs:// link'); return false }
    if (handleQ.data && !handleQ.data.available) { setErr(handleQ.data.reason ?? 'that handle is not available'); return false }
    setErr(null); setOk(null)
    return true
  }
  /** Into the pending queue — no wallet prompt. */
  const stage = () => {
    if (!check()) return
    pending.stageProfile(op(), savedOp)
    setOk('Nothing changed from what is signed.')
  }
  /** The queue, this edit included, in one signature now. */
  const signNow = async () => {
    if (!check()) return
    pending.stageProfile(op(), savedOp)
    if (await pending.apply()) setOk('Signed and stored — re-checkable by anyone.')
  }
  /** A service older than `Batch`: this edit signed on its own. */
  const save = async () => {
    if (!check()) return
    setBusy(true)
    try { await write(op()); refresh.profile(addr); setOk('Saved. One signature, stored with it, re-checkable by anyone.') }
    catch (e) { setErr(writeError(e)) }
    finally { setBusy(false) }
  }
  const queueErr = pending.queue.errors.profile ?? pending.queue.errors.batch
  const others = pending.count - (draft ? 1 : 0)

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {bar}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[st.page, { paddingBottom: insets.bottom + 40, gap: 14 }]} keyboardShouldPersistTaps="handled">
        <Card title="Face" sub={mode === 'character' ? 'drawn from six layers, free, and the same everywhere' : 'any image you host, loaded from its link'}>
          <Seg items={[{ id: 'character', word: 'Character' }, { id: 'picture', word: 'Picture' }]} value={mode} onChange={setMode} />
          {mode === 'character' ? (
            <>
              <View style={st.face}>
                <Character addr={addr} spec={s} size={112} />
                <View style={{ flex: 1, gap: 8, alignItems: 'flex-start' }}>
                  <Btn sm title="Surprise me" onPress={() => setSpec(rollSpec(earned))} />
                  <Btn sm kind="plain" title="Back to default" onPress={() => setSpec(specOf(addr))} />
                </View>
              </View>
              {LAYERS.map((l) => <Picker key={l.key} label={l.label} names={l.names} value={s[l.key]} layer={l.key} earned={earned} onPick={(i) => setSpec({ ...s, [l.key]: i })} />)}
              {claims.length > 0 && (
                <Txt s={12} c={C.warn} lh={17}>This character claims {claims.map((g) => g.why).join(' and ')}. Anyone can draw it, but until the index confirms it your profile is shown with a mark.{earned.length === 0 ? ' No badges have been earned by this wallet yet.' : ''}</Txt>
              )}
            </>
          ) : (
            <>
              <View style={st.face}>
                <Character addr={addr} avatarUrl={picOk ? pic : null} size={112} />
                <Txt s={12} c={C.tx50} lh={17} style={{ flex: 1 }}>{picOk ? 'If the link stops working, your character is shown instead.' : 'Until the link works, your character is shown.'}</Txt>
              </View>
              <Field label="Picture link" value={pic} onChangeText={setPic} maxLength={MAX_PICTURE_URL} placeholder="https://… or ipfs://…" autoCapitalize="none" autoCorrect={false} keyboardType="url"
                foot="Nothing is uploaded: the link is signed into your profile and every viewer loads the image from its host, which can see their IP. Square images look best." />
            </>
          )}
        </Card>

        <Card title="Name" sub={`without one you are “${autoName(addr)}”`}>
          <Field label="Handle" prefix="@" value={handle} onChangeText={(v) => setHandle(v.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase())} placeholder="3–20 chars, a–z 0–9 _" maxLength={20} autoCapitalize="none" autoCorrect={false}
            foot={handleQ.data && !handleQ.data.available ? handleQ.data.reason ?? 'not available' : handleQ.data?.available ? 'Available.' : 'Taken handles and other wallets’ ENS names are refused.'}
            footTone={handleQ.data && !handleQ.data.available ? C.warn : handleQ.data?.available ? C.ok : undefined} />
          <Field label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={40} placeholder={autoName(addr)} />
          <Field label="Bio" value={bio} onChangeText={setBio} maxLength={280} placeholder="What you are doing with your money, in one line." multiline />
          <Field label="Tags" value={tags} onChangeText={setTags} placeholder="stables, delta-neutral, long-only" autoCapitalize="none" foot="Up to five, self-declared — shown apart from the earned ones." />
          <View style={st.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt s={14}>Unlisted</Txt>
              <Txt s={12} c={C.tx50} lh={16}>Keep me off the board and out of discovery. The chain stays public either way; this is about appearing as a person.</Txt>
            </View>
            <Switch value={unlisted} onValueChange={setUnlisted} trackColor={{ true: C.primary, false: C.b400 }} />
          </View>
          {batched ? (
            <>
              <View style={{ gap: 8 }}>
                <Btn wide disabled={pending.applying} title="Save" onPress={stage} />
                <Btn wide kind="plain" disabled={pending.applying} title={pending.applying ? 'Signing…' : others > 0 ? `Save and sign all ${others + 1} now` : 'Save and sign now'} onPress={() => void signNow()} />
              </View>
              {err ? <Txt s={12.5} c={C.bad}>{err}</Txt> : queueErr ? <Txt s={12.5} c={C.bad}>{queueErr}</Txt> : null}
              {draft ? (
                <Txt s={12} c={C.warn} lh={17}>
                  Saved, not signed yet — nobody else sees it until you sign it from You.{' '}
                  <Txt s={12} c={C.primary} onPress={() => { pending.dropProfile(); fill(savedOp); setOk(null) }}>Discard</Txt>
                </Txt>
              ) : ok && <Txt s={12} c={C.ok}>{ok}</Txt>}
              <Txt s={12} c={C.tx50} lh={17}>{shortAddr(addr)} signs your changes together, in one signature, whenever you choose. No password, no gas, no session to lose.</Txt>
            </>
          ) : (
            <>
              <Btn wide disabled={busy} title={busy ? 'Signing…' : 'Sign and save'} onPress={() => void save()} />
              {err && <Txt s={12.5} c={C.bad}>{err}</Txt>}
              {ok && <Txt s={12} c={C.ok}>{ok}</Txt>}
              <Txt s={12} c={C.tx50} lh={17}>{shortAddr(addr)} signs this. No password, no gas, no session to lose.</Txt>
            </>
          )}
        </Card>

        {/* X links verify EIP-712 only (the service's `/x-link`) */}
        {isEvmAddr(addr) && <Card title="X" sub="optional, and revocable from either side"><XLink account={addr} linked={saved?.xHandle ?? null} /></Card>}

        {api.SOCIAL_LINKS_READY && <Card title="Linked wallets" sub="one profile across your addresses"><LinkedWallets account={addr} /></Card>}
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <View style={st.card}>
      <View style={{ gap: 2 }}><Txt s={16} w={600}>{title}</Txt>{sub && <Txt s={12} c={C.tx50}>{sub}</Txt>}</View>
      {children}
    </View>
  )
}

function Field({ label, prefix, foot, footTone, multiline, ...input }: TextInputProps & { label: string; prefix?: string; foot?: string; footTone?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt s={12} w={600} c={C.tx50}>{label}</Txt>
      <View style={[st.input, multiline && { minHeight: 84, alignItems: 'flex-start', paddingVertical: 10 }]}>
        {prefix && <Txt s={15} c={C.tx50}>{prefix}</Txt>}
        <TextInput {...input} multiline={multiline} placeholderTextColor={C.tx40} style={[st.text, multiline && { textAlignVertical: 'top' }]} />
      </View>
      {foot && <Txt s={12} c={footTone ?? C.tx50} lh={17}>{foot}</Txt>}
    </View>
  )
}

/** One layer of the character: ‹ its choices › — an earned one marked until the index confirms it. */
function Picker({ label, names, value, onPick, layer, earned }: { label: string; names: string[]; value: number; layer: keyof Spec; earned: string[]; onPick: (i: number) => void }) {
  const n = LAYER_COUNTS[layer]
  // the picked choice kept in view: on first layout, and whenever ‹ › or a tap moves it
  const scroll = React.useRef<React.ComponentRef<typeof ScrollView>>(null)
  const xs = React.useRef<number[]>([])
  const reveal = (animated: boolean) => { const x = xs.current[value]; if (x != null) scroll.current?.scrollTo({ x: Math.max(0, x - 48), animated }) }
  React.useEffect(() => { reveal(true) }, [value]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ gap: 6 }}>
      <View style={st.row}><Txt s={12} w={600} c={C.tx50} style={{ flex: 1 }}>{label}</Txt><Txt s={12} c={C.tx40}>{names[value]}</Txt></View>
      <View style={st.row}>
        <Pressable onPress={() => onPick((value - 1 + n) % n)} hitSlop={6} style={st.nudge} accessibilityLabel={`previous ${label}`}><Txt s={18} c={C.tx70}>‹</Txt></Pressable>
        <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 6 }}>
          {names.map((name, i) => {
            const g = GATED.find((x) => x.layer === layer && x.index === i)
            const locked = !!g && !earned.includes(g.tag)
            const on = i === value
            return (
              <Pressable key={name + i} onPress={() => onPick(i)} onLayout={(e) => { xs.current[i] = e.nativeEvent.layout.x; if (i === value) reveal(false) }} style={[st.opt, on && { borderColor: C.primary, backgroundColor: C.priBg }]} accessibilityState={{ selected: on }} accessibilityHint={g ? `earned: ${g.why}` : undefined}>
                <Txt s={12.5} c={on ? C.tx : C.tx70}>{name}{locked ? ' •' : ''}</Txt>
              </Pressable>
            )
          })}
        </ScrollView>
        <Pressable onPress={() => onPick((value + 1) % n)} hitSlop={6} style={st.nudge} accessibilityLabel={`next ${label}`}><Txt s={18} c={C.tx70}>›</Txt></Pressable>
      </View>
    </View>
  )
}

/**
 * Linking an X account for nothing (the web's `XLink`): the wallet signs `XLink`, the holder posts
 * the address and the same nonce on X, and the service reads the post back before it stores the
 * link. The phone hands the text to X (or to the share sheet, to paste) and takes the post's link.
 */
function XLink({ account, linked }: { account: string; linked: string | null }) {
  const { xLink } = useSocialWrite()
  const refresh = useSocialRefresh()
  const [step, setStep] = React.useState<'idle' | 'post' | 'done'>('idle')
  const [signed, setSigned] = React.useState<Envelope | null>(null)
  const [text, setText] = React.useState('')
  const [postUrl, setPostUrl] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const run = async (f: () => Promise<void>) => {
    setBusy(true); setErr(null)
    try { await f() } catch (e) { setErr(writeError(e)) } finally { setBusy(false) }
  }
  /** Sign first: everything after quotes the nonce that signature carries. */
  const begin = () => run(async () => {
    const nonce = xLinkNonce()
    const env = await xLink(nonce, 'link')
    const { text: t } = await api.xProofText(account, nonce)
    setSigned(env); setText(t); setStep('post')
  })
  const finish = () => run(async () => {
    if (!signed || !postUrl.trim()) return
    await api.xLinkByPost(signed, postUrl.trim())
    refresh.profile(account); setStep('done')
  })
  const unlink = () => run(async () => {
    const env = await xLink(xLinkNonce(), 'unlink')
    await api.xUnlink(env)
    refresh.profile(account); setStep('idle'); setSigned(null)
  })

  if (linked) return (
    <View style={{ gap: 8 }}>
      <View style={st.row}>
        <Txt s={14} style={{ flex: 1 }}>Linked to <Txt s={14} c={C.primary} onPress={() => void Linking.openURL(`https://x.com/${linked}`)}>@{linked}</Txt></Txt>
        <Btn sm kind="plain" disabled={busy} title={busy ? '…' : 'Unlink'} onPress={() => void unlink()} />
      </View>
      {err && <Txt s={12.5} c={C.bad}>{err}</Txt>}
    </View>
  )
  if (step === 'done') return <Txt s={13} c={C.ok}>Linked. Your handle now shows on your profile and beside anything you post here.</Txt>
  if (step === 'post') return (
    <View style={{ gap: 10 }}>
      <Txt s={13} c={C.tx70} lh={19}>Post this on X, then paste the link to it. Nothing is posted on your behalf — you post it, which is the whole proof.</Txt>
      <View style={st.proof}><Txt s={13} lh={19} mono selectable>{text}</Txt></View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn sm title="Post on X ›" onPress={() => void Linking.openURL(`https://x.com/intent/post?text=${encodeURIComponent(text)}`)} />
        <Btn sm kind="plain" title="Share the text" onPress={() => void Share.share({ message: text }).catch(() => {})} />
      </View>
      <Field label="The link to your post" value={postUrl} onChangeText={setPostUrl} placeholder="https://x.com/you/status/…" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn sm kind="plain" title="Cancel" onPress={() => { setStep('idle'); setSigned(null); setErr(null) }} />
        <Btn sm disabled={busy || !postUrl.trim()} title={busy ? 'Checking…' : 'Check the post'} onPress={() => void finish()} />
      </View>
      {err && <Txt s={12.5} c={C.bad}>{err}</Txt>}
      <Txt s={12} c={C.tx50} lh={17}>The post has to stay up: it is the proof, and it is re-checked. You can delete it later by unlinking first.</Txt>
    </View>
  )
  return (
    <View style={{ gap: 10 }}>
      <Txt s={13} c={C.tx70} lh={19}>Show an X handle on your profile. One signature, one public post, no developer account and nothing to pay.</Txt>
      <Btn sm disabled={busy} title={busy ? 'Signing…' : 'Link X'} onPress={() => void begin()} />
      {err && <Txt s={12.5} c={C.bad}>{err}</Txt>}
    </View>
  )
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.86)', borderBottomWidth: 1, borderBottomColor: '#1a1a1f' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  page: { paddingHorizontal: 16, paddingTop: 14 },
  note: { borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  card: { backgroundColor: C.b200, borderRadius: 12, padding: 16, gap: 14 },
  face: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, borderRadius: 10, backgroundColor: C.b300, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12 },
  text: { flex: 1, color: C.tx, fontSize: 15, fontFamily: family(400), paddingVertical: 8 },
  nudge: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.b300, alignItems: 'center', justifyContent: 'center' },
  opt: { borderRadius: 999, borderWidth: 1, borderColor: C.line2, paddingVertical: 6, paddingHorizontal: 11 },
  proof: { backgroundColor: C.b300, borderRadius: 10, padding: 12 },
})
