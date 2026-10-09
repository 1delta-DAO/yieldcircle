/**
 * The social half of the ticket: what people say about this strategy, and
 * who is already in it. It sits under the numbers because it answers a
 * different question — the cells say what the strategy pays, this says what
 * the people who looked at it (and are in it) make of it.
 *
 * The thread comes first and is open: a collapsed toggle at the bottom of the
 * drawer was where comments went to be missed (tickets/0005). It is the
 * STRATEGY's thread (`threadOf`): a deposit's market, or a loop's own — so a
 * loop no longer shares one with every other loop on its collateral, and
 * what was said on that market before stays one link away.
 *
 * Both halves come from the index and the social service, never from the
 * allocator, and both degrade to nothing when the uid is outside what the
 * index follows.
 */
import React from 'react'
import { useHolders } from '../index/queries'
import { useCounts, useProfiles } from '../social/queries'
import { marketHref } from '../state/AppState'
import { FollowButton, Money, Who } from './social-bits'
import { Sk } from './bits'
import { Thread } from './Thread'
import type { Strategy } from '../model/strategies'
import type { ThreadRef } from '../model/uid'

export function TicketSocial({ uid, thread, s, focus }: {
  /** the market the strategy sits in (a loop's collateral leg): whose holders these are */
  uid: string | null
  thread: ThreadRef | null
  s: Strategy
  /** opened from a row's 💬: scroll here and show the whole thread */
  focus?: boolean
}) {
  // a loop on its own thread: what was said on its collateral market stays one link away
  const onMarket = useCounts(thread?.kind === 'strategy' && uid ? [{ kind: 'market', key: uid }] : [])
  const nMarket = uid && thread?.kind === 'strategy' ? onMarket.count('market', uid) : 0
  const here = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => { if (focus) here.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }, [focus])
  if (!uid && !thread) return null
  const what = s.kind === 'loop' ? 'loop' : 'strategy'
  return (
    <>
      {thread && (
        <div className="tsec tsocial" ref={here}>
          <div className="ts-h">
            <span className="lbl">What people say</span>
            <span className="sp" />
            <FollowButton kind={thread.kind} target={thread.key} small quiet />
          </div>
          <Thread kind={thread.kind} subjectKey={thread.key} compact max={focus ? undefined : 2} placeholder={`What do you make of this ${what}?`} />
          {nMarket > 0 && uid && (
            <a className="ts-more" href={marketHref(uid)}>{nMarket} more on the {s.holds} market, from before loops had their own thread ›</a>
          )}
        </div>
      )}
      {uid && <div className="tsec tsocial"><WhoIsIn uid={uid} s={s} /></div>}
    </>
  )
}

/**
 * The social strip under the picked row of the list, on a desk: the thread on
 * the left, who is in it on the right. The ticket then holds only the numbers
 * and the words, and the proof and the talk are read where the choice is
 * made. On a phone, where the ticket covers the list, both stay at the
 * ticket's foot (`TicketSocial`). It unfolds (a 0fr→1fr track, no measuring)
 * and shows placeholders until the index answers.
 */
export function RowSocial({ uid, thread, s, focus }: { uid: string | null; thread: ThreadRef | null; s: Strategy; focus?: boolean }) {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => { const t = requestAnimationFrame(() => setOpen(true)); return () => cancelAnimationFrame(t) }, [])
  const what = s.kind === 'loop' ? 'loop' : 'strategy'
  if (!uid && !thread) return null
  return (
    <div className={`xp-x${open ? ' open' : ''}`}>
      <div className="xp-xi">
        <div className="rowsocial">
          {thread && (
            <div className="rs-talk">
              <div className="ts-h"><span className="lbl">What people say</span><span className="sp" /><FollowButton kind={thread.kind} target={thread.key} small quiet /></div>
              <Thread kind={thread.kind} subjectKey={thread.key} compact max={focus ? undefined : 2} placeholder={`What do you make of this ${what}?`} />
            </div>
          )}
          {uid && <WhoIsIn uid={uid} s={s} wide />}
        </div>
      </div>
    </div>
  )
}

/**
 * Who else is in it: the market's biggest holders, each a door to their
 * wallet. `wide` is the strip's layout (pills in a row); the ticket's foot
 * stacks them.
 */
export function WhoIsIn({ uid, s, wide }: { uid: string; s: Strategy; wide?: boolean }) {
  // NOT filtered to `supply`: a vault market's holders sit on the `share`
  // side, and half the deposit menu is a vault — filtering here showed an
  // empty "who else is in it" on every one of them.
  const holders = useHolders(uid, undefined, 6)
  const rows = holders.data?.holders ?? []
  const { profile } = useProfiles(rows.map((h) => h.account))
  const total = rows.reduce((a, h) => a + (h.amountUsd ?? 0), 0)
  return (
    <div className={`whoin${wide ? ' wide' : ''}`}>
      <div className="ts-h">
        <span className="lbl">Who else is in {wide ? `this ${s.kind === 'loop' ? 'loop' : 'market'}` : 'it'}</span>
        {wide && rows.length > 0 && <span className="t50 whoin-n">top {rows.length} hold <Money usd={total} short /></span>}
        <span className="sp" />
        <a className="t50" href={marketHref(uid)}>Market page ›</a>
      </div>
      {holders.isLoading && (wide
        ? <div className="ts-holders" aria-busy="true" aria-label="reading the index">{[0, 1, 2, 3].map((i) => <span key={i} className="ts-holder sk"><Sk w={24} h={24} /><Sk w={70 + i * 12} h={12} /><Sk w={32} h={12} /></span>)}</div>
        : <p className="foot">reading the index…</p>)}
      {!holders.isLoading && !rows.length && <p className="foot">The index has no holder for this market yet — it may be outside what it follows, or simply new.</p>}
      {rows.length > 0 && (
        <div className="ts-holders">
          {rows.map((h) => (
            <a key={h.account} className="ts-holder" href={`#/w/${h.account}`}>
              <Who account={h.account} profile={profile(h.account)} idx={h} size={24} plain />
              <span className="sp" />
              <Money usd={h.amountUsd} short />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
