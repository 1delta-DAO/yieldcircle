/**
 * Sign in to — or create — a paper account with a name and a password (tickets/0006 §H). One form:
 * the keys are derived here, and the social service says whether that name already has an account
 * at those keys (sign in), has one at OTHER keys (taken, or the password is wrong), or is free
 * (create). Nothing but signed messages from the derived addresses ever leaves the browser.
 *
 * Opened from anywhere with `openPaperSignIn()`; `PaperSignInHost` (mounted once) shows it.
 */
import React from 'react'
import { useModalChrome } from './useModalChrome'
import { usePaper } from '../state/Paper'
import { derivePaperKeys, normName, PAPER_NAME, PAPER_PASSWORD_MIN, type PaperKeys } from '../wallet/paperKey'
import * as social from '../social/api'

const EVENT = 'yc:paper-signin'
export const openPaperSignIn = () => window.dispatchEvent(new CustomEvent(EVENT))

export function PaperSignInHost() {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => { const f = () => setOpen(true); window.addEventListener(EVENT, f); return () => window.removeEventListener(EVENT, f) }, [])
  return open ? <PaperSignIn onClose={() => setOpen(false)} /> : null
}

type Step = { at: 'form' } | { at: 'working'; what: string } | { at: 'create'; keys: PaperKeys } | { at: 'unreachable'; keys: PaperKeys }

function PaperSignIn({ onClose }: { onClose: () => void }) {
  const paper = usePaper()
  const box = React.useRef<HTMLDivElement>(null)
  useModalChrome(box, true, onClose)
  const [name, setName] = React.useState('')
  const [pw, setPw] = React.useState('')
  const [remember, setRemember] = React.useState(true)
  const [step, setStep] = React.useState<Step>({ at: 'form' })
  const [err, setErr] = React.useState<string | null>(null)
  const n = normName(name)
  const nameOk = PAPER_NAME.test(n), pwOk = pw.length >= PAPER_PASSWORD_MIN

  const enter = async (keys: PaperKeys, create: boolean) => {
    setStep({ at: 'working', what: create ? 'Creating your paper account…' : 'Signing in…' })
    try { await paper.signIn(keys, { remember, create }); onClose() }
    catch (e) { setErr((e as Error).message); setStep({ at: 'form' }) }
  }
  const go = async () => {
    setErr(null)
    setStep({ at: 'working', what: 'Deriving your keys…' })
    let keys: PaperKeys
    try { keys = await derivePaperKeys(n, pw) } catch (e) { setErr((e as Error).message); setStep({ at: 'form' }); return }
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
  return (
    <div className="scrim" onPointerDown={onClose}>
      <div className="modal paper-in" ref={box} tabIndex={-1} onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Paper account">
        <div className="th"><span className="pill paper">paper</span><span className="n">Paper account</span><span className="sp" /><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
        {step.at === 'create' ? (
          <div className="tsec">
            <p className="plain" style={{ marginTop: 0 }}>No paper account for <b>{step.keys.name}</b> with this password yet. Create it?</p>
            <ul className="risks">
              <li><i /><span>You get play money on every chain the app offers: 10,000 of each chain's dollar and some of its gas coin.</span></li>
              <li><i /><span>Real rates, real quotes and real risks, but nothing is signed or sent on chain.</span></li>
              <li className="w"><i /><span>There is no password reset. A different password is a different account. Never send real money to it.</span></li>
            </ul>
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn pri" onClick={() => enter(step.keys, true)}>Create “{step.keys.name}”</button>
              <button className="btn" onClick={() => setStep({ at: 'form' })}>Back</button>
            </div>
          </div>
        ) : step.at === 'unreachable' ? (
          <div className="tsec">
            <p className="plain" style={{ marginTop: 0 }}>The profile service did not answer, so it cannot say whether <b>{step.keys.name}</b> exists yet.</p>
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn pri" onClick={() => enter(step.keys, false)}>Continue anyway</button>
              <button className="btn" onClick={() => setStep({ at: 'form' })}>Back</button>
            </div>
            <p className="foot" style={{ marginTop: 8 }}>Same name and password, same account: nothing is lost by trying again later.</p>
          </div>
        ) : (
          <form className="tsec" onSubmit={(e) => { e.preventDefault(); if (nameOk && pwOk && step.at === 'form') void go() }}>
            <p className="plain" style={{ marginTop: 0 }}>Try every strategy with play money — no wallet needed. A name and a password are the whole account: the same two on any device open the same book.</p>
            <label className="lbl" htmlFor="paper-name">Name</label>
            <input id="paper-name" className="inp" autoComplete="username" autoCapitalize="off" spellCheck={false} value={name} onChange={(e) => setName(e.target.value)} placeholder="3–20 letters, digits or _" />
            {name && !nameOk && <p className="foot warn">3–20 characters: a–z, 0–9 and _. It is also your public handle.</p>}
            <label className="lbl" htmlFor="paper-pw" style={{ marginTop: 10 }}>Password</label>
            <input id="paper-pw" className="inp" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={`at least ${PAPER_PASSWORD_MIN} characters`} />
            <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Stay signed in on this device</label>
            {err && <p className="err" style={{ marginTop: 8 }}>{err}</p>}
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn pri wide" type="submit" disabled={!nameOk || !pwOk || step.at === 'working'}>{step.at === 'working' ? step.what : 'Continue'}</button>
            </div>
            <p className="foot" style={{ marginTop: 8 }}>New name: you will be asked to create it. Your password never leaves this browser.</p>
          </form>
        )}
      </div>
    </div>
  )
}
