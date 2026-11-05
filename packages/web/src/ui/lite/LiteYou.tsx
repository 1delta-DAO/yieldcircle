import React from 'react'
import { go, liteHref, proHref, useApp, useRoute, walletHref } from '../../state/AppState'
import { holdingRow, holdingTitle, signedMoney, streakWord, type BoardPosition } from '@yieldcircle/core/model/lite'
import type { Holding } from '@yieldcircle/core/model/positions'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { ConnectButton } from '../../wallet/ConnectButton'
import { PaperOffer } from '../PaperPanel'
import { totalsOf } from '../Positions'
import { useMyStats } from '../Stats'
import { Sk, Tok, pct, usd, usdShort } from '../bits'
import { useDayLog, useLiteMenu } from '@yieldcircle/app/lite'
import { useHoldingPnl } from '@yieldcircle/app/index/pnl'
import { Flame, openRow } from './LiteBits'
import { ChainChip } from '../ChainPicker'
import { LiteMoves } from './LiteSocial'
import { LitePnl } from './LitePnl'
import { LiteHoldingTicket } from '../Ticket'
import { LiteLoanTicket } from '../BorrowTicket'
import { useAsideTop } from '../AssetPage'
import { owedOf } from '@yieldcircle/core/model/borrow'
import { useClosedRecord, useBoardNames } from '@yieldcircle/app/board'
import { paperPnlBook } from '@yieldcircle/core/model/paperView'
import { usePaper } from '../../state/Paper'
import { PnlDrawer } from '../PnlDrawer'

/**
 * You (docs/lite.md §6): what you have and what it earns, your streak and rank, what you made, then
 * ONE row per position — its value, what it made, what it earns a day — with the closed ones folded
 * under them (docs/you-unified.md), and what the people you follow did. Opened by the balance chip. Your profile, wallets, chains, settings and
 * the switch to Pro are behind the face (`ProfileSheet lite`). No points until a server ledger counts them
 * (docs/lite-design-review.md §3.5). Every position opens its own Lite ticket beside the
 * page (`#/lite/you?h=…`), Lite's pick or not: a loop to make safer or close, a deposit to withdraw,
 * a loan to pay back. Only a price bet (a debt in another money) is Pro's alone. Positions read
 * from the live book only (docs/apis.md); the streak and points are counted on this device from that book, a preview
 * until a server ledger exists.
 */
export function LiteYou() {
  const L = useLiteMenu()
  const { b } = L
  const t = totalsOf(b)
  const day = useDayLog(b)
  const stats = useMyStats(b.paper ? undefined : b.account)
  // a paper position's figure is the paper ledger's (the index never holds one): keyed as its holding is
  const paper = usePaper()
  const paperMade = React.useMemo(() => new Map<string, number>(b.paper && paper.ledger ? paperPnlBook(paper.ledger, paper.viewNow, paper.price).positions.map((x) => [`paper:${x.key}`, x.pnlUsd] as const) : []), [b.paper, paper.ledger, paper.viewNow, paper.price])
  const route = useRoute()
  const sel = route.h ? b.holdings.find((h) => h.key === route.h) ?? null : null
  const open = !!sel && !sel.directional
  const aside = useAsideTop(open)
  const close = () => go('you')
  if (!b.account) return (
    <div className="lite-page">
      <div className="feed-h"><h1>You</h1><span className="sp" /><ChainChip /></div>
      <div className="note">Connect a wallet to see what you have, your streak and your rank — or play the whole thing with paper money first.</div>
      <div className="lite-cta" style={{ margin: '14px 0' }}><ConnectButton /></div>
      <PaperOffer lite />
    </div>
  )
  const mine = b.holdings.filter((h) => !h.putUp).sort((x, y) => y.valueUsd - x.valueUsd)
  const selS = sel ? L.runs(sel) ?? null : null
  return (
    <>
    <div className={`lite-split lite-you${open ? ' withticket' : ''}`}>
    <div className="main">
      {/* the chain scope beside the heading: Lite's one setting, where the page about you starts (docs/lite.md §3) */}
      <div className="feed-h"><h1>You</h1>{b.paper && <span className="pill paper">paper</span>}<span className="sp" /><ChainChip /></div>
      <div className={`lstats${b.paper ? ' three' : ''}`}>
        <Stat k="You have" v={b.positionsLoading && !b.books.length ? <Sk w={80} h={20} /> : usd(t.tot)} s={t.idle >= 1 ? `${usdShort(t.idle)} idle` : 'all of it at work'} />
        <Stat k="Earning" v={<span className="ok">+{usd(t.yearly / 365)}</span>} s={`a day · ${usdShort(t.yearly)} a year`} />
        <Stat k="Streak" v={<span className="lstat-streak"><Flame size={18} />{day.streak}</span>} s={day.streak ? `${streakWord(day.streak)} in a row with money at work` : 'put money to work to start one'} />
        {!b.paper && <Stat k="Rank" v={stats.rank != null ? `#${stats.rank}` : 'Not yet'} s={stats.rank != null ? `on the board · ${usdShort(stats.perDay)} a day` : 'the board is the top 100 by dollars a day'} href={liteHref('board?t=perDay')} />}
      </div>

      <LitePnl account={b.account!} accounts={b.accounts} paper={b.paper} positions={b.positionsLoading || b.isFetching ? undefined : mine.filter((h) => h.kind !== 'borrow').length} />

      <section className="sec lite-sec">
        <div className="sec-h"><h2>Positions</h2></div>
        {b.positionsError && <div className="err">Positions could not be read: {b.positionsError.message}</div>}
        <div className="lrows">
          {b.positionsLoading && !mine.length ? [0, 1].map((i) => <div key={i} className="lrow sk"><Sk w={28} h={28} /><span className="lrow-n"><Sk w={120} h={14} /></span></div>)
            : !mine.length ? <div className="empty">Nothing at work yet. <a className="pri" href={liteHref('earn')}>Find something to earn ›</a></div>
            : mine.map((h) => <Position key={h.key} h={h} s={L.runs(h) ?? null} on={sel?.key === h.key} made={paperMade.get(h.key)} />)}
        </div>
        {!b.paper && <Closed account={b.accounts.evm} />}
      </section>

      <LiteMoves rows={L.rows} account={b.account} limit={12} title="What the people you follow did" followingOnly />
    </div>
    <aside ref={aside} className={open ? '' : 'closed'} id="aside">
      {open && (sel!.kind === 'borrow'
        ? <LiteLoanTicket key={sel!.key} h={sel!} idle={b.idlePerChain} onClose={close} />
        : <LiteHoldingTicket key={sel!.key} h={sel!} s={selS} holdings={selS ? L.holdingsOf(selS) : [sel!]} idle={b.idlePerChain} mode={route.m} onClose={close} />)}
    </aside>
    </div>
    {open && <div className="scrim" onClick={close} />}
    </>
  )
}

function Stat({ k, v, s, href }: { k: string; v: React.ReactNode; s: string; href?: string }) {
  const body = <><span className="k">{k}{href ? ' ›' : ''}</span><span className="v">{v}</span><span className="s t50">{s}</span></>
  return href ? <a className="lstat" href={href}>{body}</a> : <div className="lstat">{body}</div>
}

/**
 * One position, once (docs/you-unified.md): its name in Lite's words, its token and how it is held,
 * how far from liquidation on a line of its own; its value, what it MADE — a fact, so it wears the
 * colour — and what it earns a day, a forecast, in grey. No figure from the index is no line, never
 * a zero. Tapping it opens its Lite ticket (where it is managed and shared); a price bet opens in
 * Pro, the one kind Lite has no actions for.
 */
function Position({ h, s, on, made }: { h: Holding; s: Strategy | null; on: boolean; /** a paper position's figure, off the paper ledger */ made?: number }) {
  const title = holdingTitle(h)
  const row = holdingRow(h, title)
  // what it made since it was opened, the index's figure for it
  const pnl = useHoldingPnl(h)
  const m = made ?? pnl?.pnlUsd ?? null
  const perDay = h.apr != null && h.kind !== 'borrow' && Math.abs(h.valueUsd * h.apr / 100 / 365) >= 0.01 ? h.valueUsd * h.apr / 100 / 365 : null
  const open = () => {
    if (!h.directional) return go('you', { h: h.key })
    location.hash = proHref(`#/${h.group}?${new URLSearchParams({ ...(s ? { s: s.id } : {}), k: h.kind, h: h.key, m: 'manage' })}`)
  }
  return (
    <div className={`lrow${on ? ' on' : ''}`} role="button" tabIndex={0} aria-pressed={on} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter') open() }}>
      <Tok sym={h.symbol} logo={h.logo} size={28} />
      <span className="lrow-n">
        <b>{title}</b>
        <small className="t50">{h.kind === 'borrow' ? row.what.replace(/A loan$/, `owes ${usd(owedOf(h))}`) : row.what}{h.directional ? ' · managed in Pro' : ''}</small>
        {row.risk && <small className={row.risk.tone || 't50'}>{row.risk.text}</small>}
      </span>
      <span className="lrow-v"><b>{usd(h.valueUsd)}</b>{m != null && <small className={`made ${m >= 0 ? 'ok' : 'bad'}`}>{signedMoney(m)} made</small>}{perDay != null && <small className="t50">{signedMoney(perDay)} a day</small>}</span>
    </div>
  )
}

/** How many closed positions the fold lists; the older ones are Pro's (as on the board). */
const CLOSED_SHOWN = 5
const dayOf = (t: string) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/**
 * What you HAD, folded under what you have (docs/you-unified.md): the closed positions on the
 * chains in scope, the same row with what each made where a live one has its value. The fold's
 * head counts them off their keys (one request); each one's record is read only once it is
 * opened, and then the head says what they made together. EVM only — the Solana index keeps no
 * list of closed positions. A row opens its record (`PnlDrawer`).
 */
function Closed({ account }: { account: string | undefined }) {
  const [open, setOpen] = React.useState(false)
  const [pnl, setPnl] = React.useState<string>()
  const names = useBoardNames()
  const { chainIds, allChains } = useApp()
  const { had, count, more, isLoading } = useClosedRecord(account, names, CLOSED_SHOWN, { enabled: open, chainIds: allChains ? undefined : chainIds })
  if (!account || !count) return null
  const sum = had.reduce((n, p) => n + p.pnlUsd, 0)
  const loaded = open && !isLoading
  return (
    <div className="lclosed">
      <button type="button" className="lfold" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <b>Closed · {loaded && !more ? had.length : count}</b>
        {loaded && had.length > 0 && <span className={`made ${sum >= 0 ? 'ok' : 'bad'}`}>{signedMoney(sum)} made{more ? ` on the last ${had.length}` : ''}</span>}
        <span className="t40" aria-hidden>{open ? '⌃' : '⌄'}</span>
      </button>
      {open && (
        <div className="lrows">
          {isLoading && !had.length ? [0, 1].map((i) => <div key={i} className="lrow sk"><Sk w={28} h={28} /><span className="lrow-n"><Sk w={140} h={14} /></span></div>)
            : !had.length ? <div className="empty">Nothing that was ever at work.</div>
            : had.map((p) => <ClosedRow key={p.key} p={p} s={names.get(p.strategyKey.toLowerCase())?.s} onOpen={() => setPnl(p.key)} />)}
          {more > 0 && <a className="lfold-more t50" href={proHref(walletHref(account))}>{more} older closed position{more === 1 ? '' : 's'}, in Pro ›</a>}
        </div>
      )}
      <PnlDrawer account={pnl?.split('|')[1] || account} posKey={pnl} onClose={() => setPnl(undefined)} />
    </div>
  )
}

function ClosedRow({ p, s, onOpen }: { p: BoardPosition; s: Strategy | undefined; onOpen: () => void }) {
  const yearly = p.aprPct != null && Number.isFinite(p.aprPct) && Math.abs(p.aprPct) <= 100
  const logo = s ? (s.kind === 'loop' ? s.logoLong : s.tokenLogo ?? s.logo) : undefined
  return (
    <div className="lrow was" role="button" tabIndex={0} title="See what this position made, day by day" onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}>
      <Tok sym={p.held[0] ?? '?'} logo={logo} size={28} />
      <span className="lrow-n">
        <b>{p.title}</b>
        <small className="t50">{p.closed ? `Closed ${dayOf(p.closed.at)}` : p.sub}{p.closed?.avgUsd != null ? ` · ${usdShort(p.closed.avgUsd)} at work on average` : ''}</small>
      </span>
      <span className="lrow-v"><b className={p.pnlUsd >= 0 ? 'ok' : 'bad'}>{signedMoney(p.pnlUsd)}</b>{yearly && <small className="t50">{pct(p.aprPct!, 1)} a year</small>}</span>
    </div>
  )
}
