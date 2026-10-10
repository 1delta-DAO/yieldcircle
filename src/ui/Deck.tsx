/**
 * #/deck - the pitch deck, as a hidden route. Deep link only: nothing in the
 * app points here, and it renders without the Shell. One slide per section,
 * scroll-snapped; arrow keys, Space and PageDown step through it like the
 * lander (landing/Landing.tsx), whose look it borrows.
 *
 * PDF: the "Save as PDF" button (and `pnpm deck:pdf`, scripts/deck-pdf.mjs,
 * for a file from the command line) print it 1280×720 a slide through the
 * `@media print` rules at the end of the deck block in app.css. The button
 * opens the browser's print dialog; pick "Save as PDF" there.
 *
 * Numbers: yields and the stability figures are from the 2026-10-10 pull in
 * economics/ (gitignored; `detail.md`, `scenarios.md`); infrastructure counts
 * from positions.1delta.io/health the same day. Anything in `DRAFT` below is a
 * placeholder waiting on a real figure or quote, and is flagged on the slide.
 */
import React from 'react'
import { Logo, Mark } from '@yieldcircle/design'

const hic = { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

/** Placeholders only you can fill. Each renders with a `draft` mark until replaced. */
const DRAFT = {
  waitlist: '—',
  quotes: [
    { who: 'Yield farmer, waitlist batch 1', text: 'Quote from an early user goes here.' },
    { who: 'Vault curator', text: 'Quote from a curator or protocol goes here.' },
    { who: 'Investor / advisor', text: 'Quote from a first reviewer goes here.' },
  ],
}

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

function Pt({ kind, icon, title, children }: { kind: 'prob' | 'sol'; icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className={'land-pt' + (kind === 'sol' ? ' sol' : '')}>
      <span className={'land-pt-ic ' + kind}><svg {...hic}>{icon}</svg></span>
      <div>
        <b>{title}</b>
        {children && <span>{children}</span>}
      </div>
    </div>
  )
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="deck-stat">
      <b>{n}</b>
      <span>{label}</span>
    </div>
  )
}

/** Gross APR tiers for a USD depositor (economics/detail.md, 2026-10-10). */
const TIERS = [
  { label: 'Lending pool', sub: 'Aave · Morpho, TVL-weighted', apr: 3.8, kind: 'base' },
  { label: 'Curated vault', sub: 'median of the menu', apr: 4.8, kind: 'up' },
  { label: 'Top-quartile vault', sub: '', apr: 7.9, kind: 'up' },
  { label: 'Stable loop, 3×', sub: 'sUSDe / USDT on Aave', apr: 17.4, kind: 'loop' },
]

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
  const max = Math.max(...TIERS.map((t) => t.apr))
  return (
    <div className="land deck" ref={ref}>
      <button type="button" className="deck-pdf" onClick={() => window.print()} title="Print the deck, one slide a page. Choose 'Save as PDF' in the dialog.">
        <svg {...hic} width={16} height={16}><path d="M5.5 7.5V3h9v4.5M5.5 14H4a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 4 7.5h12A1.5 1.5 0 0 1 17.5 9v3.5A1.5 1.5 0 0 1 16 14h-1.5M5.5 11.5h9V17h-9z" /></svg>
        Save as PDF
      </button>
      {/* 1 - title */}
      <Slide>
        <div className="land-glow" aria-hidden="true" />
        <Logo height={44} href="#/deck" />
        <h1 className="deck-title">
          The <span className="land-grad">social</span> yield app
        </h1>
        <p className="land-sub">See what real wallets earn on-chain. Copy them in one tap.</p>
        <div className="land-hint" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8l6 6 6-6" /></svg>
        </div>
      </Slide>

      {/* 2 - problem */}
      <Slide n={2} kicker="Problem">
        <h1 className="land-title">
          Yield is noisy, and the noise <span className="land-grad">is paid for.</span>
        </h1>
        <div className="land-pts deck-pts">
          <Pt kind="prob" icon={<path d="M10 3 3 6.5l7 3.5 7-3.5zM3 10l7 3.5 7-3.5M3 13.5 10 17l7-3.5" />} title="33,000 markets. No ground truth.">
            Quoted APRs are projections. Safe and merely safe-looking are indistinguishable.
          </Pt>
          <Pt kind="prob" icon={<path d="M3.5 8.5v3l2.5.5 1 4.5h2l-.8-4.2 8.3 2.7V5.5L6 8zM13 7.2a2.6 2.6 0 0 1 0 5.6" />} title="Discovery is sponsored.">
            KOLs are paid by the protocols they promote. Users hear what was bought.
          </Pt>
          <Pt kind="prob" icon={<><circle cx="10" cy="10" r="7" /><path d="M10 6v4.3l2.8 2" /></>} title="Even a good find is work.">
            Bridges, swaps, approvals, loop math. Most people stop before the end.
          </Pt>
        </div>
      </Slide>

      {/* 3 - solution */}
      <Slide n={3} kicker="Solution">
        <h1 className="land-title">
          Follow the <span className="land-grad">proof,</span> not the promotion.
        </h1>
        <div className="land-pts deck-pts">
          <Pt kind="sol" icon={<path d="M11 2.5 4 11h5l-1 6.5L15 9h-5z" />} title="A feed of what wallets do.">
            Every post is an on-chain position. Ranked by realized APR the chain can prove.
          </Pt>
          <Pt kind="sol" icon={<><rect x="7.5" y="7.5" width="9" height="9" rx="2" /><path d="M12.5 4.5v-1a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1" /></>} title="One tap from seeing to holding.">
            Deposit, vault or loop, built and routed under the hood.
          </Pt>
          <Pt kind="sol" icon={<><path d="M15.5 4.5l-11 11" /><circle cx="6" cy="6" r="2.1" /><circle cx="14" cy="14" r="2.1" /></>} title="FOMO, pointed at yield.">
            A stranger verifiably earning 17 % on the stablecoin you hold idle.
          </Pt>
        </div>
      </Slide>

      {/* 4 - product, with the app itself as the exhibit */}
      <Slide n={4} kicker="Product" className="deck-prod">
        <div className="deck-prod-wrap">
          <div className="deck-prod-copy">
            <h1 className="land-title">It already <span className="land-grad">works.</span></h1>
            <div className="deck-feats">
              <div><b>Live leaderboard</b><span>Wallets ranked by proven net carry, Solana and EVM.</span></div>
              <div><b>Position feed</b><span>Opens, closes, rebalances. Each one copyable.</span></div>
              <div><b>Verified numbers</b><span>Illiquid, locked and capped yield does not rank.</span></div>
              <div><b>One-tap tickets</b><span>Loops and vaults on the 1delta engine.</span></div>
            </div>
          </div>
          <div className="deck-phone">
            <img src="/deck/board.png" alt="The Board: wallets ranked by proven net APR, with $/day earnings" width={381} height={839} />
          </div>
        </div>
      </Slide>

      {/* 5 - infrastructure: the index picks up every market by itself */}
      <Slide n={5} kicker="Infrastructure">
        <h1 className="land-title">
          Every market, indexed <span className="land-grad">the moment it exists.</span>
        </h1>
        <div className="deck-stats">
          <Stat n="33k" label="markets tracked" />
          <Stat n="15k" label="live rate series" />
          <Stat n="256k" label="ledger rows / day" />
          <Stat n="15 + Sol" label="chains" />
          <Stat n="68" label="protocols" />
        </div>
        <div className="land-pts deck-pts deck-pts-wide">
          <Pt kind="sol" icon={<><circle cx="10" cy="10" r="7" /><path d="M10 6.5v7M6.5 10h7" /></>} title="No listing step.">
            A new Morpho or Euler market is picked up from its creation event. Positions, rates and holders follow by themselves.
          </Pt>
          <Pt kind="sol" icon={<><path d="M3 15.5h14M5 12.5l3-3 3 2 5-5" /><path d="M13 6.5h3v3" /></>} title="Realized yield, not quoted yield.">
            units × Δindex, valued, flows removed. The same number for every wallet, checkable by anyone.
          </Pt>
        </div>
      </Slide>

      {/* 6 - re-allocation philosophy: why the rates a user holds stay flat */}
      <Slide n={6} kicker="Why rates stay flat">
        <h1 className="land-title">
          Curation is a <span className="land-grad">volatility filter.</span>
        </h1>
        <div className="deck-cmp">
          <div className="deck-cmp-col">
            <i>Everything on-chain</i>
            <b>6.3 pp</b>
            <span>30-day swing, median USD pool under $1m</span>
            <em>biggest one-day move 3.7 pp · upper quartile swings 14 pp</em>
          </div>
          <div className="deck-cmp-vs" aria-hidden="true">vs</div>
          <div className="deck-cmp-col on">
            <i>The YieldCircle menu</i>
            <b>2.4 pp</b>
            <span>30-day swing, median curated row</span>
            <em>biggest one-day move 1.3 pp · month-on-month drift ± 1 pp</em>
          </div>
        </div>
        <div className="deck-rules">
          <div><b>Size and liquidity floors.</b><span>10,500 thin rows hidden by default. Yield nobody can exit does not exist.</span></div>
          <div><b>Rank on the steady rate.</b><span>A 30-day mean outranks one hot night. Spikes show, but do not sort.</span></div>
          <div><b>Re-allocate inside, not across.</b><span>Curated vaults rebalance between markets for you. One move for the vault, none for the user.</span></div>
        </div>
      </Slide>

      {/* 7 - unit economics */}
      <Slide n={7} kicker="Unit economics">
        <h1 className="land-title">
          <span className="land-grad">$10</span> per $10k per point of yield.
        </h1>
        <p className="land-sub deck-sub">A 10 % performance fee. Revenue scales with the yield we route, not with deposits parked.</p>
        <div className="deck-ue">
          <div className="deck-tiers">
            {TIERS.map((t) => (
              <div className={'deck-tier ' + t.kind} key={t.label}>
                <div className="deck-tier-l"><b>{t.label}</b>{t.sub && <span>{t.sub}</span>}</div>
                <div className="deck-tier-bar"><i style={{ width: `${(t.apr / max) * 100}%` }} /></div>
                <b className="deck-tier-n">{t.apr.toFixed(1)} %</b>
              </div>
            ))}
          </div>
          <table className="deck-tbl">
            <thead>
              <tr><th>Per $10k user, 15 % fee</th><th>Curated vaults</th><th>Vaults + loops</th></tr>
            </thead>
            <tbody>
              <tr><td>Gross APR</td><td>6.7 %</td><td>11.0 %</td></tr>
              <tr><td>User keeps</td><td>5.7 %</td><td>9.4 %</td></tr>
              <tr><td>Uplift over the pool</td><td>+1.9 pp</td><td>+5.6 pp</td></tr>
              <tr className="hi"><td>Revenue / user / yr</td><td>$120</td><td>$185</td></tr>
              <tr><td>10k users · $100m</td><td>$1.2m</td><td>$1.9m</td></tr>
              <tr><td>100k users · $1b</td><td>$12m</td><td>$19m</td></tr>
            </tbody>
          </table>
        </div>
        <p className="deck-foot">USD rows, risk ≤ 3, TVL-weighted, 2026-10-10. Loop = sUSDe/USDT 3× on Aave, upper quartile of liquid pairs. Fee shown as 15 % of gross yield plus 10 bps in and out.</p>
      </Slide>

      {/* 8 - business model */}
      <Slide n={8} kicker="Business model">
        <h1 className="land-title">
          Paid for <span className="land-grad">performance,</span> not promotion.
        </h1>
        <div className="land-pts deck-pts">
          <Pt kind="sol" icon={<path d="M3 16.5h14M5 13.5v-4M10 13.5V6M15 13.5V9.5" />} title="A share of the yield we route.">
            Zero when we add nothing. Paid only while the position performs.
          </Pt>
          <Pt kind="sol" icon={<><circle cx="7" cy="7" r="3" /><path d="M2.5 17c.6-2.8 2.4-4.3 4.5-4.3S10.9 14.2 11.5 17M13 8.5l1.5 1.5 3-3.5" /></>} title="KOLs with skin in the game.">
            Bring followers, earn a cut of the margin on what they hold.
          </Pt>
          <Pt kind="prob" icon={<path d="M10 3.2 17.4 16H2.6zM10 8.4v3.4M10 14.3h.01" />} title="Incumbents can't follow.">
            Aggregators and KOL media sell sponsorship. Ranking by proof would torch their revenue.
          </Pt>
        </div>
      </Slide>

      {/* 9 - traction */}
      <Slide n={9} kicker="Traction">
        <h1 className="land-title">
          Live since <span className="land-grad">September.</span>
        </h1>
        <div className="deck-stats">
          <Stat n="174" label="commits in 18 days" />
          <Stat n="15 + Sol" label="chains live" />
          <Stat n="49k" label="wallets active / day across indexed protocols" />
          <Stat n={DRAFT.waitlist} label="waitlist wallets (fill in)" />
        </div>
        <div className="deck-quotes">
          {DRAFT.quotes.map((q) => (
            <figure key={q.who} className="deck-quote draft">
              <blockquote>“{q.text}”</blockquote>
              <figcaption>{q.who}</figcaption>
            </figure>
          ))}
        </div>
      </Slide>

      {/* 10 - ask / roadmap */}
      <Slide n={10} kicker="The ask">
        <h1 className="land-title">
          Where this <span className="land-grad">goes.</span>
        </h1>
        <div className="deck-road">
          <div><i>Now</i><b>Social yield board live</b><span>Leaderboard, feed, copy-tickets. Solana + EVM.</span></div>
          <div><i>Next</i><b>Creator economy</b><span>Margin-sharing for KOLs. Follows, alerts, auto-copy.</span></div>
          <div><i>Then</i><b>The default yield front-end</b><span>Every idle stablecoin one push away from proven carry.</span></div>
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
