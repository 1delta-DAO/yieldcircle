import React from 'react'
import { go, liteHref, proHref, useRoute } from '../../state/AppState'
import { holdingLine, liteEligible, moneyWord, streakWord } from '@yieldcircle/core/model/lite'
import type { Holding } from '@yieldcircle/core/model/positions'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { ConnectButton } from '../../wallet/ConnectButton'
import { PaperOffer } from '../PaperPanel'
import { totalsOf } from '../Positions'
import { useMyStats } from '../Stats'
import { Sk, Tok, pct, usd, usdShort } from '../bits'
import { useDayLog, useLiteMenu } from '@yieldcircle/app/lite'
import { FollowedMoves, openRow } from './LiteBits'
import { ModeSwitch } from './ModeSwitch'
import { LitePnl } from './LitePnl'
import { LiteHoldingTicket } from '../Ticket'
import { LiteLoanTicket } from '../BorrowTicket'
import { useAsideTop } from '../AssetPage'
import { owedOf } from '@yieldcircle/core/model/borrow'

/**
 * You (docs/lite.md §6): what you have and what it earns, your streak, points and rank, what the
 * people you follow did — and the switch to Pro. Every position opens its own Lite ticket beside the
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
      <div className="feed-h"><h1>You</h1></div>
      <div className="note">Connect a wallet to see what you have, your streak and your rank — or play the whole thing with paper money first.</div>
      <div className="lite-cta" style={{ margin: '14px 0' }}><ConnectButton /></div>
      <PaperOffer />
      <ModeSwitch />
    </div>
  )
  const mine = b.holdings.filter((h) => !h.putUp).sort((x, y) => y.valueUsd - x.valueUsd)
  const selS = sel ? L.runs(sel) ?? null : null
  return (
    <>
    <div className={`asset lite-asset lite-you${open ? '' : ' noticket'}`}>
    <div className="main">
      <div className="feed-h"><h1>You</h1>{b.paper && <span className="pill paper">paper</span>}</div>
      <div className="lstats">
        <Stat k="You have" v={b.positionsLoading && !b.books.length ? <Sk w={80} h={20} /> : usd(t.tot)} s={t.idle >= 1 ? `${usdShort(t.idle)} idle` : 'all of it at work'} />
        <Stat k="Earning" v={<span className="ok">+{usd(t.yearly / 365)}</span>} s={`a day · ${usdShort(t.yearly)} a year`} />
        <Stat k="Streak" v={<>🔥 {day.streak}</>} s={day.streak ? `${streakWord(day.streak)} in a row with money at work` : 'put money to work to start one'} />
        <Stat k="Points" v={day.points.toLocaleString('en-US')} s="preview · a point a day per $100 at work" />
        {!b.paper && <Stat k="Rank" v={stats.rank != null ? `#${stats.rank}` : '—'} s={stats.rank != null ? `on the board · ${usdShort(stats.perDay)}/day` : 'top 100 by what they earn a day'} href={liteHref('board?by=wallet&t=perDay')} />}
      </div>

      <LitePnl account={b.account!} paper={b.paper} rows={L.rows} positions={b.positionsLoading || b.isFetching ? undefined : mine.filter((h) => h.kind !== 'borrow').length} />

      <section className="sec lite-sec">
        <div className="sec-h"><h2>Your money</h2></div>
        {b.positionsError && <div className="err">Positions could not be read: {b.positionsError.message}</div>}
        <div className="lrows">
          {b.positionsLoading && !mine.length ? [0, 1].map((i) => <div key={i} className="lrow sk"><Sk w={28} h={28} /><span className="lrow-n"><Sk w={120} h={14} /></span></div>)
            : !mine.length ? <div className="empty">Nothing at work yet. <a className="pri" href={liteHref('earn')}>Find something to earn ›</a></div>
            : mine.map((h) => <Position key={h.key} h={h} s={L.runs(h) ?? null} account={b.account!} on={sel?.key === h.key} />)}
        </div>
      </section>

      <FollowedMoves rows={L.rows} account={b.account} limit={12} title="What the people you follow did" />
      <ModeSwitch />
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
 * One position, in words: what it is, how far from liquidation, what it is worth and earns. Tapping
 * it opens its Lite ticket; a price bet opens in Pro, the one kind Lite has no actions for.
 */
function Position({ h, s, account, on }: { h: Holding; s: Strategy | null; account: string; on: boolean }) {
  const line = holdingLine(h)
  const open = () => {
    if (!h.directional) return go('you', { h: h.key })
    location.hash = proHref(`#/${h.group}?${new URLSearchParams({ ...(s ? { s: s.id } : {}), k: h.kind, h: h.key, m: 'manage' })}`)
  }
  const shareable = !!s && liteEligible(s) && h.kind !== 'borrow' && !h.directional
  const [shared, setShared] = React.useState(false)
  const share = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!s) return
    // the link is a Copy link: whoever opens it lands on the same strategy, with you as the one copied
    const url = `${location.origin}${location.pathname}${liteHref(`${s.group}?s=${encodeURIComponent(s.id)}&k=${s.kind}&copy=${account}`)}`
    const word = moneyWord(h.asset, h.group)
    const text = `Earning ${pct(h.apr ?? s.rate)} on ${word.startsWith('Dollars') ? 'dollars' : word} with YieldCircle`
    try {
      if (navigator.share) await navigator.share({ title: 'YieldCircle', text, url })
      else { await navigator.clipboard.writeText(`${text} ${url}`); setShared(true); setTimeout(() => setShared(false), 1800) }
    } catch { /* the reader closed the sheet */ }
  }
  return (
    <div className={`lrow${on ? ' on' : ''}`} role="button" tabIndex={0} aria-pressed={on} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter') open() }}>
      <Tok sym={h.symbol} logo={h.logo} size={28} />
      <span className="lrow-n"><b>{moneyWord(h.asset, h.group)}{h.kind === 'borrow' ? ' loan' : ''}</b><small className={line.tone}>{h.kind === 'borrow' ? line.text.replace(/^A loan/, `owes ${usd(owedOf(h))}`) : line.text}{h.directional ? ' · managed in Pro' : ''}</small></span>
      <span className="lrow-v"><b>{usd(h.valueUsd)}</b>{h.apr != null && <small className={h.apr >= 0 ? 'ok' : 'bad'}>{pct(h.apr)}</small>}</span>
      {shareable && <button type="button" className="btn sm ghost" onClick={share} title="Share a link that opens this strategy, copying you">{shared ? 'Copied' : 'Share'}</button>}
      <span className="t40" aria-hidden>›</span>
    </div>
  )
}
