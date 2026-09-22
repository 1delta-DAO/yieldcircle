/**
 * Linking an X account, for nothing.
 *
 * X ended free API access for new developers in February 2026 and charges per
 * read, so "sign in with X" now means a developer app, a client secret and a
 * bill. The default here is older and cheaper than any API: **the holder says
 * it in public.**
 *
 *   1  the wallet signs `XLink { author, nonce, action }` — one EIP-712
 *      message, no gas. That is the half that says the address consents.
 *   2  the holder posts their address and the same nonce on X. That is the
 *      half that says an X account claims the address.
 *   3  the social service reads the post back through X's public oEmbed
 *      endpoint — never from this page's word for it — and stores the link
 *      only when the post quotes both.
 *
 * Neither half is enough alone and neither can be forged with the other's
 * material. What it does not buy is X's stable numeric id, so a rename breaks
 * the link and the proof is the post staying up; `VITE_XLINK_URL` enables the
 * OAuth worker for anyone who wants to pay for the stronger version.
 */
import React from 'react'
import * as api from '../social/api'
import { useSocialRefresh } from '../social/queries'
import { useSocialWrite, type Envelope } from '../social/sign'

const XLINK_URL = (import.meta.env.VITE_XLINK_URL as string | undefined)?.replace(/\/$/, '')

const newNonce = () => {
  const b = new Uint8Array(5)
  crypto.getRandomValues(b)
  return 'yc-' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

export function XLink({ account, linked }: { account: string; linked: string | null }) {
  const { xLink } = useSocialWrite()
  const refresh = useSocialRefresh()
  const [step, setStep] = React.useState<'idle' | 'post' | 'done'>('idle')
  const [signed, setSigned] = React.useState<Envelope | null>(null)
  const [text, setText] = React.useState('')
  const [postUrl, setPostUrl] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  const fail = (e: unknown) => {
    const m = (e as Error).message ?? 'failed'
    setErr(/rejected|denied/i.test(m) ? 'signature rejected' : m)
  }

  /** Sign first: everything after this quotes the nonce that signature carries. */
  const begin = async () => {
    setBusy(true); setErr(null)
    try {
      const nonce = newNonce()
      const env = await xLink(nonce, 'link')
      const { text: t } = await api.xProofText(account, nonce)
      setSigned(env); setText(t); setStep('post')
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const finish = async () => {
    if (!signed || !postUrl.trim()) return
    setBusy(true); setErr(null)
    try {
      await api.xLinkByPost(signed, postUrl.trim())
      refresh.profile(account); setStep('done')
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  const unlink = async () => {
    setBusy(true); setErr(null)
    try {
      const env = await xLink(newNonce(), 'unlink')
      await api.xUnlink(env)
      refresh.profile(account); setStep('idle'); setSigned(null)
    } catch (e) { fail(e) } finally { setBusy(false) }
  }

  if (linked)
    return (
      <div className="xrow">
        <span>Linked to <a className="pri" href={`https://x.com/${linked}`} target="_blank" rel="noreferrer">@{linked}</a></span>
        <span className="sp" />
        <button className="btn sm" disabled={busy} onClick={() => void unlink()}>{busy ? '…' : 'Unlink'}</button>
        {err && <div className="err">{err}</div>}
      </div>
    )

  if (step === 'post')
    return (
      <div className="xflow">
        <p className="plain">Post this on X, then paste the link to it. Nothing is posted on your behalf — you post it, which is the whole proof.</p>
        <div className="xpost">
          <code>{text}</code>
          <button className="btn sm" onClick={() => void navigator.clipboard?.writeText(text)}>Copy</button>
        </div>
        <div className="actions">
          <a className="btn sm pri" href={`https://x.com/intent/post?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">Open X ›</a>
        </div>
        <label className="field" style={{ marginTop: 12 }}>
          <span className="lbl">The link to your post</span>
          <div className="amt sm"><input value={postUrl} placeholder="https://x.com/you/status/…" onChange={(e) => setPostUrl(e.target.value)} /></div>
        </label>
        <div className="actions">
          <button className="btn sm ghost" onClick={() => { setStep('idle'); setSigned(null); setErr(null) }}>Cancel</button>
          <button className="btn sm pri" disabled={busy || !postUrl.trim()} onClick={() => void finish()}>{busy ? 'Checking…' : 'Check the post'}</button>
        </div>
        {err && <div className="err">{err}</div>}
        <p className="foot">The post has to stay up: it is the proof, and it is re-checked. You can delete it later by unlinking first.</p>
      </div>
    )

  if (step === 'done') return <p className="foot ok">Linked. Your handle now shows on your profile and beside anything you post here.</p>

  return (
    <div className="xrow">
      <span className="t70">Show an X handle on your profile. One signature, one public post, no developer account and nothing to pay.</span>
      <span className="sp" />
      <button className="btn sm pri" disabled={busy} onClick={() => void begin()}>{busy ? 'Signing…' : 'Link X'}</button>
      {XLINK_URL && <span className="foot">An OAuth route is also configured on this build.</span>}
      {err && <div className="err">{err}</div>}
    </div>
  )
}
