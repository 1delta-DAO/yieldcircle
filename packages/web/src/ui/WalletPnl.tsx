/**
 * What a wallet has MADE (pos-indexer tickets/0084, the wallet book): the
 * lifetime PnL of its open positions summed, and the line it drew getting there
 * (per strategy on the chart's toggle) — the number the board ranks a wallet by, shown
 * where the wallet is. Total PnL counts every price move; Yield takes out each
 * position's money moving against the dollar (ETH going up is not farming).
 *
 * Every figure comes off the index's stored records, so it is approximate and
 * says so: the coverage line names how many positions it is over, and a
 * position the index has not drawn yet is counted as missing, never as zero.
 */
import React from 'react'
import { pnlWaiting, unsupportedLine, useAccountPnlBook, strategyLabel, type AccountPnlBook, type PnlBookPoint } from '@yieldcircle/app/index/pnl'
import { Sk, pct, usd, usdShort } from './bits'

/** one hue per charted strategy, in the breakdown's order */
const HUES = ['#60a5fa', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#22d3ee', '#facc15', '#fb7185']
const signed = (v: number | null | undefined) => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + usd(Math.abs(v)).replace(/^-/, ''))
const signedShort = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + usdShort(Math.abs(v))
const day = (t: string) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })


/** The charted strategies' hues by strategy key, in the breakdown's order: the chart's lines and the cards' swatches. */
export function strategyHues(b: AccountPnlBook): Map<string, string> {
  return new Map(b.strategies.filter((s) => s.series && s.series.length > 1).map((s, i) => [s.key, HUES[i % HUES.length]]))
}
export type PnlBy = 'total' | 'strategy'
/**
 * `own`: the connected wallet's own page — its records are asked for and the book re-read while they are drawn (tickets/0093).
 * Each position's own figure is on the page's own list (Wallet.tsx's cards, Lite You's rows —
 * tickets/0017), so there is no strategy table here. `cards`: the Total / By strategy choice is the
 * page's, so its cards can wear the hues.
 */
export function WalletPnl({ addr, own = false, cards, book }: {
  addr: string; own?: boolean; cards?: { by: PnlBy; onBy: (by: PnlBy) => void }
  /** a book read by the caller — You's, merged over the owner's EVM and Solana wallets (tickets/0018) — instead of `addr`'s own */
  book?: { data: AccountPnlBook | null | undefined; isLoading: boolean }
}) {
  const own1 = useAccountPnlBook(book ? undefined : addr, { own })
  const q = book ?? own1
  const b = q.data
  if (q.isLoading) return <section className="sec"><div className="sec-h"><h2>What it made</h2></div><div className="card"><div className="empty"><Sk w={260} /></div></div></section>
  // an older index (no route), an error, or a wallet with nothing on the board: say nothing here
  if (!b || !b.coverage.positions) return null
  return (
    <section className="sec">
      <div className="sec-h">
        <h2>What it made</h2>
        <span className="sub"><Coverage b={b} /></span>
      </div>
      {b.coverage.withPnl === 0 ? (
        <div className="card"><div className="empty">
          No lifetime record yet. The index draws one per position in the background
          {waitingWords(b)}; each position’s own history opens from its card below.
          {unsupportedLine(b) ? ` ${unsupportedLine(b)}.` : ''}
        </div></div>
      ) : <Book b={b} addr={addr} cards={cards} />}
    </section>
  )
}

/** " — 2 drawing now, 1 waiting", or the older index's plain count */
function waitingWords(b: AccountPnlBook): string {
  const w = pnlWaiting(b)
  const bits = [w.drawing ? `${w.drawing} drawing now` : '', w.waiting ? `${w.waiting} waiting` : ''].filter(Boolean)
  return bits.length ? ` — ${bits.join(', ')}` : ''
}

function Coverage({ b }: { b: AccountPnlBook }) {
  const c = b.coverage
  const off = Object.entries(c.unranked).reduce((s, [, n]) => s + n, 0)
  const why = [
    c.pending ? `${c.pending} not drawn yet` : '',
    unsupportedLine(b),
    off ? `${off} without a reliable record (${Object.entries(c.unranked).map(([k, n]) => `${n} ${k}`).join(', ')})` : '',
  ].filter(Boolean).join(' · ')
  return (
    <span title={why || undefined}>
      lifetime, open positions · on {c.withPnl} of {c.positions} position{c.positions === 1 ? '' : 's'}
      {c.equityShare != null && c.withPnl < c.positions ? ` (${Math.round(c.equityShare * 100)} % of the value)` : ''}
      {' · approximate, from the index’s records'}
    </span>
  )
}

function Book({ b, addr, cards }: { b: AccountPnlBook; addr: string; cards?: { by: PnlBy; onBy: (by: PnlBy) => void } }) {
  const [own, setOwn] = React.useState<PnlBy>('total')
  const by = cards?.by ?? own, setBy = cards?.onBy ?? setOwn
  const charted = b.strategies.filter((s) => s.series && s.series.length > 1)
  const t = b.total
  return (
    <div className="card wpnl">
      <div className="wpnl-top">
        <Fig k="Total PnL" v={signed(t.pnlUsd)} c={t.pnlUsd < 0 ? 'bad' : 'ok'} s={`${pct(t.pnlAprPct)} lifetime APR`} tip="every gain and loss since each position opened, price moves included" />
        <Fig k="Yield" v={signed(t.yieldUsd)} c={t.yieldUsd < 0 ? 'bad' : 'ok'} s={`${pct(t.yieldAprPct)} APR`} tip="the PnL without each position’s money moving against the dollar: what farming made, not what holding ETH or BTC made" />
        <Fig k="Price move" v={signed(t.directionalUsd)} c="" s="the money vs the dollar" tip="Total PnL − Yield: the part that came from the held money’s own price" />
        {(() => {
          const d = spanDays(b)
          return d == null
            ? <Fig k="Capital" v="—" c="" s="span not known yet" tip="the average capital the APR is over needs the positions’ open span, which this index does not state yet" />
            : <Fig k="Capital" v={usdShort(t.capitalDays / d)} c="" s={`avg over ${Math.round(d)} day${Math.round(d) === 1 ? '' : 's'}`} tip="the average capital the APR is over: Σ capital-days ÷ the longest position’s span" />
        })()}
      </div>
      {b.series.length < 2 && <div className="t50 wpnl-wait">The day-by-day line is still being drawn — the index redraws each position’s record in the background, biggest first.</div>}
      {b.series.length > 1 && b.coverage.withLine != null && b.coverage.withLine < b.coverage.withPnl && (
        <div className="t50 wpnl-wait">The chart covers {b.coverage.withLine} of {b.coverage.withPnl} positions: the index is still redrawing the other {b.coverage.withPnl - b.coverage.withLine} with a day-by-day line, and they count in the figures above only.</div>
      )}
      {b.series.length > 1 && (
        <>
          <div className="wpnl-seg">
            <div className="seg sm">
              <button aria-pressed={by === 'total'} onClick={() => setBy('total')}>Total</button>
              <button aria-pressed={by === 'strategy'} disabled={!charted.length} onClick={() => setBy('strategy')}>By strategy</button>
            </div>
          </div>
          <Chart lines={by === 'total'
            ? [{ id: 'pnl', name: 'Total PnL', pts: b.series, v: (p) => p.pnl, main: true }, { id: 'yield', name: 'Yield', pts: b.series, v: (p) => p.yield, dashed: true }]
            : charted.map((s, i) => ({ id: s.key, name: strategyLabel(s), pts: s.series!, v: (p: PnlBookPoint) => p.pnl, hue: HUES[i % HUES.length] }))} />
        </>
      )}
    </div>
  )
}

/** The longest open span (days): the index's own figure, else the drawn line's; null when neither exists. */
const spanDays = (b: AccountPnlBook): number | null => {
  if (b.total.openDays != null && b.total.openDays > 0) return Math.max(1, b.total.openDays)
  const first = b.series.length > 1 ? b.series[0].t : null
  return first ? Math.max(1, (Date.now() - Date.parse(first)) / 86_400_000) : null
}

function Fig({ k, v, s, c, tip }: { k: string; v: string; s: string; c: string; tip: string }) {
  return <div className="wpnl-fig" title={tip}><span className="t50">{k}</span><b className={c}>{v}</b><small className="t50">{s}</small></div>
}

interface Line { id: string; name: string; pts: PnlBookPoint[]; v: (p: PnlBookPoint) => number; main?: boolean; dashed?: boolean; hue?: string }

/** The running PnL: one calendar for every line, a zero line, a readout under the cursor. */
function Chart({ lines }: { lines: Line[] }) {
  const W = 640, H = 180, padL = 8, padR = 8
  const [hover, setHover] = React.useState<number | null>(null)
  const gid = React.useId().replace(/:/g, '')
  const all = lines.flatMap((l) => l.pts.map((p) => Date.parse(p.t)))
  const t0 = Math.min(...all), t1 = Math.max(...all)
  const x = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * (W - padL - padR)
  const vs = lines.flatMap((l) => l.pts.map(l.v))
  let lo = Math.min(0, ...vs), hi = Math.max(0, ...vs)
  if (hi - lo < 1e-9) hi = lo + 1
  const y = (v: number) => 10 + ((hi - v) / (hi - lo)) * (H - 20)
  const d = (l: Line) => l.pts.map((p, i) => `${i ? 'L' : 'M'}${x(Date.parse(p.t)).toFixed(1)},${y(l.v(p)).toFixed(1)}`).join('')
  const main = lines.find((l) => l.main)
  const dir = main ? ((main.v(main.pts[main.pts.length - 1]) ?? 0) >= 0 ? 'up' : 'down') : 'up'
  // the hovered time, and each line's value at it (the line's last point at or before it)
  const tx = hover ?? t1
  const at = (l: Line) => {
    let best: PnlBookPoint | null = null
    for (const p of l.pts) if (Date.parse(p.t) <= tx) best = p
    return best ? l.v(best) : null
  }
  const onMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    setHover(Math.max(t0, Math.min(t1, t0 + (((ev.clientX - r.left) / r.width) * W - padL) / (W - padL - padR) * (t1 - t0))))
  }
  const ax = [hi, lo, 0].filter((v, i, a) => a.indexOf(v) === i)
  return (
    <div className="pnl-chart wpnl-chart">
      <div className="wpnl-read">
        <span className="mono">{day(new Date(tx).toISOString())}</span>
        {lines.slice(0, 8).map((l) => {
          const v = at(l)
          return <span key={l.id} className="wpnl-rv"><i className="wpnl-sw" style={{ background: l.hue ?? (l.dashed ? 'var(--tx50)' : dir === 'up' ? 'var(--success)' : 'var(--error)') }} />{l.name} <b className={v != null && v < 0 ? 'bad' : ''}>{v == null ? '—' : signed(v)}</b></span>
        })}
      </div>
      <div className="pnl-rwrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="pnl-svg wpnl-svg" onPointerMove={onMove} onPointerLeave={() => setHover(null)} preserveAspectRatio="none">
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" className={`pnl-gs0 ${dir}`} />
              <stop offset="1" className={`pnl-gs1 ${dir}`} />
            </linearGradient>
          </defs>
          {main && <path className="pnl-area" fill={`url(#${gid})`} d={`${d(main)}L${x(Date.parse(main.pts[main.pts.length - 1].t)).toFixed(1)},${y(0).toFixed(1)}L${x(Date.parse(main.pts[0].t)).toFixed(1)},${y(0).toFixed(1)}Z`} />}
          <line className="pnl-zero" x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} />
          {lines.map((l) => l.main
            ? <path key={l.id} className={`pnl-line ${dir}`} d={d(l)} />
            : <path key={l.id} className={l.dashed ? 'pnl-con wpnl-yield' : 'wpnl-sline'} style={l.hue ? { stroke: l.hue } : undefined} d={d(l)} />)}
          {hover != null && <line className="pnl-hover" x1={x(hover)} x2={x(hover)} y1={4} y2={H - 4} />}
        </svg>
        {ax.map((v, i) => <span key={i} className="pnl-ax t40" style={{ top: `${(y(v) / H) * 100}%` }}>{v === 0 ? '$0' : signedShort(v)}</span>)}
      </div>
      <div className="pnl-legend t50">
        <span className="sp" />
        <span className="mono">{day(new Date(t0).toISOString())} → now</span>
      </div>
    </div>
  )
}
