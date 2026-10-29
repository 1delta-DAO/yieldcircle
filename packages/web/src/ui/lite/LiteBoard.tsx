import React from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import * as idx from '@yieldcircle/core/index/api'
import { useAccountPnlBook } from '@yieldcircle/app/index/pnl'
import { RATE_BOARD_LIMIT, useClosedPositions } from '@yieldcircle/app/index/queries'
import { useMyFollows, useProfiles } from '../../social/queries'
import { go, liteWalletHref, proHref, useApp, walletHref } from '../../state/AppState'
import { normAddr } from '@yieldcircle/core/model/address'
import { bookKeyOf } from '@yieldcircle/core/model/uid'
import { boardPositions, boardStrategies, boardWallets, closedPosition, leverTag, plainName, type BoardSort, type BoardStrategy, type BoardWallet, type LiteRow } from '@yieldcircle/core/model/lite'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { GROUPS, groupOf } from '@yieldcircle/core/model/assets'
import { Face } from '../social-bits'
import { FollowButton, Who } from '../social-bits'
import { Sk, Tok, pct, usd, usdShort } from '../bits'
import { useLiteMenu } from '@yieldcircle/app/lite'
import { openRow } from './LiteBits'
import { ChainChip } from '../ChainPicker'
import { PnlDrawer } from '../PnlDrawer'

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
  const liteByKey = useLiteByKey()
  // two components, not one with a branch: each view has its own hooks
  return by === 'strategy' ? <Strategies sort={sort} held={held} liteByKey={liteByKey} /> : <Wallets sort={sort} held={held} liteByKey={liteByKey} />
}

/** The Lite row each strategy key opens, for the Copy and the words. */
export function useLiteByKey(): Map<string, LiteRow> {
  const L = useLiteMenu()
  return React.useMemo(() => {
    const m = new Map<string, LiteRow>()
    for (const r of L.rows) { const k = bookKeyOf(r.s); if (k) m.set(k.toLowerCase(), r) }
    return m
  }, [L.rows])
}

/**
 * Every strategy the catalogue holds, named in Lite's words (`plainName`) — Lite's own row first
 * where it has one. The board ranks whatever earns most today, which is mostly rows Lite does not
 * list (another debt, a venue below a floor): they still get words, never a ticker, and Copy only
 * where Lite carries the strategy (docs/lite-design-review.md §3.4).
 */
export function useBoardNames(): Map<string, { title: string; sub: string; s: Strategy }> {
  const L = useLiteMenu()
  const { b } = L
  return React.useMemo(() => {
    const m = new Map<string, { title: string; sub: string; s: Strategy }>()
    for (const s of [...b.overflow, ...b.hidden, ...b.all]) { const k = bookKeyOf(s); if (k) m.set(k.toLowerCase(), { ...plainName(s), s }) }
    for (const r of L.rows) { const k = bookKeyOf(r.s); if (k) m.set(k.toLowerCase(), { title: r.title, sub: r.sub, s: r.s }) }
    return m
  }, [b.all, b.hidden, b.overflow, L.rows])
}

/** How many closed positions a wallet's list carries; the rest are Pro's. */
const CLOSED_SHOWN = 6
/** How many a board shows before "Show more": a ranking reads in its top; the rest is one tap. */
const BOARD_ROWS = 20

function Wallets({ sort, held, liteByKey }: { sort: BoardSort; held?: idx.ExposureChip; liteByKey: Map<string, LiteRow> }) {
  const { account } = useApp()
  const q = useQuery({
    // `earners-me` is the $/day board the header and You already read: one request for both
    queryKey: sort === 'perDay' && !held ? ['earners-me'] : ['earners-lite', sort, held ?? 'all'],
    // a rate board at the size the index pre-warms (the same query as `useRateLeaders`); dollars a day at 100, as the header reads it
    queryFn: () => idx.walletEarners({ sort, people: true, exposure: held, limit: sort === 'apr' ? RATE_BOARD_LIMIT : 100 }),
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const f = useMyFollows(account)
  const [mine, setMine] = React.useState(false)
  const only = mine ? new Set([...f.wallets, ...(account ? [normAddr(account)] : [])].map((a) => a.toLowerCase())) : undefined
  const all = boardWallets(q.data?.rows ?? [], sort, only).slice(0, 50)
  const [many, setMany] = React.useState(false)
  const rows = many ? all : all.slice(0, BOARD_ROWS)
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
      <p className="t70 lite-lens-why">{SORTS.find((x) => x.id === sort)!.why}. Tap one for what each position made.</p>
      {me && !mine && <div className="note lite-me">You are <b>#{me.rank}</b> · {sort === 'apr' ? `${pct(me.value, 1)} a year` : `${usdShort(me.value)} a day`}</div>}
      <div className="lboard">
        {q.isLoading ? [0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="lb-row sk"><Sk w={24} h={18} /><Sk w={26} h={26} /><Sk w={140} h={14} /><span className="sp" /><Sk w={60} h={18} /></div>)
          : q.error ? <div className="empty">The board could not be read right now.</div>
          : !rows.length ? <div className="empty">{mine ? 'Nobody you follow is on the board yet.' : held ? 'Nobody on the board in this money right now.' : 'Nobody on the board right now.'}</div>
          : rows.map((r) => <WalletRow key={r.account} r={r} sort={sort} profile={profile(r.account)} me={!!account && normAddr(r.account) === normAddr(account)} open={open === r.account} onToggle={() => setOpen(open === r.account ? null : r.account)} liteByKey={liteByKey} />)}
        {all.length > rows.length && <button type="button" className="lrow lite-showall" onClick={() => setMany(true)}>Show the top {all.length}</button>}
      </div>
    </div>
  )
}

function WalletRow({ r, sort, profile, me, open, onToggle, liteByKey }: { r: BoardWallet; sort: BoardSort; profile: ReturnType<ReturnType<typeof useProfiles>['profile']>; me: boolean; open: boolean; onToggle: () => void; liteByKey: Map<string, LiteRow> }) {
  return (
    <div className={`lb-item${open ? ' open' : ''}${me ? ' me' : ''}`}>
      <button type="button" className="lb-row" aria-expanded={open} onClick={onToggle}>
        <Rank n={r.rank} />
        <Who account={r.account} profile={profile} size={28} plain sub={`${usdShort(r.navUsd)} · ${r.positions} position${r.positions === 1 ? '' : 's'}`} />
        <span className="sp" />
        <span className="lb-v ok">{sort === 'apr' ? pct(r.value, r.value >= 10 ? 0 : 1) : usdShort(r.value)}<small className="t50">{sort === 'apr' ? 'a year' : 'a day'}</small></span>
        <svg className="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && <WalletPositions account={r.account} liteByKey={liteByKey} me={me} />}
    </div>
  )
}

/**
 * One wallet's positions, opened on a tap (and the profile's "What it runs"): each with its money's
 * marks — the Lite row's own logos where Lite carries it, else the index's symbols — a slim bar in
 * its money's colour for its share of the wallet, what it made, and a Copy where Lite carries it.
 * A tap on the row opens the position's own record (Pro's drawer, in place: `?pos=` is Pro's page).
 */
export function WalletPositions({ account, liteByKey, me, foot = true }: { account: string; liteByKey: Map<string, LiteRow>; me: boolean; /** Follow and the way to the profile: the board's row has them, the profile itself not */ foot?: boolean }) {
  const q = useAccountPnlBook(account)
  const liteTitle = (k: string) => liteByKey.get(k.toLowerCase())?.title ?? null
  const open = q.data ? boardPositions(q.data, liteTitle) : []
  // what it HAD: the closed positions' keys, then each one's own record (the drawer's query, so a
  // tap opens it from cache); the newest few, the rest in Pro
  const closedQ = useClosedPositions(account)
  const closedKeys = React.useMemo(() => [...(closedQ.data ?? [])].sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, CLOSED_SHOWN), [closedQ.data])
  const series = useQueries({
    queries: closedKeys.map((k) => ({
      queryKey: ['pos-series', account, k.key, 'USD'],
      queryFn: () => idx.positionSeries(account, k.key, 'USD'),
      staleTime: 5 * 60_000,
      retry: (c: number, e: unknown) => c < 1 && !/→ 404$|no anchored position/.test((e as Error)?.message ?? ''),
    })),
  })
  const had = closedKeys.flatMap((k, i) => { const r = series[i].data; const p = r && closedPosition(k, r, liteTitle); return p ? [p] : [] })
  const ps = [...open, ...had]
  const moreClosed = Math.max(0, (closedQ.data?.length ?? 0) - CLOSED_SHOWN)
  const [pnl, setPnl] = React.useState<string>()
  const colorOf = (g: string) => GROUPS.find((x) => x.id === g)?.color ?? null
  const since = (t: string) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return (
    <div className="lb-pos">
      {q.isLoading ? [0, 1].map((i) => <div key={i} className="lb-p sk" aria-hidden><span className="lb-pm"><Sk w={32} h={32} /></span><span className="lb-pn"><Sk w={150} h={14} /><Sk w={200} h={10} /></span><span className="lb-pv"><Sk w={64} h={16} /></span></div>)
        : !ps.length ? <div className="lb-p t50">No position with a record yet. The index draws each one within a few hours of opening.</div>
        : ps.map((p) => {
          const row = liteByKey.get(p.strategyKey.toLowerCase())
          const s = row?.s
          const held = s ? (s.kind === 'loop' ? { symbol: s.holds, logo: s.logoLong } : { symbol: s.assetSymbol, logo: s.tokenLogo ?? s.logo }) : { symbol: p.held[0] ?? '?', logo: undefined }
          const debt = s?.kind === 'loop' ? { symbol: s.debt, logo: s.logoShort } : p.debt[0] ? { symbol: p.debt[0], logo: undefined } : null
          const color = s ? colorOf(s.group) : colorOf(groupOf(held.symbol))
          const up = p.pnlUsd >= 0
          const open = () => setPnl(p.key)
          return (
            <div key={p.key} className={`lb-p${p.closed ? ' was' : ''}`} role="button" tabIndex={0} title="See what this position made, day by day" onClick={open} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }} style={{ '--gc': color ?? undefined } as React.CSSProperties}>
              <span className="lb-pm">{debt ? <span className="toks"><Tok sym={held.symbol} logo={held.logo} size={32} /><Tok sym={debt.symbol} logo={debt.logo} size={32} /></span> : <Tok sym={held.symbol} logo={held.logo} size={32} />}</span>
              <span className="lb-pn">
                <b>{p.title}{p.kind === 'loop' && s?.kind === 'loop' && <span className="pill lever">{leverTag(s.tiers.balanced)}</span>}{p.closed && <span className="pill closed">closed</span>}</b>
                <small className="t50">{p.sub}{p.since ? <> · since {since(p.since)}</> : null}{p.closed ? <> · closed {since(p.closed.at)}</> : null}</small>
                {p.closed?.avgUsd != null && <span className="lb-share"><small><b>{usdShort(p.closed.avgUsd)}</b> was at work</small></span>}
                {p.equityUsd != null && (
                  <span className="lb-share" aria-label={p.share != null ? `${Math.round(p.share * 100)}% of its money` : undefined}>
                    {p.share != null && ps.length > 1 && <i className="lb-track"><i className="lb-fill" style={{ width: `${Math.max(1.5, p.share * 100)}%` }} /></i>}
                    <small><b>{usdShort(p.equityUsd)}</b> in it{p.share != null && ps.length > 1 ? <span className="t50"> · {p.share < 0.01 ? '<1' : Math.round(p.share * 100)}%</span> : null}</small>
                  </span>
                )}
              </span>
              <span className="lb-pv"><b className={up ? 'ok' : 'bad'}>{up ? '+' : '−'}{usd(Math.abs(p.pnlUsd))}</b><small className="t50">{p.aprPct != null ? <>{pct(p.aprPct, 1)} a year</> : 'made so far'}</small></span>
              <span className="lb-pa">
                {row && !me ? <button type="button" className="btn sm pri" onClick={(e) => { e.stopPropagation(); openRow(row.s, { copy: account }) }}>Copy</button> : <span className="lb-nocopy" />}
                <span className="t40 lb-chev" aria-hidden>›</span>
              </span>
            </div>
          )
        })}
      {moreClosed > 0 && <div className="lb-p t50 lb-older"><a href={proHref(walletHref(account))}>{moreClosed} older closed position{moreClosed === 1 ? '' : 's'}, in Pro ›</a></div>}
      {foot && (
        <div className="lb-foot">
          {!me && <FollowButton kind="wallet" target={account} small />}
          <span className="sp" />
          <a className="t50" href={liteWalletHref(account)}>Their profile ›</a>
        </div>
      )}
      <PnlDrawer account={pnl?.split('|')[1] || account} posKey={pnl} onClose={() => setPnl(undefined)} />
    </div>
  )
}

/** The title and the Wallets · Strategies switch, shared by both views; wallets are the default (people, every row one to follow or copy). */
function BoardHead({ by, sort, held }: { by: 'wallet' | 'strategy'; sort: BoardSort; held?: idx.ExposureChip }) {
  const t = sort === 'apr' ? undefined : sort
  const x = held
  return (
    <div className="feed-h">
      <h1>Leaderboard</h1>
      <div className="seg" role="tablist" aria-label="Wallets or strategies">
        <button role="tab" aria-selected={by === 'wallet'} aria-pressed={by === 'wallet'} onClick={() => go('board', { t, x })}>Wallets</button>
        <button role="tab" aria-selected={by === 'strategy'} aria-pressed={by === 'strategy'} onClick={() => go('board', { by: 'strategy', t, x })}>Strategies</button>
      </div>
      <span className="sp" /><ChainChip /><span className="t70 hide-m">real wallets, read off the chain</span>
    </div>
  )
}
function SortSeg({ by, sort, held }: { by: 'wallet' | 'strategy'; sort: BoardSort; held?: idx.ExposureChip }) {
  const nav = (t: BoardSort, x: idx.ExposureChip | undefined) => go('board', { by: by === 'strategy' ? 'strategy' : undefined, t: t === 'apr' ? undefined : t, x })
  return (
    <>
      <div className="seg" role="tablist" aria-label="Rank by">
        {SORTS.map((x) => <button key={x.id} role="tab" aria-selected={sort === x.id} aria-pressed={sort === x.id} onClick={() => nav(x.id, held)}>{x.word}</button>)}
      </div>
      <div className="denoms lite-held" role="group" aria-label="What the money is held in">
        {HELD.map((c) => <button key={c.word} className="dchip" aria-pressed={held === c.id} aria-label={`${c.word}: ${c.title}`} onClick={() => nav(sort, c.id)}>{c.word}</button>)}
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
  const names = useBoardNames()
  const [many, setMany] = React.useState(false)
  const q = useQuery({
    queryKey: ['earners', 'strategy', sort, 'default', true, 'all', held ?? 'all', 'all', 'all', 50] as const,
    queryFn: () => idx.strategyBoard({ sort, people: true, exposure: held, limit: 50 }),
    staleTime: 60_000,
    retry: 1,
  })
  const colorOf = (g: string) => GROUPS.find((x) => x.id === g)?.color ?? '#8fa6ff'
  const ranked = React.useMemo(() => boardStrategies(q.data?.rows ?? [], sort, (k) => {
    const n = names.get(k.toLowerCase())
    if (!n) return null
    const s = n.s
    return { title: n.title, sub: n.sub, color: colorOf(s.group), held: s.kind === 'loop' ? { symbol: s.holds, logo: s.logoLong } : { symbol: s.assetSymbol, logo: s.tokenLogo ?? s.logo }, debt: s.kind === 'loop' ? { symbol: s.debt, logo: s.logoShort } : null }
  }), [q.data, sort, names]) // eslint-disable-line react-hooks/exhaustive-deps
  // a strategy the catalogue does not hold has no words, only a ticker: it stays Pro's, and the foot counts it
  const rows = ranked.filter((r) => names.has(r.key.toLowerCase()))
  const unnamed = ranked.length - rows.length
  const top = rows[0]
  const fmt = (v: number) => (sort === 'apr' ? pct(v, 1) : usdShort(v))
  const unit = sort === 'apr' ? 'a year' : 'a day'
  const copy = (s: BoardStrategy) => { const r = liteByKey.get(s.key.toLowerCase()); if (r) openRow(r.s, { copy: s.best?.account }) }
  const canCopy = (s: BoardStrategy) => liteByKey.has(s.key.toLowerCase()) && (!account || normAddr(s.best?.account ?? '') !== normAddr(account))
  return (
    <div className="lite-page lite-board">
      <BoardHead by="strategy" sort={sort} held={held} />
      <div className="lite-board-bar"><SortSeg by="strategy" sort={sort} held={held} /></div>
      <p className="t70 lite-lens-why">{STRAT_WHY[sort]}. Copy opens it at the best holder’s leverage, your own size.</p>
      {q.isLoading ? <div className="lstrat"><div className="ls-hero" aria-hidden><Sk w={120} h={12} /><Sk w={220} h={26} /><div className="ls-rate"><Sk w={140} h={44} /></div></div>{[0, 1, 2].map((i) => <div key={i} className="ls-row sk"><Sk w={24} h={18} /><Sk w={36} h={36} /><Sk w={160} h={14} /><Sk w={70} h={18} /></div>)}</div>
        : q.error ? <div className="empty">The board could not be read right now.</div>
        : !top ? <div className="empty">{held ? 'Nothing on the board in this money right now.' : 'Nothing on the board right now.'}</div>
        : (
          <div className="lstrat">
            <section className="ls-hero" style={{ '--gc': top.color ?? undefined } as React.CSSProperties} aria-label="The top strategy">
              <div>
                <div className="ls-k">#1 · {sort === 'apr' ? 'best rate' : 'most a day'}</div>
                <h2><Marks s={top} size={34} />{top.title}</h2>
                <div className="ls-sub">{top.sub}{top.levRange ? ` · held at ${top.levRange}` : ''}</div>
              </div>
              <div className="ls-rate"><b>{fmt(top.value)}</b><small>{unit} · everyone in it together</small></div>
              <div className="ls-foot">
                <Faces faces={top.faces} size={28} />
                <span className="ls-crowd"><b>{top.wallets}</b> {top.wallets === 1 ? 'person runs' : 'people run'} this · <b>{usdShort(top.equityUsd)}</b> in it{top.best && sort === 'apr' ? <> · the best earns <b>{pct(top.best.aprPct, 1)}</b> on {usdShort(top.best.equityUsd)}</> : null}</span>
                {canCopy(top) ? <button type="button" className="btn pri" onClick={() => copy(top)}>Copy</button> : top.best ? <a className="btn" href={liteWalletHref(top.best.account)}>See the best holder</a> : null}
              </div>
            </section>
            {rows.slice(1, many ? 40 : BOARD_ROWS).map((s, i) => (
              <div key={s.key} className="ls-row" style={{ '--gc': s.color ?? undefined, '--w': `${Math.max(4, Math.min(100, (s.value / top.value) * 100))}%` } as React.CSSProperties}>
                <span className="ls-bar" aria-hidden />
                <Rank n={i + 2} />
                <span className="ls-mark"><Marks s={s} size={26} /></span>
                <span className="ls-n"><b>{s.title}</b><small>{s.levRange ? `${s.levRange} · ` : ''}{s.sub} · {s.wallets} people · {usdShort(s.equityUsd)}</small></span>
                <span className="ls-v"><span className="ls-face"><Faces faces={s.faces.slice(0, 2)} size={22} /></span><b>{fmt(s.value)}</b>{canCopy(s) ? <button type="button" className="btn sm pri" onClick={() => copy(s)}>Copy</button> : s.best ? <a className="btn sm" href={liteWalletHref(s.best.account)}>Who</a> : null}</span>
              </div>
            ))}
            {rows.length > BOARD_ROWS && !many && <button type="button" className="lrow lite-showall" onClick={() => setMany(true)}>Show the top {Math.min(rows.length, 40)}</button>}
            {unnamed > 0 && <p className="t70 lite-foot">{unnamed} more on the board hold coins Lite does not list. <a href={proHref(`#/board${held ? `?x=${held}` : ''}`)}>See them in Pro ›</a></p>}
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
