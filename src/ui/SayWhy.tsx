/**
 * "Say why" — the mechanic the whole social layer runs on.
 *
 * A yield app never gets comments by waiting for people to feel like
 * commenting: a deposit sits still for weeks and there is nothing to react to.
 * It gets them by asking at the one moment intent is maximal — beside the
 * confirm button, from someone who is about to put money in.
 *
 * The note is posted to the STRATEGY's market thread, not to the transaction.
 * Two reasons: the market uid is the key this app, the index and the social
 * service provably agree on (the loop legs are the optimizer's own uids and a
 * deposit's is rebuilt from the same `<lender>:<chain>:<ref>` shape), and it
 * puts the comment where the next person choosing that strategy will read it.
 * One EIP-712 signature, no gas, nothing sent on chain.
 */
import React from 'react'
import { useSocialRefresh } from '../social/queries'
import { useSocialWrite } from '../social/sign'

export function SayWhy({ uid, label, done }: { uid: string | null; label?: string; done?: boolean }) {
  const { account, message } = useSocialWrite()
  const refresh = useSocialRefresh()
  const [open, setOpen] = React.useState(false)
  const [body, setBody] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [posted, setPosted] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  if (!uid || !account) return null

  const post = async () => {
    const text = body.trim()
    if (!text) return
    setBusy(true); setErr(null)
    try {
      await message('market', uid, text)
      refresh.thread('market', uid)
      setPosted(true); setOpen(false); setBody('')
    } catch (e) {
      const m = (e as Error).message
      setErr(/rejected|denied/i.test(m) ? 'signature rejected' : m.slice(0, 120))
    } finally { setBusy(false) }
  }

  if (posted) return <p className="foot ok saywhy-ok">Posted. It shows on this strategy for everyone reading it.</p>
  if (!open)
    return (
      <button className="saywhy" onClick={() => setOpen(true)}>
        <span className="q">”</span>{label ?? (done ? 'Say why you did this' : 'Say why (optional)')}
        <span className="t40"> · one signature, no gas</span>
      </button>
    )
  return (
    <div className="saywhy-box">
      <textarea autoFocus rows={2} maxLength={1000} value={body} placeholder="Why this one? e.g. “funding is positive again and the PT is expensive”"
        onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void post() }} />
      <div className="composer-f">
        <span className="foot">Public, signed by your wallet, shown on this strategy.</span>
        <span className="sp" />
        <button className="btn sm ghost" onClick={() => setOpen(false)}>Not now</button>
        <button className="btn sm pri" disabled={busy || !body.trim()} onClick={() => void post()}>{busy ? 'Signing…' : 'Post'}</button>
      </div>
      {err && <div className="err">{err}</div>}
    </div>
  )
}
