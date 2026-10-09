/**
 * A thread on anything the index can name: a market, a position, a wallet, a
 * ledger event. Reads are public; posting costs one EIP-712 signature and no
 * gas. Replies are one level deep on purpose — a yield thread is a
 * conversation about one position, not a forum.
 */
import React from 'react'
import { useProfiles, useSocialRefresh, useThread } from '../social/queries'
import { useSocialWrite } from '../social/sign'
import type { Message, SubjectKind } from '../social/types'
import { Ago, Stake, Who } from './social-bits'
import { Sk } from './bits'
import { normAddr } from '../model/address'

const REACTIONS: { kind: string; glyph: string; title: string; word: string }[] = [
  { kind: 'like', glyph: '♥', title: 'like', word: 'like' },
  { kind: 'agree', glyph: '✓', title: 'makes sense', word: 'agree' },
  { kind: 'risky', glyph: '⚠', title: 'looks risky', word: 'risky' },
]

export function Thread({ kind, subjectKey, title, placeholder, compact, max, fold }: {
  kind: SubjectKind
  subjectKey: string
  title?: React.ReactNode
  placeholder?: string
  compact?: boolean
  /** the composer waits behind a "Say something" button, and the reactions say their word — the strip under a list row */
  fold?: boolean
  /** show only the newest `max` top-level messages until asked for the rest — a thread inside a drawer */
  max?: number
}) {
  const t = useThread(kind, subjectKey)
  const msgs = t.data?.messages ?? []
  const authors = msgs.map((m) => m.author)
  const { profile } = useProfiles(authors)
  const { account, message, react, remove } = useSocialWrite()
  const refresh = useSocialRefresh()
  const [body, setBody] = React.useState('')
  const [replyTo, setReplyTo] = React.useState<Message | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  const post = async () => {
    const text = body.trim()
    if (!text) return
    setBusy(true); setErr(null)
    try {
      await message(kind, subjectKey, text, replyTo?.id ?? 0)
      setBody(''); setReplyTo(null); setWriting(false); refresh.thread(kind, subjectKey)
    } catch (e) { setErr(short(e)) } finally { setBusy(false) }
  }
  const toggle = async (r: string) => {
    setErr(null)
    try { await react(kind, subjectKey, r, true); refresh.thread(kind, subjectKey) } catch (e) { setErr(short(e)) }
  }
  const drop = async (m: Message) => {
    setErr(null)
    try { await remove(m.id); refresh.thread(kind, subjectKey) } catch (e) { setErr(short(e)) }
  }

  const [all, setAll] = React.useState(false)
  // folded: the box opens on the button, or on a reply
  const [writing, setWriting] = React.useState(false)
  const composing = !fold || writing || !!replyTo
  const every = msgs.filter((m) => !m.parentId)
  const tops = max && !all ? every.slice(0, max) : every
  const kids = (id: number) => msgs.filter((m) => m.parentId === id)
  return (
    <div className={`thread${compact ? ' compact' : ''}${fold ? ' fold' : ''}`}>
      {title && <div className="thread-h">{title}</div>}
      <div className="reacts">
        {REACTIONS.map((r) => {
          const n = t.data?.reactions?.[r.kind] ?? 0
          return <button key={r.kind} className={`rct ${r.kind}${n ? ' has' : ''}`} title={account ? r.title : `${r.title} — connect a wallet to react`} onClick={() => toggle(r.kind)}><span className="g">{r.glyph}</span>{fold && <span className="w">{r.word}</span>}{n > 0 && <span className="n">{n}</span>}</button>
        })}
        {fold && !composing && <>
          <span className="sp" />
          <button className="btn sm say" disabled={!account} title={account ? undefined : 'Connect a wallet to post'} onClick={() => setWriting(true)}>
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2.5 13.5 3.3 10 10.8 2.5l2.7 2.7-7.5 7.5zM9.5 3.8l2.7 2.7" /></svg>
            {account ? 'Say something' : 'Connect to post'}
          </button>
        </>}
      </div>
      <div className="msgs">
        {t.isLoading && <div className="msg"><Sk w={180} /></div>}
        {!t.isLoading && !tops.length && <p className="thread-empty">{fold ? 'Nothing said yet — be the first.' : 'Nobody has said anything here yet.'}</p>}
        {tops.map((m) => (
          <div key={m.id} className="msg">
            <Row m={m} profile={profile(m.author)} mine={account === normAddr(m.author)} onReply={() => setReplyTo(m)} onDelete={() => drop(m)} />
            {kids(m.id).map((k) => (
              <div key={k.id} className="msg reply">
                <Row m={k} profile={profile(k.author)} mine={account === normAddr(k.author)} onDelete={() => drop(k)} />
              </div>
            ))}
          </div>
        ))}
        {tops.length < every.length && <button className="lnk thread-more" onClick={() => setAll(true)}>Show all {every.length} ›</button>}
      </div>
      {composing && <div className="composer">
        {replyTo && <div className="replying">replying to <b>{replyTo.body.slice(0, 40)}{replyTo.body.length > 40 ? '…' : ''}</b><button className="x" onClick={() => setReplyTo(null)} aria-label="Cancel reply">✕</button></div>}
        <textarea
          value={body}
          maxLength={1000}
          rows={compact ? 2 : 3}
          placeholder={account ? placeholder ?? 'Say something — it is signed by your wallet and public.' : 'Connect a wallet to post'}
          disabled={!account || busy}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void post(); if (e.key === 'Escape' && fold && !body.trim()) { setWriting(false); setReplyTo(null) } }}
          autoFocus={fold}
        />
        <div className="composer-f">
          <span className="foot">{account ? 'One signature, no gas. Everything here is public.' : 'Reads are open; posting needs a wallet.'}</span>
          <span className="sp" />
          {fold && <button className="btn sm ghost" disabled={busy} onClick={() => { setWriting(false); setReplyTo(null); setBody('') }}>Cancel</button>}
          <button className="btn sm pri" disabled={!account || busy || !body.trim()} onClick={() => void post()}>{busy ? 'Signing…' : replyTo ? 'Reply' : 'Post'}</button>
        </div>
        {err && <div className="err">{err}</div>}
      </div>}
    </div>
  )
}

function Row({ m, profile, mine, onReply, onDelete }: {
  m: Message
  profile: ReturnType<ReturnType<typeof useProfiles>['profile']>
  mine: boolean
  onReply?: () => void
  onDelete?: () => void
}) {
  return (
    <div className="msg-row">
      <div className="msg-h">
        <Who account={m.author} profile={profile} size={22} />
        <Stake stake={m.authorStake} />
        <span className="sp" />
        <Ago ts={m.signedAt} />
      </div>
      <p className="msg-b">{m.body}</p>
      <div className="msg-a">
        {onReply && <button onClick={onReply}>reply</button>}
        {mine && onDelete && <button onClick={onDelete}>delete</button>}
      </div>
    </div>
  )
}

const short = (e: unknown) => {
  const m = (e as Error).message ?? 'failed'
  if (/rejected|denied|User rejected/i.test(m)) return 'signature rejected'
  return m.length > 140 ? m.slice(0, 140) + '…' : m
}
