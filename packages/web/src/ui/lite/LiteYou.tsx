import React from 'react'
import { go, liteHref, proHref, useRoute } from '../../state/AppState'
import { holdingLine, moneyWord, signedMoney, streakWord } from '@yieldcircle/core/model/lite'
import type { Holding } from '@yieldcircle/core/model/positions'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { ConnectButton } from '../../wallet/ConnectButton'
import { PaperOffer } from '../PaperPanel'
import { totalsOf } from '../Positions'
import { useMyStats } from '../Stats'
import { Sk, Tok, usd, usdShort } from '../bits'
import { useDayLog, useLiteMenu } from '@yieldcircle/app/lite'
import { useHoldingPnl } from '@yieldcircle/app/index/pnl'
import { Flame, openRow } from './LiteBits'
import { ProfileSheet } from '../ProfileSheet'
import { ChainChip } from '../ChainPicker'
import { LiteMoves } from './LiteSocial'
import { LitePnl } from './LitePnl'
import { LiteHoldingTicket } from '../Ticket'
import { LiteLoanTicket } from '../BorrowTicket'
import { useAsideTop } from '../AssetPage'
import { owedOf } from '@yieldcircle/core/model/borrow'

/**
 * You (docs/lite.md §6): what you have and what it earns, your streak and rank, what the people you
 * follow did — and, at its foot, the wallet, chains and the switch to Pro: Lite's one page about the
 * reader, opened by the face and by the balance chip. No points until a server ledger counts them
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
      <Settings />
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
        <div className="sec-h"><h2>Your money</h2></div>
        {b.positionsError && <div className="err">Positions could not be read: {b.positionsError.message}</div>}
        <div className="lrows">
          {b.positionsLoading && !mine.length ? [0, 1].map((i) => <div key={i} className="lrow sk"><Sk w={28} h={28} /><span className="lrow-n"><Sk w={120} h={14} /></span></div>)
            : !mine.length ? <div className="empty">Nothing at work yet. <a className="pri" href={liteHref('earn')}>Find something to earn ›</a></div>
            : mine.map((h) => <Position key={h.key} h={h} s={L.runs(h) ?? null} on={sel?.key === h.key} />)}
        </div>
      </section>

      <LiteMoves rows={L.rows} account={b.account} limit={12} title="What the people you follow did" followingOnly />
      <Settings />
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

/** The wallet, the chains, the profile and Lite / Pro: what Pro keeps behind the face, at You's foot. */
function Settings() {
  return <section className="sec lite-sec lite-settings"><div className="sec-h"><h2>Wallet and settings</h2></div><ProfileSheet embedded /></section>
}

function Stat({ k, v, s, href }: { k: string; v: React.ReactNode; s: string; href?: string }) {
  const body = <><span className="k">{k}{href ? ' ›' : ''}</span><span className="v">{v}</span><span className="s t50">{s}</span></>
  return href ? <a className="lstat" href={href}>{body}</a> : <div className="lstat">{body}</div>
}

/**
 * One position, in words: what it is, how far from liquidation, what it is worth, made and earns.
 * Tapping it opens its Lite ticket (where it is managed and shared); a price bet opens in Pro, the
 * one kind Lite has no actions for.
 */
function Position({ h, s, on }: { h: Holding; s: Strategy | null; on: boolean }) {
  const line = holdingLine(h)
  // what it made since it was opened, the index's figure for it
  const pnl = useHoldingPnl(h)
  const open = () => {
    if (!h.directional) return go('you', { h: h.key })
    location.hash = proHref(`#/${h.group}?${new URLSearchParams({ ...(s ? { s: s.id } : {}), k: h.kind, h: h.key, m: 'manage' })}`)
  }
  return (
    <div className={`lrow${on ? ' on' : ''}`} role="button" tabIndex={0} aria-pressed={on} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter') open() }}>
      <Tok sym={h.symbol} logo={h.logo} size={28} />
      <span className="lrow-n"><b>{moneyWord(h.asset, h.group)}{h.kind === 'borrow' ? ' loan' : ''}</b><small className={line.tone}>{h.kind === 'borrow' ? line.text.replace(/^A loan/, `owes ${usd(owedOf(h))}`) : line.text}{h.directional ? ' · managed in Pro' : ''}</small></span>
      <span className="lrow-v"><b>{usd(h.valueUsd)}</b>{h.apr != null && h.kind !== 'borrow' && Math.abs(h.valueUsd * h.apr / 100 / 365) >= 0.01 ? <small className={h.apr >= 0 ? 'ok' : 'bad'}>{signedMoney(h.valueUsd * h.apr / 100 / 365)} a day</small> : null}{pnl && <small className="t70">{signedMoney(pnl.pnlUsd!)} made</small>}</span>
    </div>
  )
}
