/**
 * Start — the beginner's dashboard, and the first page a new visitor sees.
 *
 * The home answers "what are people doing?", the Earn tab "what pays what?".
 * Neither answers the question someone NEW actually has: *what should I do
 * with my money, and how much work is it?* This page does, in three bands
 * (`model/activity.ts`) — passive savings, medium loops, active PT strategies
 * — with 2–3 recommended cards each. A card is recommended because the top-50
 * earners board holds real equity in it (the proof is on the card, with the
 * wallet it links to), the steady 30-day rate breaking ties; never because
 * tonight's rate is the biggest number.
 *
 * It is the first of the four tabs, and a first visit without a wallet is
 * redirected here from `#/` (`useSeenStart`, marked in App.tsx) — once, so the
 * Home tab is the social feed from then on.
 */
import React from 'react'
import { useApp, walletHref } from '../state/AppState'
import { ConnectButton } from '../wallet/ConnectButton'
import { useBook } from './useBook'
import { useRateHistory } from '../sdk/queries'
import { steadyRate, type HistoryGet } from '../model/rateHistory'
import { BANDS, BAND_ORDER, DENOMS, clockOf, denomOf, denomOfAsset, recommend, type Band, type Denom, type Pick_ } from '../model/activity'
import { useEarners } from '../index/queries'
import type { EarnerRow } from '../index/api'
import { useProfiles } from '../social/queries'
import { Who } from './social-bits'
import { Avg30 } from './Spark'
import { RiskDot, Sk, StratMark, Toks, pct, usdShort } from './bits'
import { dateOf, type Strategy } from '../model/strategies'
import { nameOf } from '../model/assets'

// ---------------------------------------------------------------- first visit
/** Has this browser been pointed at the Start tab once? App.tsx redirects the first `#/` here and marks it. */
const SEEN_KEY = 'yieldcircle.start-seen:v1'
let seen: boolean = (() => { try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return true } })()
export function markStartSeen() {
  if (seen) return
  seen = true
  try { localStorage.setItem(SEEN_KEY, '1') } catch { /* private mode */ }
}
export const startSeen = () => seen

// ---------------------------------------------------------------- the page
export function Start() {
  const { isConnected, chainIds, allChains } = useApp()
  const b = useBook()
  const get = useRateHistory(b.all, !b.isFetching)
  const rank = (s: Strategy) => steadyRate(s, get)
  // the same board the Board page shows (and the index pre-warms): the top
  // positions by APR, people only — the proof behind every "recommended"
  const eq = useEarners({ by: 'position', sort: 'apr', people: true, chainIds: allChains ? undefined : chainIds.join(',') })
  const rows: EarnerRow[] | undefined = eq.data?.by === 'position' ? eq.data.rows : undefined
  // one denomination at a time, so exposures are never mixed: a SOL rate is
  // SOL-on-SOL, and putting it beside a dollar rate would rank apples by oranges
  const [denom, setDenom] = React.useState<Denom>('USD')
  const menu = b.all.filter((s) => denomOf(s) === denom)
  const picks = Object.fromEntries(BAND_ORDER.map((band) => [band, recommend(menu, band, rows, rank)])) as Record<Band, Pick_[]>
  // one profiles request for every face the cards show
  const { profile } = useProfiles(BAND_ORDER.flatMap((band) => picks[band].map((p) => p.proof?.best?.account)).filter((a): a is string => !!a))
  // being here IS the first visit done — the Home tab goes to the feed from now on
  React.useEffect(() => { markStartSeen() }, [])
  // the teaser counts only money already IN this denomination — moving a coin
  // into dollars first would be an exposure change, not parking idle money
  const idleUsd = b.books.filter((x) => denomOfAsset(x.group, x.asset) === denom).reduce((a, x) => a + x.idleUsd, 0)
  const bestPassive = picks.passive[0]?.s
  const loading = b.isLoading && !b.all.length
  return (
    <div className="start">
      <header className="start-hero">
        <h1>Where to start</h1>
        <p>
          Three ways to put money to work, sorted by how much attention they ask — and in each,
          what the chain’s proven top earners actually hold. Every rate is an APR read off the
          chain, and every card opens as a ready-made ticket.
        </p>
        {!isConnected && (
          <div className="start-cta">
            <ConnectButton />
            <a className="linklike" href="#/">or look around first — see the live feed ›</a>
          </div>
        )}
        {isConnected && idleUsd > 0 && bestPassive && (
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
        <span className="sub t50 hide-m">rates are in the asset you pick — exposures are never mixed</span>
      </div>

      {BAND_ORDER.map((band) => (
        <BandSection key={band} band={band} picks={picks[band]} loading={loading} get={get} profile={profile} />
      ))}

      <section className="sec">
        <div className="note">
          <b>How to go deeper.</b> The <a href="#/">home feed</a> shows
          every move real wallets make, as it happens — any position there opens as a ticket you can
          copy in one tap. The <a href="#/board">board</a> ranks wallets by what they verifiably earn,
          and the <a href="#/earn">Earn tab</a> lists the whole catalogue, asset by asset.
        </div>
      </section>
    </div>
  )
}

type ProfileOf = ReturnType<typeof useProfiles>['profile']

/** One band: the heading with its effort marks, the plain words, and the cards. */
function BandSection({ band, picks, loading, get, profile }: {
  band: Band
  picks: Pick_[]
  loading: boolean
  get: HistoryGet
  profile: ProfileOf
}) {
  const m = BANDS[band]
  return (
    <section className="sec bandsec">
      <div className="sec-h">
        <h2>{m.word}</h2>
        <Effort n={m.effort} />
        <span className="sub">{m.why}</span>
      </div>
      <div className="band-tend t50">{m.tend}</div>
      <div className="stcards">
        {loading && !picks.length && [0, 1, 2].map((i) => <div key={i} className="stcard"><Sk w={120} /><Sk w={80} h={22} /><Sk w={160} /></div>)}
        {!loading && !picks.length && <div className="empty t50">Nothing in this band for the picked asset right now.</div>}
        {picks.map((p) => <StartCard key={p.s.id} p={p} get={get} profile={profile} />)}
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

/**
 * One recommendation. The card is the ticket's door (`go`, like the Earn
 * digest's rows); the proof line links to the wallet instead, so both of the
 * page's promises — "copy in one tap" and "see who actually does this" — are
 * one tap from the card.
 */
function StartCard({ p, get, profile }: { p: Pick_; get: HistoryGet; profile: ProfileOf }) {
  const s = p.s
  const expiry = clockOf(s)
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
          <small className="t50">{s.kind === 'loop' ? `${s.rec.toFixed(1)}× ${expiry ? 'PT loop' : 'loop'} on ${s.venue} · borrows ${s.debt}` : s.via}</small>
        </span>
        <RiskDot r={s.risk} label={s.riskLabel} dotOnly />
      </div>
      <div className="stcard-rate">
        <b className="ok">{pct(s.rate)}</b>
        <span className="t50">APR</span>
        <Avg30 s={s} get={get} prefix="30d " />
        {expiry ? <span className="pill pt" title="A fixed-rate PT: the rate holds until this date, then the money must be redeemed or rolled.">until {dateOf(expiry)}</span> : null}
      </div>
      {p.proof && best ? (
        // the wallet behind the proof, without an <a> inside this <a>
        <div className="stcard-proof" role="link" tabIndex={0} title="open this wallet"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); location.hash = walletHref(best.account) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); location.hash = walletHref(best.account) } }}>
          <Who account={best.account} profile={profile(best.account)} size={22} plain
            sub={<>{pct(best.aprPct)} on {usdShort(best.equityUsd)}</>} />
          <small className="t50" title="Equity that wallets on the top-earners board hold in exactly this market — read off the chain, not claimed.">
            {usdShort(p.proof.totalUsd)} from {p.proof.wallets} top earner{p.proof.wallets === 1 ? '' : 's'}
          </small>
        </div>
      ) : <div className="stcard-proof t40"><small>steadiest rate in its band this month</small></div>}
      <span className="stcard-go">Earn this ›</span>
    </a>
  )
}
