/**
 * What a wallet has MADE (pos-indexer tickets/0084, the wallet book): the
 * lifetime PnL of its open positions summed, the line it drew getting there,
 * and the same per strategy — the number the board ranks a wallet by, shown
 * where the wallet is. Total PnL counts every price move; Yield takes out each
 * position's money moving against the dollar (ETH going up is not farming).
 *
 * Every figure comes off the index's stored records, so it is approximate and
 * says so: the coverage line names how many positions it is over, and a
 * position the index has not drawn yet is counted as missing, never as zero.
 */
import React from 'react'
import { pnlWaiting, unsupportedLine, useAccountPnlBook, strategyLabel, type AccountPnlBook, type PnlBookPoint, type PnlBookStrategy } from '../index/pnl'
import { indexChainLabel } from '@yieldcircle/core/index/types'
import { chainLabel } from '../sdk/queries'
import { go } from '../state/AppState'
import { ProtocolLogo, Sk, pct, protocolIconUrls, usd, usdShort } from './bits'
import { prettyProtocol } from './ProtocolFilter'

/** one hue per charted strategy, in the breakdown's order */
const HUES = ['#60a5fa', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#22d3ee', '#facc15', '#fb7185']
const signed = (v: number | null | undefined) => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + usd(Math.abs(v)).replace(/^-/, ''))
const signedShort = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + usdShort(Math.abs(v))
const day = (t: string) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })

/** Opens a position's PnL drawer over the wallet page (Wallet.tsx `openPnl`'s twin). */
function openPnl(who: string, posKey: string) {
  go(`w/${who}`, { pos: posKey })
  history.replaceState({ ...(history.state ?? {}), pnl: true }, '')
}

/** `own`: the connected wallet's own page — its records are asked for and the book re-read while they are drawn (tickets/0093). */
export function WalletPnl({ addr, own = false }: { addr: string; own?: boolean }) {
  const q = useAccountPnlBook(addr, { own })
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
          {waitingWords(b)}; each position’s own history is under its <b>PnL</b> button below.
          {unsupportedLine(b) ? ` ${unsupportedLine(b)}.` : ''}
        </div></div>
      ) : <Book b={b} addr={addr} />}
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

function Book({ b, addr }: { b: AccountPnlBook; addr: string }) {
  const [by, setBy] = React.useState<'total' | 'strategy'>('total')
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
      <Strategies b={b} addr={addr} hues={by === 'strategy' ? new Map(charted.map((s, i) => [s.key, HUES[i % HUES.length]])) : null} />
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

/** Each strategy's lifetime PnL as a bar from zero, its yield and APR; a click opens its biggest position. */
function Strategies({ b, addr, hues }: { b: AccountPnlBook; addr: string; hues: Map<string, string> | null }) {
  const max = Math.max(1e-9, ...b.strategies.map((s) => Math.abs(s.pnlUsd)))
  const [all, setAll] = React.useState(false)
  const shown = all ? b.strategies : b.strategies.slice(0, 8)
  const top = (s: PnlBookStrategy) =>
    b.positions.filter((p) => p.strategyKey === s.key && p.status === 'ok').sort((x, y) => (y.equityUsd ?? 0) - (x.equityUsd ?? 0))[0]?.key
  return (
    <div className="wpnl-strats">
      <div className="wpnl-sh t50"><span>Strategy</span><span /><span className="num">PnL</span><span className="num">Yield</span><span className="num">APR</span></div>
      {shown.map((s) => {
        const k = top(s)
        const w = (Math.abs(s.pnlUsd) / max) * 50
        return (
          <button key={s.key} className="wpnl-srow" onClick={() => k && openPnl(addr, k)} disabled={!k}
            title={`${strategyLabel(s)} — ${s.positions} position${s.positions === 1 ? '' : 's'}${s.since ? ` since ${day(s.since)}` : ''}; open its biggest position’s PnL history`}>
            <span className="wpnl-sname">
              {hues?.get(s.key) && <i className="wpnl-sw" style={{ background: hues.get(s.key) }} />}
              {s.protocol && <ProtocolLogo urls={protocolIconUrls(s.protocol)} name={prettyProtocol(s.protocol)} />}
              <b className="wpnl-one">{strategyLabel(s)}</b>
              <small className="t50 wpnl-one">
                {s.kind === 'loop' ? 'loop' : s.kind === 'deposit' ? 'deposit' : 'position'}
                {s.market && s.market !== strategyLabel(s) ? ` · ${s.market}` : s.protocol?.startsWith('vault.') ? ` · ${s.held.join(' + ')}` : ''}
                {s.protocol ? ` · ${prettyProtocol(s.protocol)}` : ''}
                {' · '}{s.chains.map((c) => indexChainLabel(c, chainLabel)).join(', ')}
                {s.positions > 1 ? ` · ${s.positions} positions` : ''}
                {` · ${usdShort(s.equityUsd)} now`}
              </small>
            </span>
            <span className="wpnl-bar" aria-hidden>
              <i className={s.pnlUsd < 0 ? 'neg' : 'pos'} style={s.pnlUsd < 0 ? { right: '50%', width: `${w}%` } : { left: '50%', width: `${w}%` }} />
            </span>
            <b className={`num ${s.pnlUsd < 0 ? 'bad' : 'ok'}`}>{signedShort(s.pnlUsd)}</b>
            <span className={`num ${s.yieldUsd < 0 ? 'bad' : ''}`}>{signedShort(s.yieldUsd)}</span>
            <span className="num" title={`yield ${pct(s.yieldAprPct)} APR`}>{pct(s.pnlAprPct)}</span>
          </button>
        )
      })}
      {b.strategies.length > 8 && <button className="linklike wpnl-more" onClick={() => setAll(!all)}>{all ? 'fewer' : `all ${b.strategies.length} strategies`}</button>}
    </div>
  )
}
