import React from 'react'
import { go, walletHref } from '../../state/AppState'
import { canonUid, uidOf } from '@yieldcircle/core/model/uid'
import { isSpike, seriesFor, type HistoryGet } from '@yieldcircle/core/model/rateHistory'
import { familyOf, heldBy, leverTag, splitTitle, type LiteRow } from '@yieldcircle/core/model/lite'
export { heldBy }
import { GROUPS } from '@yieldcircle/core/model/assets'
import type { Proof } from '@yieldcircle/core/model/activity'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import type { TxBundle } from '@yieldcircle/core/index/types'
import { subjectOf } from '@yieldcircle/core/index/types'
import { useFeedPage } from '@yieldcircle/app/index/queries'
import { useMyFollows, useProfiles } from '../../social/queries'
import { Ago, Who, describeBundle } from '../social-bits'
import { GroupIcon, RiskDot, Sk, Tok, Toks, pct, usdShort } from '../bits'
import { TxMoney, primaryLeg } from '../Feed'
import { useApp } from '../../state/AppState'

/** A row's face: the token the money sits in (a loop's debt beside it) — never a venue badge. */
export function LiteFace({ s, size = 28 }: { s: Strategy; size?: number }) {
  return s.kind === 'loop'
    ? <Toks a={s.holds} b={s.debt} logoA={s.logoLong} logoB={s.logoShort} />
    : <Tok sym={s.assetSymbol} logo={[s.tokenLogo, s.logo]} size={size} />
}

/**
 * A row's name: the money's own mark, then whose it is — `Dollars via 3Jane` is the dollar's mark
 * and `3Jane`, the whole phrase on hover. A ticker (`cbETH`, `USDC`) keeps its mark too, so every
 * row says its money the same way; its hover says the money in words.
 */
export function LiteTitle({ r, size = 14 }: { r: LiteRow; size?: number }) {
  const { short, via } = splitTitle(r.title)
  const g = GROUPS.find((x) => x.id === r.s.group)
  const fam = familyOf(r.s.group)
  return (
    <b className="lite-title" title={via ? r.title : fam ? `${r.title} · ${fam.toLowerCase()}` : undefined}>
      {g && <GroupIcon id={g.id} color={g.color} size={size} />}
      {short}
    </b>
  )
}

/** Opening a row is opening its ticket on the category's own list. */
export const openRow = (s: Strategy, more: Record<string, string | undefined> = {}) => go(s.group, { s: s.id, k: s.kind, ...more })

/** The rate, amber when tonight's is a spike against its own month. */
export function LiteRate({ s, get }: { s: Strategy; get: HistoryGet }) {
  const spike = isSpike(s.rate, seriesFor(s, get, true))
  return <b className={`lite-rate ${spike ? 'warn' : s.rate >= 3 ? 'ok' : ''}`} title={spike ? 'Higher than this month’s usual: the steady rate is what the list ranks by' : undefined}>{pct(s.rate)}</b>
}


/** One list row: face · what it is · held by · rate · risk · lever · yours. */
export function LiteRowView({ r, get, proof, on, yoursUsd }: { r: LiteRow; get: HistoryGet; proof: Proof | null; on?: boolean; yoursUsd?: number }) {
  const s = r.s
  const who = heldBy(proof)
  return (
    <button type="button" className={`lrow${on ? ' on' : ''}`} aria-pressed={on} onClick={() => openRow(s)}>
      <LiteFace s={s} />
      <span className="lrow-n"><LiteTitle r={r} /><small>{r.sub}{who ? <> · <span className="t70">{who}</span></> : null}</small></span>
      {yoursUsd != null && yoursUsd > 0 && <span className="pill run">yours {usdShort(yoursUsd)}</span>}
      {s.kind === 'loop' && <span className="pill lever">{leverTag(s.tiers.balanced)}</span>}
      <RiskDot r={s.risk} label={s.riskLabel} dotOnly />
      <LiteRate s={s} get={get} />
      <span className="t40" aria-hidden>›</span>
    </button>
  )
}

/** A card: the same row for the home's lenses, with the proof's face and one Copy. */
export function LiteCard({ r, get, proof, profile }: { r: LiteRow; get: HistoryGet; proof: Proof | null; profile: ReturnType<typeof useProfiles>['profile'] }) {
  const s = r.s
  const best = proof?.best
  return (
    <div className="lcard" role="button" tabIndex={0} onClick={() => openRow(s)} onKeyDown={(e) => { if (e.key === 'Enter') openRow(s) }}>
      <div className="lcard-h"><LiteFace s={s} size={30} /><RiskDot r={s.risk} label={s.riskLabel} dotOnly />{s.kind === 'loop' && <span className="pill lever">{leverTag(s.tiers.balanced)}</span>}</div>
      <div className="lcard-n"><LiteTitle r={r} size={15} /><small className="t50">{r.sub}</small></div>
      <div className="lcard-rate"><LiteRate s={s} get={get} /><span className="t50">a year</span></div>
      {best ? (
        <div className="lcard-proof">
          <span role="link" tabIndex={0} title="open this wallet" onClick={(e) => { e.stopPropagation(); location.hash = walletHref(best.account) }}>
            <Who account={best.account} profile={profile(best.account)} size={20} plain sub={heldBy(proof)} />
          </span>
          <button type="button" className="btn sm pri" onClick={(e) => { e.stopPropagation(); openRow(s, { copy: best.account }) }}>Copy</button>
        </div>
      ) : <div className="lcard-proof t40"><small>steadiest rate of its kind this month</small><button type="button" className="btn sm" onClick={(e) => { e.stopPropagation(); openRow(s) }}>Earn this</button></div>}
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

/**
 * What the people the reader follows did, newest first — each move with a Copy when Lite has the
 * strategy it opened (fomo's follow alert, with a real copy behind it).
 */
export function FollowedMoves({ rows, account, limit = 8, title = 'People you follow' }: { rows: LiteRow[]; account: string | undefined; limit?: number; title?: string }) {
  const { chainIds, allChains } = useApp()
  const f = useMyFollows(account)
  const has = f.wallets.length + f.markets.length > 0
  const feed = useFeedPage({ follower: account, follow: 'all', chainIds: allChains ? undefined : chainIds.join(',') }, 40, !!account && has)
  const txs = (feed.data?.txs ?? []).slice(0, limit)
  const { profile } = useProfiles(txs.map((t) => subjectOf(t).account).filter(Boolean))
  if (!account || !has) return null
  return (
    <section className="sec lite-sec">
      <div className="sec-h"><h2>{title}</h2></div>
      <div className="card">
        {feed.isLoading && <div className="empty"><Sk w={200} /></div>}
        {!feed.isLoading && !txs.length && <div className="empty t50">Nothing from them yet.</div>}
        <div className="tape">{txs.map((t) => {
          const l = primaryLeg(t), d = describeBundle(t), who = subjectOf(t).account
          const r = rowOfTx(t, rows)
          return (
            <div key={`${t.chainId}:${t.txHash}`} className="tape-row alert lite-move">
              <Who account={who} profile={profile(who)} idx={subjectOf(t)} size={22} plain />
              <span className={`verb ${d.cls}`}>{d.verb}</span>
              <span className="tr-m">{r ? r.title : l?.symbol ?? ''}</span>
              <span className="tr-v"><TxMoney t={t} l={l} short /></span>
              {r ? <button type="button" className="btn sm pri" onClick={() => openRow(r.s, { copy: who })}>Copy</button> : <span className="tr-t"><Ago ts={t.blockTs} /></span>}
            </div>
          )
        })}</div>
      </div>
    </section>
  )
}
