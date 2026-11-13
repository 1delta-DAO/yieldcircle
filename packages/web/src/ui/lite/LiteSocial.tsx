/**
 * Lite's social layer (docs/lite-social-search.md): people on every surface, as fomo has them —
 * the moves of the people you follow or of the wallets with the best rates, each with the mover's own reason; who
 * is in a strategy, on its ticket; every face a door to a Lite profile. Nothing here fetches on its
 * own terms: the feed, the holders, the board and the threads are the hooks Pro reads.
 */
import React from 'react'
import { liteWalletHref, useApp } from '../../state/AppState'
import type { LiteRow } from '@yieldcircle/core/model/lite'
import { normAddr } from '@yieldcircle/core/model/address'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import type { ThreadRef } from '@yieldcircle/core/model/uid'
import type { TxBundle } from '@yieldcircle/core/index/types'
import { subjectOf } from '@yieldcircle/core/index/types'
import { useWhoIsIn } from '@yieldcircle/app/social/whoIsIn'
import { useLiteMoves, useMoveReasons } from '@yieldcircle/app/liteMoves'
import { useMyFollows, useProfiles } from '../../social/queries'
import { Ago, FollowButton, Who, describeBundle } from '../social-bits'
import { Sk, usdShort } from '../bits'
import { TxMoney, primaryLeg } from '../Feed'
import { Thread } from '../Thread'
import { writeSeen } from '../Alerts'
import { openRow } from './LiteBits'
import { Boundary } from '../Boundary'

/**
 * The moves on Home (fomo's feed, with its Following toggle). Following is what the people you
 * follow did; Everyone is what the wallets with the best rates did (the rate board, not the biggest
 * wallets — docs/rate-boards.md), only moves Lite can Copy and no dust — or, when none of theirs
 * is Lite's, anyone's moves in Lite's markets ("Moves you can copy"),
 * so a first visit — no wallet, no follows — still opens on people. With `followingOnly` (You)
 * there is no toggle and nothing without follows.
 */
export function LiteMoves({ rows, account, limit = 8, title, followingOnly }: { rows: LiteRow[]; account: string | undefined; limit?: number; title?: string; followingOnly?: boolean }) {
  const { chainIds, allChains } = useApp()
  const { tab, setTab: setPicked, has, txs, loading, from } = useLiteMoves({ rows, account, limit, chains: allChains ? undefined : chainIds.join(','), followingOnly })
  // the moves of the people you follow are seen once they are on screen: the Home tab's dot goes
  React.useEffect(() => { if (tab === 'following' && txs.length) writeSeen(Date.now()) }, [tab, txs.length])
  if (followingOnly && !has) return null
  return (
    <section className="sec lite-sec">
      <div className="sec-h">
        <h2>{title ?? (tab === 'following' ? 'People you follow' : from === 'menu' ? 'Moves you can copy' : 'Moves by the best rates')}</h2>
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
  const said = useMoveReasons(txs)
  return (
    <div className="tape">{txs.map(({ t, r }) => (
      // a move that throws in render is skipped, not the tape (tickets/0022 A3)
      <Boundary key={`${t.chainId}:${t.txHash}`} name="move row">
        <MoveRow t={t} r={r} account={account} said={said} profile={profile} follows={(w) => f.isFollowing('wallet', w)} showFollow={showFollow} hideWho={hideWho} />
      </Boundary>
    ))}</div>
  )
}

function MoveRow({ t, r, account, said, profile, follows, showFollow, hideWho }: { t: TxBundle; r: LiteRow | null; account: string | undefined; said: ReturnType<typeof useMoveReasons>; profile: ReturnType<typeof useProfiles>['profile']; follows: (who: string) => boolean; showFollow?: boolean; hideWho?: boolean }) {
  const l = primaryLeg(t), d = describeBundle(t), who = subjectOf(t).account
  const why = r ? said(r.s, who) : null
  const what = r ? r.title : l?.symbol ?? ''
  const follow = showFollow && who && !follows(who)
  return (
    <div className="lite-move-w">
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
}

/**
 * Who's in it, on the Lite ticket (fomo's holders on a coin page): the biggest holders with the
 * people you follow first, each with what they said about it and a Copy; then the thread, folded.
 */
export function LiteWho({ s, uid, thread, heldBy }: { s: Strategy; uid: string | null; thread: ThreadRef | null; /** the proof's line: "n people run this · $x" */ heldBy: string }) {
  const { account } = useApp()
  const w = useWhoIsIn(uid, thread, account)
  const { rows, nFollowed, profile, n } = w
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
      {w.isLoading && <div className="lite-whoin-r"><Sk w={180} h={14} /></div>}
      {!w.isLoading && !rows.length && <p className="foot t50">Nobody the index follows is in it yet.</p>}
      {rows.map((h) => {
        const why = w.said(h.account)
        const you = w.follows(h.account)
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
