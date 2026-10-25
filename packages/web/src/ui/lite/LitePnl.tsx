import React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { pnlWaiting, unsupportedLine, useAccountPnlBook, type AccountPnlBook } from '@yieldcircle/app/index/pnl'
import { useAccountSync } from '@yieldcircle/app/index/queries'
import { isEvmAddr } from '@yieldcircle/core/model/address'
import { usePaperDaily } from '../../social/queries'
import { usePaper } from '../../state/Paper'
import { boardPositions, pnlSummary, signedMoney, type LiteRow } from '@yieldcircle/core/model/lite'
import { bookKeyOf } from '@yieldcircle/core/model/uid'
import { Sk, pct, usdShort } from '../bits'
import { LiteDetailsDrawer } from './LiteTicketBits'
import { WalletPnl } from '../WalletPnl'
import { pnlNotReadYet } from '@yieldcircle/core/model/holdingPnl'
import { PaperWalletBook } from '../PaperPanel'
import { paperPnlBook } from '@yieldcircle/core/model/paperView'
import { proHref, walletHref } from '../../state/AppState'

/**
 * What you made (docs/lite.md §6), for Lite: one number, one bar, one sentence — the lifetime PnL
 * of your open positions, how much of it was farming and how much the coin's price, and each
 * position's own figure, best first. The same index record Pro's wallet page shows in full
 * (`WalletPnl`); "Every number" opens that page's version in a drawer. A paper account has its
 * own ledger: what the strategies earned, and its daily line.
 */
export function LitePnl({ account, paper, rows, positions }: { account: string; paper: boolean; rows: LiteRow[]; /** how many positions the live book holds once it has settled, to say how many the index has not read; absent while chains are still answering */ positions?: number }) {
  return paper ? <PaperMade account={account} /> : <RealMade account={account} rows={rows} positions={positions} />
}

function RealMade({ account, rows, positions }: { account: string; rows: LiteRow[]; positions?: number }) {
  // You is the owner's own page: its records are asked for, and the book re-read while they are drawn
  const q = useAccountPnlBook(account, { own: true })
  // the index draws a record only for positions it has read. Pro's wallet page hands it the live
  // book's legs as hints (`useAccountSync`, docs/apis.md: hints, never shown), so a position the
  // ledger never saw gets read; You does the same, and re-reads the book once the sync lands
  const sync = useAccountSync(isEvmAddr(account) ? account : undefined)
  const qc = useQueryClient()
  React.useEffect(() => { if (sync.data) void qc.invalidateQueries({ queryKey: ['pnl-book', account.toLowerCase()] }) }, [sync.data, account, qc])
  const [more, setMore] = React.useState(false)
  const liteByKey = React.useMemo(() => {
    const m = new Map<string, LiteRow>()
    for (const r of rows) { const k = bookKeyOf(r.s); if (k) m.set(k.toLowerCase(), r) }
    return m
  }, [rows])
  const b = q.data
  const s = b ? pnlSummary(b) : null
  if (q.isLoading) return <section className="sec lite-sec"><div className="sec-h"><h2>What you made</h2></div><div className="lpnl"><Sk w={160} h={34} /><Sk w={240} h={12} /></div></section>
  const syncing = !!isEvmAddr(account) && !sync.data && !sync.isError
  // no book, or one with nothing in it: say so while there is money at work, instead of a blank
  if (!b || !b.coverage.positions) return positions ? (
    <section className="sec lite-sec">
      <div className="sec-h"><h2>What you made</h2><span className="sub">since each position opened · from the index’s records</span></div>
      <div className="lpnl"><div className="empty t50">{pnlNotReadYet(positions, syncing, q.isError)}</div></div>
    </section>
  ) : null
  const ps = boardPositions(b, (k) => liteByKey.get(k.toLowerCase())?.title ?? null)
  return (
    <section className="sec lite-sec">
      <div className="sec-h"><h2>What you made</h2><span className="sub">since each position opened · from the index’s records</span></div>
      <div className="lpnl">
        {!s ? <div className="empty t50"><Waiting b={b} live={positions} syncing={syncing} gaps={sync.data?.synced === false || sync.data?.state === 'gaps'} /></div> : <>
          <div className="lpnl-top">
            <b className={`lpnl-v ${s.total >= 0 ? 'ok' : 'bad'}`}>{signedMoney(s.total)}</b>
            <span className="lpnl-s t50">{s.aprPct != null ? `${pct(s.aprPct, 1)} a year on what was in` : ''}{s.on < s.of ? ` · on ${s.on} of ${s.of} positions` : ''}</span>
          </div>
          {s.split && s.yield != null && s.price != null && (
            <>
              <div className="lpnl-bar" role="img" aria-label={`${Math.round(s.split.yield * 100)}% farming, ${Math.round(s.split.price * 100)}% price`}>
                <i className={`y ${s.yield < 0 ? 'neg' : ''}`} style={{ flex: `0 0 ${Math.round(s.split.yield * 100)}%` }} />
                <i className={`p ${s.price < 0 ? 'neg' : ''}`} style={{ flex: '1 1 auto' }} />
              </div>
              <div className="lpnl-k">
                <span><i className="dot y" />Farming <b className={s.yield >= 0 ? 'ok' : 'bad'}>{signedMoney(s.yield)}</b></span>
                <span><i className="dot p" />Price <b className={s.price >= 0 ? 'ok' : 'bad'}>{signedMoney(s.price)}</b></span>
              </div>
            </>
          )}
          <p className="lpnl-word">{s.word}</p>
          {(() => {
            const w = pnlWaiting(b)
            const bits = [w.drawing ? `${w.drawing} drawing now` : '', w.waiting ? `${w.waiting} waiting` : '', unsupportedLine(b)].filter(Boolean)
            return bits.length ? <p className="lpnl-word t50">Not in this figure: {bits.join(' · ')}.</p> : null
          })()}
          {b.series.length > 1 && <Spark pts={b.series.map((p) => p.pnl)} up={s.total >= 0} />}
          {ps.length > 0 && (
            <div className="lpnl-pos">
              {ps.slice(0, 4).map((p) => (
                <div key={p.key} className="lpnl-p">
                  <span className="lpnl-pn"><b>{p.title}</b><small className="t50">{p.sub}{p.equityUsd != null ? ` · ${usdShort(p.equityUsd)} in it` : ''}</small></span>
                  <b className={p.pnlUsd >= 0 ? 'ok' : 'bad'}>{signedMoney(p.pnlUsd)}</b>
                </div>
              ))}
              {ps.length > 4 && <div className="lpnl-p t50"><small>and {ps.length - 4} more</small></div>}
            </div>
          )}
          <button type="button" className="lite-details lpnl-more" onClick={() => setMore(true)}><span><b>Every number</b><small>the day-by-day line, yield against price, each strategy</small></span><span aria-hidden>›</span></button>
          <LiteDetailsDrawer open={more} onClose={() => setMore(false)} pro={proHref(walletHref(account))}>
            <div className="lpnl-full"><WalletPnl addr={account} own /></div>
          </LiteDetailsDrawer>
        </>}
      </div>
    </section>
  )
}

/** Why there is nothing yet, in one line: what is being drawn, what the index has not read, what it will never draw. */
function Waiting({ b, live, syncing, gaps }: { b: AccountPnlBook; live?: number; syncing: boolean; gaps: boolean }) {
  const w = pnlWaiting(b)
  const known = b.coverage.positions
  // the venues the index does not follow are not "unread": they are never read
  const unread = live == null ? 0 : Math.max(0, live - known - w.unsupported)
  const bits = [
    w.drawing ? `${w.drawing} position${w.drawing === 1 ? '' : 's'} drawing now — this updates by itself` : '',
    w.waiting ? `${w.waiting} position${w.waiting === 1 ? '' : 's'} waiting to be drawn — the index draws each within a few hours of reading it` : '',
    unread ? `${unread} of your ${live} the index has not read yet${syncing ? ' — syncing them now' : gaps ? ' — some it could not read; the balance above has the live numbers' : ''}` : '',
    unsupportedLine(b),
  ].filter(Boolean)
  return <>No record yet. {bits.length ? bits.join(' · ') + '.' : 'The index draws one per position within a few hours of opening.'}</>
}

/**
 * The paper account, on par with the real one (pos-indexer tickets/0093): the same figure, the same
 * farming / price bar and sentence, the same per-position rows and the same "Every number" drawer
 * — off the paper ledger (`paperPnlBook`), so nothing ever waits to be drawn. What paper adds is
 * the friction line (its costs are known to the cent) and the return on what was put in.
 */
function PaperMade({ account }: { account: string }) {
  const paper = usePaper()
  const daily = usePaperDaily(account, 90)
  const [more, setMore] = React.useState(false)
  // accrual moves the figure by the second; re-fold it twice a minute like the positions sheet
  const [, tick] = React.useReducer((x: number) => x + 1, 0)
  React.useEffect(() => { const t = setInterval(tick, 30_000); return () => clearInterval(t) }, [])
  const l = paper.ledger
  const b = paper.book
  if (!l || !b) return null
  const pb = paperPnlBook(l, paper.viewNow, paper.price)
  const s = pnlSummary(pb)
  const pts = (daily.data?.days ?? []).map((d) => d.pnlUsd)
  return (
    <section className="sec lite-sec">
      <div className="sec-h"><h2>What you made</h2><span className="sub">on paper · since each position opened{paper.skewDays ? ` · previewing +${paper.skewDays} days` : ''}</span></div>
      <div className="lpnl paper">
        {!s ? <div className="empty t50">Nothing made yet. Open a deposit or a loop on paper and its figure shows here at once, accruing by the minute.</div> : <>
          <div className="lpnl-top">
            <b className={`lpnl-v ${s.total >= 0 ? 'ok' : 'bad'}`}>{signedMoney(s.total)}</b>
            <span className="lpnl-s t50">{s.aprPct != null ? `${pct(s.aprPct, 1)} a year on what was in · ` : ''}{pct(b.returnPct, 2)} of what was put in</span>
          </div>
          {s.split && s.yield != null && s.price != null && (
            <>
              <div className="lpnl-bar" role="img" aria-label={`${Math.round(s.split.yield * 100)}% farming, ${Math.round(s.split.price * 100)}% price`}>
                <i className={`y ${s.yield < 0 ? 'neg' : ''}`} style={{ flex: `0 0 ${Math.round(s.split.yield * 100)}%` }} />
                <i className={`p ${s.price < 0 ? 'neg' : ''}`} style={{ flex: '1 1 auto' }} />
              </div>
              <div className="lpnl-k">
                <span><i className="dot y" />Farming <b className={s.yield >= 0 ? 'ok' : 'bad'}>{signedMoney(s.yield)}</b></span>
                <span><i className="dot p" />Price <b className={s.price >= 0 ? 'ok' : 'bad'}>{signedMoney(s.price)}</b></span>
              </div>
            </>
          )}
          <p className="lpnl-word">{s.word}</p>
          {b.frictionUsd > 0.005 && <p className="lpnl-word t50">{usdShort(b.frictionUsd)} of it went on fees, swaps and bridges.</p>}
          {pts.length > 1 ? <Spark pts={pts} up={s.total >= 0} /> : <p className="lpnl-word t50">The day-by-day line starts after a second day.</p>}
          {pb.positions.length > 0 && (
            <div className="lpnl-pos">
              {pb.positions.slice(0, 4).map((p) => (
                <div key={p.key} className="lpnl-p">
                  <span className="lpnl-pn"><b>{p.title}</b><small className="t50">{p.sub} · {usdShort(p.equityUsd)} in it</small></span>
                  <b className={p.pnlUsd >= 0 ? 'ok' : 'bad'}>{signedMoney(p.pnlUsd)}</b>
                </div>
              ))}
              {pb.positions.length > 4 && <div className="lpnl-p t50"><small>and {pb.positions.length - 4} more</small></div>}
            </div>
          )}
          <button type="button" className="lite-details lpnl-more" onClick={() => setMore(true)}><span><b>Every number</b><small>each position, what is at work, what it cost</small></span><span aria-hidden>›</span></button>
          <LiteDetailsDrawer open={more} onClose={() => setMore(false)} pro={proHref(walletHref(account))}>
            <div className="lpnl-full"><PaperWalletBook account={account} inScope={() => true} /></div>
          </LiteDetailsDrawer>
        </>}
      </div>
    </section>
  )
}

/** The running total, as one quiet line with its zero: the shape, not the scale. */
function Spark({ pts, up }: { pts: number[]; up: boolean }) {
  const w = 600, h = 56
  const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts), span = hi - lo || 1
  const x = (i: number) => 2 + (i * (w - 4)) / Math.max(1, pts.length - 1), y = (v: number) => 3 + ((hi - v) * (h - 6)) / span
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const c = up ? 'var(--success)' : 'var(--error)'
  return (
    <svg className="lpnl-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`what you made, day by day, over ${pts.length} days`}>
      <defs><linearGradient id="lpnl-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".22" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient></defs>
      <line x1={2} x2={w - 2} y1={y(0)} y2={y(0)} stroke="var(--line2)" strokeDasharray="3 4" />
      <path d={`${d}L${x(pts.length - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`} fill="url(#lpnl-g)" />
      <path d={d} fill="none" stroke={c} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
