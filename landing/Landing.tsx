/**
 * The public landing page — its own deployment (`landing/`), on its own
 * origin. The hero is the join page's field of real farmers (`Showcase.tsx`,
 * hover one and its PnL plays), then what the index sees right now (the top
 * wallets, live), what is broken about yield discovery and how the app fixes
 * it, the three steps, the protocols the proof is read from, and the waitlist
 * again at the end. Every "Join the waitlist" opens the gate's own card
 * (`openGate`, built into `index.html` by `vite.config.ts`), which puts a
 * wallet in line through this deployment's Worker; "Sign in" and every link
 * into the product go to the app (`APP_URL`), where the beta cookie lives.
 */
import React from 'react'
import { Logo, Mark, Socials, TELEGRAM_BLUE, TELEGRAM_D, TELEGRAM_URL } from '@yieldcircle/design'
import { Showcase, SHOWCASE_AT, SHOWCASE_N, SHOWCASE_PNL } from '../src/ui/Showcase'
import { Character } from '../src/identity/character'
import { displayFor } from '../src/identity/name'
import { useEarners, useProtocols } from '../src/index/queries'
import { protocolName } from '../src/ui/ProtocolFilter'
import { ProtocolLogo, pct, protocolIconUrls, usdShort } from '../src/ui/bits'
import { chainLabel } from '../src/sdk/queries'
import { openGate } from '../src/wallet/gate'
import { APP_URL } from './config'

const hic = { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

const BOARD_ROWS = 6

export function Landing() {
  // the field of farmers stays put behind the page (fixed, design/marketing.css); past the hero it dims to a backdrop
  const [deep, setDeep] = React.useState(false)
  React.useEffect(() => {
    const f = () => setDeep(window.scrollY > window.innerHeight * 0.45)
    f()
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [])
  // the gate's card is the modal; should it be missing, the link goes through to the app, which has its own
  const join = (e: React.MouseEvent) => { if (openGate()) e.preventDefault() }
  /** the top-right button and every CTA on the page */
  const cta = (label = 'Join the waitlist', className = 'join-cta') => <a className={className} href={APP_URL} onClick={join}>{label}</a>

  return (
    <div className={deep ? 'lp lp-deep' : 'lp'}>
      <header className="lp-top">
        <Logo height={28} href="/" />
        <nav className="lp-nav" aria-label="Sections">
          <a href="#broken">What's broken</a>
          <a href="#fix">How we fix it</a>
          <a href="#live">Live</a>
        </nav>
        <span className="sp" />
        <Socials className="lp-social" label="Telegram" />
        {cta('Join the waitlist', 'join-cta lp-btn')}
      </header>

      <Showcase className="lp-hero" quiet={deep}>
        <main className="join-hero">
          <h1>Everything you hold, <span className="land-grad">earning.</span></h1>
          <p>See what real yield farmers actually make — the PnL the chain can prove, not the APR on the poster — and copy them in one tap.</p>
          {cta()}
          <a className="join-in" href={APP_URL}>Already on the list? Sign in</a>
        </main>
        <a className="land-hint lp-hint" href="#live" aria-label="Scroll down">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8l6 6 6-6" /></svg>
        </a>
      </Showcase>

      <Live join={join} />

      <section className="lp-sec lp-why" id="broken">
        <div className="land-h prob lp-kick">
          <span className="land-h-ic"><svg {...hic}><path d="M10 3.2 17.4 16H2.6zM10 8.4v3.4M10 14.3h.01" /></svg></span>
          <b>What's broken</b>
        </div>
        <h2 className="lp-h2">Yield is noisy. <span className="land-grad">Nobody shows you the proof.</span></h2>
        <p className="lp-lead">Finding yield in DeFi means reading posters: a listing's APR, a thread's promise, a sponsor's number. None of it says who is in the position, for how long, or what they walked away with.</p>
        <div className="lp-grid">
          <div className="land-pt">
            <span className="land-pt-ic prob"><svg {...hic}><path d="M10 3 3 6.5l7 3.5 7-3.5zM3 10l7 3.5 7-3.5M3 13.5 10 17l7-3.5" /></svg></span>
            <div>
              <b>Too many pools, no signal.</b>
              <span>Thousands of pools, vaults and loops across a dozen chains. Every one of them quotes a rate, and nothing tells safe apart from what merely looks it.</span>
            </div>
          </div>
          <div className="land-pt">
            <span className="land-pt-ic prob"><svg {...hic}><path d="M3.5 8.5v3l2.5.5 1 4.5h2l-.8-4.2 8.3 2.7V5.5L6 8zM13 7.2a2.6 2.6 0 0 1 0 5.6" /></svg></span>
            <div>
              <b>The loudest voices are paid.</b>
              <span>KOLs are paid by the issuers and lenders they promote — marketing biased by construction. You hear what was sponsored, not what works.</span>
            </div>
          </div>
          <div className="land-pt">
            <span className="land-pt-ic prob"><svg {...hic}><path d="M3 15.5 8 10l3 3 6-6.5M13 6.5h4v4" /><path d="M3 4v13h14" strokeOpacity=".4" /></svg></span>
            <div>
              <b>The poster APR is not what you earn.</b>
              <span>Rates move, incentives end, a loop's spread changes with every rate update. A projected number says nothing about a realized one — and realized is the only one you keep.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec lp-fix" id="fix">
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
        <div className="land-h sol lp-kick">
          <span className="land-h-ic"><Mark size={20} mono /></span>
          <b>How we fix it</b>
        </div>
        <h2 className="lp-h2">Follow the proof, <span className="land-grad">not the promotion.</span></h2>
        <p className="lp-lead">YieldCircle reads positions straight off the chain. The feed, the leaderboard and every number on this page come from wallets that hold the position — nothing is written by hand, and nothing is sponsored.</p>
        <div className="lp-grid four">
          <div className="land-pt sol">
            <span className="land-pt-ic sol"><svg {...hic}><path d="M11 2.5 4 11h5l-1 6.5L15 9h-5z" /></svg></span>
            <div>
              <b>A feed of real wallets.</b>
              <span>Every post is an on-chain position: who holds what, since when, and what it has made so far. The FOMO is real because the numbers are.</span>
            </div>
          </div>
          <div className="land-pt sol">
            <span className="land-pt-ic sol"><svg {...hic}><path d="M4 16h12M6 16V9M10 16V4M14 16v-6" /></svg></span>
            <div>
              <b>A leaderboard ranked on proof.</b>
              <span>Wallets ranked on the yield the chain can verify: the carry their positions actually pay, net of debt, as a 24-hour mean — not a quote, and not who paid.</span>
            </div>
          </div>
          <div className="land-pt sol">
            <span className="land-pt-ic sol"><svg {...hic}><rect x="7.5" y="7.5" width="9" height="9" rx="2" /><path d="M12.5 4.5v-1a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1" /></svg></span>
            <div>
              <b>Copy any position in one tap.</b>
              <span>A position in the feed opens as a ready-made ticket: deposits and loops on Kamino, Morpho, Euler, Pendle, Jupiter Lend and more, EVM and Solana, in one flow.</span>
            </div>
          </div>
          <div className="land-pt sol">
            <span className="land-pt-ic sol"><svg {...hic}><path d="M15.5 4.5l-11 11" /><circle cx="6" cy="6" r="2.1" /><circle cx="14" cy="14" r="2.1" /></svg></span>
            <div>
              <b>Aligned incentives for KOLs. <i className="land-tag">building</i></b>
              <span>Interest-margin sharing: a KOL who refers users earns a cut of the margin on the positions they build — paid for performance, not for promotion.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-sec lp-how">
        <h2 className="lp-h2 center">Three steps. <span className="land-grad">No transaction to start.</span></h2>
        <ol className="lp-steps">
          <li>
            <i>01</i>
            <b>Connect a wallet</b>
            <span>EVM or Solana, any wallet, a signature and nothing else. Joining the waitlist is free and never a transaction.</span>
          </li>
          <li>
            <i>02</i>
            <b>Follow the proof</b>
            <span>Browse the feed and the board. Hover a farmer and watch their PnL count up from the day they opened the position.</span>
          </li>
          <li>
            <i>03</i>
            <b>Copy it, hold it, climb</b>
            <span>Open any position as a ticket and hold it in a tap. From then on your own carry is on the board, proven the same way.</span>
          </li>
        </ol>
      </section>

      <Protocols />

      <section className="lp-sec lp-end">
        <div className="land-glow" aria-hidden="true" />
        <span className="lp-tag">Closed beta</span>
        <h2 className="lp-h2 center">Early members <span className="land-grad">earn rewards.</span></h2>
        <p className="lp-lead center">Access opens in waves down the waitlist. What counts for early rewards is what you actually do on YieldCircle — positions held, days held, who you follow — not how many wallets you sign up.</p>
        <div className="lp-end-row">
          {cta()}
          <a className="tg-link lp-tg" href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path d={TELEGRAM_D} fill={TELEGRAM_BLUE} /></svg><span>Join us on Telegram</span>
          </a>
        </div>
        <small className="lp-fine">Free to join · never a transaction</small>
      </section>

      <footer className="lp-foot">
        <Logo height={22} href="/" />
        <span>Realized PnL from on-chain records as of {SHOWCASE_AT}. Board figures are live from the position index.</span>
        <Socials label="Telegram" />
      </footer>
    </div>
  )
}

/** What the index sees now: the showcase's realized total, the protocols the proof is read from, and the top wallets by carry. */
function Live({ join }: { join: (e: React.MouseEvent) => void }) {
  // the Board's own default key, so this hits the index's pre-warmed answer rather than a cold query
  const board = useEarners({ by: 'wallet', sort: 'perDay', people: true })
  const protos = useProtocols('7d')
  const rows = React.useMemo(() => (board.data?.by === 'wallet' ? board.data.rows.filter((r) => r.perDayUsd != null && r.perDayUsd > 0).slice(0, BOARD_ROWS) : []), [board.data])
  const facets = protos.data?.protocols ?? []
  const chains = new Set(facets.flatMap((p) => p.chains)).size
  const markets = facets.reduce((s, p) => s + p.markets, 0)
  return (
    <section className="lp-sec lp-live" id="live">
      <div className="lp-live-h">
        <span className="dot" /><span className="lbl">Live from the index</span>
      </div>
      <div className="lp-tiles">
        <div className="lp-tile">
          <b className="ok">+{usdShort(SHOWCASE_PNL)}</b>
          <span>realized by the {SHOWCASE_N} farmers on the field above, from on-chain records</span>
        </div>
        <div className="lp-tile">
          <b>{facets.length || '—'}</b>
          <span>protocols read on-chain, across {chains || '—'} chains, EVM and Solana</span>
        </div>
        <div className="lp-tile">
          <b>{markets ? markets.toLocaleString('en-US') : '—'}</b>
          <span>markets with moves this week — each one a page, a tape and its holders</span>
        </div>
        <div className="lp-tile">
          <b>{rows[0] ? `${usdShort(rows[0].perDayUsd)}/day` : '—'}</b>
          <span>the best wallet on the board is making right now, net of its debt</span>
        </div>
      </div>
      <div className="lp-board">
        <div className="lp-board-h">
          <b>The board</b>
          <span>people only · ranked on $/day · the 24 h mean APR, net of debt</span>
        </div>
        {board.isError && <div className="lp-board-empty">The board is catching its breath — the live figures are back in a moment.</div>}
        {!board.isError && rows.length === 0 && <div className="lp-board-empty">Reading the ledger…</div>}
        {rows.map((r, i) => {
          const name = r.accountLabel ?? displayFor(r.account).label
          const apr = r.apr24hPct ?? r.netAprPct
          return (
            <div className="lp-row" key={r.account}>
              <i className="lp-rank">{i + 1}</i>
              <Character addr={r.account} size={34} title="" />
              <div className="lp-who">
                <b>{name}</b>
                <small>{r.best?.marketName ?? `${r.nPositions} position${r.nPositions === 1 ? '' : 's'}`}{r.chains[0] ? ` · ${r.chains.map(chainLabel).slice(0, 2).join(', ')}` : ''}</small>
              </div>
              <span className="lp-v ok">{r.exact ? '' : '≈ '}{pct(apr, 1)}<small>APR</small></span>
              <span className="lp-v">{usdShort(r.perDayUsd)}<small>per day</small></span>
              <span className="lp-v dim">{usdShort(r.navUsd)}<small>NAV</small></span>
            </div>
          )
        })}
        <div className="lp-board-f">
          <a className="btn" href={`${APP_URL}/#/board`} onClick={join}>See the full board — join the waitlist</a>
        </div>
      </div>
    </section>
  )
}

/** The protocols the proof is read from, live: the ones with moves this week, by activity. */
function Protocols() {
  const protos = useProtocols('7d')
  const list = React.useMemo(() => {
    const by = new Map<string, { key: string; name: string; logo: string | null; markets: number }>()
    for (const p of protos.data?.protocols ?? []) {
      const name = protocolName(p)
      const cur = by.get(name)
      if (cur) cur.markets += p.markets
      else by.set(name, { key: p.protocol, name, logo: p.logoUri, markets: p.markets })
    }
    return [...by.values()].sort((a, b) => b.markets - a.markets).slice(0, 24)
  }, [protos.data])
  if (list.length === 0) return null
  return (
    <section className="lp-sec lp-protos">
      <span className="lbl">Where the proof is read from</span>
      <div className="lp-proto-row">
        {list.map((p) => (
          <span className="lp-proto" key={p.key} title={`${p.markets} market${p.markets === 1 ? '' : 's'} with moves this week`}>
            <ProtocolLogo urls={protocolIconUrls(p.key, p.logo)} name={p.name} />
            <b>{p.name}</b>
            <small>{p.markets}</small>
          </span>
        ))}
      </div>
    </section>
  )
}
