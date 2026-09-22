/**
 * The stream: the ledger as it happens, dense enough to glance at.
 *
 * Deliberately NOT the feed. A feed card is something you read — a face, a
 * sentence, a reason, a Copy button. A stream row is something you notice:
 * one line, one verb, one number, ticking. Put a feed on a home page and it
 * pushes everything else below the fold; put a stream there and the page
 * still has a shape while telling you the place is alive.
 */
import React from 'react'
import { go, marketHref, walletHref } from '../state/AppState'
import { useApp } from '../state/AppState'
import { useFeedPage } from '../index/queries'
import type { TxBundle } from '../index/types'
import { useMyFollows, useProfiles } from '../social/queries'
import { useSocialWrite } from '../social/sign'
import { Ago, Money, Who, describeTx } from './social-bits'
import { Sk } from './bits'
import { primaryLeg } from './Feed'
import { useMenu } from './useMenu'

type Scope = 'menu' | 'following' | 'everyone'

export function Stream({ rows = 12 }: { rows?: number }) {
  const { chain } = useApp()
  const { account } = useSocialWrite()
  const follows = useMyFollows(account)
  const menu = useMenu()
  const canFollow = follows.wallets.length + follows.markets.length > 0
  const [scope, setScope] = React.useState<Scope>('menu')
  // a wallet that follows nobody would get an empty stream, which on a home
  // page reads as "broken" rather than "you follow nobody" — so the default
  // only becomes `following` once there is something to follow
  React.useEffect(() => { if (canFollow) setScope('following') }, [canFollow])

  const q = useFeedPage(
    scope === 'following'
      ? { follower: account, follow: 'all' as const, chainId: chain === 'all' ? undefined : chain }
      : { chainId: chain === 'all' ? undefined : chain },
    scope === 'menu' ? rows * 4 : rows * 2,
    scope !== 'following' || !!account,
  )
  const all = q.data?.txs ?? []
  const inMenu = (t: TxBundle) => t.legs.some((l) => l.marketUid && menu.byUid.has(l.marketUid))
  const list = (scope === 'menu' ? all.filter(inMenu) : all).slice(0, rows)
  const { profile } = useProfiles(list.map((t) => t.accounts[0]).filter(Boolean))

  return (
    <section className="sec stream-sec">
      <div className="sec-h">
        <h2>The stream</h2>
        <span className="sp" />
        <div className="seg sm">
          {canFollow && <button aria-pressed={scope === 'following'} onClick={() => setScope('following')}>following</button>}
          <button aria-pressed={scope === 'menu'} onClick={() => setScope('menu')}>in the menu</button>
          <button aria-pressed={scope === 'everyone'} onClick={() => setScope('everyone')}>everyone</button>
        </div>
      </div>
      <div className="card stream">
        {q.isLoading && !list.length && [0, 1, 2, 3, 4].map((i) => <div key={i} className="srow"><Sk w="60%" /></div>)}
        {!q.isLoading && !list.length && (
          <div className="empty">
            {scope === 'following' ? 'Nobody you follow has moved yet.' : 'Nothing on the selected chains yet.'}
          </div>
        )}
        {list.map((t) => {
          const l = primaryLeg(t)
          const d = describeTx(t.kinds)
          const who = t.accounts[0] ?? l?.account ?? ''
          return (
            <a key={`${t.chainId}:${t.txHash}`} className="srow" href={l?.marketUid ? marketHref(l.marketUid) : walletHref(who)}>
              <Who account={who} profile={profile(who)} size={22} idx={l} plain />
              <span className={`verb ${d.cls}`}>{d.verb}</span>
              <span className="s-m">{l?.marketName ?? l?.symbol ?? '—'}<span className="t40"> {l?.lenderName ?? ''}</span></span>
              <span className="s-v"><Money usd={t.volumeUsd ?? l?.amountUsd} status={l?.usdStatus} fromIndex={l?.amountFromIndex} amount={l?.amount} symbol={l?.symbol} short /></span>
              <span className="s-t"><Ago ts={t.blockTs} /></span>
            </a>
          )
        })}
      </div>
      <button className="stream-more" onClick={() => go('feed', { t: scope === 'following' ? 'following' : scope })}>
        Open the full feed ›
      </button>
    </section>
  )
}

/**
 * The pulse: one line at the top of the page that changes. It is the smallest
 * possible proof that this is a live place and not a listing — and it costs
 * nothing, because it reads the stream's own query.
 */
export function Pulse() {
  const { chain } = useApp()
  const q = useFeedPage({ chainId: chain === 'all' ? undefined : chain }, 12)
  const txs = q.data?.txs ?? []
  const [i, setI] = React.useState(0)
  React.useEffect(() => {
    if (txs.length < 2) return
    const t = setInterval(() => setI((n) => (n + 1) % Math.min(txs.length, 8)), 4500)
    return () => clearInterval(t)
  }, [txs.length])
  const t = txs[Math.min(i, Math.max(0, txs.length - 1))]
  const l = t ? primaryLeg(t) : undefined
  const d = t ? describeTx(t.kinds) : null
  return (
    <div className="pulse" aria-live="off">
      <span className="dot" />
      <span className="p-lbl">live</span>
      {t && l ? (
        <a className="p-body" key={t.txHash} href={l.marketUid ? marketHref(l.marketUid) : '#/feed'}>
          <Who account={t.accounts[0] ?? l.account} size={18} plain />
          <span className={`verb ${d!.cls}`}>{d!.verb}</span>
          <span className="t70">{l.marketName ?? l.symbol}</span>
          <span className="mono"><Money usd={t.volumeUsd ?? l.amountUsd} amount={l.amount} symbol={l.symbol} short /></span>
          <Ago ts={t.blockTs} />
        </a>
      ) : (
        <span className="p-body t40">{q.isLoading ? 'reading the index…' : 'nothing on the selected chains'}</span>
      )}
      <span className="sp" />
      <a className="p-all" href="#/feed">all activity ›</a>
    </div>
  )
}
