import React from 'react'
import { liteHash } from '@yieldcircle/core/model/liteLinks'
import { canonUid, uidOf } from '@yieldcircle/core/model/uid'
import { isSpike, seriesFor, type HistoryGet } from '@yieldcircle/core/model/rateHistory'
import { heldBy, leverTag, riskWord, rowName, type LiteRow } from '@yieldcircle/core/model/lite'
export { heldBy }
import { GROUPS } from '@yieldcircle/core/model/assets'
import type { Proof } from '@yieldcircle/core/model/activity'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import type { TxBundle } from '@yieldcircle/core/index/types'
import { useProfiles } from '../../social/queries'
import { Face, Who } from '../social-bits'
import { GroupIcon, Sk, Tok, Toks, pct, usdShort } from '../bits'

/** A row's face: the token the money sits in (a loop's debt beside it) — never a venue badge. */
export function LiteFace({ s, size = 28 }: { s: Strategy; size?: number }) {
  return s.kind === 'loop'
    ? <Toks a={s.holds} b={s.debt} logoA={s.logoLong} logoB={s.logoShort} />
    : <Tok sym={s.assetSymbol} logo={[s.tokenLogo, s.logo]} size={size} />
}

/**
 * A row's name: the money's own mark, then the money in words. On a category's own list the family
 * is the page's ("Dollars"), so the row says whose it is (`3Jane`); wherever categories mix — the
 * best rates across all, the home's cards, search — it says the whole phrase (`Dollars via 3Jane`):
 * a touch screen has no hover to say it (docs/lite-design-review.md §3.2). A PT or a loop adds how
 * it earns (`3Jane via Pendle`, `3Jane loop via Morpho`: `rowName`).
 */
export function LiteTitle({ r, size = 14, full }: { r: LiteRow; size?: number; full?: boolean }) {
  const g = GROUPS.find((x) => x.id === r.s.group)
  return (
    <b className="lite-title">
      {g && <GroupIcon id={g.id} color={g.color} size={size} />}
      <span>{rowName(r, full)}</span>
    </b>
  )
}

/** The streak's flame, drawn: an emoji is a different picture on every platform and OS version. */
export function Flame({ size = 14 }: { size?: number }) {
  return <svg className="flame" viewBox="0 0 16 16" width={size} height={size} aria-hidden><path d="M8.6 1.2c.3 2.1-.6 3.3-1.6 4.4C6 6.7 5 7.8 5 9.7a3 3 0 0 0 6 .1c0-.9-.3-1.6-.8-2.3 1.6.5 2.8 2 2.8 3.9A5 5 0 0 1 3 11.3c0-2.8 1.4-4.4 2.7-5.8C6.9 4.2 8 3 8.6 1.2z" fill="currentColor" /></svg>
}

/** Opening a row is opening its ticket on the category's own list. */
/** A row's ticket, through core's route map (`liteHash`): the same address a shared link or the phone opens. */
export const openRow = (s: Strategy, more: { copy?: string; lev?: string; h?: string; m?: string } = {}) => { location.hash = liteHash({ to: 'strategy', s, ...more }) }

/**
 * The rate, in its risk's colour (low green, medium amber, high red): the risk said where the eye
 * already is, instead of a dot beside it. A spike against the month is said in words on the row.
 */
export function LiteRate({ s }: { s: Strategy }) {
  return <b className={`lite-rate r${s.risk}`} aria-label={`${pct(s.rate)} a year, ${riskWord(s.risk).toLowerCase()}`}>{pct(s.rate)}</b>
}
/** Tonight's rate well above its own month: the list ranks by the steady one, and says so. */
export const spikeOf = (s: Strategy, get: HistoryGet) => isSpike(s.rate, seriesFor(s, get, true))

/** One list row: face · what it is · held by · yours · lever · rate. The whole row is the button. */
export function LiteRowView({ r, get, proof, on, yoursUsd, followed, full }: { r: LiteRow; get: HistoryGet; proof: Proof | null; on?: boolean; yoursUsd?: number; /** the proof's face is someone the reader follows: said first (docs/lite-social-search.md §4.6) */ followed?: boolean; /** categories mix on this list: the whole phrase, not only whose */ full?: boolean }) {
  const s = r.s
  const who = heldBy(proof)
  const friend = followed && proof?.best ? proof.best.account : null
  const spike = spikeOf(s, get)
  return (
    <button type="button" className={`lrow${on ? ' on' : ''}`} aria-pressed={on} onClick={() => openRow(s)}>
      <LiteFace s={s} />
      <span className="lrow-n">
        <LiteTitle r={r} full={full} />
        <small>{r.sub}{spike && <> · <span className="warn">higher than usual</span></>}{friend ? <> · <span className="lite-friend"><Face account={friend} size={14} /> you follow{proof!.wallets > 1 ? ` + ${proof!.wallets - 1}` : ''}</span></> : who ? <> · <span className="t70">{who}</span></> : null}</small>
      </span>
      {yoursUsd != null && yoursUsd > 0 && <span className="pill run">yours {usdShort(yoursUsd)}</span>}
      {s.kind === 'loop' && <span className="pill lever">{leverTag(s.tiers.balanced)}</span>}
      <LiteRate s={s} />
    </button>
  )
}

/**
 * A card: the same row for the home's lenses, with the proof's face and one Copy. Two things to tap
 * — the card opens it, Copy copies the face on it — so a thumb never lands on a third.
 */
export function LiteCard({ r, get, proof, profile, followed }: { r: LiteRow; get: HistoryGet; proof: Proof | null; profile: ReturnType<typeof useProfiles>['profile']; /** the reader follows the face on the card */ followed?: boolean }) {
  const s = r.s
  const best = proof?.best
  const spike = spikeOf(s, get)
  return (
    <div className="lcard" role="button" tabIndex={0} onClick={() => openRow(s)} onKeyDown={(e) => { if (e.key === 'Enter') openRow(s) }}>
      <div className="lcard-h"><LiteFace s={s} size={30} /><span className={`lite-risk r${s.risk}`}>{riskWord(s.risk)}</span>{s.kind === 'loop' && <span className="pill lever">{leverTag(s.tiers.balanced)}</span>}</div>
      <div className="lcard-n"><LiteTitle r={r} size={15} full /><small className="t70">{r.sub}</small></div>
      <div className="lcard-rate"><LiteRate s={s} /><span className="t70">a year{spike ? ' · higher than usual' : ''}</span></div>
      {best ? (
        <div className="lcard-proof">
          <Who account={best.account} profile={profile(best.account)} size={20} plain sub={followed ? `you follow · ${heldBy(proof)}` : heldBy(proof)} />
          <button type="button" className="btn sm pri" onClick={(e) => { e.stopPropagation(); openRow(s, { copy: best.account }) }}>Copy</button>
        </div>
      ) : <div className="lcard-proof"><small className="t70">the steadiest rate of its kind this month</small><button type="button" className="btn sm" onClick={(e) => { e.stopPropagation(); openRow(s) }}>Earn this</button></div>}
    </div>
  )
}
export function LiteCardSk() {
  return <div className="lcard" aria-hidden><div className="lcard-h"><Sk w={30} h={30} /></div><div className="lcard-n"><Sk w={110} h={14} /><Sk w={140} h={10} /></div><div className="lcard-rate"><Sk w={80} h={22} /></div><div className="lcard-proof"><Sk w={150} h={12} /></div></div>
}

/**
 * The Lite row a feed move is about, when Lite carries it: a loop by its two markets, a deposit by
 * its market — what a Copy on the move opens.
 */
export function rowOfTx(t: TxBundle, rows: LiteRow[]): LiteRow | null {
  const uid = (u?: string | null) => (u ? canonUid(u)?.toLowerCase() ?? u.toLowerCase() : '')
  const supply = t.legs.filter((l) => l.side !== 'borrow' && l.side !== 'debt').map((l) => uid(l.marketUid))
  const debt = t.legs.filter((l) => l.side === 'borrow' || l.side === 'debt').map((l) => uid(l.marketUid))
  for (const r of rows) {
    const s = r.s
    if (s.kind === 'loop' ? supply.includes(uid(s.marketLongUid)) && debt.includes(uid(s.marketShortUid)) : !debt.length && supply.includes(uid(uidOf(s)))) return r
  }
  return null
}
