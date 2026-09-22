/**
 * What happened while you were away.
 *
 * Computed in the browser from the following feed and the follower list, with
 * a last-seen mark in localStorage. That is deliberate for a first version: it
 * needs no job, no table and no push permission, and it is already the useful
 * half — a yield app's pull is not a pump, it is "someone you follow moved"
 * and "your rate changed". The server-side half (`social.alerts` +
 * `social.notifications`, delivery endpoints) is what makes it arrive when the
 * tab is closed.
 */
import React from 'react'
import { useApp, marketHref } from '../state/AppState'
import { useFeedPage } from '../index/queries'
import { useFollowers, useMyFollows, useProfiles } from '../social/queries'
import { useSocialWrite } from '../social/sign'
import { Ago, Money, Who, describeTx } from './social-bits'
import { Sk } from './bits'
import { primaryLeg } from './Feed'

const SEEN = 'yieldcircle.alerts.seen'
const readSeen = (): number => { try { return Number(localStorage.getItem(SEEN)) || 0 } catch { return 0 } }
const writeSeen = (t: number) => { try { localStorage.setItem(SEEN, String(t)) } catch { /* private mode */ } }

/** How many unseen items there are — the dot in the nav reads this. */
export function useUnseen(): number {
  const { account } = useSocialWrite()
  const f = useMyFollows(account)
  const has = f.wallets.length + f.markets.length > 0
  const feed = useFeedPage({ follower: account, follow: 'all' }, 40, !!account && has)
  const seen = readSeen()
  return (feed.data?.txs ?? []).filter((t) => Date.parse(t.blockTs) > seen).length
}

export function Alerts() {
  const { chainIds, allChains } = useApp()
  const { account } = useSocialWrite()
  const f = useMyFollows(account)
  const followers = useFollowers(account)
  const has = f.wallets.length + f.markets.length > 0
  const feed = useFeedPage({ follower: account, follow: 'all', chainIds: allChains ? undefined : chainIds.join(',') }, 60, !!account && has)
  const txs = feed.data?.txs ?? []
  const { profile } = useProfiles(txs.map((t) => t.accounts[0]).filter(Boolean))

  const [seen] = React.useState(readSeen)
  React.useEffect(() => { if (txs.length) writeSeen(Date.now()) }, [txs.length])

  if (!account) return <div className="note">Connect a wallet to see what the people and markets you follow have been doing.</div>
  if (!has) return <div className="note"><b>Nothing to watch yet.</b> Follow a wallet or a market and their moves collect here. <a className="pri" href="#/board">The leaderboard</a> is a good place to start.</div>

  const fresh = txs.filter((t) => Date.parse(t.blockTs) > seen)
  const older = txs.filter((t) => Date.parse(t.blockTs) <= seen)
  const newFollowers = (followers.data?.followers ?? []).filter((x) => Date.parse(x.createdAt ?? '') > seen)

  return (
    <>
      <div className="feed-h"><h1>Alerts</h1><span className="sp" /><span className="sub t50">{f.wallets.length} wallet{f.wallets.length === 1 ? '' : 's'} · {f.markets.length} market{f.markets.length === 1 ? '' : 's'}</span></div>
      {newFollowers.length > 0 && (
        <div className="card pad" style={{ marginBottom: 14 }}>
          <span className="lbl">New followers</span>
          <div className="faces">{newFollowers.map((x) => <Who key={x.account} account={x.account} size={26} />)}</div>
        </div>
      )}
      <Group title="Since you last looked" rows={fresh} profile={profile} loading={feed.isLoading} empty="Nothing new." />
      {older.length > 0 && <Group title="Earlier" rows={older} profile={profile} loading={false} empty="" />}
    </>
  )
}

function Group({ title, rows, profile, loading, empty }: {
  title: string
  rows: ReturnType<typeof useFeedPage>['data'] extends infer T ? (T extends { txs: infer R } ? R : never) : never
  profile: ReturnType<typeof useProfiles>['profile']
  loading: boolean
  empty: string
}) {
  return (
    <section className="sec" style={{ marginTop: 18 }}>
      <div className="sec-h"><h2>{title}</h2></div>
      <div className="card">
        {loading && <div className="empty"><Sk w={200} /></div>}
        {!loading && !rows.length && empty && <div className="empty">{empty}</div>}
        <div className="tape">{rows.map((t) => {
          const l = primaryLeg(t), d = describeTx(t.kinds)
          return (
            <a key={`${t.chainId}:${t.txHash}`} className="tape-row alert" href={l?.marketUid ? marketHref(l.marketUid) : `#/w/${t.accounts[0]}`}>
              <Who account={t.accounts[0] ?? ''} profile={profile(t.accounts[0] ?? '')} size={22} plain />
              <span className={`verb ${d.cls}`}>{d.verb}</span>
              <span className="tr-m">{l?.marketName ?? l?.symbol ?? ''} <span className="t50">{l?.lenderName ?? ''}</span></span>
              <span className="tr-v"><Money usd={t.volumeUsd ?? l?.amountUsd} status={l?.usdStatus} amount={l?.amount} symbol={l?.symbol} short /></span>
              <span className="tr-t"><Ago ts={t.blockTs} /></span>
            </a>
          )
        })}</div>
      </div>
    </section>
  )
}
