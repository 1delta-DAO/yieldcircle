/**
 * Start — the home page (`#/`): the beginner's dashboard, and the first page
 * every visitor sees.
 *
 * The feed answers "what are people doing?", the Earn tab "what pays what?".
 * Neither answers the question someone NEW actually has: *what should I do
 * with my money, and how much work is it?* This page does, in three bands
 * (`model/activity.ts`) — passive savings, medium loops, active strategies on a
 * clock (a PT, or a loop on fixed-rate debt)
 * — with 2–3 recommended cards each. A card is recommended because real
 * wallets hold equity in it (the index's strategy book: every person's
 * position ≥ $1k; the proof is on the card, with the wallet it links to) and,
 * in the bands that ask more work, because it pays for that work — the steady
 * rate, never tonight's spike, and a premium over the passive card
 * (`recommend` in `model/activity.ts`).
 *
 * It is the first of the four tabs, the Home one; the feed is the second.
 */
import React from 'react'
import { useApp, walletHref } from '../state/AppState'
import { ConnectButton } from '../wallet/ConnectButton'
import { useBook } from './useBook'
import { useRateHistory } from '../sdk/queries'
import { steadyRate, type HistoryGet } from '../model/rateHistory'
import { BANDS, BAND_ORDER, DENOMS, bandOf, clockOf, denomOf, denomOfAsset, isFixedDebt, recommendAll, type Band, type Denom, type Pick_ } from '../model/activity'
import { useStrategyProofs } from '../index/queries'
import { bookKeyOf } from '../model/uid'
import { useProfiles } from '../social/queries'
import { Who } from './social-bits'
import { Avg30 } from './Spark'
import { RiskDot, Sk, StratMark, Toks, pct, usdShort } from './bits'
import { dateOf, type Strategy } from '../model/strategies'
import { nameOf } from '../model/assets'
import { ChainChip } from './ChainPicker'

/** Each lane's colour and face: calm green, warm amber, electric violet. */
const LANE: Record<Band, { color: string; ico: string; tag: string }> = {
  passive: { color: 'var(--success)', ico: '🌱', tag: 'set and forget' },
  medium: { color: 'var(--warning)', ico: '☕', tag: 'a look now and then' },
  active: { color: 'var(--violet)', ico: '⏰', tag: 'on a clock' },
}

// ---------------------------------------------------------------- the page
export function Start() {
  const { isConnected, allChains, chainIds } = useApp()
  const b = useBook()
  const get = useRateHistory(b.all, !b.isFetching)
  const rank = (s: Strategy) => steadyRate(s, get)
  // who holds each strategy that could be a card, in every denomination (a
  // chip switch then costs no request): the index's strategy book, every
  // person's position ≥ $1k — the proof behind every "recommended"
  // (`b.all` is a new array every render: memo on the joined list, or the proofs' debounce never settles)
  const keyList = [...new Set(b.all.filter((s) => bandOf(s) && denomOf(s)).map(bookKeyOf).filter((k): k is string => !!k))].sort().join(' ')
  const keys = React.useMemo(() => (keyList ? keyList.split(' ') : []), [keyList])
  const proofs = useStrategyProofs(keys)
  const book = proofs.data
  // one denomination at a time, so exposures are never mixed: a SOL rate is
  // SOL-on-SOL, and putting it beside a dollar rate would rank apples by oranges
  const [denom, setDenom] = React.useState<Denom>('USD')
  const menu = b.all.filter((s) => denomOf(s) === denom)
  const picks = recommendAll(menu, book, rank)
  // one profiles request for every face the cards show
  const { profile } = useProfiles(BAND_ORDER.flatMap((band) => picks[band].map((p) => p.proof?.best?.account)).filter((a): a is string => !!a))
  // the teaser counts only money already IN this denomination — moving a coin
  // into dollars first would be an exposure change, not parking idle money
  const idleUsd = b.books.filter((x) => denomOfAsset(x.group, x.asset) === denom).reduce((a, x) => a + x.idleUsd, 0)
  const bestPassive = picks.passive[0]?.s
  // the cards are a RANKING of the whole catalogue by who holds what: until every
  // selected chain has answered and the proofs cover the list, a band that looks
  // empty (or a card about to be outranked) is a guess, so it shows
  // placeholders — never "nothing here" while a chain is still on its way. Once
  // per chain scope: a background refetch later keeps the cards on screen
  const scope = chainIds.join(',')
  const ready = chainIds.every((c) => b.settled.has(c)) && proofs.current
  const [readyFor, setReadyFor] = React.useState<string | null>(null)
  if (ready && readyFor !== scope) setReadyFor(scope)
  const loading = !ready && readyFor !== scope
  return (
    <div className="start">
      <header className="start-hero">
        <h1><span className="wave" aria-hidden>👋</span> Where should your money go?</h1>
        <p>
          Three lanes, sorted by how much attention they ask. Every card is something real
          wallets hold right now, with the rate read off the chain — tap one and it opens as a
          ready-made ticket.
        </p>
        {!isConnected && (
          <div className="start-cta">
            <ConnectButton />
            <a className="linklike" href="#/feed">or look around first — see the live feed ›</a>
          </div>
        )}
        {isConnected && !loading && idleUsd > 0 && bestPassive && (
          <div className="note start-idle">
            You have <b>{usdShort(idleUsd)}</b> sitting idle. In the passive strategy below it would
            earn about <b className="ok">{usdShort(idleUsd * bestPassive.rate / 100)}/yr</b> — without you touching it again.
          </div>
        )}
      </header>

      {/* what to earn IN: one exposure at a time, so a SOL rate never ranks beside a dollar rate */}
      <div className="denoms" role="group" aria-label="What to earn in">
        <span className="denoms-lbl t50">Earn in</span>
        {DENOMS.map((d) => (
          <button key={d.id} className="dchip" aria-pressed={denom === d.id} onClick={() => setDenom(d.id)}>{d.word}</button>
        ))}
        <span className="sub t50 hide-m">rates are in the asset you pick, never mixed</span>
        <span className="sp" />
        <ChainChip />
      </div>

      {BAND_ORDER.map((band) => (
        <BandSection key={band} band={band} picks={picks[band]} loading={loading} get={get} profile={profile} scoped={!allChains} />
      ))}

      <section className="sec">
        <div className="sec-h"><h2>Go deeper</h2></div>
        <div className="deeper">
          <a href="#/feed"><span className="ico" aria-hidden>📡</span><b>Feed</b><small>Every move real wallets make, as it happens. Any one of them copies in a tap.</small></a>
          <a href="#/board"><span className="ico" aria-hidden>🏆</span><b>Board</b><small>Wallets ranked by what they verifiably earn — not by what they say.</small></a>
          <a href="#/earn"><span className="ico" aria-hidden>🗂️</span><b>Earn</b><small>The whole catalogue, asset by asset, with every desk and every rate.</small></a>
        </div>
      </section>
    </div>
  )
}

type ProfileOf = ReturnType<typeof useProfiles>['profile']

/** One band: the heading with its effort marks, the plain words, and the cards. */
function BandSection({ band, picks, loading, get, profile, scoped }: {
  band: Band
  picks: Pick_[]
  loading: boolean
  get: HistoryGet
  profile: ProfileOf
  /** a chain filter is on — the likelier reason a band is empty */
  scoped: boolean
}) {
  const m = BANDS[band]
  const lane = LANE[band]
  return (
    <section className="sec bandsec" style={{ '--bc': lane.color } as React.CSSProperties}>
      <div className="sec-h">
        <h2><span className="band-ico" aria-hidden>{lane.ico}</span>{m.word} <span className="t50">· {lane.tag}</span></h2>
        <Effort n={m.effort} />
        <span className="sub">{m.why}</span>
      </div>
      <div className="band-tend">{m.tend}</div>
      <div className="stcards">
        {loading
          ? [0, 1, 2].map((i) => <StartCardSk key={i} />)
          : !picks.length
          ? <div className="empty t50">Nothing in this band for the picked asset{scoped ? ' on these chains' : ''} right now.</div>
          : picks.map((p) => <StartCard key={p.s.id} p={p} get={get} profile={profile} />)}
      </div>
    </section>
  )
}

/** ⚡-marks: how much attention the band asks, 1 of 3 to 3 of 3. */
function Effort({ n }: { n: number }) {
  return (
    <span className="eff" title={`attention needed: ${n} of 3`} aria-label={`attention needed: ${n} of 3`}>
      {[1, 2, 3].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}
    </span>
  )
}

/** A card's shape while the catalogue and the proofs load, so the page does not jump when they land. */
function StartCardSk() {
  return (
    <div className="stcard stcard-sk" aria-hidden>
      <div className="stcard-h">
        <Sk w={26} h={26} />
        <span className="stcard-n"><Sk w={90} h={14} /><Sk w={140} h={10} /></span>
      </div>
      <div className="stcard-rate"><Sk w={84} h={24} /></div>
      <div className="stcard-proof"><Sk w={120} h={14} /><Sk w={150} h={10} /></div>
      <span className="stcard-go"><Sk w={60} h={10} /></span>
    </div>
  )
}

/**
 * One recommendation. The card is the ticket's door (`go`, like the Earn
 * digest's rows); the proof line links to the wallet instead, so both of the
 * page's promises — "copy in one tap" and "see who actually does this" — are
 * one tap from the card.
 */
function StartCard({ p, get, profile }: { p: Pick_; get: HistoryGet; profile: ProfileOf }) {
  const s = p.s
  const expiry = clockOf(s)
  // which clock: the PT's own maturity, or the loan's (a fixed-rate borrow falls due; a tenor runs from the open)
  const ptClock = s.kind !== 'loop' || !!s.expiry
  const fixedDebt = s.kind === 'loop' && isFixedDebt(s)
  const loopWord = s.kind === 'loop' ? `${s.expiry ? 'PT loop' : 'loop'} on ${s.venue} · borrows ${s.debt}${fixedDebt ? ' at a fixed rate' : ''}` : ''
  // the ticket's own URL (what `go(s.group, { u, k })` would set), so the card is a real link
  const q = new URLSearchParams({ u: s.asset, ...(s.kind === 'loop' ? { k: 'loop' } : {}) })
  const best = p.proof?.best
  return (
    <a className="stcard" href={`#/${s.group}?${q}`}>
      <div className="stcard-h">
        {s.kind === 'simple'
          ? <StratMark sym={s.holds} logo={s.logo ?? s.tokenLogo} venueKey={s.venueKey} brand={s.brand} size={26} />
          : <Toks a={s.asset} b={s.debt} logoA={s.logoLong ?? s.tokenLogo} logoB={s.logoShort} />}
        <span className="stcard-n">
          <b>{nameOf(s.asset)}</b>
          <small className="t50">{s.kind === 'loop' ? `${s.rec.toFixed(1)}× ${loopWord}` : s.via}</small>
        </span>
        <RiskDot r={s.risk} label={s.riskLabel} dotOnly />
      </div>
      <div className="stcard-rate">
        <b className="ok">{pct(s.rate)}</b>
        <span className="t50">APR</span>
        <Avg30 s={s} get={get} prefix="30d " />
        {expiry ? <span className="pill pt" title={ptClock ? 'A fixed-rate PT: the rate holds until this date, then the money must be redeemed or rolled.' : 'A fixed-rate loan: it falls due on this date and must be repaid or rolled — past it, it can be liquidated.'}>{ptClock ? 'until' : 'loan due'} {dateOf(expiry)}</span>
          : fixedDebt ? <span className="pill pt" title="The borrow rate is fixed for the term you pick when you open it; at its end the loan must be repaid or rolled.">fixed term</span> : null}
      </div>
      {p.proof && best ? (
        // the wallet behind the proof, without an <a> inside this <a>
        <div className="stcard-proof" role="link" tabIndex={0} title="open this wallet"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); location.hash = walletHref(best.account) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); location.hash = walletHref(best.account) } }}>
          <Who account={best.account} profile={profile(best.account)} size={22} plain
            sub={<>{pct(best.aprPct)} on {usdShort(best.equityUsd)}</>} />
          <small className="t50" title="Wallets holding at least $1k in exactly this strategy, and their equity in it — read off the chain, not claimed. Smaller holders are not counted, so there are at least this many.">
            held by {p.proof.wallets}+ wallet{p.proof.wallets === 1 ? '' : 's'} · {usdShort(p.proof.totalUsd)}
          </small>
        </div>
      ) : <div className="stcard-proof t40"><small>steadiest rate in its band this month</small></div>}
      <span className="stcard-go">Earn this →</span>
    </a>
  )
}
