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

const REACTIONS: { kind: string; glyph: string; title: string }[] = [
  { kind: 'like', glyph: '♥', title: 'like' },
  { kind: 'agree', glyph: '✓', title: 'makes sense' },
  { kind: 'risky', glyph: '⚠', title: 'looks risky' },
]

export function Thread({ kind, subjectKey, title, placeholder, compact }: {
  kind: SubjectKind
  subjectKey: string
  title?: React.ReactNode
  placeholder?: string
  compact?: boolean
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
      setBody(''); setReplyTo(null); refresh.thread(kind, subjectKey)
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

  const tops = msgs.filter((m) => !m.parentId)
  const kids = (id: number) => msgs.filter((m) => m.parentId === id)
  return (
    <div className={`thread${compact ? ' compact' : ''}`}>
      {title && <div className="thread-h">{title}</div>}
      <div className="reacts">
        {REACTIONS.map((r) => {
          const n = t.data?.reactions?.[r.kind] ?? 0
          return <button key={r.kind} className={`rct${n ? ' has' : ''}`} title={r.title} onClick={() => toggle(r.kind)}><span className="g">{r.glyph}</span>{n > 0 && <span>{n}</span>}</button>
        })}
      </div>
      <div className="msgs">
        {t.isLoading && <div className="msg"><Sk w={180} /></div>}
        {!t.isLoading && !tops.length && <p className="thread-empty">Nobody has said anything here yet.</p>}
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
      </div>
      <div className="composer">
        {replyTo && <div className="replying">replying to <b>{replyTo.body.slice(0, 40)}{replyTo.body.length > 40 ? '…' : ''}</b><button className="x" onClick={() => setReplyTo(null)} aria-label="Cancel reply">✕</button></div>}
        <textarea
          value={body}
          maxLength={1000}
          rows={compact ? 2 : 3}
          placeholder={account ? placeholder ?? 'Say something — it is signed by your wallet and public.' : 'Connect a wallet to post'}
          disabled={!account || busy}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void post() }}
        />
        <div className="composer-f">
          <span className="foot">{account ? 'One signature, no gas. Everything here is public.' : 'Reads are open; posting needs a wallet.'}</span>
          <span className="sp" />
          <button className="btn sm pri" disabled={!account || busy || !body.trim()} onClick={() => void post()}>{busy ? 'Signing…' : replyTo ? 'Reply' : 'Post'}</button>
        </div>
        {err && <div className="err">{err}</div>}
      </div>
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
        <Stake usd={m.authorStake} />
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
