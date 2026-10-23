import React from 'react'
import { liteHref, proHref } from '../../state/AppState'
import { leverTag, liteEligible, moneyWord, streakWord } from '../../model/lite'
import type { Holding } from '../../model/positions'
import type { Strategy } from '../../model/strategies'
import { ConnectButton } from '../../wallet/ConnectButton'
import { PaperOffer } from '../PaperPanel'
import { totalsOf } from '../Positions'
import { useMyStats } from '../Stats'
import { Sk, Tok, pct, usd, usdShort } from '../bits'
import { useDayLog, useLiteMenu } from './useLite'
import { FollowedMoves, openRow } from './LiteBits'
import { ModeSwitch } from './ModeSwitch'

/**
 * You (docs/lite.md §6): what you have and what it earns, your streak, points and rank, what the
 * people you follow did — and the switch to Pro. Positions read from the live book only
 * (docs/apis.md); the streak and points are counted on this device from that book, a preview
 * until a server ledger exists.
 */
export function LiteYou() {
  const L = useLiteMenu()
  const { b } = L
  const t = totalsOf(b)
  const day = useDayLog(b)
  const stats = useMyStats(b.paper ? undefined : b.account)
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
  return (
    <div className="lite-page">
      <div className="feed-h"><h1>You</h1>{b.paper && <span className="pill paper">paper</span>}</div>
      <div className="lstats">
        <Stat k="You have" v={b.positionsLoading && !b.books.length ? <Sk w={80} h={20} /> : usd(t.tot)} s={t.idle >= 1 ? `${usdShort(t.idle)} idle` : 'all of it at work'} />
        <Stat k="Earning" v={<span className="ok">+{usd(t.yearly / 365)}</span>} s={`a day · ${usdShort(t.yearly)} a year`} />
        <Stat k="Streak" v={<>🔥 {day.streak}</>} s={day.streak ? `${streakWord(day.streak)} in a row with money at work` : 'put money to work to start one'} />
        <Stat k="Points" v={day.points.toLocaleString('en-US')} s="preview · a point a day per $100 at work" />
        {!b.paper && <Stat k="Rank" v={stats.rank != null ? `#${stats.rank}` : '—'} s={stats.rank != null ? `on the board · ${usdShort(stats.perDay)}/day` : 'top 100 by what they earn a day'} />}
      </div>

      <section className="sec lite-sec">
        <div className="sec-h"><h2>Your money</h2></div>
        {b.positionsError && <div className="err">Positions could not be read: {b.positionsError.message}</div>}
        <div className="lrows">
          {b.positionsLoading && !mine.length ? [0, 1].map((i) => <div key={i} className="lrow sk"><Sk w={28} h={28} /><span className="lrow-n"><Sk w={120} h={14} /></span></div>)
            : !mine.length ? <div className="empty">Nothing at work yet. <a className="pri" href={liteHref('earn')}>Find something to earn ›</a></div>
            : mine.map((h) => <Position key={h.key} h={h} s={L.runs(h) ?? null} account={b.account!} />)}
        </div>
      </section>

      <FollowedMoves rows={L.rows} account={b.account} limit={12} title="What the people you follow did" />
      <ModeSwitch />
    </div>
  )
}

function Stat({ k, v, s }: { k: string; v: React.ReactNode; s: string }) {
  return <div className="lstat"><span className="k">{k}</span><span className="v">{v}</span><span className="s t50">{s}</span></div>
}

/**
 * One position, in words. Lite manages what it carries (Add, Withdraw all); a loan, a price bet or
 * a strategy outside Lite's menu opens in Pro, where its own ticket is.
 */
function Position({ h, s, account }: { h: Holding; s: Strategy | null; account: string }) {
  const inLite = !!s && liteEligible(s) && h.kind !== 'borrow' && !h.directional
  const open = () => {
    if (inLite) return openRow(s!, { h: h.key })
    const q = new URLSearchParams({ ...(s ? { s: s.id } : {}), k: h.kind, h: h.key, m: h.kind === 'loop' ? 'manage' : h.kind === 'borrow' ? 'reduce' : 'reduce' })
    location.hash = proHref(h.kind === 'borrow' ? `#/borrow?${q}` : `#/${h.group}?${q}`)
  }
  const [shared, setShared] = React.useState(false)
  const share = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!s) return
    // the link is a Copy link: whoever opens it lands on the same strategy, with you as the one copied
    const url = `${location.origin}${location.pathname}${liteHref(`${s.group}?s=${encodeURIComponent(s.id)}&k=${s.kind}&copy=${account}`)}`
    const text = `Earning ${pct(h.apr ?? s.rate)} on ${moneyWord(h.asset, h.group).toLowerCase().startsWith('dollars') ? 'dollars' : moneyWord(h.asset, h.group)} with YieldCircle`
    try {
      if (navigator.share) await navigator.share({ title: 'YieldCircle', text, url })
      else { await navigator.clipboard.writeText(`${text} ${url}`); setShared(true); setTimeout(() => setShared(false), 1800) }
    } catch { /* the reader closed the sheet */ }
  }
  return (
    <div className="lrow" role="button" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === 'Enter') open() }}>
      <Tok sym={h.symbol} logo={h.logo} size={28} />
      <span className="lrow-n"><b>{moneyWord(h.asset, h.group)}</b><small>{h.kind === 'loop' ? `Levered ${leverTag(h.leverage ?? 1)}` : h.kind === 'borrow' ? 'A loan · managed in Pro' : h.directional ? 'A price bet · managed in Pro' : 'Earning'}{!inLite && h.kind !== 'borrow' && !h.directional ? ' · managed in Pro' : ''}</small></span>
      <span className="lrow-v"><b>{usd(h.valueUsd)}</b>{h.apr != null && <small className={h.apr >= 0 ? 'ok' : 'bad'}>{pct(h.apr)}</small>}</span>
      {s && inLite && <button type="button" className="btn sm ghost" onClick={share} title="Share a link that opens this strategy, copying you">{shared ? 'Copied' : 'Share'}</button>}
      <span className="t40" aria-hidden>›</span>
    </div>
  )
}
