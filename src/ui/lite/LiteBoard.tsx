import React from 'react'
import { useQuery } from '@tanstack/react-query'
import * as idx from '../../index/api'
import { useAccountPnlBook } from '../../index/pnl'
import { useMyFollows, useProfiles } from '../../social/queries'
import { go, useApp, walletHref } from '../../state/AppState'
import { normAddr } from '../../model/address'
import { bookKeyOf } from '../../model/uid'
import { boardPositions, boardWallets, type BoardSort, type BoardWallet, type LiteRow } from '../../model/lite'
import { FollowButton, Who } from '../social-bits'
import { Sk, pct, usd, usdShort } from '../bits'
import { useLiteMenu } from './useLite'
import { openRow } from './LiteBits'

const SORTS: { id: BoardSort; word: string; why: string }[] = [
  { id: 'apr', word: 'Best rate', why: 'what each wallet earns a year on all its money, at today’s rates' },
  { id: 'perDay', word: 'Most a day', why: 'the dollars each wallet’s money earns a day, at today’s rates' },
]
/** the podium's colours (design tokens), drawn rather than an emoji: an emoji medal renders differently on every platform */
const MEDAL = ['gold', 'silver', 'bronze']

/**
 * Lite's leaderboard (docs/lite.md §6): real wallets, one number each — the rate they earn on
 * everything, or the dollars a day — read off the chain, never claimed. No lifetime total: a
 * wallet's PnL sum is mostly what its coins did against the dollar. Tap a wallet and its positions
 * open, each with what IT made, and a Copy where Lite carries the strategy.
 *
 * The same board Pro's Wallets view and the header's rank read (the index pre-warms both), so
 * the reader's own place here is the one their You page shows.
 */
export function LiteBoard({ sort }: { sort: BoardSort }) {
  const { account } = useApp()
  const L = useLiteMenu()
  const q = useQuery({
    // `earners-me` is the $/day board the header and You already read: one request for both
    queryKey: sort === 'perDay' ? ['earners-me'] : ['earners-lite', sort],
    queryFn: () => idx.walletEarners({ sort, people: true, limit: 100 }),
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const f = useMyFollows(account)
  const [mine, setMine] = React.useState(false)
  const only = mine ? new Set([...f.wallets, ...(account ? [normAddr(account)] : [])].map((a) => a.toLowerCase())) : undefined
  const rows = boardWallets(q.data?.rows ?? [], sort, only).slice(0, 50)
  const { profile } = useProfiles(rows.map((r) => r.account))
  const [open, setOpen] = React.useState<string | null>(null)
  const me = account ? rows.find((r) => normAddr(r.account) === normAddr(account)) : undefined
  // the Lite row each strategy key opens, for the positions' Copy
  const liteByKey = React.useMemo(() => {
    const m = new Map<string, LiteRow>()
    for (const r of L.rows) { const k = bookKeyOf(r.s); if (k) m.set(k.toLowerCase(), r) }
    return m
  }, [L.rows])
  return (
    <div className="lite-page lite-board">
      <div className="feed-h"><h1>Leaderboard</h1><span className="sp" /><span className="t50">real wallets, read off the chain</span></div>
      <div className="lite-board-bar">
        <div className="seg" role="tablist" aria-label="Rank by">
          {SORTS.map((x) => <button key={x.id} role="tab" aria-selected={sort === x.id} aria-pressed={sort === x.id} onClick={() => go('board', { t: x.id === 'apr' ? undefined : x.id })}>{x.word}</button>)}
        </div>
        {account && f.wallets.length > 0 && (
          <div className="seg" role="group" aria-label="Whose">
            <button aria-pressed={!mine} onClick={() => setMine(false)}>Everyone</button>
            <button aria-pressed={mine} onClick={() => setMine(true)}>People you follow</button>
          </div>
        )}
      </div>
      <p className="t50 lite-lens-why">{SORTS.find((x) => x.id === sort)!.why}. Tap a wallet to see each position and what it made.</p>
      {me && !mine && <div className="note lite-me">You are <b>#{me.rank}</b> · {sort === 'apr' ? `${pct(me.value, 1)} a year` : `${usdShort(me.value)} a day`}</div>}
      <div className="lboard">
        {q.isLoading ? [0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="lb-row sk"><Sk w={24} h={18} /><Sk w={26} h={26} /><Sk w={140} h={14} /><span className="sp" /><Sk w={60} h={18} /></div>)
          : q.error ? <div className="empty">The board could not be read right now.</div>
          : !rows.length ? <div className="empty">{mine ? 'Nobody you follow is on the board yet.' : 'Nobody on the board right now.'}</div>
          : rows.map((r) => <WalletRow key={r.account} r={r} sort={sort} profile={profile(r.account)} me={!!account && normAddr(r.account) === normAddr(account)} open={open === r.account} onToggle={() => setOpen(open === r.account ? null : r.account)} liteByKey={liteByKey} />)}
      </div>
    </div>
  )
}

function WalletRow({ r, sort, profile, me, open, onToggle, liteByKey }: { r: BoardWallet; sort: BoardSort; profile: ReturnType<ReturnType<typeof useProfiles>['profile']>; me: boolean; open: boolean; onToggle: () => void; liteByKey: Map<string, LiteRow> }) {
  return (
    <div className={`lb-item${open ? ' open' : ''}${me ? ' me' : ''}`}>
      <button type="button" className="lb-row" aria-expanded={open} onClick={onToggle}>
        <span className={`lb-rank${r.rank <= 3 ? ` top ${MEDAL[r.rank - 1]}` : ''}`} aria-label={`#${r.rank}`}>{r.rank}</span>
        <Who account={r.account} profile={profile} size={28} plain sub={`${r.positions} position${r.positions === 1 ? '' : 's'} · on ${usdShort(r.navUsd)}`} />
        <span className="sp" />
        <span className="lb-v ok">{sort === 'apr' ? pct(r.value, 1) : usdShort(r.value)}<small className="t50">{sort === 'apr' ? 'a year' : 'a day'}</small></span>
        <svg className="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && <WalletPositions account={r.account} liteByKey={liteByKey} me={me} />}
    </div>
  )
}

/** One wallet's positions, opened on a tap: each with what it made, and a Copy where Lite carries it. */
function WalletPositions({ account, liteByKey, me }: { account: string; liteByKey: Map<string, LiteRow>; me: boolean }) {
  const q = useAccountPnlBook(account)
  const ps = q.data ? boardPositions(q.data, (k) => liteByKey.get(k.toLowerCase())?.title ?? null) : []
  return (
    <div className="lb-pos">
      {q.isLoading ? <div className="lb-p"><Sk w={180} h={14} /></div>
        : !ps.length ? <div className="lb-p t50">No position with a record yet. The index draws each one within a few hours of opening.</div>
        : ps.map((p) => {
          const row = liteByKey.get(p.strategyKey.toLowerCase())
          return (
            <div key={p.key} className="lb-p">
              <span className="lb-pn"><b>{p.title}</b><small className="t50">{p.sub}{p.equityUsd != null ? ` · ${usdShort(p.equityUsd)} in it` : ''}{p.since ? ` · since ${new Date(p.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</small></span>
              <span className="lb-pv"><b className={p.pnlUsd >= 0 ? 'ok' : 'bad'}>{p.pnlUsd >= 0 ? '+' : '−'}{usd(Math.abs(p.pnlUsd))}</b>{p.aprPct != null && <small className="t50">{pct(p.aprPct, 1)} a year</small>}</span>
              {row && !me ? <button type="button" className="btn sm pri" onClick={() => openRow(row.s, { copy: account })}>Copy</button> : <span className="lb-nocopy" />}
            </div>
          )
        })}
      <div className="lb-foot">
        {!me && <FollowButton kind="wallet" target={account} small />}
        <span className="sp" />
        <a className="t50" href={walletHref(account)}>Their whole page ›</a>
      </div>
    </div>
  )
}
