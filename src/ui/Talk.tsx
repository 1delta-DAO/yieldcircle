/**
 * The feed's Talk tab: what people SAID, newest first (tickets/0005).
 *
 * Every other tab is the ledger — what wallets did. A comment written on a
 * strategy (in its ticket, or with Say why at the moment of putting money in)
 * surfaced nowhere but inside that ticket, so nobody came across one by
 * browsing. Here each card is one top-level comment: who said it, what they
 * held when they did, the words, and the strategy it is about — one tap from
 * that strategy's ticket, opened on its thread.
 *
 * Only `market` and `strategy` threads: those are where strategies are
 * talked about. A position's or a wallet's thread is a conversation about a
 * person, and stays on the card or page it belongs to.
 */
import React from 'react'
import { useAccountMessages, useProfiles, useRecentMessages } from '../social/queries'
import { go, marketHref, tokenHref, walletHref } from '../state/AppState'
import { curatorHref } from './CuratorFilter'
import { shortAddr } from '../identity/name'
import { parseLoopKey, parseUid, threadOf } from '../model/uid'
import { chainLabel } from '../sdk/queries'
import type { Strategy } from '../model/strategies'
import type { Message } from '../social/types'
import { Ago, Stake, Who } from './social-bits'
import { Sk, StratMark, Toks } from './bits'
import { ChainCorner } from './ChainMark'

/**
 * A thread → the catalogue row it is about. A loop answers on its own key,
 * and on its collateral market too where no deposit claims that market — so
 * a comment from before loops had their own thread still finds a ticket.
 */
function useBySubject(menu: Strategy[]) {
  return React.useMemo(() => {
    const m = new Map<string, Strategy>()
    for (const s of menu) {
      const t = threadOf(s, true)
      if (t) m.set(`${t.kind}|${t.key}`, s)
    }
    for (const s of menu) {
      if (s.kind !== 'loop') continue
      const k = `market|${threadOf(s, false)?.key}`
      if (!m.has(k)) m.set(k, s)
    }
    return m
  }, [menu])
}
const ticketHref = (s: Strategy) => {
  const q = new URLSearchParams({ u: s.asset, s: s.id, talk: '1' })
  if (s.kind === 'loop') q.set('k', 'loop')
  return `#/${s.group}?${q}`
}
const strategyName = (s: Strategy) => (s.kind === 'loop' ? `${s.holds} / ${s.debt} loop` : s.holds)

export function Talk({ chainIds, protocols, menu }: { chainIds?: string; protocols?: string; menu: Strategy[] }) {
  const q = useRecentMessages({ chainIds, protocols })
  const msgs = React.useMemo(() => q.data?.pages.flatMap((p) => p.messages) ?? [], [q.data])
  const { profile } = useProfiles(msgs.map((m) => m.author))
  const bySubject = useBySubject(menu)

  return (
    <div className="feed">
      {q.isLoading && [0, 1, 2].map((i) => <div key={i} className="fcard"><Sk w="40%" /><Sk w="70%" /></div>)}
      {q.error && <div className="err">The social service could not be read: {(q.error as Error).message}</div>}
      {!q.isLoading && !q.error && !msgs.length && (
        <div className="empty">
          Nobody has said anything about a strategy{chainIds || protocols ? ' for this filter' : ''} yet. Open one from
          Earn — the thread sits in its ticket, and <b>Say why</b> beside the button posts there.
        </div>
      )}
      {msgs.map((m) => (
        <TalkCard key={m.id} m={m} profile={profile(m.author)} strategy={bySubject.get(`${m.subjectKind}|${m.subjectKey}`) ?? null} />
      ))}
      {q.hasNextPage && (
        <div className="feed-more">
          <button className="btn" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            {q.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}

function TalkCard({ m, profile, strategy: s }: { m: Message; profile: ReturnType<ReturnType<typeof useProfiles>['profile']>; strategy: Strategy | null }) {
  const loop = m.subjectKind === 'strategy' ? parseLoopKey(m.subjectKey) : null
  /** the market to fall back on when the menu has no row: the subject, or a loop's collateral leg */
  const market = loop?.long ?? (m.subjectKind === 'market' ? m.subjectKey : null)
  const chainId = s?.chainId ?? (market ? parseUid(market)?.chainId : undefined)
  const open = () => s && go(s.group, { u: s.asset, s: s.id, k: s.kind, talk: '1' })
  return (
    <article className="fcard tcard">
      <div className="tc-h">
        <Who account={m.author} profile={profile} size={26} />
        <Stake stake={m.authorStake} />
        <span className="sp" />
        {chainId && <ChainCorner chainId={chainId} />}
        <Ago ts={m.signedAt} />
      </div>
      <p className="tc-b">{m.body}</p>
      <div className="tc-f">
        {s ? (
          <button className="tc-s" onClick={open}>
            <span className="t50">on</span>
            {s.kind === 'loop' ? <Toks a={s.holds} b={s.debt} logoA={s.logoLong} logoB={s.logoShort} /> : <StratMark sym={s.holds} logo={s.logo} venueKey={s.protocolKey} brand={s.brand} size={18} />}
            <b>{strategyName(s)}</b>
            <span className="t50">{s.kind === 'loop' ? s.venue : s.via} · {chainLabel(s.chainId)}</span>
          </button>
        ) : (
          <span className="tc-s">
            <span className="t50">on</span>
            <b>{loop ? 'a loop' : 'a market'}</b>
            <span className="t50">{market ? parseUid(market)?.lender ?? market : ''}{loop ? ' · not in the menu' : ''}</span>
          </span>
        )}
        <span className="sp" />
        {!!m.replies && <span className="t50 tc-n">{m.replies} repl{m.replies === 1 ? 'y' : 'ies'}</span>}
        {s ? (
          <button className="btn sm pri" onClick={open}>Open strategy ›</button>
        ) : market ? (
          <a className="btn sm" href={marketHref(market)}>Open market</a>
        ) : null}
      </div>
    </article>
  )
}

/**
 * What one wallet has said, anywhere, newest first — its page's "Said". Each
 * row names what it was said about and leads there: a strategy's ticket on
 * its thread, a market, an asset, a desk, another wallet's wall.
 */
export function Said({ account, menu }: { account: string; menu: Strategy[] }) {
  const q = useAccountMessages(account)
  const bySubject = useBySubject(menu)
  const msgs = q.data?.messages ?? []
  if (!msgs.length) return null
  return (
    <section className="sec">
      <div className="sec-h"><h2>Said</h2><span className="sub">every comment this wallet signed, newest first</span></div>
      <div className="card">
        <div className="tape">
          {msgs.map((m) => {
            const where = whereSaid(m, bySubject.get(`${m.subjectKind}|${m.subjectKey}`) ?? null)
            return (
              <a key={m.id} className="said-row" href={where.href}>
                <span className="said-on t50">{m.parentId ? 'replied on' : 'on'} <b>{where.label}</b></span>
                <span className="said-b">“{m.body}”</span>
                <span className="tr-t"><Ago ts={m.signedAt} /></span>
              </a>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function whereSaid(m: Message, s: Strategy | null): { label: string; href?: string } {
  if (s) return { label: strategyName(s), href: ticketHref(s) }
  const k = m.subjectKey
  switch (m.subjectKind) {
    case 'market': return { label: parseUid(k)?.lender ?? 'a market', href: marketHref(k) }
    case 'strategy': { const l = parseLoopKey(k); return { label: 'a loop', href: l ? marketHref(l.long) : undefined } }
    case 'asset': return { label: k, href: tokenHref(k) }
    case 'curator': return { label: 'a desk', href: curatorHref(k) }
    case 'wallet': return { label: `${shortAddr(k)}'s wall`, href: walletHref(k) }
    case 'position': { const u = k.split('|')[2]; return { label: 'a position', href: u ? marketHref(u) : undefined } }
    default: return { label: 'a move' }
  }
}
