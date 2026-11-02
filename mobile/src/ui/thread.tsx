import React from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { normAddr } from '@yieldcircle/core/model/address'
import { ago, usdShort } from '@yieldcircle/core/model/format'
import { REACTIONS, stakeLine } from '@yieldcircle/core/social/words'
import type { Message, Profile, SubjectKind } from '@yieldcircle/core/social/types'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import type { ThreadRef } from '@yieldcircle/core/model/uid'
import { useSession } from '@yieldcircle/app/session'
import { useProfiles, useSocialRefresh, useThread } from '@yieldcircle/app/social/queries'
import { useSocialWrite } from '@yieldcircle/app/social/sign'
import { useWhoIsIn } from '@yieldcircle/app/social/whoIsIn'
import { C } from '../theme'
import { family } from '../fonts'
import { Btn, Sk } from './bits'
import { Who } from './Character'
import { openStrategy, openWallet } from './lite'
import { writeError } from './social'
import { Txt } from './Txt'

/**
 * A thread (the web's `Thread`): reads are public; posting costs one signature and no gas. Replies
 * are one level deep on purpose — a conversation about one strategy, not a forum. `max` shows the
 * newest few top-level messages until asked for the rest.
 */
export function Thread({ kind, subjectKey, placeholder, max }: { kind: SubjectKind; subjectKey: string; placeholder?: string; max?: number }) {
  const t = useThread(kind, subjectKey)
  const msgs = t.data?.messages ?? []
  const { profile } = useProfiles(msgs.map((m) => m.author))
  const { account, message, react, remove } = useSocialWrite()
  const refresh = useSocialRefresh()
  const [body, setBody] = React.useState('')
  const [replyTo, setReplyTo] = React.useState<Message | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const [all, setAll] = React.useState(false)
  const run = async (f: () => Promise<unknown>) => { setErr(null); try { await f(); refresh.thread(kind, subjectKey) } catch (e) { setErr(writeError(e)) } }
  const post = async () => {
    const text = body.trim()
    if (!text) return
    setBusy(true)
    await run(async () => { await message(kind, subjectKey, text, replyTo?.id ?? 0); setBody(''); setReplyTo(null) })
    setBusy(false)
  }
  const every = msgs.filter((m) => !m.parentId)
  const tops = max && !all ? every.slice(0, max) : every
  const kids = (id: number) => msgs.filter((m) => m.parentId === id)
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {REACTIONS.map((r) => {
          const n = t.data?.reactions?.[r.kind] ?? 0
          return (
            <Pressable key={r.kind} onPress={() => void run(() => react(kind, subjectKey, r.kind, true))} disabled={!account} style={[st.react, n > 0 && { borderColor: C.line2 }]} accessibilityLabel={r.title}>
              <Txt s={12.5} c={r.kind === 'risky' ? C.warn : r.kind === 'like' ? C.bad : C.ok}>{r.glyph}</Txt>
              <Txt s={12} c={C.tx70}>{r.word}{n > 0 ? ` ${n}` : ''}</Txt>
            </Pressable>
          )
        })}
      </View>
      {t.isLoading ? <Sk w={180} />
        : !tops.length ? <Txt s={12.5} c={C.tx50}>Nothing said yet — be the first.</Txt>
        : tops.map((m) => (
          <View key={m.id} style={{ gap: 8 }}>
            <Row m={m} profile={profile(m.author)} mine={account === normAddr(m.author)} onReply={() => setReplyTo(m)} onDelete={() => void run(() => remove(m.id))} />
            {kids(m.id).map((k) => <View key={k.id} style={st.reply}><Row m={k} profile={profile(k.author)} mine={account === normAddr(k.author)} onDelete={() => void run(() => remove(k.id))} /></View>)}
          </View>
        ))}
      {tops.length < every.length && <Pressable onPress={() => setAll(true)}><Txt s={12.5} c={C.primary}>Show all {every.length} ›</Txt></Pressable>}
      <View style={{ gap: 8 }}>
        {replyTo && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt s={12} c={C.tx50} numberOfLines={1} style={{ flex: 1 }}>replying to <Txt s={12} w={600} c={C.tx70}>{replyTo.body.slice(0, 40)}{replyTo.body.length > 40 ? '…' : ''}</Txt></Txt>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={8} accessibilityLabel="Cancel reply"><Txt s={16} c={C.tx50}>×</Txt></Pressable>
          </View>
        )}
        <TextInput value={body} onChangeText={setBody} maxLength={1000} multiline editable={!!account && !busy}
          placeholder={account ? placeholder ?? 'Say something — it is signed by your wallet and public.' : 'Connect a wallet to post'}
          placeholderTextColor={C.tx40} style={st.box} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Txt s={11.5} c={C.tx40} style={{ flex: 1 }}>{account ? 'One signature, no gas. Everything here is public.' : 'Reads are open; posting needs a wallet.'}</Txt>
          <Btn sm disabled={!account || busy || !body.trim()} title={busy ? 'Signing…' : replyTo ? 'Reply' : 'Post'} onPress={() => void post()} />
        </View>
        {err && <Txt s={12.5} c={C.bad}>{err}</Txt>}
      </View>
    </View>
  )
}

function Row({ m, profile, mine, onReply, onDelete }: { m: Message; profile: Profile | null; mine: boolean; onReply?: () => void; onDelete?: () => void }) {
  const stake = stakeLine(m.authorStake)
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable onPress={() => openWallet(m.author)} style={{ flexShrink: 1 }}><Who account={m.author} profile={profile} size={22} sub={stake?.text} /></Pressable>
        <View style={{ flex: 1 }} />
        <Txt s={11} c={C.tx40}>{ago(m.signedAt)}</Txt>
      </View>
      <Txt s={13.5} lh={19}>{m.body}</Txt>
      {(onReply || mine) && (
        <View style={{ flexDirection: 'row', gap: 14 }}>
          {onReply && <Pressable onPress={onReply} hitSlop={6}><Txt s={12} c={C.tx50}>reply</Txt></Pressable>}
          {mine && onDelete && <Pressable onPress={onDelete} hitSlop={6}><Txt s={12} c={C.tx50}>delete</Txt></Pressable>}
        </View>
      )}
    </View>
  )
}

/**
 * "Say why" (the web's `SayWhy`): asked beside the confirm button, from someone about to put money
 * in, and again once it is done. Posted to the strategy's thread, where the next person choosing it
 * reads it. One signature, no gas, nothing on chain. Nothing without a wallet that signs.
 */
export function SayWhy({ on, done }: { on: ThreadRef | null; done?: boolean }) {
  const { account, message } = useSocialWrite()
  const refresh = useSocialRefresh()
  const [open, setOpen] = React.useState(false)
  const [body, setBody] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [posted, setPosted] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  if (!on || !account) return null
  const post = async () => {
    const text = body.trim()
    if (!text) return
    setBusy(true); setErr(null)
    try { await message(on.kind, on.key, text); refresh.thread(on.kind, on.key); setPosted(true); setOpen(false); setBody('') }
    catch (e) { setErr(writeError(e)) }
    finally { setBusy(false) }
  }
  if (posted) return <Txt s={12.5} c={C.ok} style={{ marginTop: 10 }}>Posted. It shows on this strategy for everyone reading it.</Txt>
  if (!open) return (
    <Pressable onPress={() => setOpen(true)} style={st.say}>
      <Txt s={18} w={700} c={C.primary} lh={20}>”</Txt>
      <Txt s={13} c={C.tx70}>{done ? 'Say why you did this' : 'Say why (optional)'}<Txt s={12} c={C.tx40}> · one signature, no gas</Txt></Txt>
    </Pressable>
  )
  return (
    <View style={{ gap: 8, marginTop: 10 }}>
      <TextInput autoFocus value={body} onChangeText={setBody} maxLength={1000} multiline placeholder="Why this one? e.g. “funding is positive again and the PT is expensive”" placeholderTextColor={C.tx40} style={st.box} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt s={11.5} c={C.tx40} style={{ flex: 1 }}>Public, signed by your wallet, shown on this strategy.</Txt>
        <Btn sm kind="plain" title="Not now" onPress={() => setOpen(false)} />
        <Btn sm disabled={busy || !body.trim()} title={busy ? 'Signing…' : 'Post'} onPress={() => void post()} />
      </View>
      {err && <Txt s={12.5} c={C.bad}>{err}</Txt>}
    </View>
  )
}

/**
 * Who's in it, on Lite's ticket (the web's `LiteWho`): the biggest holders with the people you follow
 * first (`useWhoIsIn`), each with what they said about it and a Copy; then the thread, folded.
 */
export function WhoIsIn({ s, uid, thread, heldBy }: { s: Strategy; uid: string | null; thread: ThreadRef | null; /** the proof's line: "n people run this · $x" */ heldBy: string }) {
  const { account } = useSession()
  const w = useWhoIsIn(uid, thread, account)
  const [talk, setTalk] = React.useState(false)
  if (!uid && !thread) return null
  return (
    <View style={st.sec}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt s={12} w={600} c={C.tx50} style={{ flex: 1, letterSpacing: 0.4, textTransform: 'uppercase' }}>Who’s in it</Txt>
        {!!heldBy && <Txt s={12} c={C.tx50}>{heldBy}</Txt>}
      </View>
      {w.nFollowed > 0 && <Txt s={12.5} c={C.ok}>{w.nFollowed === 1 ? 'Someone you follow runs this' : `${w.nFollowed} people you follow run this`}</Txt>}
      {w.isLoading ? <Sk w={180} />
        : !w.rows.length ? <Txt s={12.5} c={C.tx50}>Nobody the index follows is in it yet.</Txt>
        : w.rows.map((h) => {
          const why = w.said(h.account)
          return (
            <View key={h.account} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable onPress={() => openWallet(h.account)} style={{ flex: 1 }}>
                  <Who account={h.account} profile={w.profile(h.account)} idx={h} size={24} sub={`${w.follows(h.account) ? 'you follow · ' : ''}${h.amountUsd != null ? `${usdShort(h.amountUsd)} in it` : 'in it'}`} />
                </Pressable>
                <Btn sm kind="plain" title="Copy" onPress={() => openStrategy(s, { copy: h.account })} />
              </View>
              {why && <Txt s={12.5} c={C.tx70} lh={18} numberOfLines={2} style={{ marginLeft: 32, fontStyle: 'italic' }}>“{why.body}”</Txt>}
            </View>
          )
        })}
      {thread && (
        <View style={{ gap: 10 }}>
          <Pressable onPress={() => setTalk(!talk)} accessibilityState={{ expanded: talk }}>
            <Txt s={13} c={C.primary}>{talk ? 'Hide what people say' : w.n ? `What people say (${w.n}) ›` : 'Say something about it ›'}</Txt>
          </Pressable>
          {talk && <Thread kind={thread.kind} subjectKey={thread.key} max={4} placeholder={`What do you make of this ${s.kind === 'loop' ? 'loop' : 'one'}?`} />}
        </View>
      )}
    </View>
  )
}

const st = StyleSheet.create({
  sec: { paddingVertical: 14, paddingHorizontal: 16, gap: 12, borderTopWidth: 1, borderTopColor: C.line },
  react: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1, borderColor: C.line, paddingVertical: 5, paddingHorizontal: 10 },
  reply: { marginLeft: 16, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: C.line },
  box: { minHeight: 64, borderRadius: 10, backgroundColor: C.b300, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 10, color: C.tx, fontSize: 14, fontFamily: family(400), textAlignVertical: 'top' },
  say: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2 },
})
