/**
 * #/landing — the two-slide lander for the demo video (Road to Colosseum
 * submission). Deep link only: nothing in the app points here, and the page
 * renders without the Shell. Slide 1 is the hero, slide 2 the problem → the
 * solution, and the only way out is "Open the app" back to #/. Arrow keys,
 * Space and PageDown step the slides, so it presents like a deck.
 */
import React from 'react'
import { Logo, Mark } from './Logo'

export function Landing() {
  const ref = React.useRef<HTMLDivElement>(null)
  // present with the keyboard: → / ↓ / Space / PageDown forward, the mirrors back
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      const fwd = ['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)
      const back = ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)
      if (!fwd && !back) return
      e.preventDefault()
      el.scrollBy({ top: (fwd ? 1 : -1) * el.clientHeight, behavior: 'smooth' })
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="land" ref={ref}>
      <section className="land-slide land-hero">
        <div className="land-glow" aria-hidden="true" />
        <Logo height={44} href="#/landing" />
        <h1>
          Everything you hold, <span className="land-grad">earning.</span>
        </h1>
        <p className="land-sub">
          The social yield app — see what real yield farmers actually do on-chain, and copy them in one tap.
        </p>
        <div className="land-hint" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8l6 6 6-6" /></svg>
        </div>
      </section>

      <section className="land-slide">
        <div className="land-cols">
          <div>
            <h2 className="lbl">The problem</h2>
            <div className="land-pts">
              <div className="land-pt">
                <b>Yield in DeFi is hard.</b>
                <span>Thousands of pools, vaults and loops across a dozen chains — too many options, and no way to tell what is safe from what merely looks it.</span>
              </div>
              <div className="land-pt">
                <b>The loudest voices are paid.</b>
                <span>KOLs are paid by the issuers and lenders they promote. The marketing is biased by construction — you hear what was sponsored, not what works.</span>
              </div>
            </div>
          </div>
          <div>
            <h2 className="lbl">The solution</h2>
            <div className="land-pts">
              <div className="land-pt">
                <b>YieldCircle — the FOMO app for yield farming.</b>
                <span>A live feed of what real wallets are doing, a leaderboard ranked on yield the chain can prove — not on who paid. Follow the farmers who are actually earning.</span>
              </div>
              <div className="land-pt">
                <b>Copy their positions with ease.</b>
                <span>Any position in the feed opens as a ready-made ticket: one tap from seeing a strategy to holding it.</span>
              </div>
            </div>
          </div>
        </div>
        <a className="btn pri land-cta" href="#/">
          <Mark size={18} mono /> Open the app
        </a>
      </section>
    </div>
  )
}
