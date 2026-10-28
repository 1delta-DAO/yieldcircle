import React from 'react'
import type * as idx from '@yieldcircle/core/index/api'
import { boardWallets } from '@yieldcircle/core/model/lite'
import { liteHref, proHref, useApp, walletHref } from '../../state/AppState'
import { normAddr } from '@yieldcircle/core/model/address'
import { labelFor, shortAddr } from '@yieldcircle/core/identity/name'
import { useFeedPage, useRateLeaders, useTopEarners } from '@yieldcircle/app/index/queries'
import { useLiteMenu } from '@yieldcircle/app/lite'
import { useAccountMessages, useFollowers, useMyFollows, useProfile, useProfiles } from '../../social/queries'
import { Character } from '../../identity/character'
import { Ago, Face, FollowButton } from '../social-bits'
import { useAccountPnlBook } from '@yieldcircle/app/index/pnl'
import { AddrExplorerMenu, Sk, pct, usdShort } from '../bits'
import { useLiteByKey, WalletPositions } from './LiteBoard'
import { rowOfTx } from './LiteBits'
import { Moves } from './LiteSocial'

/**
 * A wallet's profile in Lite (docs/lite-social-search.md §4.3, fomo's profile): who it is, who
 * follows it — the people you follow first — one number from the board, what it runs with a Copy
 * on each, what it said and what it did lately. Every face in Lite opens it. Rates and dollars a
 * day, never a balance (owner's call, 2026-10-27). Your own address is You: the index never serves
 * the connected wallet's own positions (docs/apis.md).
 */
export function LiteProfile({ addr }: { addr: string }) {
  const { account } = useApp()
  const own = !!account && normAddr(account) === normAddr(addr)
  React.useEffect(() => { if (own) location.replace(liteHref('you')) }, [own])
  const p = useProfile(addr).data?.profile ?? null
  const name = labelFor(addr, p)
  const followers = useFollowers(addr)
  const f = useMyFollows(account)
  const mutual = (followers.data?.followers ?? []).map((x) => normAddr(x.account)).filter((a) => f.wallets.includes(a))
  const { profile } = useProfiles(mutual.slice(0, 3))
  // the board has no one-wallet read: the wallet is looked for on its rate board (the top 50, ranked
  // as Lite's board ranks it) and then on the dollars-a-day top 100, and ranked on the first it is on
  const byRate = useRateLeaders()
  const byDay = useTopEarners()
  const me = normAddr(addr)
  const rated = boardWallets(byRate.data?.rows ?? [], 'apr')
  const ir = rated.findIndex((r) => normAddr(r.account) === me)
  const find = (rows: idx.WalletEarnerRow[] | undefined) => (rows ?? []).find((r) => normAddr(r.account) === me) ?? null
  const id = (byDay.data?.rows ?? []).findIndex((r) => normAddr(r.account) === me)
  const row = find(byRate.data?.rows) ?? find(byDay.data?.rows)
  const rank = ir >= 0 ? { n: ir + 1, by: 'by rate' } : id >= 0 ? { n: id + 1, by: 'by dollars a day' } : null
  const board = { isLoading: byRate.isLoading && byDay.isLoading }
  const liteByKey = useLiteByKey()
  const L = useLiteMenu()
  const feed = useFeedPage({ accounts: normAddr(addr) }, 12)
  const moves = (feed.data?.txs ?? []).map((t) => ({ t, r: rowOfTx(t, L.rows) })).slice(0, 6)
  // the explorers: the chains it holds positions on, the biggest first (the book, the same read as
  // "What it runs"), then the board's chains, then the chains of what it did lately
  const book = useAccountPnlBook(addr)
  const chains = [
    ...[...(book.data?.positions ?? [])].sort((a, b) => (b.equityUsd ?? 0) - (a.equityUsd ?? 0)).map((x) => x.chainId),
    ...(row?.chains ?? []),
    ...(feed.data?.txs ?? []).map((t) => t.chainId),
  ]
  const said = useAccountMessages(addr)
  const msgs = (said.data?.messages ?? []).filter((m) => !m.deleted).slice(0, 4)
  if (own) return null
  const nFollowers = followers.data?.followers.length
  // a wallet the index has drawn nothing for (docs/lite-design-review.md §3.7): one plain line, not
  // two empty boxes (the feed's slow read is not waited for: its moves, when they come, lead the page)
  const runsNothing = !book.isLoading && !(book.data?.positions ?? []).length
  const nothingYet = runsNothing && !row && !byRate.isLoading && !byDay.isLoading && !moves.length && !msgs.length
  const lately = moves.length > 0 && (
    <section className="sec lite-sec">
      <div className="sec-h"><h2>Lately</h2></div>
      <div className="card"><Moves txs={moves} hideWho /></div>
    </section>
  )
  return (
    <div className="lite-page lite-profile">
      <header className="lite-prof-h">
        <Character addr={addr} avatarUrl={p?.avatarUrl} size={64} />
        <div className="lite-prof-n">
          <h1>{name.label}</h1>
          <div className="t50">
            <span className="lite-prof-addr">{shortAddr(addr)}<AddrExplorerMenu addr={addr} chainIds={chains} /></span>
            {p?.xHandle && <> · <a href={`https://x.com/${p.xHandle}`} target="_blank" rel="noopener">@{p.xHandle}</a></>}
          </div>
          <div className="lite-prof-c">
            <span><b>{nFollowers ?? '–'}</b> follower{nFollowers === 1 ? '' : 's'}</span>
            {mutual.length > 0 && (
              <span className="lite-mutual">
                <span className="ls-faces">{mutual.slice(0, 3).map((a) => <Face key={a} account={a} profile={profile(a)} size={18} />)}</span>
                followed by {mutual.length === 1 ? `${labelFor(mutual[0], profile(mutual[0])).label}` : `${labelFor(mutual[0], profile(mutual[0])).label} and ${mutual.length - 1} more`} you follow
              </span>
            )}
          </div>
        </div>
        <FollowButton kind="wallet" target={addr} />
      </header>

      {nothingYet ? (
        <div className="card lite-prof-empty">
          <b>Nothing on record for this wallet yet</b>
          <p className="t50">The index has drawn no position for it. A new one shows here within a few hours of opening; its explorers are under the address above.</p>
        </div>
      ) : <>
      <div className="lite-prof-stats">
        {board.isLoading ? <Sk w={220} h={40} /> : row ? (
          <>
            <div><b className="ok">{row.netAprPct != null ? pct(row.netAprPct, 1) : '–'}</b><small>a year on all its money</small></div>
            <div><b className="ok">{row.perDayUsd != null ? usdShort(row.perDayUsd) : '–'}</b><small>a day</small></div>
            <div><b>#{rank!.n}</b><small>on the board, {rank!.by}</small></div>
          </>
        ) : <p className="t50">Not in the board’s top 100 today.</p>}
      </div>

      {runsNothing && lately}
      <section className="sec lite-sec">
        <div className="sec-h"><h2>What it runs</h2></div>
        <div className="card lb-item open"><WalletPositions account={addr} liteByKey={liteByKey} me={false} foot={false} /></div>
      </section>
      </>}

      {msgs.length > 0 && (
        <section className="sec lite-sec">
          <div className="sec-h"><h2>What it said</h2></div>
          <div className="card lite-said">
            {msgs.map((m) => <div key={m.id} className="lite-said-r"><q>{m.body}</q><small className="t50"><Ago ts={m.signedAt} /></small></div>)}
          </div>
        </section>
      )}

      {!runsNothing && lately}

      <p className="lite-more t50"><a href={proHref(walletHref(addr))}>Every number on this wallet, in Pro ›</a></p>
    </div>
  )
}
