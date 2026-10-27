import React from 'react'
import { useQuery } from '@tanstack/react-query'
import * as idx from '@yieldcircle/core/index/api'
import { useAccountPnlBook } from '@yieldcircle/app/index/pnl'
import { useMyFollows, useProfiles } from '../../social/queries'
import { go, useApp, walletHref } from '../../state/AppState'
import { normAddr } from '@yieldcircle/core/model/address'
import { bookKeyOf } from '@yieldcircle/core/model/uid'
import { boardPositions, boardStrategies, boardWallets, type BoardSort, type BoardStrategy, type BoardWallet, type LiteRow } from '@yieldcircle/core/model/lite'
import { GROUPS } from '@yieldcircle/core/model/assets'
import { Face } from '../social-bits'
import { FollowButton, Who } from '../social-bits'
import { Sk, Tok, pct, usd, usdShort } from '../bits'
import { useLiteMenu } from '@yieldcircle/app/lite'
import { openRow } from './LiteBits'

const SORTS: { id: BoardSort; word: string; why: string }[] = [
  { id: 'apr', word: 'Best rate', why: 'what each wallet earns a year on all its money, at today’s rates' },
  { id: 'perDay', word: 'Most a day', why: 'the dollars each wallet’s money earns a day, at today’s rates' },
]
/**
 * What the money is held in — Pro's exposure chips (pos-indexer tickets/0072), the three Lite
 * names: a board across every money ranks whatever odd token pays most today on top, where a
 * reader asks "what is the best on my dollars".
 */
const HELD: { id: idx.ExposureChip | undefined; word: string; title: string }[] = [
  { id: undefined, word: 'All', title: 'every position' },
  { id: 'usd', word: 'Dollars', title: 'dollars and their savings, PTs and vaults' },
  { id: 'eth', word: 'ETH', title: 'ether and staked ether — whatever is borrowed against it' },
  { id: 'btc', word: 'BTC', title: 'bitcoin wrappers and staked bitcoin' },
]
export const liteHeld = (x: string | undefined) => HELD.find((c) => c.id === x)?.id
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
export function LiteBoard({ sort, by, held }: { sort: BoardSort; /** who earns, or what is run */ by: 'wallet' | 'strategy'; held?: idx.ExposureChip }) {
  const L = useLiteMenu()
  // the Lite row each strategy key opens, for the Copy and the words
  const liteByKey = React.useMemo(() => {
    const m = new Map<string, LiteRow>()
    for (const r of L.rows) { const k = bookKeyOf(r.s); if (k) m.set(k.toLowerCase(), r) }
    return m
  }, [L.rows])
  // two components, not one with a branch: each view has its own hooks
  return by === 'strategy' ? <Strategies sort={sort} held={held} liteByKey={liteByKey} /> : <Wallets sort={sort} held={held} liteByKey={liteByKey} />
}

function Wallets({ sort, held, liteByKey }: { sort: BoardSort; held?: idx.ExposureChip; liteByKey: Map<string, LiteRow> }) {
  const { account } = useApp()
  const q = useQuery({
    // `earners-me` is the $/day board the header and You already read: one request for both
    queryKey: sort === 'perDay' && !held ? ['earners-me'] : ['earners-lite', sort, held ?? 'all'],
    queryFn: () => idx.walletEarners({ sort, people: true, exposure: held, limit: 100 }),
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
  return (
    <div className="lite-page lite-board">
      <BoardHead by="wallet" sort={sort} held={held} />
      <div className="lite-board-bar">
        <SortSeg by="wallet" sort={sort} held={held} />
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
          : !rows.length ? <div className="empty">{mine ? 'Nobody you follow is on the board yet.' : held ? 'Nobody on the board in this money right now.' : 'Nobody on the board right now.'}</div>
          : rows.map((r) => <WalletRow key={r.account} r={r} sort={sort} profile={profile(r.account)} me={!!account && normAddr(r.account) === normAddr(account)} open={open === r.account} onToggle={() => setOpen(open === r.account ? null : r.account)} liteByKey={liteByKey} />)}
      </div>
    </div>
  )
}

function WalletRow({ r, sort, profile, me, open, onToggle, liteByKey }: { r: BoardWallet; sort: BoardSort; profile: ReturnType<ReturnType<typeof useProfiles>['profile']>; me: boolean; open: boolean; onToggle: () => void; liteByKey: Map<string, LiteRow> }) {
  return (
    <div className={`lb-item${open ? ' open' : ''}${me ? ' me' : ''}`}>
      <button type="button" className="lb-row" aria-expanded={open} onClick={onToggle}>
        <Rank n={r.rank} />
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

/** The title and the Strategies · Wallets switch, shared by both views; strategies are the default (what is run, before who runs it). */
function BoardHead({ by, sort, held }: { by: 'wallet' | 'strategy'; sort: BoardSort; held?: idx.ExposureChip }) {
  const t = sort === 'apr' ? undefined : sort
  const x = held
  return (
    <div className="feed-h">
      <h1>Leaderboard</h1>
      <div className="seg" role="tablist" aria-label="Wallets or strategies">
        <button role="tab" aria-selected={by === 'strategy'} aria-pressed={by === 'strategy'} onClick={() => go('board', { t, x })}>Strategies</button>
        <button role="tab" aria-selected={by === 'wallet'} aria-pressed={by === 'wallet'} onClick={() => go('board', { by: 'wallet', t, x })}>Wallets</button>
      </div>
      <span className="sp" /><span className="t50 hide-m">real wallets, read off the chain</span>
    </div>
  )
}
function SortSeg({ by, sort, held }: { by: 'wallet' | 'strategy'; sort: BoardSort; held?: idx.ExposureChip }) {
  const nav = (t: BoardSort, x: idx.ExposureChip | undefined) => go('board', { by: by === 'wallet' ? 'wallet' : undefined, t: t === 'apr' ? undefined : t, x })
  return (
    <>
      <div className="seg" role="tablist" aria-label="Rank by">
        {SORTS.map((x) => <button key={x.id} role="tab" aria-selected={sort === x.id} aria-pressed={sort === x.id} onClick={() => nav(x.id, held)}>{x.word}</button>)}
      </div>
      <div className="denoms lite-held" role="group" aria-label="What the money is held in">
        {HELD.map((c) => <button key={c.word} className="dchip" aria-pressed={held === c.id} title={c.title} onClick={() => nav(sort, c.id)}>{c.word}</button>)}
      </div>
    </>
  )
}

const STRAT_WHY: Record<BoardSort, string> = {
  apr: 'what everyone in the strategy earns together, a year, at today’s rates',
  perDay: 'the dollars a day everyone in the strategy earns together: where the money is',
}

/**
 * What is RUN, not who runs it twice (docs/board-strategies.md): one row per strategy, in Lite's
 * words, with the crowd behind it. The best one is the hero — its money's colour, the rate large,
 * the faces of who holds it — and every row below carries a bar against it, so the page reads as
 * a ranking before a single number is read. Copy opens Lite's ticket where Lite carries it.
 */
function Strategies({ sort, held, liteByKey }: { sort: BoardSort; held?: idx.ExposureChip; liteByKey: Map<string, LiteRow> }) {
  const { account } = useApp()
  const q = useQuery({
    queryKey: ['earners', 'strategy', sort, 'default', true, 'all', held ?? 'all', 'all', 'all', 50] as const,
    queryFn: () => idx.strategyBoard({ sort, people: true, exposure: held, limit: 50 }),
    staleTime: 60_000,
    retry: 1,
  })
  const colorOf = (g: string) => GROUPS.find((x) => x.id === g)?.color ?? '#8fa6ff'
  const rows = React.useMemo(() => boardStrategies(q.data?.rows ?? [], sort, (k) => {
    const r = liteByKey.get(k.toLowerCase())
    if (!r) return null
    const s = r.s
    return { title: r.title, sub: r.sub, color: colorOf(s.group), held: s.kind === 'loop' ? { symbol: s.holds, logo: s.logoLong } : { symbol: s.assetSymbol, logo: s.tokenLogo ?? s.logo }, debt: s.kind === 'loop' ? { symbol: s.debt, logo: s.logoShort } : null }
  }), [q.data, sort, liteByKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const top = rows[0]
  const fmt = (v: number) => (sort === 'apr' ? pct(v, 1) : usdShort(v))
  const unit = sort === 'apr' ? 'a year' : 'a day'
  const copy = (s: BoardStrategy) => { const r = liteByKey.get(s.key.toLowerCase()); if (r) openRow(r.s, { copy: s.best?.account }) }
  const canCopy = (s: BoardStrategy) => liteByKey.has(s.key.toLowerCase()) && (!account || normAddr(s.best?.account ?? '') !== normAddr(account))
  return (
    <div className="lite-page lite-board">
      <BoardHead by="strategy" sort={sort} held={held} />
      <div className="lite-board-bar"><SortSeg by="strategy" sort={sort} held={held} /></div>
      <p className="t50 lite-lens-why">{STRAT_WHY[sort]}. Copy opens the same strategy at the best holder’s leverage, your own size.</p>
      {q.isLoading ? <div className="lstrat"><div className="ls-hero" aria-hidden><Sk w={120} h={12} /><Sk w={220} h={26} /><div className="ls-rate"><Sk w={140} h={44} /></div></div>{[0, 1, 2].map((i) => <div key={i} className="ls-row sk"><Sk w={24} h={18} /><Sk w={36} h={36} /><Sk w={160} h={14} /><Sk w={70} h={18} /></div>)}</div>
        : q.error ? <div className="empty">The board could not be read right now.</div>
        : !top ? <div className="empty">{held ? 'Nothing on the board in this money right now.' : 'Nothing on the board right now.'}</div>
        : (
          <div className="lstrat">
            <section className="ls-hero" style={{ '--gc': top.color ?? undefined } as React.CSSProperties} aria-label="The top strategy">
              <div>
                <div className="ls-k">#1 · {sort === 'apr' ? 'best rate' : 'most a day'}</div>
                <h2><Marks s={top} size={34} />{top.title}</h2>
                <div className="ls-sub">{top.sub}{top.levRange && !top.sub.includes('×') ? ` · ${top.levRange}` : ''}</div>
              </div>
              <div className="ls-rate"><b>{fmt(top.value)}</b><small>{unit} · everyone in it together</small></div>
              <div className="ls-foot">
                <Faces faces={top.faces} size={28} />
                <span className="ls-crowd"><b>{top.wallets}</b> {top.wallets === 1 ? 'person runs' : 'people run'} this · <b>{usdShort(top.equityUsd)}</b> in it{top.best && sort === 'apr' ? <> · the best earns <b>{pct(top.best.aprPct, 1)}</b> on {usdShort(top.best.equityUsd)}</> : null}</span>
                {canCopy(top) ? <button type="button" className="btn pri" onClick={() => copy(top)}>Copy</button> : top.best ? <a className="btn" href={walletHref(top.best.account)}>See the best holder</a> : null}
              </div>
            </section>
            {rows.slice(1, 40).map((s, i) => (
              <div key={s.key} className="ls-row" style={{ '--gc': s.color ?? undefined, '--w': `${Math.max(4, Math.min(100, (s.value / top.value) * 100))}%` } as React.CSSProperties}>
                <span className="ls-bar" aria-hidden />
                <Rank n={i + 2} />
                <span className="ls-mark"><Marks s={s} size={26} /></span>
                <span className="ls-n"><b>{s.title}</b><small>{s.sub} · {s.wallets} {s.wallets === 1 ? 'person' : 'people'} · {usdShort(s.equityUsd)}</small></span>
                <span className="ls-v"><span className="ls-face"><Faces faces={s.faces.slice(0, 2)} size={22} /></span><b>{fmt(s.value)}</b>{canCopy(s) ? <button type="button" className="btn sm pri" onClick={() => copy(s)}>Copy</button> : s.best ? <a className="btn sm" href={walletHref(s.best.account)}>Who</a> : null}</span>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

/**
 * A place on the board. The podium's three are a tinted ring drawn by an inner element with a
 * fixed box — a grid or flex cell can stretch the outer span, never this disc.
 */
function Rank({ n }: { n: number }) {
  return <span className="lb-rank" aria-label={`#${n}`}>{n <= 3 ? <i className={`medal ${MEDAL[n - 1]}`}>{n}</i> : n}</span>
}

/** Up to three holders' faces, overlapping: the crowd behind a strategy at a glance. */
function Faces({ faces, size }: { faces: string[]; size: number }) {
  if (!faces.length) return null
  return <span className="ls-faces">{faces.slice(0, 3).map((a) => <Face key={a} account={a} size={size} />)}</span>
}

/** What the strategy holds (and borrows): the tokens' own marks, a loop's two side by side. */
function Marks({ s, size }: { s: BoardStrategy; size: number }) {
  return s.debt
    ? <span className="ls-toks toks"><Tok sym={s.held.symbol} logo={s.held.logo} size={size} /><Tok sym={s.debt.symbol} logo={s.debt.logo} size={size} /></span>
    : <Tok sym={s.held.symbol} logo={s.held.logo} size={size} />
}
