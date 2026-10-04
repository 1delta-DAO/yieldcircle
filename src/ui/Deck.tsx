/**
 * #/deck - the pitch deck, as a hidden route. Deep link only: nothing in the
 * app points here, and it renders without the Shell. One slide per section,
 * scroll-snapped; arrow keys, Space and PageDown step through it like the
 * lander (src/ui/Landing.tsx), whose look it borrows. Numbers on the ask and
 * traction slides are draft placeholders, flagged in place.
 */
import React from 'react'
import { Logo, Mark } from './Logo'

const hic = { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

function Slide({ n, kicker, children, className }: { n?: number; kicker?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={'land-slide deck-slide' + (className ? ' ' + className : '')}>
      {n != null && (
        <div className="deck-top" aria-hidden="true">
          <Mark size={16} mono />
          {kicker && <span className="deck-kicker">{kicker}</span>}
          <span className="deck-n">{String(n).padStart(2, '0')}</span>
        </div>
      )}
      {children}
    </section>
  )
}

export function Deck() {
  const ref = React.useRef<HTMLDivElement>(null)
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
    <div className="land deck" ref={ref}>
      {/* 1 - title */}
      <Slide>
        <div className="land-glow" aria-hidden="true" />
        <Logo height={44} href="#/deck" />
        <h1 className="deck-title">
          The <span className="land-grad">social</span> yield app
        </h1>
        <p className="land-sub">
          See what real yield farmers actually do on-chain - and copy them in one tap.
        </p>
        <div className="land-hint" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8l6 6 6-6" /></svg>
        </div>
      </Slide>

      {/* 2 - problem */}
      <Slide n={2} kicker="Problem">
        <h1 className="land-title">
          Yield is noisy - and the noise <span className="land-grad">is paid for.</span>
        </h1>
        <div className="land-pts deck-pts">
          <div className="land-pt">
            <span className="land-pt-ic prob">
              <svg {...hic}><path d="M10 3 3 6.5l7 3.5 7-3.5zM3 10l7 3.5 7-3.5M3 13.5 10 17l7-3.5" /></svg>
            </span>
            <div>
              <b>Too many options, no ground truth.</b>
              <span>Thousands of pools, vaults and loops across a dozen chains. Quoted APRs are projections; there is no way to tell what is safe from what merely looks it.</span>
            </div>
          </div>
          <div className="land-pt">
            <span className="land-pt-ic prob">
              <svg {...hic}><path d="M3.5 8.5v3l2.5.5 1 4.5h2l-.8-4.2 8.3 2.7V5.5L6 8zM13 7.2a2.6 2.6 0 0 1 0 5.6" /></svg>
            </span>
            <div>
              <b>Discovery runs on sponsorship.</b>
              <span>KOLs are paid by the issuers and lenders they promote - marketing biased by construction. Users hear what was sponsored, not what works.</span>
            </div>
          </div>
          <div className="land-pt">
            <span className="land-pt-ic prob">
              <svg {...hic}><circle cx="10" cy="10" r="7" /><path d="M10 6v4.3l2.8 2" /></svg>
            </span>
            <div>
              <b>Even a good find is work.</b>
              <span>From reading about a strategy to holding it is bridges, swaps, approvals and loop math - most people stop before the end.</span>
            </div>
          </div>
        </div>
      </Slide>

      {/* 3 - solution */}
      <Slide n={3} kicker="Solution">
        <h1 className="land-title">
          Follow the <span className="land-grad">proof,</span> not the promotion.
        </h1>
        <div className="land-pts deck-pts">
          <div className="land-pt sol">
            <span className="land-pt-ic sol">
              <svg {...hic}><path d="M11 2.5 4 11h5l-1 6.5L15 9h-5z" /></svg>
            </span>
            <div>
              <b>A feed of what wallets do, not what they say.</b>
              <span>Every post is an on-chain position. The leaderboard ranks wallets on net APR the chain can prove - flagged and filtered, never self-reported.</span>
            </div>
          </div>
          <div className="land-pt sol">
            <span className="land-pt-ic sol">
              <svg {...hic}><rect x="7.5" y="7.5" width="9" height="9" rx="2" /><path d="M12.5 4.5v-1a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1" /></svg>
            </span>
            <div>
              <b>One tap from seeing to holding.</b>
              <span>Any position opens as a ready-made ticket - deposit, loop or vault - with routing and execution handled under the hood.</span>
            </div>
          </div>
          <div className="land-pt sol">
            <span className="land-pt-ic sol">
              <svg {...hic}><path d="M15.5 4.5l-11 11" /><circle cx="6" cy="6" r="2.1" /><circle cx="14" cy="14" r="2.1" /></svg>
            </span>
            <div>
              <b>The FOMO loop, pointed at yield.</b>
              <span>Seeing a stranger verifiably earn 40% on the same stablecoin you hold idle is the strongest acquisition channel in crypto. We productize it.</span>
            </div>
          </div>
        </div>
      </Slide>

      {/* 4 - product, with the app itself as the exhibit */}
      <Slide n={4} kicker="Product" className="deck-prod">
        <div className="deck-prod-wrap">
          <div className="deck-prod-copy">
            <h1 className="land-title">It already <span className="land-grad">works.</span></h1>
            <div className="deck-feats">
              <div><b>Live leaderboard</b><span>Wallets ranked by proven net carry on equity, $/day alongside - across Solana and EVM.</span></div>
              <div><b>Position feed</b><span>Opens, closes and rebalances from followed wallets, each one copyable.</span></div>
              <div><b>Verified numbers</b><span>Illiquid exits, locked and rate-capped positions are hidden by default - yield no one can take home doesn't rank.</span></div>
              <div><b>One-tap tickets</b><span>Loops and vault deposits built from any position in the feed, routed through the 1delta engine.</span></div>
            </div>
          </div>
          <div className="deck-phone">
            <img src="/deck/board.png" alt="The Board: wallets ranked by proven net APR, with $/day earnings" width={381} height={839} />
          </div>
        </div>
      </Slide>

      {/* 5 - business model */}
      <Slide n={5} kicker="Business model">
        <h1 className="land-title">
          Paid for <span className="land-grad">performance,</span> not promotion.
        </h1>
        <div className="land-pts deck-pts">
          <div className="land-pt sol">
            <span className="land-pt-ic sol">
              <svg {...hic}><path d="M3 16.5h14M5 13.5v-4M10 13.5V6M15 13.5V9.5" /></svg>
            </span>
            <div>
              <b>Interest-margin share on executed positions.</b>
              <span>The app earns a thin margin on the yield it routes - aligned with users compounding, not with churn.</span>
            </div>
          </div>
          <div className="land-pt sol">
            <span className="land-pt-ic sol">
              <svg {...hic}><circle cx="7" cy="7" r="3" /><path d="M2.5 17c.6-2.8 2.4-4.3 4.5-4.3S10.9 14.2 11.5 17M13 8.5l1.5 1.5 3-3.5" /></svg>
            </span>
            <div>
              <b>KOLs become distribution with skin in the game.</b>
              <span>A farmer or KOL who brings followers earns a cut of the margin on the positions those followers hold - an income stream that only pays while the strategy performs.</span>
            </div>
          </div>
          <div className="land-pt">
            <span className="land-pt-ic prob">
              <svg {...hic}><path d="M10 3.2 17.4 16H2.6zM10 8.4v3.4M10 14.3h.01" /></svg>
            </span>
            <div>
              <b>Why incumbents can't follow.</b>
              <span>Aggregators and KOL media monetize sponsorship; ranking by proof would torch their own revenue. We have no sponsored inventory to protect.</span>
            </div>
          </div>
        </div>
      </Slide>

      {/* 6 - ask / roadmap */}
      <Slide n={6} kicker="The ask">
        <h1 className="land-title">
          Where this <span className="land-grad">goes.</span>
        </h1>
        <div className="deck-road">
          <div><i>Now</i><b>Social yield board live</b><span>Leaderboard, feed and copy-tickets on Solana + EVM, on the 1delta execution engine.</span></div>
          <div><i>Next</i><b>Creator economy</b><span>Margin-sharing for KOLs and farmers; follows, alerts and auto-copy.</span></div>
          <div><i>Then</i><b>The default yield front-end</b><span>Every idle stablecoin balance a push notification away from the best proven carry.</span></div>
        </div>
        <div className="deck-ask">
          <div className="deck-ask-num">
            <i>Raising</i>
            <b>$250-500k</b>
          </div>
          <div className="deck-ask-uses">
            <i>Use of funds</i>
            <div>
              <span>Marketing</span>
              <span>KOL onboarding</span>
              <span>Chain &amp; protocol expansion</span>
              <span>Mobile app</span>
            </div>
            <p>Plus a token sale via MetaDAO to fund user and KOL incentives.</p>
          </div>
        </div>
        <a className="btn pri land-cta" href="#/">
          <Mark size={18} mono /> Open the app
        </a>
      </Slide>
    </div>
  )
}
