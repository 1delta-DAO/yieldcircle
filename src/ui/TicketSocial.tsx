/**
 * The social half of the ticket: who is already in this market, and what they
 * said about it. It sits under the numbers because it answers a different
 * question — the cells say what the strategy pays, this says whether anyone
 * you can look up is actually in it.
 *
 * Both halves come from the index and the social service, never from the
 * allocator, and both degrade to nothing when the uid is outside what the
 * index follows.
 */
import React from 'react'
import { useHolders } from '../index/queries'
import { useProfiles, useThread } from '../social/queries'
import { marketHref } from '../state/AppState'
import { Money, Who } from './social-bits'
import { Thread } from './Thread'
import type { Strategy } from '../model/strategies'

export function TicketSocial({ uid, s }: { uid: string | null; s: Strategy }) {
  const [open, setOpen] = React.useState(false)
  // NOT filtered to `supply`: a vault market's holders sit on the `share`
  // side, and half the deposit menu is a vault — filtering here showed an
  // empty "who else is in it" on every one of them.
  const holders = useHolders(uid ?? undefined, undefined, 6)
  const t = useThread(uid ? 'market' : undefined, uid ?? undefined)
  const rows = holders.data?.holders ?? []
  const { profile } = useProfiles(rows.map((h) => h.account))
  const n = t.data?.messages.length ?? 0
  if (!uid) return null
  return (
    <div className="tsec tsocial">
      <div className="ts-h">
        <span className="lbl">Who else is in it</span>
        <span className="sp" />
        <a className="t50" href={marketHref(uid)}>Market page ›</a>
      </div>
      {holders.isLoading && <p className="foot">reading the index…</p>}
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
      <button className="ts-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide' : n ? `${n} comment${n === 1 ? '' : 's'} on this ${s.kind === 'loop' ? 'loop' : 'strategy'}` : 'Be the first to say something about it'} {open ? '▴' : '▾'}
      </button>
      {open && <Thread kind="market" subjectKey={uid} compact placeholder="What do you make of this one?" />}
    </div>
  )
}
