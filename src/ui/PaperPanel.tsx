/**
 * The paper account on screen (tickets/0006 §C): the strip under the header, the head of the
 * positions sheet, the offers on the home page, and the account tools in settings. Amber
 * everywhere, so play money never passes for real money.
 */
import React from 'react'
import { usePaper } from '../state/Paper'
import { openPaperSignIn } from './PaperSignIn'
import { MAX_TOPUPS } from '../model/paper'
import { metaKey, paperHoldings } from '../model/paperView'
import { usePaperBook, usePaperDaily } from '../social/queries'
import { HealthPill, Sk } from './bits'
import { chainLabel } from '../sdk/queries'
import { num, pct, usd } from './bits'

const DAYS = [0, 7, 30, 90]
const STRIP_KEY = 'yc.paper-strip'

/**
 * What the strategies earned, one point a day as the server valued it (`paper.book_daily`) — the
 * paper account's PnL line. Real time only: the paper clock never writes a day.
 */
function PaperPnlLine({ account }: { account: string }) {
  const q = usePaperDaily(account, 90)
  const pts = (q.data?.days ?? []).map((d) => d.pnlUsd)
  if (pts.length < 2) return <span className="t50" style={{ fontSize: 11 }}>{q.isLoading ? '' : 'The daily line starts after a second day.'}</span>
  const w = 220, h = 36, lo = Math.min(0, ...pts), hi = Math.max(0, ...pts), span = hi - lo || 1
  const x = (i: number) => 2 + (i * (w - 4)) / (pts.length - 1), y = (v: number) => 2 + ((hi - v) * (h - 4)) / span
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`earned by strategies over ${pts.length} days`}>
      <line x1={2} x2={w - 2} y1={y(0)} y2={y(0)} stroke="var(--line2)" strokeDasharray="2 3" />
      <path d={d} fill="none" stroke="var(--paper)" strokeWidth={1.6} />
    </svg>
  )
}

/** One line under the header while the paper account is the one connected. */
export function PaperStrip() {
  const paper = usePaper()
  const [hidden, setHidden] = React.useState(() => { try { return sessionStorage.getItem(STRIP_KEY) === '1' } catch { return false } })
  if (!paper.active || hidden) return null
  const hide = () => { try { sessionStorage.setItem(STRIP_KEY, '1') } catch { /* private mode */ } setHidden(true) }
  return (
    <div className="paper-strip" role="note">
      <span className="pill paper">paper</span>
      <span><b>{paper.session?.name}</b> · play money on real rates — nothing goes on chain{paper.skewDays ? <> · <b>clock +{paper.skewDays} days</b></> : null}</span>
      <span className="sp" />
      {paper.status === 'offline' && <span className="warn" title="The paper service is out of reach; your actions are kept and sent when it is back">offline{paper.pending ? ` · ${paper.pending} queued` : ''}</span>}
      <button onClick={() => void paper.signOut()}>Sign out</button>
      <button onClick={hide} aria-label="Hide for this session">✕</button>
    </div>
  )
}

/** The head of the positions sheet on paper: what strategies earned, the paper clock, the bank, the way out. */
export function PaperPanel() {
  const paper = usePaper()
  const [bank, setBank] = React.useState(false)
  if (!paper.active) return null
  const b = paper.book
  const l = paper.ledger
  const risky = paper.holdings.filter((h) => h.health != null && h.health < 1)
  const rows = l ? Object.entries(l.bank).flatMap(([c, toks]) => Object.entries(toks).map(([t, u]) => ({ c, t, u, m: paper.tokens[metaKey(c, t)], p: paper.price(c, t) }))).filter((r) => r.u > 0).sort((a, z) => (z.p ?? 0) * z.u - (a.p ?? 0) * a.u) : []
  return (
    <div className="paper-card paper-sec" style={{ marginBottom: 14 }}>
      <div className="row2"><span className="pill paper">paper</span><b>{paper.session?.name}</b><span className="t50" style={{ fontSize: 12 }}>· play money on real rates</span>
        <span className="sp" style={{ flex: 1 }} /><span className="t50" style={{ fontSize: 11 }}>{paper.status === 'syncing' ? 'syncing…' : paper.status === 'offline' ? `offline${paper.pending ? ` · ${paper.pending} queued` : ''}` : paper.status === 'ok' ? 'saved' : ''}</span></div>
      {paper.notice && <div className="err" style={{ margin: 0 }}>{paper.notice} <button className="btn sm ghost" onClick={paper.clearNotice}>OK</button></div>}
      {b && <div className="paper-stats">
        <div className="stat"><small>Earned by strategies</small><b className={b.pnlUsd >= 0 ? 'ok' : 'bad'}>{b.pnlUsd >= 0 ? '+' : '−'}{usd(Math.abs(b.pnlUsd))}</b><small>{pct(b.returnPct, 3)} of what was put in</small></div>
        <div className="stat"><small>At work</small><b>{usd(b.deployedUsd)}</b><small>{b.netAprPct != null ? `${pct(b.netAprPct)} net` : 'nothing yet'}</small></div>
        <div className="stat"><small>Put in</small><b>{usd(l?.putInUsd ?? 0)}</b><small>{l?.topups ? `${l.topups} of ${MAX_TOPUPS} top-ups` : 'the starting bank'}</small></div>
      </div>}
      {paper.session && <div className="row2"><span className="lbl" style={{ margin: 0 }}>Daily</span><PaperPnlLine account={paper.session.evm} /></div>}
      {risky.length > 0 && <div className="liq-warn">{risky.map((h) => h.label).join(', ')} would have been liquidated (health {risky.map((h) => h.health!.toFixed(2)).join(', ')}). On paper it stays open — close it to see what is left.</div>}
      <div className="paper-clock">
        <span className="lbl" style={{ margin: 0 }}>Paper clock</span>
        <div className="seg">{DAYS.map((d) => <button key={d} aria-pressed={paper.skewDays === d} onClick={() => paper.setSkewDays(d)}>{d === 0 ? 'Today' : `+${d} days`}</button>)}</div>
      </div>
      {paper.skewDays > 0 && <p className="foot" style={{ margin: 0 }}>A preview: every position accrued {paper.skewDays} days ahead at today's rates. Trading waits until the clock is back at today, and the board always counts real time.</p>}
      <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }} aria-expanded={bank} onClick={() => setBank(!bank)}>{bank ? 'Hide the bank' : `The bank · ${rows.length} balances`}</button>
      {bank && <div className="paper-bank">{rows.map((r) => (
        <div key={r.c + r.t} className="bk"><span>{r.m?.symbol ?? r.t.slice(0, 8)} <span className="t50">{chainLabel(r.c)}</span></span><span className="mono">{num(r.u, 4)}</span><span className="mono t50">{r.p != null ? usd(r.u * r.p) : '—'}</span></div>
      ))}{(l?.inflight ?? []).map((t) => <div key={t.id} className="bk"><span>{paper.tokens[metaKey(t.toChainId, t.token)]?.symbol ?? 'token'} <span className="t50">bridging to {chainLabel(t.toChainId)}</span></span><span className="mono">{num(t.units, 4)}</span><span className="mono t50">lands {new Date(t.arrivesAt).toLocaleTimeString()}</span></div>)}</div>}
      <div className="actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a className="btn sm" href="#/earn">Find a strategy</a>
        <a className="btn sm" href="#/board?by=paper">Paper board</a>
        <button className="btn sm ghost" onClick={() => void paper.signOut()}>Sign out</button>
      </div>
    </div>
  )
}

/**
 * The way in from the home page: before any wallet, and for a connected wallet with nothing in
 * it — the dead end the reviewers hit (tickets/0006 "The feedback").
 */
export function PaperOffer({ empty }: { empty?: boolean }) {
  const paper = usePaper()
  if (paper.active) return null
  return (
    <div className="paper-card">
      <div className="row2" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="pill paper">paper</span><b>{empty ? 'Nothing in this wallet yet' : 'No wallet? Try it on paper'}</b></div>
      <span className="t70" style={{ fontSize: 13 }}>Play money on every chain — 10,000 of each chain's dollar and some of its gas coin — at real rates, real quotes and real risks. Nothing is signed or sent on chain. A name and a password are the whole account.</span>
      <div className="actions">
        <button className="btn paper" onClick={openPaperSignIn}>{paper.session ? `Continue as ${paper.session.name}` : 'Try with paper money'}</button>
      </div>
    </div>
  )
}

/** The account tools in settings. */
export function PaperSettings() {
  const paper = usePaper()
  const exportBook = () => {
    const blob = new Blob([JSON.stringify({ ledger: paper.ledger, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = `paper-${paper.session?.name ?? 'book'}.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }
  return (
    <>
      <div className="sm-h" style={{ marginTop: 14 }}><b>Paper account</b></div>
      {paper.session ? <>
        <p className="sm-p">Signed in as <b>{paper.session.name}</b>{paper.active ? '' : ' (another wallet is connected now)'}. The same name and password open the same account on any device.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!paper.active && <button className="btn sm paper" onClick={openPaperSignIn}>Use it</button>}
          <button className="btn sm" disabled={!paper.ledger} onClick={exportBook}>Export the book</button>
          <button className="btn sm ghost" onClick={() => void paper.signOut()}>Sign out</button>
        </div>
      </> : <>
        <p className="sm-p">Every strategy with play money, no wallet needed.</p>
        <button className="btn sm paper" onClick={openPaperSignIn}>Try with paper money</button>
      </>}
    </>
  )
}

/**
 * A paper account's page (tickets/0006): the index has never seen it, so its positions are the
 * paper ledger's — your own from here, anyone else's from the server (paper books are public, like
 * the board). Valued at each position's own prices when the page has no feed for them.
 */
export function PaperWalletBook({ account }: { account: string }) {
  const paper = usePaper()
  const mine = paper.session?.evm === account
  const q = usePaperBook(mine ? undefined : account)
  const ledger = mine ? paper.ledger : q.data?.ledger ?? null
  const book = mine ? paper.book : q.data?.book ?? null
  const price = mine ? paper.price : () => undefined
  const rows = ledger ? paperHoldings(ledger, Date.now(), price) : []
  if (!mine && q.isLoading) return <div className="card"><div className="empty"><Sk w={220} /></div></div>
  if (!ledger) return <div className="card"><div className="empty">{q.isError ? 'This paper account has no book on the server yet.' : 'No paper book.'}</div></div>
  return (
    <div className="card">
      {book && <div className="paper-stats" style={{ padding: '12px 16px' }}>
        <div className="paper-sec"><div className="stat"><small>Earned by strategies</small><b className={book.pnlUsd >= 0 ? 'ok' : 'bad'}>{book.pnlUsd >= 0 ? '+' : '−'}{usd(Math.abs(book.pnlUsd))}</b><small>{pct(book.returnPct, 3)} since the start</small></div></div>
        <div className="paper-sec"><div className="stat"><small>At work</small><b>{usd(book.deployedUsd)}</b><small>{book.netAprPct != null ? `${pct(book.netAprPct)} net` : 'nothing yet'}</small></div></div>
        <div className="paper-sec"><div className="stat"><small>Paper money</small><b>{usd(book.navUsd)}</b><small>{book.positions} position{book.positions === 1 ? '' : 's'}</small></div></div>
      </div>}
      {!rows.length && <div className="empty">Nothing at work yet — the whole book is in the paper bank.</div>}
      {rows.map((h) => (
        <div key={h.key} className="xrow" style={{ cursor: 'default' }}>
          <span className="xt"><span className="n"><span>{h.label}</span><span className="pill paper">paper</span></span>
            <small>{h.venue} · {chainLabel(h.chainId)}{h.health != null ? <> · <HealthPill h={h.health} /></> : ''}{h.health != null && h.health < 1 ? <> · <span className="liq-warn">would have been liquidated</span></> : ''}</small></span>
          <span className="sp" />
          <span className="xv"><b>{usd(h.valueUsd)}</b><small>{h.apr != null ? <span className="ok">{pct(h.apr)}</span> : '—'}{h.leverage && h.leverage > 1.05 ? ` · ${h.leverage.toFixed(1)}×` : ''}</small></span>
        </div>
      ))}
    </div>
  )
}
