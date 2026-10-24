import React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccountPnlBook } from '../../index/pnl'
import { useAccountSync } from '../../index/queries'
import { isEvmAddr } from '../../model/address'
import { usePaperDaily } from '../../social/queries'
import { usePaper } from '../../state/Paper'
import { boardPositions, pnlSummary, signedMoney, type LiteRow } from '../../model/lite'
import { bookKeyOf } from '../../model/uid'
import { Sk, pct, usdShort } from '../bits'
import { LiteDetailsDrawer } from './LiteTicketBits'
import { WalletPnl } from '../WalletPnl'
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
  const q = useAccountPnlBook(account)
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
  if (!b || !b.coverage.positions) return null
  const ps = boardPositions(b, (k) => liteByKey.get(k.toLowerCase())?.title ?? null)
  return (
    <section className="sec lite-sec">
      <div className="sec-h"><h2>What you made</h2><span className="sub">since each position opened · from the index’s records</span></div>
      <div className="lpnl">
        {!s ? <div className="empty t50"><Waiting pending={b.coverage.pending} known={b.coverage.positions} live={positions} syncing={!!isEvmAddr(account) && !sync.data && !sync.isError} gaps={sync.data?.synced === false || sync.data?.state === 'gaps'} /></div> : <>
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
            <div className="lpnl-full"><WalletPnl addr={account} /></div>
          </LiteDetailsDrawer>
        </>}
      </div>
    </section>
  )
}

/** Why there is nothing yet, in one line: what is being drawn, what the index has not read, what is on its way. */
function Waiting({ pending, known, live, syncing, gaps }: { pending: number; known: number; live?: number; syncing: boolean; gaps: boolean }) {
  const unread = live == null ? 0 : Math.max(0, live - known)
  const bits = [
    pending ? `${pending} position${pending === 1 ? '' : 's'} waiting to be drawn — the index draws each within a few hours of reading it` : '',
    unread ? `${unread} of your ${live} the index has not read yet${syncing ? ' — syncing them now' : gaps ? ' — some it could not read; the balance above has the live numbers' : ''}` : '',
  ].filter(Boolean)
  return <>No record yet. {bits.length ? bits.join(' · ') + '.' : 'The index draws one per position within a few hours of opening.'}</>
}

/** The paper account: what its strategies earned (the ledger's own figure) and its daily line. */
function PaperMade({ account }: { account: string }) {
  const paper = usePaper()
  const daily = usePaperDaily(account, 90)
  const b = paper.book
  if (!b) return null
  const pts = (daily.data?.days ?? []).map((d) => d.pnlUsd)
  return (
    <section className="sec lite-sec">
      <div className="sec-h"><h2>What you made</h2><span className="sub">on paper · what the strategies earned, costs included</span></div>
      <div className="lpnl paper">
        <div className="lpnl-top">
          <b className={`lpnl-v ${b.pnlUsd >= 0 ? 'ok' : 'bad'}`}>{signedMoney(b.pnlUsd)}</b>
          <span className="lpnl-s t50">{pct(b.returnPct, 2)} of what was put in{b.frictionUsd > 0.005 ? ` · ${usdShort(b.frictionUsd)} of it went on fees and swaps` : ''}</span>
        </div>
        {pts.length > 1 ? <Spark pts={pts} up={b.pnlUsd >= 0} /> : <p className="lpnl-word t50">The day-by-day line starts after a second day.</p>}
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
