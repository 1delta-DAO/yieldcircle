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
 * from positions.1delta.io/health the same day.
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
/** Hackathon first prizes, newest first; the count is the point, the names are the footnote. */
const WINS = ['StableHacks 2026 (Tenity · Solana)', 'Unite DeFi 2025 (ETHGlobal · 1inch)', 'Superteam Earn (Jito)', 'ETHGlobal Lisbon (Aave)']
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

/** Gross APR tiers for a USD depositor (economics/detail.md). */
const TIERS = [
  { label: 'Lending pool', sub: 'Aave · Morpho', apr: 3.8, c: 'c-ink', take: '5 %' },
  { label: 'Curated vault', sub: 'median of the menu', apr: 4.8, c: 'c-cyan', take: '10 %' },
  { label: 'Top-quartile vault', sub: 'p75 of the menu', apr: 7.9, c: 'c-moss', take: '10 %' },
  { label: 'Stable loop, 3×', sub: 'sUSDe / USDT', apr: 17.4, c: 'c-gold', take: '15 %' },
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
    // The slides are drawn for 1280×720 (the PDF page); a bigger window scales them up to fill it
    // instead of leaving a small slide in a sea of black. Never below 1: phones keep their own layouts.
    const fit = () => el.style.setProperty('--deck-zoom', String(Math.max(1, Math.min(innerWidth / 1280, innerHeight / 720))))
    fit()
    addEventListener('keydown', onKey)
    addEventListener('resize', fit)
    return () => {
      removeEventListener('keydown', onKey)
      removeEventListener('resize', fit)
    }
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
              <div className="c-cyan"><b>Board, feed, threads</b><span>Wallets ranked by proven net carry; illiquid or capped yield does not rank. Every move copyable.</span></div>
              <div className="c-gold"><b>Full execution</b><span>Deposit, withdraw, loop, close, swap, bridge. 15 chains and Solana, one engine.</span></div>
              <div className="c-moss"><b>Realized PnL</b><span>Value, money in and PnL since open, per position and per wallet.</span></div>
              <div className="c-plum"><b>Every market, auto-indexed</b><span>A new Morpho or Euler market is picked up at creation, no listing. 33k markets, 16 chains.</span></div>
            </div>
          </div>
          <div className="deck-phone" style={css({ '--tilt': '2deg' })}>
            <img src="/deck/board.png" alt="The Board: wallets ranked by proven net APR, with $/day earnings" width={381} height={839} />
          </div>
        </div>
      </Slide>

      {/* 5 - why people will use this: three facts, the cast telling them */}
      <Slide n={5} kicker="Why people will use this">
        <span className="lp-sticker sol">The case</span>
        <h2 className="lp-h2 center">Most money sits idle. <span className="lp-mark">Proof</span> moves it.</h2>
        <div className="lp-comic deck-comic deck-why">
          <div className="lp-panel in" style={css({ '--tilt': '-1.2deg' })}>
            <div className="deck-big c-ink">14 %</div>
            <Character addr="sold" spec={CAST.sold} size={88} title="" />
            <b>Most money earns nothing.</b>
            <span>Of $73b USDC, $10b earns in a lending market or vault. USDT: 2.6 % of $184b. ETH: 3.3 % of $306b.</span>
          </div>
          <div className="lp-panel in" style={css({ '--tilt': '1deg' })}>
            <div className="deck-big c-gold">1 in 2</div>
            <Character addr="lost" spec={CAST.lost} size={88} title="" />
            <b>Yield feels too risky to touch.</b>
            <span>Nearly half of US retail holders have never earned yield; 20m do on exchanges, 0.5m in DeFi. Liquidity and security stop them; an easy exit beats a higher APY.</span>
          </div>
          <div className="lp-panel in" style={css({ '--tilt': '-0.8deg' })}>
            <div className="deck-big c-moss">28.7 %</div>
            <Character addr="0x4a7c1e2f9b0d6c3a8e5f7b2d1c9a4e6f8b3d5a7c" size={88} title="" />
            <b>Seeing who farms changes minds.</b>
            <span>A real wallet: $270k at 4× on Kamino, exact to the chain. Seeing a peer hold an asset raises take-up most when the peer is the expert; 40 % of eToro’s users copy.</span>
          </div>
        </div>
        <p className="deck-foot">Index, 2026-10-10: market cap vs lending deposits + vault TVL; Solana position board. MoreMarkets Crypto Yield Retail Report 2025 (liquidity 68 %, security 45 %, no lock-up 47 % vs higher APY 34 %). Bursztyn, Ederer, Ferman, Yuchtman, Econometrica 2014. eToro copy usage.</p>
      </Slide>

      {/* 6 - unit economics, the three numbers */}
      <Slide n={6} kicker="Unit economics">
        <span className="lp-sticker sol">Unit economics</span>
        <h2 className="lp-h2 center">We keep <span className="lp-mark">5 to 15 ¢</span> of every yield dollar.</h2>
        <p className="lp-lead center deck-sub">5 ¢ on a pool, 10 ¢ on a vault, 15 ¢ on a loop. A $10k vault at 7 % earns $700 a year; $70 is ours.</p>
        <div className="deck-ue deck-ue-simple">
          <div className="deck-tiers">
            {TIERS.map((t, i) => (
              <div className={'deck-tier ' + t.c} key={t.label} style={css({ '--tilt': `${i % 2 ? 0.6 : -0.6}deg` })}>
                <div className="deck-tier-l"><b>{t.label}</b>{t.sub && <small>{t.sub}</small>}</div>
                <div className="deck-tier-bar"><i style={{ width: `${(t.apr / max) * 100}%` }} /></div>
                <b className="deck-tier-n">{t.apr.toFixed(1)}%</b>
                <small className="deck-tier-take">{t.take} ours</small>
              </div>
            ))}
          </div>
          <div className="deck-nums">
            <div className="lp-card c-cyan in" style={css({ '--tilt': '-1.5deg' })}><b>$87</b><span>a year from a $10k vault user</span></div>
            <div className="lp-card c-moss in" style={css({ '--tilt': '1deg' })}><b>$152</b><span>vaults plus a light loop</span></div>
            <div className="lp-card c-gold in" style={css({ '--tilt': '-0.8deg' })}><b>$361</b><span>a protected 3× loop</span></div>
            <small>10,000 such users are $0.9m to $3.6m a year. Protection is a premium on debt, 0.5 % on correlated pairs to 2 % on volatile ones; auto-roll, auto-compound and re-lever bill 5–15 bps per trigger.</small>
          </div>
        </div>
      </Slide>

      {/* 7 - founder */}
      <Slide n={7} kicker="Founder">
        <div className="deck-founder">
          <div className="deck-founder-photo" style={css({ '--tilt': '-2deg' })}>
            <img src="/founder/achim-bw.png" alt="Achim Huebl" width={512} height={476} />
          </div>
          <div className="deck-founder-copy">
            <span className="lp-sticker sol">Who</span>
            <h2 className="lp-h2">Achim <span className="lp-mark">Huebl.</span></h2>
            <i className="deck-founder-role">Founder · Co-founder &amp; CTO of 1delta · M.Sc. Mathematics &amp; Finance</i>
            <div className="deck-founder-pts">
              <div className="c-cyan"><b>Three years of 1delta.</b><span>Lending aggregation and position data across 16 chains and 68 protocols: the API that routes every trade here and the index that proves every number.</span></div>
              <div className="c-gold"><b>Author and inventor of the protocol.</b><span>Wrote the 1delta white paper and designed the protocol.</span></div>
              <div className="c-moss"><b>Trader first, then builder.</b><span>Years of DeFi trading on the protocols underneath; before that quantitative trading, risk management, consulting and investment banking.</span></div>
            </div>
          </div>
        </div>
        <div className="deck-wins">
          <div className="lp-card c-gold in deck-wincount" style={css({ '--tilt': '-1.5deg' })}>
            <b>8 × 🥇</b>
            <span>first prize at the last eight hackathons</span>
          </div>
          <small>{WINS.join(' · ')} · and four more</small>
        </div>
      </Slide>

      {/* 8 - ask / roadmap */}
      <Slide n={8} kicker="The ask" className="deck-end">
        <div className="land-glow" aria-hidden="true" />
        <span className="lp-sticker sol">Where this goes</span>
        <h2 className="lp-h2 center">Raising <span className="lp-mark">$250–500k.</span></h2>
        <div className="deck-road">
          <div className="lp-card c-cyan in" style={css({ '--tilt': '-1.5deg' })}><i>Built</i><b>The whole stack, in beta</b><span>Board, feed, threads, PnL. Execution for every op incl. swaps and bridging, 15 chains + Solana.</span></div>
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
