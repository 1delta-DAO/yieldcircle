/**
 * #/join — the one-screen waitlist page. The app itself is open to every
 * visitor (only real trading needs beta access), so this is reached by its
 * route only: the welcome the gate lands a new member on after the signature,
 * and a page to link to (the full landing page is its own deployment, `landing/`).
 * One button in the middle, the join flow is the overlay's own card
 * (`openGate`), and the field behind it is real farmers (`Showcase.tsx`).
 * A visitor without access can also go in on PAPER (a name and a password, play money): the app
 * opens for a paper session, and only real trading stays behind the waitlist (tickets/0006).
 * A visitor who is IN (whitelisted, or the gate is off) sees the same page at
 * `#/join` with a banner instead of the waitlist — the gate lands them here
 * after the signature — and an access-code holder gets the nudge to join.
 */
import React from 'react'
import { Logo, Socials } from '@yieldcircle/design'
import { WAITLIST_HREF, gated, onAccessCode, openGate } from '../wallet/gate'
import { Showcase } from './Showcase'
import { openPaperSignIn } from './PaperSignIn'

export { gated }

export function Join() {
  const join = (e: React.MouseEvent) => { if (openGate()) e.preventDefault() }
  const inside = !gated()
  const pass = inside && onAccessCode()

  return (
    <Showcase className={inside ? 'has-banner' : ''}>
      <header className="join-top"><Logo height={30} href="#/join" /><Socials className="join-social" label="Telegram" /></header>
      {inside && (
        <div className="join-banner">
          {pass
            ? <><b>You're in on an access code.</b> It isn't yours to keep — <a href={WAITLIST_HREF} target="_blank" rel="noopener">join the waitlist</a> to hold a place of your own.</>
            : <><b>You're in.</b> The beta is open to this wallet — everything you see is live.</>}
        </div>
      )}
      <main className="join-hero">
        {inside && <span className="join-pill">{pass ? 'Access code' : 'Welcome to the beta'}</span>}
        <h1>Everything you hold, <span className="land-grad">earning.</span></h1>
        <p>See what real yield farmers actually make — the PnL the chain can prove, not the APR on the poster — and copy them in one tap.</p>
        {inside ? <>
          <a className="join-cta" href="#/">Open the app</a>
          <a className="join-in" href="#/board">See the leaderboard</a>
        </> : <>
          <a className="join-cta" href="#/" onClick={join}>Join the waitlist</a>
          {/* paper trading needs no beta: a name and a password, play money, the whole app (tickets/0006) */}
          <button type="button" className="join-paper" onClick={openPaperSignIn}>Try it with paper money <small>no wallet, no waitlist</small></button>
          <a className="join-in" href="#/" onClick={join}>Already on the list? Sign in</a>
        </>}
      </main>
    </Showcase>
  )
}
