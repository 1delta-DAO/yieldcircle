/**
 * The feed. One card per TRANSACTION, never per ledger row: a loop arrives as
 * a deposit and a borrow in the same tx and reads as "opened a loop", which is
 * the difference between a feed and a log. The index folds the legs
 * (`?group=tx`), so the card is one request.
 *
 * Three scopes:
 *   following  the follow graph, resolved in SQL by the index. A wallet that
 *              follows nobody gets an EMPTY feed — never the global one.
 *   menu       everyone, but only in markets this app can open in one tap.
 *              The default: a move you cannot act on is a log line.
 *   everyone   the whole tape.
 */
import React from 'react'
import { useApp } from '../state/AppState'
import { go, marketHref } from '../state/AppState'
import { useFeedPage } from '../index/queries'
import type { TxBundle, TxLeg } from '../index/types'
import { useCounts, useMyFollows, useProfiles } from '../social/queries'
import { positionKey } from '../social/api'
import { useSocialWrite } from '../social/sign'
import { useMenu } from './useMenu'
import { Ago, Comments, Money, Who, describeTx } from './social-bits'
import { indexChainLabel } from '../index/types'
import { Sk, Tok, pct } from './bits'
import { Thread } from './Thread'
import { chainLabel } from '../sdk/queries'
import type { Strategy } from '../model/strategies'

type Tab = 'following' | 'menu' | 'everyone'

export function Feed({ tab: tabIn }: { tab?: string }) {
  const { chain, chainIds } = useApp()
  const { account } = useSocialWrite()
  const follows = useMyFollows(account)
  const menu = useMenu()
  const tab: Tab = tabIn === 'following' || tabIn === 'everyone' ? tabIn : 'menu'
  const [limit, setLimit] = React.useState(40)
  React.useEffect(() => setLimit(40), [tab, chain])

  const q = tab === 'following'
    ? { follower: account, follow: 'all' as const, chainId: chain === 'all' ? undefined : chain }
    : { chainId: chain === 'all' ? undefined : chain }
  const feed = useFeedPage(q, limit, tab !== 'following' || !!account)

  const all = feed.data?.txs ?? []
  // "menu" is a client-side narrowing: the index has no uid-set filter, and the
  // menu is at most a few hundred uids, so this costs nothing and stays honest
  // about what it dropped.
  const inMenu = (t: TxBundle) => t.legs.some((l) => l.marketUid && menu.byUid.has(l.marketUid))
  const txs = tab === 'menu' ? all.filter(inMenu) : all
  const hidden = tab === 'menu' ? all.length - txs.length : 0

  const subjects = txs.map((t) => ({ kind: 'position' as const, key: cardKey(t) })).filter((s) => !!s.key)
  const counts = useCounts(subjects)
  const { profile } = useProfiles(txs.map((t) => t.accounts[0]).filter(Boolean))
  const [open, setOpen] = React.useState<string | null>(null)

  return (
    <>
      <div className="feed-h">
        <div className="seg">
          <button aria-pressed={tab === 'following'} onClick={() => go('feed', { t: 'following' })}>Following{follows.wallets.length + follows.markets.length > 0 && <span className="c">{follows.wallets.length + follows.markets.length}</span>}</button>
          <button aria-pressed={tab === 'menu'} onClick={() => go('feed', { t: 'menu' })}>In the menu</button>
          <button aria-pressed={tab === 'everyone'} onClick={() => go('feed', { t: 'everyone' })}>Everyone</button>
        </div>
        <span className="sp" />
        <span className="sub t50">{chain === 'all' ? `${chainIds.length} chains` : chainLabel(chain)} · live</span>
      </div>

      {tab === 'following' && !account && <div className="note">Connect a wallet to see what the people and markets you follow are doing. Reading anyone is possible because the chain is public; the feed is just the part you chose.</div>}
      {tab === 'following' && account && !follows.isLoading && !follows.wallets.length && !follows.markets.length && (
        <div className="note"><b>You follow nobody yet.</b> This feed stays empty until you do — it is never quietly replaced by the global one. Open a wallet or a market and press Follow, or start from <a className="pri" href="#/board">the leaderboard</a>.</div>
      )}
      {feed.error && <div className="err">The index could not be read: {(feed.error as Error).message}</div>}

      <div className="feed">
        {feed.isLoading && !txs.length && [0, 1, 2, 3].map((i) => <div key={i} className="fcard"><Sk w="60%" /><Sk w="40%" /></div>)}
        {!feed.isLoading && !txs.length && !feed.error && (
          <div className="empty">Nothing here yet{tab === 'menu' ? ' in the markets this app can open' : ''}.</div>
        )}
        {txs.map((t) => (
          <Card key={`${t.chainId}:${t.txHash}`} tx={t} profile={profile(t.accounts[0] ?? '')} strategy={menu.forUid(primaryLeg(t)?.marketUid)}
            comments={counts.count('position', cardKey(t))} open={open === t.txHash} onToggle={() => setOpen(open === t.txHash ? null : t.txHash)} />
        ))}
      </div>

      {txs.length > 0 && (
        <div className="feed-more">
          <button className="btn" onClick={() => setLimit((n) => n + 60)} disabled={feed.isFetching}>{feed.isFetching ? 'Loading…' : 'Load more'}</button>
          {hidden > 0 && <span className="foot">{hidden} more move{hidden > 1 ? 's' : ''} in markets this app has no row for — <button className="lnk" onClick={() => go('feed', { t: 'everyone' })}>show everyone</button></span>}
        </div>
      )}
    </>
  )
}

/** The leg a card is ABOUT: the biggest supply-side leg, else the biggest leg. */
export function primaryLeg(t: TxBundle): TxLeg | undefined {
  const size = (l: TxLeg) => Math.abs(l.amountUsd ?? 0)
  const supply = t.legs.filter((l) => l.side !== 'borrow')
  const pick = (supply.length ? supply : t.legs).slice().sort((a, b) => size(b) - size(a))[0]
  return pick ?? t.legs[0]
}
/** The card's thread: the POSITION, which is stable and is what a comment written at execution time is posted against. */
export function cardKey(t: TxBundle): string {
  const l = primaryLeg(t)
  if (!l?.marketUid) return ''
  return positionKey({ chainId: t.chainId, account: l.account, marketUid: l.marketUid, side: l.side, posId: l.posId })
}

function Card({ tx, profile, strategy, comments, open, onToggle }: {
  tx: TxBundle
  profile: ReturnType<ReturnType<typeof useProfiles>['profile']>
  strategy: Strategy | null
  comments: number
  open: boolean
  onToggle: () => void
}) {
  const leg = primaryLeg(tx)
  const who = tx.accounts[0] ?? leg?.account ?? ''
  const { verb, cls } = describeTx(tx.kinds)
  const borrow = tx.legs.find((l) => l.side === 'borrow')
  const key = cardKey(tx)
  return (
    <article className="fcard">
      <div className="fc-h">
        <Who account={who} profile={profile} size={30} idx={leg} />
        <span className="sp" />
        <Ago ts={tx.blockTs} />
      </div>
      <div className="fc-b">
        <span className={`verb ${cls}`}>{verb}</span>
        {leg && (
          <a className="fc-m" href={leg.marketUid ? marketHref(leg.marketUid) : undefined}>
            <Tok sym={leg.symbol ?? '?'} logo={leg.assetLogo ?? undefined} size={20} />
            <b>{leg.marketName ?? leg.symbol ?? 'a market'}</b>
            <span className="t50">{leg.lenderName ?? leg.lenderKey}</span>
          </a>
        )}
      </div>
      <div className="fc-n">
        <span className="big"><Money usd={tx.volumeUsd ?? leg?.amountUsd} status={leg?.usdStatus} fromIndex={leg?.amountFromIndex} amount={leg?.amount} symbol={leg?.symbol} /></span>
        {borrow && borrow !== leg && <span className="t50">· owes <Money usd={borrow.amountUsd} status={borrow.usdStatus} amount={borrow.amount} symbol={borrow.symbol} short /></span>}
        {leg?.apr != null && <span className="ok">· {pct(leg.apr)}</span>}
        <span className="t40">· {indexChainLabel(tx.chainId, chainLabel)}</span>
        {tx.nRows > 1 && <span className="t40">· {tx.nRows} legs</span>}
      </div>
      <div className="fc-a">
        <Comments n={comments} onClick={onToggle} active={open} />
        <span className="sp" />
        {strategy
          ? <button className="btn sm pri" onClick={() => go(strategy.group, { u: strategy.asset, s: strategy.id, k: strategy.kind, copy: who })}>Copy this ›</button>
          : leg?.marketUid
            ? <a className="btn sm" href={marketHref(leg.marketUid)}>Open market</a>
            : null}
      </div>
      {open && key && (
        <div className="fc-t">
          <Thread kind="position" subjectKey={key} compact placeholder="What do you make of this?" />
        </div>
      )}
    </article>
  )
}
