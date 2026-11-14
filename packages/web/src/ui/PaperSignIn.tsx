/**
 * Sign up for — or log in to — a paper account with a name and a password (tickets/0006 §H). One
 * form with the choice on top: "Log in" when this device has had an account (`lastPaperName`),
 * else "Sign up". The keys are derived here, and the social service says whether that name already
 * has an account at those keys (in, whichever was chosen), has one at OTHER keys (taken, or the
 * password is wrong), or is free (sign up creates it at once; log in says there is none).
 * Nothing but signed messages from the derived addresses ever leaves the browser.
 *
 * Opened from anywhere with `openPaperSignIn()`; `PaperSignInHost` (mounted once) shows it.
 */
import React from 'react'
import { useModalChrome } from './useModalChrome'
import { usePaper } from '../state/Paper'
import { lastPaperName } from '../wallet/paper'
import { derivePaperKeys, normName, PAPER_NAME, PAPER_PASSWORD_MIN, type PaperKeys } from '../wallet/paperKey'
import * as social from '../social/api'

const EVENT = 'yc:paper-signin'
export const openPaperSignIn = () => window.dispatchEvent(new CustomEvent(EVENT))

/** `?paper` on the app's address (the landing's "Try it on paper" link) opens the form on arrival. */
export const PAPER_PARAM = 'paper'
export function PaperSignInHost() {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => { const f = () => setOpen(true); window.addEventListener(EVENT, f); return () => window.removeEventListener(EVENT, f) }, [])
  React.useEffect(() => {
    const u = new URL(location.href)
    if (!u.searchParams.has(PAPER_PARAM)) return
    u.searchParams.delete(PAPER_PARAM)
    history.replaceState(history.state, '', u.pathname + u.search + u.hash)
    setOpen(true)
  }, [])
  return open ? <PaperSignIn onClose={() => setOpen(false)} /> : null
}

type Mode = 'signup' | 'login'
type Step = { at: 'form' } | { at: 'working'; what: string } | { at: 'unreachable'; keys: PaperKeys }

function PaperSignIn({ onClose }: { onClose: () => void }) {
  const paper = usePaper()
  const box = React.useRef<HTMLDivElement>(null)
  useModalChrome(box, true, onClose)
  const [last] = React.useState(lastPaperName)
  const [mode, setMode] = React.useState<Mode>(last ? 'login' : 'signup')
  const [name, setName] = React.useState(last ?? '')
  const [pw, setPw] = React.useState('')
  const [remember, setRemember] = React.useState(true)
  const [step, setStep] = React.useState<Step>({ at: 'form' })
  const [err, setErr] = React.useState<string | null>(null)
  const n = normName(name)
  const nameOk = PAPER_NAME.test(n), pwOk = pw.length >= PAPER_PASSWORD_MIN
  const signup = mode === 'signup'
  const pick = (m: Mode) => { if (step.at === 'working') return; setMode(m); setErr(null) }

  const enter = async (keys: PaperKeys, create: boolean) => {
    setStep({ at: 'working', what: create ? 'Creating your paper account…' : 'Logging in…' })
    try {
      await paper.signIn(keys, { remember, create }); onClose()
      // in from the join page: on to the app
      if (location.hash.startsWith('#/join')) location.hash = '#/'
    }
    catch (e) { setErr((e as Error).message); setStep({ at: 'form' }) }
  }
  const go = async () => {
    setErr(null)
    setStep({ at: 'working', what: 'Deriving your keys…' })
    let keys: PaperKeys
    try { keys = await derivePaperKeys(n, pw) } catch (e) { setErr((e as Error).message); setStep({ at: 'form' }); return }
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
  return (
    <div className="scrim" onPointerDown={onClose}>
      <div className="modal paper-in" ref={box} tabIndex={-1} onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Paper account">
        <div className="th"><span className="pill paper">paper</span><span className="n">Paper account</span><span className="sp" /><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
        {step.at === 'unreachable' ? (
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
            <div className="seg paper-mode" role="group" aria-label="Sign up or log in">
              <button type="button" aria-pressed={signup} onClick={() => pick('signup')}>Sign up</button>
              <button type="button" aria-pressed={!signup} onClick={() => pick('login')}>Log in</button>
            </div>
            <p className="plain" style={{ marginTop: 10 }}>{signup
              ? 'Try every strategy with play money — no wallet needed. A name and a password are the whole account.'
              : 'The same name and password open the same book on any device.'}</p>
            <label className="lbl" htmlFor="paper-name">Name</label>
            <input id="paper-name" className="inp" autoComplete="username" autoCapitalize="off" spellCheck={false} value={name} onChange={(e) => setName(e.target.value)} placeholder={signup ? '3–20 letters, digits or _' : 'your paper name'} />
            {name && !nameOk && <p className="foot warn">3–20 characters: a–z, 0–9 and _.{signup ? ' It is also your public handle.' : ''}</p>}
            <label className="lbl" htmlFor="paper-pw" style={{ marginTop: 10 }}>Password</label>
            <input id="paper-pw" className="inp" type="password" autoComplete={signup ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder={signup ? `at least ${PAPER_PASSWORD_MIN} characters` : 'password'} />
            <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Stay signed in on this device</label>
            {signup && (
              <ul className="risks" style={{ marginTop: 10 }}>
                <li><i /><span>You start with 10,000 USDC and 1 SOL on Solana. Real rates, real quotes and real risks, but nothing is signed or sent on chain.</span></li>
                <li><i /><span>The name is also your public handle.</span></li>
                <li className="w"><i /><span>There is no password reset. A different password is a different account. Never send real money to it.</span></li>
              </ul>
            )}
            {err && <p className="err" style={{ marginTop: 8 }}>{err}</p>}
            <div className="actions" style={{ marginTop: 12 }}>
              <button className="btn pri wide" type="submit" disabled={!nameOk || !pwOk || step.at === 'working'}>{step.at === 'working' ? step.what : signup ? `Create ${nameOk ? `“${n}”` : 'account'}` : 'Log in'}</button>
            </div>
            <p className="foot" style={{ marginTop: 8 }}>Your password never leaves this browser.</p>
          </form>
        )}
      </div>
    </div>
  )
}
