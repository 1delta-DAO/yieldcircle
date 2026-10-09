/**
 * The public landing page — its own deployment (`landing/`), on its own
 * origin. The field of real farmers (`Showcase.tsx`) is the page's backdrop:
 * fixed to the viewport, the hero in the middle of it, and once the visitor
 * scrolls past it dims to a backdrop the rest of the page scrolls over.
 *
 * The page is PLAYFUL on purpose: the creatures every wallet wears in the app
 * are the cast here — they shout the poster APRs, stand on the podium, peek
 * from the stat stickers and crowd the finish line. Stickers tilt, numbers
 * count up when they come into view, the tape of real moves runs under the
 * hero, the protocols run as a marquee. Everything that moves holds still
 * under `prefers-reduced-motion`.
 *
 * Every "Join the waitlist" opens the gate's own card (`openGate`, built into
 * `index.html` by `vite.config.ts`), which puts a wallet in line through this
 * deployment's Worker; "Sign in" and every link into the product go to the
 * app (`APP_URL`), where the beta cookie lives.
 */
import React from 'react'
import { Logo, Mark, Socials, TELEGRAM_BLUE, TELEGRAM_D, TELEGRAM_URL } from '@yieldcircle/design'
import { Showcase, SHOWCASE_AT, SHOWCASE_N, SHOWCASE_PNL } from '../src/ui/Showcase'
import { Character, type Spec } from '../src/identity/character'
import { displayFor } from '../src/identity/name'
import { useQueries } from '@tanstack/react-query'
import { useEarners, useFeedPage, useProtocols } from '../src/index/queries'
import { find, type EarnerRow, type FindHit, type ProtocolFacet } from '../src/index/api'
import { protocolKeyOf } from '../src/model/uid'
import { marketHref } from '../src/state/AppState'
import { subjectOf, type TxBundle } from '../src/index/types'
import { protocolName } from '../src/ui/ProtocolFilter'
import { ProtocolLogo, pct, protocolIconUrls, usdShort } from '../src/ui/bits'
import { describeBundle } from '../src/ui/social-bits'
import { isDust, primaryLeg } from '../src/ui/Feed'
import { chainLabel } from '../src/sdk/queries'
import { ChainMark } from '../src/ui/ChainMark'
import { openGate } from '../src/wallet/gate'
import { APP_URL } from './config'

/**
 * The board, one column per chain, read from the POSITION board: each row is
 * one position on its own chain, so the instrument shown is the one earning the
 * APR beside it (the wallet board blends a wallet's book across chains and names
 * its best market, which can sit on another chain at another rate). The top
 * farmers on one chain tend to run the same trade, so under each champion come
 * the next ones with a different trade first — one row per wallet.
 */
const BOARD_CHAINS = ['1', 'solana', '56']
const BOARD_UNDER = 3
const BOARD_DEPTH = 60

/** What a position holds and what it owes, by symbol. */
function legsOf(r: EarnerRow) {
  const hold = r.legs.filter((l) => l.side === 'supply' || l.side === 'collateral').sort((a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0))
  const owe = r.legs.filter((l) => l.side === 'borrow').sort((a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0))
  return { hold, owe }
}
/** A token's family: a PT's underlying without its maturity, case folded — PT-apyUSD-5NOV2026 and apyUSD are one trade. */
const family = (sym: string | null | undefined) => (sym ?? '?').replace(/^PT-/i, '').replace(/-\d{1,2}[A-Z]{3}\d{4}.*$/i, '').replace(/-\(.*\)$/, '').toLowerCase()
/** The trade a position runs: what it holds (by family) against what it owes. */
const tradeOf = (r: EarnerRow) => { const { hold, owe } = legsOf(r); return { hold: family(hold[0]?.symbol), owe: (owe[0]?.symbol ?? '').toLowerCase() } }
const venue = (r: EarnerRow) => protocolName({ protocol: protocolKeyOf(r.lenderKey), name: null } as ProtocolFacet)

/** The champion and the next ones: one per wallet; first a new holding AND a new debt, then a new holding, then anything. */
function pickBoard(rows: EarnerRow[]): { top: EarnerRow | undefined; under: EarnerRow[] } {
  const ok = rows.filter((r) => (r.apr24hPct ?? r.netAprPct) != null && (r.perDayUsd ?? 0) > 0)
  const [top, ...rest] = ok
  if (!top) return { top, under: [] }
  const wallets = new Set([top.account.toLowerCase()])
  const holds = new Set([tradeOf(top).hold]), owes = new Set([tradeOf(top).owe])
  const under: EarnerRow[] = []
  const pass = (fits: (t: { hold: string; owe: string }) => boolean) => {
    for (const r of rest) {
      if (under.length >= BOARD_UNDER) return
      const t = tradeOf(r)
      if (wallets.has(r.account.toLowerCase()) || !fits(t)) continue
      wallets.add(r.account.toLowerCase()); holds.add(t.hold); owes.add(t.owe); under.push(r)
    }
  }
  pass((t) => !holds.has(t.hold) && (!t.owe || !owes.has(t.owe)))
  pass((t) => !holds.has(t.hold))
  pass(() => true)
  return { top, under: under.sort((a, b) => (b.apr24hPct ?? b.netAprPct ?? 0) - (a.apr24hPct ?? a.netAprPct ?? 0)) }
}

/** The instrument, spelled out: what it holds, what it owes, where, and how levered. */
function Instrument({ r, big }: { r: EarnerRow; big?: boolean }) {
  const { hold, owe } = legsOf(r)
  const lev = r.leverage != null && r.leverage > 1.05 ? `${r.leverage.toFixed(1)}×` : null
  return (
    <span className={big ? 'lp-inst big' : 'lp-inst'}>
      <span className="lp-inst-legs">
        <b className="hold">{hold.map((l) => l.symbol ?? '?').join(' + ') || '—'}</b>
        {owe.length > 0 && <><i>against</i><b className="owe">{owe.map((l) => l.symbol ?? '?').join(' + ')}</b></>}
      </span>
      <small>{venue(r)}{lev ? ` · ${lev} loop` : owe.length ? '' : ' · deposit'}</small>
    </span>
  )
}

/**
 * The cast: faces built from the character's own layers (`identity/character.tsx`),
 * so a shouting fox here is the same creature that is a wallet's face in the app.
 * b backdrop · c creature · e eyes · m mouth · a accessory · p palette
 */
const CAST = {
  kol: { b: 4, c: 1, e: 3, m: 3, a: 7, p: 2 } as Spec, // a fox with rays and a bolt, grinning: the paid voice
  lost: { b: 8, c: 4, e: 7, m: 2, a: 3, p: 4 } as Spec, // an owl in specs, eyes spinning: too many pools
  sold: { b: 0, c: 3, e: 2, m: 1, a: 2, p: 9 } as Spec, // a bear in a beanie, flat: bought the poster
  reader: { b: 1, c: 2, e: 1, m: 0, a: 3, p: 0 } as Spec, // a cat in specs: reads the chain
  climber: { b: 4, c: 0, e: 4, m: 3, a: 8, p: 6 } as Spec, // an otter with a crown: made the board
  wallet: { b: 2, c: 10, e: 5, m: 0, a: 0, p: 7 } as Spec, // a robot: connects
}

export function Landing() {
  // the field of farmers stays put behind the page (fixed, design/marketing.css); past the hero it dims to a backdrop
  const [deep, setDeep] = React.useState(false)
  React.useEffect(() => {
    const f = () => setDeep(window.scrollY > window.innerHeight * 0.45)
    f()
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [])
  useReveal()
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
        <main className="join-hero lp-hero-copy">
          <span className="lp-sticker lp-sticker-hero">Closed beta · free to join</span>
          <h1>Everything you hold, <span className="lp-mark">earning.</span></h1>
          <p>See what real yield farmers <b>actually</b> make — the PnL the chain can prove, not the APR on the poster — and copy them in one tap.</p>
          {cta()}
          <a className="join-in" href={APP_URL}>Already on the list? Sign in</a>
        </main>
        <a className="land-hint lp-hint" href="#live" aria-label="Scroll down">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8l6 6 6-6" /></svg>
        </a>
      </Showcase>

      <Tape />

      <Live join={join} />

      <Finder />

      <section className="lp-sec lp-why" id="broken">
        <div className="lp-head rv">
          <span className="lp-sticker prob">What's broken</span>
          <h2 className="lp-h2">Yield is <span className="lp-wob">noisy.</span> Nobody shows you the proof.</h2>
          <p className="lp-lead">Finding yield in DeFi means reading posters: a listing's APR, a thread's promise, a sponsor's number. None of it says who is in the position, for how long, or what they walked away with.</p>
        </div>
        <div className="lp-comic">
          <div className="lp-panel rv" style={{ '--tilt': '-1.5deg' } as React.CSSProperties}>
            <div className="lp-bubble shout"><b>500% APR!!</b> trust me bro <i className="lp-tag-s">sponsored</i></div>
            <Character addr="kol" spec={CAST.kol} size={96} title="" />
            <b>The loudest voices are paid.</b>
            <span>KOLs are paid by the issuers and lenders they promote — marketing biased by construction. You hear what was sponsored, not what works.</span>
          </div>
          <div className="lp-panel rv" style={{ '--tilt': '1deg' } as React.CSSProperties}>
            <div className="lp-swarm" aria-hidden="true">
              {['pool #4,912', 'vault', 'loop 6×', 'PT-sUSDe', '"safe"', 'new chain', 'points', '12.4%', 'vault', 'pool #4,913'].map((t, i) => <i key={i} style={{ '--i': i } as React.CSSProperties}>{t}</i>)}
            </div>
            <Character addr="lost" spec={CAST.lost} size={96} title="" />
            <b>Too many pools, no signal.</b>
            <span>Thousands of pools, vaults and loops across a dozen chains. Every one of them quotes a rate, and nothing tells safe apart from what merely looks it.</span>
          </div>
          <div className="lp-panel rv" style={{ '--tilt': '-0.8deg' } as React.CSSProperties}>
            <div className="lp-poster"><s>APR 18.0%</s><em>realized <b>3.1%</b></em></div>
            <Character addr="sold" spec={CAST.sold} size={96} title="" />
            <b>The poster APR is not what you earn.</b>
            <span>Rates move, incentives end, a loop's spread changes with every rate update. A projected number says nothing about a realized one — and realized is the only one you keep.</span>
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
        <div className="lp-head rv">
          <span className="lp-sticker sol"><Mark size={14} mono /> How we fix it</span>
          <h2 className="lp-h2">Follow the <span className="lp-mark">proof,</span> not the promotion.</h2>
          <p className="lp-lead">YieldCircle reads positions straight off the chain. The feed, the leaderboard and every number on this page come from wallets that hold the position — nothing is written by hand, and nothing is sponsored.</p>
        </div>
        <div className="lp-stickers">
          <div className="lp-card c-cyan rv" style={{ '--tilt': '-2deg' } as React.CSSProperties}>
            <div className="lp-mock lp-mock-feed">
              <Character addr="0x7a3f9c2e" size={28} title="" />
              <span className="lp-mock-who"><b>Copper Kelp</b><small>2m ago</small></span>
              <span className="verb k-in">deposited</span>
              <span className="lp-mock-amt">$10,000</span>
              <span className="lp-mock-copy">Copy this ›</span>
            </div>
            <b>A feed of real wallets.</b>
            <span>Every post is an on-chain position: who holds what, since when, and what it has made so far. The FOMO is real because the numbers are.</span>
          </div>
          <div className="lp-card c-gold rv" style={{ '--tilt': '1.5deg' } as React.CSSProperties}>
            <div className="lp-mock lp-mock-board">
              {[['Zesty Walrus', '100.4%', 0], ['Fearless Urchin', '85.0%', 1], ['Calm Viper', '60.6%', 2]].map(([n, a, i]) => (
                <div key={n} className="lp-mock-row"><i>{(i as number) + 1}</i><Character addr={`0xb${i}ard${n}`} size={22} title="" /><b>{n}</b><em>{a}</em></div>
              ))}
            </div>
            <b>A leaderboard ranked on proof.</b>
            <span>Wallets ranked on the yield the chain can verify: the carry their positions actually pay, net of debt — not a quote, and not who paid.</span>
          </div>
          <div className="lp-card c-moss rv" style={{ '--tilt': '1deg' } as React.CSSProperties}>
            <div className="lp-mock lp-mock-ticket">
              <span className="lp-mock-pair"><b>PST / PYUSD</b><small>Morpho · Ethereum</small></span>
              <span className="lp-mock-lev">4.2×</span>
              <span className="lp-mock-btn">Hold it</span>
            </div>
            <b>Copy any position in one tap.</b>
            <span>A position in the feed opens as a ready-made ticket: deposits and loops on Kamino, Morpho, Euler, Pendle, Jupiter Lend and more, EVM and Solana, in one flow.</span>
          </div>
          <div className="lp-card c-plum rv" style={{ '--tilt': '-1.2deg' } as React.CSSProperties}>
            <div className="lp-mock lp-mock-share">
              <Character addr="kol2" spec={{ ...CAST.kol, e: 1, p: 3 }} size={40} title="" />
              <span className="lp-mock-arrow">→</span>
              <span className="lp-mock-cut"><b>+0.4%</b><small>of the margin</small></span>
            </div>
            <b>Aligned incentives for KOLs. <i className="land-tag">building</i></b>
            <span>Interest-margin sharing: a KOL who refers users earns a cut of the margin on the positions they build — paid for performance, not for promotion.</span>
          </div>
        </div>
      </section>

      <section className="lp-sec lp-how">
        <h2 className="lp-h2 center rv">Three steps. <span className="lp-mark">No transaction</span> to start.</h2>
        <ol className="lp-path">
          <svg className="lp-path-line" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true"><path d="M60 60 C 250 -20, 350 140, 500 60 S 750 -20, 940 60" /></svg>
          <li className="rv">
            <span className="lp-step"><Character addr="wallet" spec={CAST.wallet} size={64} title="" /><i>01</i></span>
            <b>Connect a wallet</b>
            <span>EVM or Solana, any wallet, a signature and nothing else. Joining the waitlist is free and never a transaction.</span>
          </li>
          <li className="rv">
            <span className="lp-step"><Character addr="reader" spec={CAST.reader} size={64} title="" /><i>02</i></span>
            <b>Follow the proof</b>
            <span>Browse the feed and the board. Hover a farmer and watch their PnL count up from the day they opened the position.</span>
          </li>
          <li className="rv">
            <span className="lp-step"><Character addr="climber" spec={CAST.climber} size={64} title="" /><i>03</i></span>
            <b>Copy it, hold it, climb</b>
            <span>Open any position as a ticket and hold it in a tap. From then on your own carry is on the board, proven the same way.</span>
          </li>
        </ol>
      </section>

      <Protocols />

      <section className="lp-sec lp-end">
        <div className="land-glow" aria-hidden="true" />
        <span className="lp-sticker rv">Closed beta</span>
        <h2 className="lp-h2 center rv">Early members <span className="lp-mark">earn rewards.</span></h2>
        <p className="lp-lead center rv">Access opens in waves down the waitlist. What counts for early rewards is what you actually do on YieldCircle — positions held, days held, who you follow — not how many wallets you sign up.</p>
        <div className="lp-end-row rv">
          {cta()}
          <a className="tg-link lp-tg" href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path d={TELEGRAM_D} fill={TELEGRAM_BLUE} /></svg><span>Join us on Telegram</span>
          </a>
        </div>
        <small className="lp-fine">Free to join · never a transaction</small>
        <Crowd />
      </section>

      <footer className="lp-foot">
        <Logo height={22} href="/" />
        <span>Realized PnL from on-chain records as of {SHOWCASE_AT}. Board figures are live from the position index.</span>
        <Socials label="Telegram" />
      </footer>
    </div>
  )
}

/** The last real moves across every chain, running under the hero: the proof that this is a live place. */
function Tape() {
  const q = useFeedPage({}, 30)
  const moves = React.useMemo(() => (q.data?.txs ?? []).filter((t) => !isDust(t)).slice(0, 14), [q.data])
  if (!moves.length) return null
  const item = (t: TxBundle, copy: number) => {
    const l = primaryLeg(t)
    if (!l) return null
    const d = describeBundle(t)
    const who = subjectOf(t).account || l.account
    const usd = t.volumeUsd ?? l.amountUsd
    return (
      <a className="lp-move" key={`${copy}:${t.chainId}:${t.txHash}`} href={APP_URL} aria-hidden={copy > 0 || undefined} tabIndex={copy > 0 ? -1 : undefined}>
        <Character addr={who} size={22} title="" />
        <b>{subjectOf(t).accountLabel ?? displayFor(who).label}</b>
        <span className={`verb ${d.cls}`}>{d.verb}</span>
        <span className="lp-move-m">{l.marketName ?? l.symbol}</span>
        {usd != null && <em>{usdShort(usd)}</em>}
      </a>
    )
  }
  return (
    <div className="lp-tape" aria-label="Live moves">
      <span className="lp-tape-l"><span className="dot" />live</span>
      <div className="lp-tape-v"><div className="lp-tape-t">{moves.map((t) => item(t, 0))}{moves.map((t) => item(t, 1))}</div></div>
    </div>
  )
}

/** What the index sees now: the numbers as stickers that count up, and the board as a podium. */
function Live({ join }: { join: (e: React.MouseEvent) => void }) {
  // ranked on APR, not $/day: by dollars the board is whoever parked a billion in a 3% market
  const boards = [
    useEarners({ by: 'position', sort: 'apr', people: true, chainIds: BOARD_CHAINS[0], limit: BOARD_DEPTH }),
    useEarners({ by: 'position', sort: 'apr', people: true, chainIds: BOARD_CHAINS[1], limit: BOARD_DEPTH }),
    useEarners({ by: 'position', sort: 'apr', people: true, chainIds: BOARD_CHAINS[2], limit: BOARD_DEPTH }),
  ]
  const protos = useProtocols('7d')
  const columns = React.useMemo(() => BOARD_CHAINS.map((chainId, k) => {
    // the chain asked for, and only it: a position elsewhere has no place in this column
    const rows = (boards[k].data?.by === 'position' ? boards[k].data.rows : []).filter((r) => r.chainId === chainId)
    return { chainId, ...pickBoard(rows), error: boards[k].isError, loading: boards[k].isLoading }
  }), [boards[0].data, boards[1].data, boards[2].data, boards[0].isError, boards[1].isError, boards[2].isError, boards[0].isLoading, boards[1].isLoading, boards[2].isLoading])
  const facets = protos.data?.protocols ?? []
  const chains = new Set(facets.flatMap((p) => p.chains)).size
  const markets = facets.reduce((s, p) => s + p.markets, 0)
  const bestApr = Math.max(0, ...columns.map((c) => c.top?.apr24hPct ?? c.top?.netAprPct ?? 0))
  const href = (r: EarnerRow) => { const { hold } = legsOf(r); return hold[0]?.marketUid ? `${APP_URL}/${marketHref(hold[0].marketUid)}` : APP_URL }
  const apr = (r: { apr24hPct: number | null; netAprPct: number | null; exact: boolean }) => `${r.exact ? '' : '≈ '}${pct(r.apr24hPct ?? r.netAprPct, 1)}`
  return (
    <section className="lp-sec lp-live" id="live">
      <div className="lp-live-h rv"><span className="dot" /><span className="lbl">Live from the index</span></div>
      <div className="lp-tiles">
        <Stat n={SHOWCASE_PNL} fmt={(v) => `+${usdShort(v)}`} cls="ok c-moss" tilt="-1.5deg" face={{ b: 6, c: 7, e: 1, m: 0, a: 0, p: 1 }}>realized by the {SHOWCASE_N} farmers on the field, from on-chain records</Stat>
        <Stat n={facets.length} fmt={(v) => String(Math.round(v))} cls="c-cyan" tilt="1deg" face={{ b: 5, c: 10, e: 5, m: 1, a: 0, p: 0 }}>protocols read on-chain, across {chains || '—'} chains, EVM and Solana</Stat>
        <Stat n={markets} fmt={(v) => Math.round(v).toLocaleString('en-US')} cls="c-plum" tilt="-0.8deg" face={{ b: 8, c: 13, e: 4, m: 2, a: 0, p: 3 }}>markets with moves this week — each one a page, a tape and its holders</Stat>
        <Stat n={bestApr} fmt={(v) => pct(v, 1)} cls="c-gold" tilt="1.4deg" face={{ b: 4, c: 0, e: 4, m: 3, a: 8, p: 6 }}>APR the best position on the board is making right now, net of its debt</Stat>
      </div>
      <div className="lp-board rv">
        <div className="lp-board-h">
          <b>The board</b>
          <span>people only · each position's 24 h mean APR, net of debt · the top of each chain</span>
        </div>
        <div className="lp-cols">
          {columns.map((c) => (
            <div className="lp-col" key={c.chainId}>
              <div className="lp-col-h"><ChainMark chainId={c.chainId} size={18} /><b>{chainLabel(c.chainId)}</b></div>
              {c.error && <div className="lp-board-empty">Catching its breath — back in a moment.</div>}
              {!c.error && !c.top && <div className="lp-board-empty">{c.loading ? 'Reading the ledger…' : 'Nothing earning here right now.'}</div>}
              {c.top && (
                <a className="lp-champ" href={href(c.top)} onClick={join}>
                  <Character addr={c.top.account} size={72} title="" />
                  <b>{c.top.accountLabel ?? displayFor(c.top.account).label}</b>
                  <Instrument r={c.top} big />
                  <span className="lp-champ-apr"><Count n={c.top.apr24hPct ?? c.top.netAprPct ?? 0} fmt={(v) => `${c.top!.exact ? '' : '≈ '}${pct(v, 1)}`} /><small>APR · {usdShort(c.top.perDayUsd)} per day on {usdShort(c.top.equityUsd)}</small></span>
                </a>
              )}
              {c.under.map((r, i) => (
                <a className="lp-under" key={r.key} href={href(r)} onClick={join}>
                  <i>{i + 2}</i>
                  <Character addr={r.account} size={28} title="" />
                  <span className="lp-under-who"><b>{r.accountLabel ?? displayFor(r.account).label}</b><Instrument r={r} /></span>
                  <span className="lp-under-v"><b>{apr(r)}</b><small>{usdShort(r.perDayUsd)}/day</small></span>
                </a>
              ))}
            </div>
          ))}
        </div>
        <div className="lp-board-f">
          <a className="btn" href={`${APP_URL}/#/board`} onClick={join}>See the full board — join the waitlist</a>
        </div>
      </div>
    </section>
  )
}

/** The names the finder types, in turn: known people, ENS and Basenames, `.sol` and `.skr` — every kind of name the index knows. */
const FINDS = ['justin sun', 'stani', 'toly', 'mert', 'ansem', 'degen', 'frank']
const TYPE_MS = 70, ERASE_MS = 28, HOLD_MS = 3200, SETTLE_MS = 450

/** What kind of name answered — the claim behind the hit, in a word. */
function claim(h: FindHit): string {
  if (h.subtitle === 'known' || h.match.source === 'seed') return 'known wallet'
  if (h.match.source === 'kolscan') return 'KOL'
  if (/\.skr$/i.test(h.title)) return 'Seeker .skr'
  if (/\.sol$/i.test(h.title)) return 'SNS .sol'
  if (/\.base\.eth$/i.test(h.title)) return 'Basename'
  if (/\.eth$/i.test(h.title)) return 'ENS'
  return h.subtitle ?? 'wallet'
}

/**
 * The finder: a search box that types one name after another and shows what
 * the index answers — live, from `/find` on both indexes, prefetched so the
 * results land the moment the typing stops. Known people, ENS, Basenames,
 * `.sol` and `.skr`: whoever has a name, the index has the wallet.
 */
function Finder() {
  const answers = useQueries({
    queries: FINDS.map((q) => ({ queryKey: ['lp-find', q], queryFn: ({ signal }: { signal?: AbortSignal }) => find({ q, kinds: 'wallet', per: 4 }, signal), staleTime: 10 * 60_000, retry: false })),
  })
  const [i, setI] = React.useState(0)
  const [typed, setTyped] = React.useState('')
  const [shown, setShown] = React.useState(false)
  const still = React.useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const hover = React.useRef(false)
  // the loop: type, settle, show, hold, erase, next — each step a timeout so a hovered box simply waits
  React.useEffect(() => {
    if (still) { setTyped(FINDS[0]); setShown(true); return }
    let t = 0, alive = true
    const at = (ms: number, f: () => void) => { t = window.setTimeout(() => { if (alive) f() }, ms) }
    const q = FINDS[i]
    const type = (n: number) => { setTyped(q.slice(0, n)); if (n < q.length) at(TYPE_MS + Math.random() * 50, () => type(n + 1)); else at(SETTLE_MS, () => { setShown(true); hold() }) }
    const hold = () => at(HOLD_MS, () => (hover.current ? hold() : erase(q.length)))
    const erase = (n: number) => { if (n === q.length) setShown(false); setTyped(q.slice(0, n)); if (n > 0) at(ERASE_MS, () => erase(n - 1)); else at(300, () => setI((i + 1) % FINDS.length)) }
    at(i === 0 ? 900 : 0, () => type(1))
    return () => { alive = false; clearTimeout(t) }
  }, [i, still])
  const hits = (answers[i].data?.groups.find((g) => g.kind === 'wallet')?.hits ?? []).slice(0, 4)
  const count = answers[i].data?.groups.find((g) => g.kind === 'wallet')?.count ?? 0
  return (
    <section className="lp-sec lp-find" onPointerEnter={() => { hover.current = true }} onPointerLeave={() => { hover.current = false }}>
      <div className="lp-head center rv">
        <span className="lp-sticker">Search anyone</span>
        <h2 className="lp-h2 center">If a wallet has a <span className="lp-mark">name,</span> it's in here.</h2>
        <p className="lp-lead center">Known people, ENS and Basenames, <code>.sol</code> and <code>.skr</code> — the index knows the wallet behind the name, and every position it holds.</p>
      </div>
      <div className="lp-search rv" style={{ '--tilt': '-0.6deg' } as React.CSSProperties}>
        <div className="lp-search-box">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5 17 17" /></svg>
          <span className="lp-search-q">{typed}<i className="lp-caret" /></span>
          {typed && !shown && <span className="lp-search-wait">searching…</span>}
          {shown && count > 0 && <span className="lp-search-n">{count.toLocaleString('en-US')} wallet{count === 1 ? '' : 's'}</span>}
        </div>
        <div className={`lp-search-hits${shown && hits.length ? ' on' : ''}`}>
          {hits.map((h, k) => (
            <a className="lp-hit" key={h.docId} href={`${APP_URL}/#/w/${h.key}`} style={{ '--k': k } as React.CSSProperties}>
              <Character addr={h.key} size={36} title="" />
              <span className="lp-hit-who"><b>{h.title}</b><small>{h.key.slice(0, 6)}…{h.key.slice(-4)}</small></span>
              <span className="lp-hit-claim">{claim(h)}</span>
              {h.weightUsd > 0 && <span className="lp-hit-usd">{usdShort(h.weightUsd)}<small>in positions</small></span>}
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

function Stat({ n, fmt, cls, tilt, face, children }: { n: number; fmt: (v: number) => string; cls: string; tilt: string; face: Spec; children: React.ReactNode }) {
  return (
    <div className={`lp-tile rv ${cls}`} style={{ '--tilt': tilt } as React.CSSProperties}>
      <Character addr="stat" spec={face} size={44} title="" className="lp-tile-face" />
      <b>{n ? <Count n={n} fmt={fmt} /> : '—'}</b>
      <span>{children}</span>
    </div>
  )
}

/** A number that counts up from zero the first time it scrolls into view (and simply shows under reduced motion). */
function Count({ n, fmt }: { n: number; fmt: (v: number) => string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [v, setV] = React.useState(0)
  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(n); return }
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now(), dur = 1400
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / dur), ease = 1 - Math.pow(1 - k, 3)
        setV(n * ease)
        if (k < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }, { threshold: 0.4 })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(raf) }
  }, [n])
  return <span ref={ref}>{fmt(v)}</span>
}

/** The protocols the proof is read from, as a marquee: two rows, opposite ways, still under the pointer. */
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
  const half = Math.ceil(list.length / 2)
  const row = (items: typeof list, back: boolean) => (
    <div className={back ? 'lp-marq back' : 'lp-marq'}>
      <div className="lp-marq-t">
        {[0, 1].map((copy) => items.map((p) => (
          <span className="lp-proto" key={`${copy}:${p.key}`} aria-hidden={copy > 0 || undefined} title={`${p.markets} market${p.markets === 1 ? '' : 's'} with moves this week`}>
            <ProtocolLogo urls={protocolIconUrls(p.key, p.logo)} name={p.name} />
            <b>{p.name}</b>
            <small>{p.markets}</small>
          </span>
        )))}
      </div>
    </div>
  )
  return (
    <section className="lp-sec lp-protos">
      <span className="lbl rv">Where the proof is read from</span>
      {row(list.slice(0, half), false)}
      {row(list.slice(half), true)}
    </section>
  )
}

/** The crowd at the finish line: the board's wallets, peeking up from the bottom edge. */
function Crowd() {
  const board = useEarners({ by: 'position', sort: 'perDay', people: true, limit: 40 })
  const faces = React.useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const r of board.data?.by === 'position' ? board.data.rows : []) {
      const a = r.account.toLowerCase()
      if (seen.has(a)) continue
      seen.add(a); out.push(r.account)
      if (out.length >= 16) break
    }
    return out
  }, [board.data])
  if (!faces.length) return null
  return (
    <div className="lp-crowd" aria-hidden="true">
      {faces.map((a, i) => <span key={a} style={{ '--i': i, '--n': faces.length } as React.CSSProperties}><Character addr={a} size={56} title="" /></span>)}
    </div>
  )
}

/** `.rv` elements get `.in` the first time they scroll into view (all at once under reduced motion). */
function useReveal() {
  React.useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>('.rv')]
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { els.forEach((e) => e.classList.add('in')); return }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }), { threshold: 0.15, rootMargin: '0px 0px -5% 0px' })
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [])
}
