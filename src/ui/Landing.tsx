/**
 * #/landing — the two-slide lander for the demo video (Road to Colosseum
 * submission). Deep link only: nothing in the app points here, and the page
 * renders without the Shell. Slide 1 is the hero, slide 2 the problem → the
 * solution, and the only way out is "Open the app" back to #/. Arrow keys,
 * Space and PageDown step the slides, so it presents like a deck.
 */
import React from 'react'
import { Logo, Mark } from './Logo'

const hic = { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

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

      <section className="land-slide land-why">
        <svg className="land-rings" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id="lr" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="var(--brand-b)" />
              <stop offset="1" stopColor="var(--brand-a)" />
            </linearGradient>
          </defs>
          {/* the mark's motif at landscape scale: open turns of yield around the content */}
          <circle cx="-80" cy="810" r="430" />
          <circle cx="-80" cy="810" r="560" />
          <circle cx="1290" cy="-30" r="400" />
          <circle cx="1290" cy="-30" r="540" />
        </svg>
        <h1 className="land-title">
          Yield is noisy. <span className="land-grad">Follow the proof.</span>
        </h1>
        <div className="land-cols">
          <div>
            <div className="land-h prob">
              <span className="land-h-ic">
                <svg {...hic}><path d="M10 3.2 17.4 16H2.6zM10 8.4v3.4M10 14.3h.01" /></svg>
              </span>
              <b>The problem</b>
            </div>
            <div className="land-pts">
              <div className="land-pt">
                <span className="land-pt-ic prob">
                  <svg {...hic}><path d="M10 3 3 6.5l7 3.5 7-3.5zM3 10l7 3.5 7-3.5M3 13.5 10 17l7-3.5" /></svg>
                </span>
                <div>
                  <b>Yield in DeFi is hard.</b>
                  <span>Thousands of pools, vaults and loops across a dozen chains — too many options, and no way to tell what is safe from what merely looks it.</span>
                </div>
              </div>
              <div className="land-pt">
                <span className="land-pt-ic prob">
                  <svg {...hic}><path d="M3.5 8.5v3l2.5.5 1 4.5h2l-.8-4.2 8.3 2.7V5.5L6 8zM13 7.2a2.6 2.6 0 0 1 0 5.6" /></svg>
                </span>
                <div>
                  <b>The loudest voices are paid.</b>
                  <span>KOLs are paid by the issuers and lenders they promote — marketing biased by construction. You hear what was sponsored, not what works.</span>
                </div>
              </div>
            </div>
          </div>
          <div>
            <div className="land-h sol">
              <span className="land-h-ic">
                <Mark size={20} mono />
              </span>
              <b>The solution</b>
            </div>
            <div className="land-pts">
              <div className="land-pt sol">
                <span className="land-pt-ic sol">
                  <svg {...hic}><path d="M11 2.5 4 11h5l-1 6.5L15 9h-5z" /></svg>
                </span>
                <div>
                  <b>The FOMO app for yield farming.</b>
                  <span>A live feed of what real wallets are doing, and a leaderboard ranked on yield the chain can prove — not on who paid.</span>
                </div>
              </div>
              <div className="land-pt sol">
                <span className="land-pt-ic sol">
                  <svg {...hic}><rect x="7.5" y="7.5" width="9" height="9" rx="2" /><path d="M12.5 4.5v-1a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1" /></svg>
                </span>
                <div>
                  <b>Copy positions in one tap.</b>
                  <span>Any position in the feed opens as a ready-made ticket — from seeing a strategy to holding it in a single step.</span>
                </div>
              </div>
              <div className="land-pt sol">
                <span className="land-pt-ic sol">
                  <svg {...hic}><path d="M15.5 4.5l-11 11" /><circle cx="6" cy="6" r="2.1" /><circle cx="14" cy="14" r="2.1" /></svg>
                </span>
                <div>
                  <b>Aligned incentives for KOLs. <i className="land-tag">building</i></b>
                  <span>Interest-margin sharing: a KOL who refers users earns a cut of the margin on the positions they build — paid for performance, not for promotion.</span>
                </div>
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
