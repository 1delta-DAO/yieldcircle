/**
 * Lite's social layer (docs/lite-social-search.md): people on every surface, as fomo has them —
 * the moves of the people you follow or of the wallets with the best rates, each with the mover's own reason; who
 * is in a strategy, on its ticket; every face a door to a Lite profile. Nothing here fetches on its
 * own terms: the feed, the holders, the board and the threads are the hooks Pro reads.
 */
import React from 'react'
import { liteWalletHref, useApp } from '../../state/AppState'
import { followedFirst, type LiteRow } from '@yieldcircle/core/model/lite'
import { normAddr } from '@yieldcircle/core/model/address'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import type { ThreadRef } from '@yieldcircle/core/model/uid'
import type { TxBundle } from '@yieldcircle/core/index/types'
import { subjectOf } from '@yieldcircle/core/index/types'
import { useFeedPage, useHolders, useRateLeaders } from '@yieldcircle/app/index/queries'
import { useCounts, useLatest, useMyFollows, useProfiles, useThreadOf } from '../../social/queries'
import type { Message } from '../../social/types'
import { Ago, FollowButton, Who, describeBundle } from '../social-bits'
import { Sk, usdShort } from '../bits'
import { TxMoney, isDust, primaryLeg } from '../Feed'
import { Thread } from '../Thread'
import { writeSeen } from '../Alerts'
import { openRow, rowOfTx } from './LiteBits'

type Tab = 'following' | 'everyone'
/** how many of the board's top wallets "Everyone" watches: the ones that put real money to work */
const TOP_N = 40

/**
 * The moves on Home (fomo's feed, with its Following toggle). Following is what the people you
 * follow did; Everyone is what the wallets with the best rates did (the rate board, not the biggest
 * wallets — docs/rate-boards.md), only moves Lite can Copy and no dust,
 * so a first visit — no wallet, no follows — still opens on people. With `followingOnly` (You)
 * there is no toggle and nothing without follows.
 */
export function LiteMoves({ rows, account, limit = 8, title, followingOnly }: { rows: LiteRow[]; account: string | undefined; limit?: number; title?: string; followingOnly?: boolean }) {
  const { chainIds, allChains } = useApp()
  const chains = allChains ? undefined : chainIds.join(',')
  const f = useMyFollows(account)
  const has = !!account && f.wallets.length + f.markets.length > 0
  const [picked, setPicked] = React.useState<Tab | null>(null)
  const tab: Tab = followingOnly ? 'following' : picked ?? (has ? 'following' : 'everyone')
  const followed = useFeedPage({ follower: account, follow: 'all', chainIds: chains }, 40, has && tab === 'following')
  const top = useRateLeaders(tab === 'everyone')
  const me = account ? normAddr(account) : null
  const accounts = (top.data?.rows ?? []).map((r) => normAddr(r.account)).filter((a) => a !== me).slice(0, TOP_N)
  const everyone = useFeedPage({ accounts: accounts.join(','), chainIds: chains }, 80, tab === 'everyone' && accounts.length > 0)
  const feed = tab === 'following' ? followed : everyone
  const txs = (feed.data?.txs ?? [])
    .map((t) => ({ t, r: rowOfTx(t, rows) }))
    // Everyone shows what can be copied; Following shows everything the people you chose did
    .filter((x) => tab === 'following' || (x.r && !isDust(x.t)))
    // one move per wallet and strategy, the newest: a desk that tops up all day is one row, not six
    .filter((x, i, all) => all.findIndex((y) => subjectOf(y.t).account === subjectOf(x.t).account && (y.r?.s.id ?? y.t.txHash) === (x.r?.s.id ?? x.t.txHash)) === i)
    .slice(0, limit)
  // the moves of the people you follow are seen once they are on screen: the Home tab's dot goes
  React.useEffect(() => { if (tab === 'following' && txs.length) writeSeen(Date.now()) }, [tab, txs.length])
  if (followingOnly && !has) return null
  const loading = feed.isLoading || (tab === 'everyone' && top.isLoading)
  return (
    <section className="sec lite-sec">
      <div className="sec-h">
        <h2>{title ?? (tab === 'following' ? 'People you follow' : 'Moves by the best rates')}</h2>
        {!followingOnly && (
          <div className="seg lite-moves-tab" role="tablist" aria-label="Whose moves">
            <button role="tab" aria-selected={tab === 'following'} aria-pressed={tab === 'following'} onClick={() => setPicked('following')}>Following</button>
            <button role="tab" aria-selected={tab === 'everyone'} aria-pressed={tab === 'everyone'} onClick={() => setPicked('everyone')}>Everyone</button>
          </div>
        )}
      </div>
      <div className="card">
        {loading && <div className="empty"><Sk w={200} /></div>}
        {!loading && tab === 'following' && !has && <div className="empty t50">{account ? 'Follow someone and their moves show here, with a Copy on each. Everyone shows the wallets with the best rates.' : 'Connect a wallet to follow people. Everyone shows what the wallets with the best rates do.'}</div>}
        {!loading && (tab === 'everyone' || has) && !txs.length && <div className="empty t50">{tab === 'following' ? 'Nothing from them yet.' : 'No move to copy from the best rates right now.'}</div>}
        <Moves txs={txs} showFollow={tab === 'everyone'} />
      </div>
    </section>
  )
}

/** Move rows: who · what they did · the money · Copy, and under it the mover's own reason. */
export function Moves({ txs, showFollow, hideWho }: { txs: { t: TxBundle; r: LiteRow | null }[]; showFollow?: boolean; hideWho?: boolean }) {
  const { account } = useApp()
  const f = useMyFollows(account)
  const { profile } = useProfiles(txs.map((x) => subjectOf(x.t).account).filter(Boolean))
  const said = useReasons(txs)
  return (
    <div className="tape">{txs.map(({ t, r }) => {
      const l = primaryLeg(t), d = describeBundle(t), who = subjectOf(t).account
      const why = r ? said(r.s, who) : null
      const what = r ? r.title : l?.symbol ?? ''
      const follow = showFollow && who && !f.isFollowing('wallet', who)
      return (
        <div key={`${t.chainId}:${t.txHash}`} className="lite-move-w">
          <div className="lite-move">
            {/* what they did is the line under the name: it is the one thing a phone row must keep */}
            {hideWho
              ? <span className="lite-move-w-t"><b className={`verb ${d.cls}`}>{d.verb}</b> {what}</span>
              : <a className="lite-who" href={liteWalletHref(who)}><Who account={who} profile={profile(who)} idx={subjectOf(t)} size={24} plain sub={<><span className={`verb ${d.cls}`}>{d.verb}</span> {what}</>} /></a>}
            <span className="tr-v"><TxMoney t={t} l={l} short /><small className="t40"><Ago ts={t.blockTs} /></small></span>
            {follow && <FollowButton kind="wallet" target={who} small quiet label="+" />}
            {r && normAddr(who) !== normAddr(account ?? '') ? <button type="button" className="btn sm pri" onClick={() => openRow(r.s, { copy: who })}>Copy</button> : <span className="lite-nocopy" />}
          </div>
          {why && <div className="lite-why"><q>{why.body}</q></div>}
        </div>
      )
    })}</div>
  )
}

/** What each mover said on the strategy they moved in (Say why) — the mover's own, never a stranger's. */
function useReasons(txs: { t: TxBundle; r: LiteRow | null }[]) {
  const threadFor = useThreadOf()
  const subjects = txs.flatMap(({ t, r }) => {
    const th = r ? threadFor(r.s) : null
    const who = subjectOf(t).account
    return th && who ? [{ ...th, author: who }] : []
  })
  const latest = useLatest(subjects)
  return (s: Strategy, who: string): Message | null => {
    const th = threadFor(s)
    return th && who ? latest(th.kind, th.key, who) : null
  }
}

/**
 * Who's in it, on the Lite ticket (fomo's holders on a coin page): the biggest holders with the
 * people you follow first, each with what they said about it and a Copy; then the thread, folded.
 */
export function LiteWho({ s, uid, thread, heldBy }: { s: Strategy; uid: string | null; thread: ThreadRef | null; /** the proof's line: "n people run this · $x" */ heldBy: string }) {
  const { account } = useApp()
  const f = useMyFollows(account)
  const holders = useHolders(uid ?? undefined, undefined, 12)
  const mine = account ? normAddr(account) : null
  const all = (holders.data?.holders ?? []).filter((h) => normAddr(h.account) !== mine)
  const fset = React.useMemo(() => new Set(f.wallets.map((a) => a.toLowerCase())), [f.wallets])
  const rows = followedFirst(all, fset).slice(0, 5)
  const nFollowed = all.filter((h) => fset.has(h.account.toLowerCase())).length
  const { profile } = useProfiles(rows.map((h) => h.account))
  const latest = useLatest(thread ? rows.map((h) => ({ ...thread, author: h.account })) : [])
  const counts = useCounts(thread ? [thread] : [])
  const n = thread ? counts.count(thread.kind, thread.key) : 0
  const [talk, setTalk] = React.useState(false)
  if (!uid && !thread) return null
  return (
    <div className="tsec lite-whoin">
      <div className="ts-h">
        <span className="lbl">Who’s in it</span>
        <span className="sp" />
        {heldBy && <span className="t50">{heldBy}</span>}
      </div>
      {nFollowed > 0 && <div className="lite-whoin-f ok">{nFollowed === 1 ? 'Someone you follow runs this' : `${nFollowed} people you follow run this`}</div>}
      {holders.isLoading && <div className="lite-whoin-r"><Sk w={180} h={14} /></div>}
      {!holders.isLoading && !rows.length && <p className="foot t50">Nobody the index follows is in it yet.</p>}
      {rows.map((h) => {
        const why = thread ? latest(thread.kind, thread.key, h.account) : null
        const you = fset.has(h.account.toLowerCase())
        return (
          <div key={h.account} className="lite-whoin-r">
            <a className="lite-who" href={liteWalletHref(h.account)}>
              <Who account={h.account} profile={profile(h.account)} idx={h} size={24} plain sub={<>{you ? 'you follow · ' : ''}{h.amountUsd != null ? `${usdShort(h.amountUsd)} in it` : 'in it'}</>} />
            </a>
            {why && <q className="lite-whoin-q">{why.body}</q>}
            <button type="button" className="btn sm" onClick={() => openRow(s, { copy: h.account })}>Copy</button>
          </div>
        )
      })}
      {thread && (
        <div className="lite-whoin-talk">
          <button type="button" className="ts-more" aria-expanded={talk} onClick={() => setTalk(!talk)}>{talk ? 'Hide what people say' : n ? `What people say (${n}) ›` : 'Say something about it ›'}</button>
          {talk && <Thread kind={thread.kind} subjectKey={thread.key} compact max={4} placeholder={`What do you make of this ${s.kind === 'loop' ? 'loop' : 'one'}?`} />}
        </div>
      )}
    </div>
  )
}
