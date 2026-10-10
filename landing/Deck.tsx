/**
 * /deck on the landing - the pitch deck, its own page (deck.html + deck-main.tsx
 * beside this file, a second input of the landing build). Deep link only:
 * nothing links here. One slide per section, scroll-snapped; arrow keys,
 * Space and PageDown step through it.
 *
 * It is drawn with the landing's own playful pieces (design/marketing.css:
 * stickers, tilted colour cards, the comic panels, the marker, the crowd),
 * so the deck and the page read as one thing. Deck-only pieces: deck.css.
 *
 * PDF: the "Save as PDF" button (and `pnpm deck:pdf`, scripts/deck-pdf.mjs,
 * for a file from the command line) print it 1280×720 a slide through the
 * `@media print` rules at the end of deck.css.
 *
 * Numbers: yields and the stability figures are from the 2026-10-10 pull in
 * economics/ (gitignored; `detail.md`, `scenarios.md`); infrastructure counts
 * from positions.1delta.io/health the same day. The two rate lines on the
 * stability slide are real 30-day series from that pull.
 */
import React from 'react'
import { Logo, Mark } from '@yieldcircle/design'
import { Character, type Spec } from '../src/identity/character'
import { APP_URL } from './config'

const hic = { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
const css = (o: Record<string, string | number>) => o as React.CSSProperties

/** The cast, the same creatures as on the landing (Landing.tsx). */
const CAST = {
  kol: { b: 4, c: 1, e: 3, m: 3, a: 7, p: 2 } as Spec,
  lost: { b: 8, c: 4, e: 7, m: 2, a: 3, p: 4 } as Spec,
  sold: { b: 0, c: 3, e: 2, m: 1, a: 2, p: 9 } as Spec,
}
/** A fixed crowd: faces derived from (made-up, full-length) addresses, so the deck needs no fetch and prints the same every time. */
const CROWD = [
  '0x9d4511bc588f5eaede7f847f6f9a0f4c643a71e7',
  '0x9fe8154ad72fde341debab0126bfd23e7eb82cc4',
  '0x2062f2e252785eb067656317917c09c26954c3aa',
  '0x5f5ca121da4e636038be9d379a9891468519bac2',
  '0xb963791d2d26384b95f07d6d54957f4a5097572a',
  '0x4cddbbee344d40447f1d121e0f09b803e6276b5a',
  '0x158706219a5005b0b206a66d6e69fa6b6611cbe6',
  '0xa185f19dd7b9825f95953b696913684ce11439f3',
  '0xdbcbc4d9b66a5399bbfd2235c6af32397bd0241b',
  '0xaa34cce0d6e004e01dd8aa2c93a03e0a7b4cdc43',
  '0xf851591ede9165900c2d5e955a984c2f14b3a3b3',
  '0xa4854a7b1a3d32d3dd029d7bca8c11c3055ac48d',
  '0x9c64e806555d06c2e33a745b5e51ed4e14ec859b',
  '0xcf9df8f789430197d3006ea6a11b5d914fad47a2',
  '0xfa226ec375d7e5417af63638058f0029cc9fbc1c',
  '0x6554d9afedffadb62b0384a07c29ac28ba15fe35',
]

/** Two real 30-day rate series (APR %, one point a day), economics/raw: a thin Euler Earn vault and sUSDe. */
const THIN = [8.33, 6.36, 10.9, 8.67, 8.33, 7.73, 8.3, 8.39, 9.27, 10.03, 9.23, 8.12, 7.53, 8.37, 8.97, 7.21, 7.4, 7.71, 9.35, 8.71, 7.66, 7.9, 6.2, 6.9, 7.33, 8.72, 10.58, 9.3, 7.18, 6.87]
const CURATED = [4.86, 4.82, 4.91, 4.92, 4.88, 4.87, 4.86, 4.7, 4.6, 4.57, 4.58, 4.59, 4.58, 4.6, 4.77, 4.85, 4.89, 4.9, 4.98, 5.01, 5.12, 4.96, 4.93, 4.93, 4.95, 4.88, 4.9, 4.95, 4.78, 4.82]

/** Gross APR tiers for a USD depositor (economics/detail.md). */
const TIERS = [
  { label: 'Lending pool', sub: 'Aave · Morpho', apr: 3.8, c: 'c-ink' },
  { label: 'Curated vault', sub: 'median of the menu', apr: 4.8, c: 'c-cyan' },
  { label: 'Top-quartile vault', sub: '', apr: 7.9, c: 'c-moss' },
  { label: 'Stable loop, 3×', sub: 'sUSDe / USDT', apr: 17.4, c: 'c-gold' },
]

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

function Rings() {
  return (
    <svg className="land-rings" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="lr" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="var(--brand-b)" />
          <stop offset="1" stopColor="var(--brand-a)" />
        </linearGradient>
      </defs>
      <circle cx="-80" cy="810" r="430" />
      <circle cx="-80" cy="810" r="560" />
      <circle cx="1290" cy="-30" r="400" />
      <circle cx="1290" cy="-30" r="540" />
    </svg>
  )
}

function Crowd() {
  return (
    <div className="lp-crowd deck-crowd" aria-hidden="true">
      {CROWD.map((a, i) => <span key={a} style={css({ '--i': i, '--n': CROWD.length })}><Character addr={a} size={56} title="" /></span>)}
    </div>
  )
}

/** A 30-day rate line on a shared scale, so the two slides' lines can be read against each other. */
function Line({ v, lo, hi, stroke }: { v: number[]; lo: number; hi: number; stroke: string }) {
  const W = 320, H = 96
  const pts = v.map((y, i) => `${(i / (v.length - 1)) * W},${H - ((y - lo) / (hi - lo)) * H}`).join(' ')
  return (
    <svg className="deck-line" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
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
  const max = Math.max(...TIERS.map((t) => t.apr))
  return (
    <div className="lp land deck" ref={ref}>
      <button type="button" className="deck-pdf" onClick={() => window.print()} title="Print the deck, one slide a page. Choose 'Save as PDF' in the dialog.">
        <svg {...hic} width={16} height={16}><path d="M5.5 7.5V3h9v4.5M5.5 14H4a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 4 7.5h12A1.5 1.5 0 0 1 17.5 9v3.5A1.5 1.5 0 0 1 16 14h-1.5M5.5 11.5h9V17h-9z" /></svg>
        Save as PDF
      </button>

      {/* 1 - title */}
      <Slide className="deck-hero">
        <div className="land-glow" aria-hidden="true" />
        <Rings />
        <Logo height={40} href="/deck" />
        <span className="lp-sticker lp-sticker-hero">Pre-seed · October 2026</span>
        <h1 className="deck-title">Everything you hold, <span className="lp-mark">earning.</span></h1>
        <p className="lp-lead center">The social yield app. See what real wallets make, proven on-chain, and copy them in one tap.</p>
        <Crowd />
      </Slide>

      {/* 2 - problem: the comic */}
      <Slide n={2} kicker="Problem">
        <span className="lp-sticker prob">What's broken</span>
        <h2 className="lp-h2 center">Yield is <span className="lp-wob">noisy.</span> Nobody shows you the proof.</h2>
        <div className="lp-comic deck-comic">
          <div className="lp-panel in" style={css({ '--tilt': '-1.5deg' })}>
            <div className="lp-bubble shout"><b>500% APR!!</b> trust me bro <i className="lp-tag-s">sponsored</i></div>
            <Character addr="kol" spec={CAST.kol} size={96} title="" />
            <b>The loudest voices are paid.</b>
            <span>KOLs promote whoever pays them.</span>
          </div>
          <div className="lp-panel in" style={css({ '--tilt': '1deg' })}>
            <div className="lp-swarm" aria-hidden="true">
              {['pool #4,912', 'vault', 'loop 6×', 'PT-sUSDe', '"safe"', 'new chain', 'points', '12.4%', 'vault', 'pool #4,913'].map((t, i) => <i key={i} style={css({ '--i': i })}>{t}</i>)}
            </div>
            <Character addr="lost" spec={CAST.lost} size={96} title="" />
            <b>33,000 markets, no signal.</b>
            <span>Thousands of quoted rates. Nothing says which hold up.</span>
          </div>
          <div className="lp-panel in" style={css({ '--tilt': '-0.8deg' })}>
            <div className="lp-poster"><s>APR 18.0%</s><em>realized <b>3.1%</b></em></div>
            <Character addr="sold" spec={CAST.sold} size={96} title="" />
            <b>The poster isn't what you earn.</b>
            <span>Rates move. Realized is the only number you keep.</span>
          </div>
        </div>
      </Slide>

      {/* 3 - solution: the stickers */}
      <Slide n={3} kicker="Solution" className="deck-fix">
        <Rings />
        <span className="lp-sticker sol"><Mark size={14} mono /> How we fix it</span>
        <h2 className="lp-h2 center">Follow the <span className="lp-mark">proof,</span> not the promotion.</h2>
        <div className="lp-stickers deck-stickers">
          <div className="lp-card c-cyan in" style={css({ '--tilt': '-2deg' })}>
            <div className="lp-mock lp-mock-feed">
              <Character addr="0x7a3f9c2e" size={28} title="" />
              <span className="lp-mock-who"><b>Copper Kelp</b><small>2m ago</small></span>
              <span className="verb k-in">deposited</span>
              <span className="lp-mock-copy">Copy this ›</span>
            </div>
            <b>A feed of real wallets.</b>
            <span>Who holds what, since when, what it made.</span>
          </div>
          <div className="lp-card c-gold in" style={css({ '--tilt': '1.5deg' })}>
            <div className="lp-mock lp-mock-board">
              {[['Zesty Walrus', '100.4%', 0], ['Fearless Urchin', '85.0%', 1], ['Calm Viper', '60.6%', 2]].map(([n, a, i]) => (
                <div key={n} className="lp-mock-row"><i>{(i as number) + 1}</i><Character addr={`0xb${i}ard${n}`} size={22} title="" /><b>{n}</b><em>{a}</em></div>
              ))}
            </div>
            <b>A board ranked on proof.</b>
            <span>Net of debt, from the chain. Never a quote.</span>
          </div>
          <div className="lp-card c-moss in" style={css({ '--tilt': '1deg' })}>
            <div className="lp-mock lp-mock-ticket">
              <span className="lp-mock-pair"><b>sUSDe / USDT</b><small>Aave · Ethereum</small></span>
              <span className="lp-mock-lev">3.0×</span>
              <span className="lp-mock-btn">Hold it</span>
            </div>
            <b>Copy it in one tap.</b>
            <span>Any position is a ready ticket. EVM and Solana.</span>
          </div>
        </div>
      </Slide>

      {/* 4 - product, with the app itself as the exhibit */}
      <Slide n={4} kicker="Product" className="deck-prod">
        <div className="deck-prod-wrap">
          <div className="deck-prod-copy">
            <span className="lp-sticker sol">Live in closed beta</span>
            <h2 className="lp-h2">It already <span className="lp-mark">works.</span></h2>
            <div className="deck-feats">
              <div className="c-cyan"><b>Live leaderboard</b><span>Wallets ranked by proven net carry.</span></div>
              <div className="c-gold"><b>Position feed</b><span>Opens, closes, rebalances. Each one copyable.</span></div>
              <div className="c-moss"><b>Verified numbers</b><span>Illiquid, locked and capped yield does not rank.</span></div>
              <div className="c-plum"><b>One-tap tickets</b><span>Loops and vaults on the 1delta engine.</span></div>
            </div>
          </div>
          <div className="deck-phone" style={css({ '--tilt': '2deg' })}>
            <img src="/deck/board.png" alt="The Board: wallets ranked by proven net APR, with $/day earnings" width={381} height={839} />
          </div>
        </div>
      </Slide>

      {/* 5 - infrastructure: the index picks up every market by itself */}
      <Slide n={5} kicker="Infrastructure">
        <span className="lp-sticker sol">Under the hood</span>
        <h2 className="lp-h2 center">Every market, indexed <span className="lp-mark">the moment it exists.</span></h2>
        <div className="deck-stats">
          {[['33k', 'markets tracked', 'c-cyan', '-2deg'], ['15k', 'live rate series', 'c-gold', '1.5deg'], ['256k', 'ledger rows a day', 'c-moss', '-1deg'], ['15 + Sol', 'chains', 'c-plum', '2deg'], ['68', 'protocols', 'c-cyan', '-1.5deg']].map(([n, l, c, t]) => (
            <div key={l} className={`lp-card deck-stat in ${c}`} style={css({ '--tilt': t })}><b>{n}</b><span>{l}</span></div>
          ))}
        </div>
        <div className="lp-mock deck-mock-wide">
          <Character addr="0x9994e35db0cd3f5c7b2f0b2c0c7a3d1e8f6a4b2c" size={28} title="" />
          <span className="lp-mock-who"><b>Morpho</b><small>just now</small></span>
          <span className="verb k-in">created</span>
          <span className="lp-mock-amt">a new market</span>
          <span className="deck-mock-arrow" aria-hidden="true">→</span>
          <span className="lp-mock-who"><b>indexed</b><small>positions · rates · holders</small></span>
          <span className="lp-mock-copy">No listing step</span>
        </div>
        <p className="deck-foot">Realized yield is units × Δindex, valued, flows removed. The same number for every wallet, checkable by anyone.</p>
      </Slide>

      {/* 6 - re-allocation philosophy: why the rates a user holds stay flat */}
      <Slide n={6} kicker="Why rates stay flat">
        <span className="lp-sticker sol">Curation</span>
        <h2 className="lp-h2 center">Curation is a <span className="lp-mark">volatility filter.</span></h2>
        <div className="deck-cmp">
          <div className="lp-card c-gold in deck-cmp-col" style={css({ '--tilt': '-1.5deg' })}>
            <i>Everything on-chain</i>
            <Line v={THIN} lo={3} hi={12} stroke="#e2c33a" />
            <b>6.3 pp</b>
            <span>30-day swing of the median thin pool</span>
            <small>a $200k Euler Earn vault, 30 real days</small>
          </div>
          <div className="lp-card c-moss in deck-cmp-col" style={css({ '--tilt': '1.5deg' })}>
            <i>The YieldCircle menu</i>
            <Line v={CURATED} lo={3} hi={12} stroke="var(--success)" />
            <b>2.4 pp</b>
            <span>30-day swing of the median curated row</span>
            <small>sUSDe, $1.2b, the same 30 days</small>
          </div>
        </div>
        <div className="deck-rules">
          <span className="lp-sticker"><b>1</b> Size and liquidity floors. 10,500 thin rows hidden.</span>
          <span className="lp-sticker"><b>2</b> Rank on the 30-day rate. Spikes show, never sort.</span>
          <span className="lp-sticker"><b>3</b> Vaults re-allocate inside. One move for them, none for you.</span>
        </div>
      </Slide>

      {/* 7 - unit economics */}
      <Slide n={7} kicker="Unit economics">
        <span className="lp-sticker sol">Per $10k, per point of yield</span>
        <h2 className="lp-h2 center"><span className="lp-mark">$10</span> a year, per $10k, per point.</h2>
        <div className="deck-ue">
          <div className="deck-tiers">
            {TIERS.map((t, i) => (
              <div className={'deck-tier ' + t.c} key={t.label} style={css({ '--tilt': `${i % 2 ? 0.6 : -0.6}deg` })}>
                <div className="deck-tier-l"><b>{t.label}</b>{t.sub && <small>{t.sub}</small>}</div>
                <div className="deck-tier-bar"><i style={{ width: `${(t.apr / max) * 100}%` }} /></div>
                <b className="deck-tier-n">{t.apr.toFixed(1)}%</b>
              </div>
            ))}
          </div>
          <table className="deck-tbl">
            <thead>
              <tr><th>$10k user · 15 % of yield</th><th>Curated vaults</th><th>Vaults + loops</th></tr>
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
        <p className="deck-foot">Gross APR of USD rows, risk ≤ 3, TVL-weighted, 2026-10-10. Loop: sUSDe/USDT at 3× on Aave, upper quartile of liquid pairs. Revenue at 15 % of gross yield plus 10 bps in and out.</p>
      </Slide>

      {/* 8 - business model */}
      <Slide n={8} kicker="Business model" className="deck-fix">
        <Rings />
        <span className="lp-sticker sol">How it pays</span>
        <h2 className="lp-h2 center">Paid for <span className="lp-mark">performance,</span> not promotion.</h2>
        <div className="lp-stickers deck-stickers">
          <div className="lp-card c-cyan in" style={css({ '--tilt': '-1.5deg' })}>
            <div className="lp-mock"><span className="lp-mock-who"><b>Yield routed</b><small>sUSDe loop, 17.4 %</small></span><span className="lp-mock-cut"><b>15 %</b><small>of the yield</small></span><span className="lp-mock-copy">$261 / yr</span></div>
            <b>A share of the yield we route.</b>
            <span>Zero when we add nothing. Paid only while it performs.</span>
          </div>
          <div className="lp-card c-plum in" style={css({ '--tilt': '1.5deg' })}>
            <div className="lp-mock"><Character addr="kol" spec={CAST.kol} size={28} title="" /><span className="lp-mock-who"><b>Fox</b><small>1,200 followers</small></span><span className="deck-mock-arrow" aria-hidden="true">→</span><span className="lp-mock-cut"><b>30 %</b><small>of their margin</small></span></div>
            <b>KOLs with skin in the game.</b>
            <span>Bring followers, earn a cut of what they hold.</span>
          </div>
          <div className="lp-card c-gold in" style={css({ '--tilt': '-1deg' })}>
            <div className="lp-mock"><span className="lp-poster deck-poster"><s>sponsored</s></span><span className="lp-mock-who"><b>Aggregators and KOL media</b><small>sell listings</small></span></div>
            <b>Incumbents can't follow.</b>
            <span>Ranking by proof would torch their own revenue.</span>
          </div>
        </div>
      </Slide>

      {/* 9 - ask / roadmap */}
      <Slide n={9} kicker="The ask" className="deck-end">
        <div className="land-glow" aria-hidden="true" />
        <span className="lp-sticker sol">Where this goes</span>
        <h2 className="lp-h2 center">Raising <span className="lp-mark">$250–500k.</span></h2>
        <div className="deck-road">
          <div className="lp-card c-cyan in" style={css({ '--tilt': '-1.5deg' })}><i>Now</i><b>Social yield board live</b><span>Leaderboard, feed, copy-tickets. Solana + EVM.</span></div>
          <div className="lp-card c-gold in" style={css({ '--tilt': '1deg' })}><i>Next</i><b>Creator economy</b><span>Margin-sharing for KOLs. Follows, alerts, auto-copy.</span></div>
          <div className="lp-card c-moss in" style={css({ '--tilt': '-0.8deg' })}><i>Then</i><b>The default yield front-end</b><span>Every idle stablecoin one push from proven carry.</span></div>
        </div>
        <div className="deck-uses">
          <span className="lp-sticker">Marketing</span>
          <span className="lp-sticker">KOL onboarding</span>
          <span className="lp-sticker">Chains &amp; protocols</span>
          <span className="lp-sticker">Mobile app</span>
          <small>plus a token sale via MetaDAO for user and KOL incentives</small>
        </div>
        <a className="join-cta deck-cta" href={APP_URL}>Open the app</a>
        <Crowd />
      </Slide>
    </div>
  )
}
