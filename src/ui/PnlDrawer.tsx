/**
 * One position's PnL history (pos-indexer tickets/0061, docs/pnl-series.md):
 * what it was worth at every midnight since it opened, what the holder had put
 * in by then, and the difference — with every move on the line and a plain
 * statement of how exact each leg's walk is.
 *
 * Built for checking the index as much as for reading a wallet: the legs'
 * flags are spelled out, the moves link to the transactions, and an
 * approximate line says why. History, not the live position — the connected
 * user's own row may open it too.
 */
import React from 'react'
import { Drawer } from './Drawer'
import { usePositionSeries } from '../index/queries'
import type { PositionSeries, SeriesEvent } from '../index/api'
import { Sk, TxLink, pct, usd, usdShort } from './bits'
import { chainLabel } from '../sdk/queries'
import { marketHref } from '../state/AppState'

const FLAG_WORDS: Record<string, string> = {
  'negative-units': 'the ledger misses a move here: walked back, the balance goes below zero (drawn at zero)',
  'dex-transfers-unseen': 'vault shares bought or sold on a DEX are not ledger rows — this line can miss them',
  'index-backfilled': 'the interest index starts later than this line: flat before its first point',
  'no-index': 'no interest index for this market: drawn without interest',
  snapshot: 'a row states an absolute balance and is not walked',
  'amountless-row': 'a “withdraw all” row names no amount',
  'converted-row': 'a row without units was converted at the index of its hour',
  uncalibrated: 'the index scale could not be checked against the read',
  'no-decimals': 'token decimals unknown (18 assumed)',
  impaired: 'the market cannot pay this leg — its value is a phantom',
  'unpriced-flow': 'a move had no price at all: what was put in, and so the PnL, is unknown from there',
  'flow-priced-nearby': 'a move had no price in its own hour and is valued at the nearest price within two weeks',
}
const KIND_CLASS: Record<string, string> = {
  deposit: 'k-in', transfer_in: 'k-in', repay: 'k-in',
  withdraw: 'k-out', transfer_out: 'k-out',
  borrow: 'k-borrow', liquidated: 'k-liq', redeemed: 'k-liq',
}
const day = (t: string) => t.slice(0, 10)
const signed = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${usd(Math.abs(v))}`)

export function PnlDrawer({ account, posKey, onClose }: { account: string; posKey: string | undefined; onClose: () => void }) {
  const q = usePositionSeries(account, posKey)
  const s = q.data
  return (
    <Drawer open={!!posKey} onClose={onClose} side="right" label="Position history" wide>
      {q.isLoading && <div className="empty"><Sk w={260} /></div>}
      {q.error ? <div className="note">The index could not build this line: {(q.error as Error).message}</div> : null}
      {s && <Body s={s} />}
    </Drawer>
  )
}

function Body({ s }: { s: PositionSeries }) {
  const [mode, setMode] = React.useState<'usd' | 'asset'>('usd')
  const last = s.points.at(-1)
  const syms = [...new Set(s.legs.map((l) => l.symbol ?? '?'))]
  const putIn = last?.contribUsd ?? null
  const pnl = last?.pnlUsd ?? null
  const canAsset = s.points.some((p) => p.navAsset != null)
  return (
    <div className="pnl">
      <div className="pnl-h">
        <b>{syms.join(' / ')}</b> <span className="t50">· {s.legs[0]?.lenderKey} · {chainLabel(s.chainId)}</span>
        <div className="t50 pnl-sub">
          {s.since ? <>older than the ledger — drawn from {day(s.since)}, valued as if bought that day</> : s.start ? <>opened {day(s.start)}</> : 'no history'}
        </div>
      </div>

      <div className="pnl-stats">
        <Stat k="Value now" v={usd(last?.navUsd)} />
        <Stat k="Put in" v={putIn == null ? 'unknown' : usd(putIn)} s={putIn == null ? 'a move had no price' : 'deposits − withdrawals, borrows out, repays in'} />
        <Stat k="PnL" v={<span className={pnl == null ? '' : pnl >= 0 ? 'ok' : 'bad'}>{signed(pnl)}</span>}
          s={putIn && pnl != null && putIn > 0 ? pct((pnl / putIn) * 100) + ' of what was put in' : undefined} />
      </div>

      <div className={`pnl-exact ${s.exact ? 'ok' : 'warn'}`}>
        {s.exact ? 'Exact: every leg walks on its own units and the lender’s own index.' : 'Approximate — see the legs below for why.'}
        {s.unpriced > 0 && <span className="t50"> · {s.unpriced} day{s.unpriced === 1 ? '' : 's'} without a price (gaps in the line)</span>}
        {' '}<span className="t50">Rewards are not included.</span>
      </div>

      {canAsset && (
        <div className="seg sm pnl-mode" role="group" aria-label="Unit">
          <button aria-pressed={mode === 'usd'} onClick={() => setMode('usd')}>USD</button>
          <button aria-pressed={mode === 'asset'} onClick={() => setMode('asset')}>{s.assetSymbol ?? 'asset'}</button>
        </div>
      )}
      <Chart s={s} mode={mode} />

      <h3 className="pnl-t">Legs</h3>
      <table className="tbl pnl-legs">
        <thead><tr><th>Leg</th><th>Walk</th><th className="r">Rows</th><th>Check</th></tr></thead>
        <tbody>
          {s.legs.map((l, i) => (
            <tr key={i} onClick={() => { location.hash = marketHref(l.marketUid) }}>
              <td><b>{l.symbol ?? '?'}</b> <span className="t50">{l.side === 'borrow' ? 'debt' : l.side}</span></td>
              <td className="t70" title={`unit kind ${l.unitKind}`}>{l.walk === 'units' ? 'units' : 'amount'} · {l.indexSource === 'log' ? 'lender’s index' : l.indexSource === 'cache' ? 'hourly index' : 'no index'}</td>
              <td className="r">{l.rows}</td>
              <td>
                <span className={l.exact ? 'ok' : 'warn'}>{l.exact ? 'exact' : 'approx'}</span>
                <span className="t50"> · {l.closed ? 'closed — its moves net to zero' : l.openedInRange ? 'walks back to 0 ✓' : `older (${pct(l.openResidual * 100, 1)} before first row)`}</span>
                {l.flags.map((f) => <div key={f} className="t50 pnl-flag">{FLAG_WORDS[f] ?? f}</div>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {s.unanchored.length > 0 && (
        <div className="note">Not on the line: {s.unanchored.map((u) => `${u.rows} ${u.side} row${u.rows === 1 ? '' : 's'} in ${u.marketUid.split(':')[0]}`).join(', ')} — no read has anchored that leg yet.</div>
      )}

      <h3 className="pnl-t">Moves <span className="t50">({s.events.length})</span></h3>
      <div className="pnl-ev">
        {[...s.events].reverse().map((e, i) => <EventRow key={i} e={e} s={s} />)}
      </div>
      <div className="t40 pnl-key mono" title="the position key the index answered for">{s.key}</div>
    </div>
  )
}

function EventRow({ e, s }: { e: SeriesEvent; s: PositionSeries }) {
  const leg = s.legs[e.leg]
  return (
    <div className="pnl-e">
      <span className="t50 mono">{e.t.slice(0, 16).replace('T', ' ')}</span>
      <span className={`verb ${KIND_CLASS[e.kind] ?? ''}`}>{e.kind.replace('_', ' ')}</span>
      <span>{e.amount != null ? `${fmtAmt(e.amount)} ${leg?.symbol ?? ''}` : '—'}</span>
      <span className="r">{usdShort(e.amountUsd)}</span>
      <span className={`r ${e.flowUsd == null ? 'bad' : e.flowUsd > 0 ? 'ok' : e.flowUsd < 0 ? 'warn' : 't40'}`} title={e.flowUsd == null ? 'no price for this move' : e.flowUsd === 0 ? 'not a flow: the holder did not choose it' : 'money in (+) or out (−) of the position'}>
        {e.flowUsd === null ? '?' : e.flowUsd === 0 ? '·' : signed(e.flowUsd)}
      </span>
      <TxLink chainId={s.chainId} hash={e.txHash} />
    </div>
  )
}

const fmtAmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : Math.abs(n) >= 1 ? 2 : 6 })

function Stat({ k, v, s }: { k: string; v: React.ReactNode; s?: string }) {
  return <div className="pnl-stat"><span className="t50">{k}</span><b>{v}</b>{s && <small className="t50">{s}</small>}</div>
}

/**
 * Monotone cubic through one run of points (Fritsch–Carlson, what d3 calls
 * curveMonotoneX): smooth, but never overshooting past a data point — a spike
 * stays a spike of its own height, not a bounce above it.
 */
function monotone(xs: number[], ys: number[]): string {
  const n = xs.length
  if (n < 2) return ''
  const m: number[] = []
  for (let i = 0; i < n - 1; i++) m.push((ys[i + 1] - ys[i]) / Math.max(1e-9, xs[i + 1] - xs[i]))
  const t = [m[0]]
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2)
  t.push(m[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h = Math.hypot(a, b)
    if (h > 3) { t[i] = (3 / h) * a * m[i]; t[i + 1] = (3 / h) * b * m[i] }
  }
  let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const dx = (xs[i + 1] - xs[i]) / 3
    d += `C${(xs[i] + dx).toFixed(1)},${(ys[i] + t[i] * dx).toFixed(1)} ${(xs[i + 1] - dx).toFixed(1)},${(ys[i + 1] - t[i + 1] * dx).toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`
  }
  return d
}

/** Consecutive non-null points as runs — a day without a price stays a gap in every path. */
function runs(vs: (number | null | undefined)[], X: number[]): { xs: number[]; ys: number[] }[] {
  const out: { xs: number[]; ys: number[] }[] = []
  let cur: { xs: number[]; ys: number[] } | null = null
  vs.forEach((v, i) => {
    if (v == null) { cur = null; return }
    if (!cur) { cur = { xs: [], ys: [] }; out.push(cur) }
    cur.xs.push(X[i]); cur.ys.push(v)
  })
  return out
}

/**
 * Value (solid, over a soft fill) and money put in (dashed) over time, the
 * PnL band under it, and a tick on the axis for every move: green in, amber
 * out, red a liquidation. Lines are monotone-smoothed between the daily
 * points; a day with no price is a gap, never a straight line.
 */
function Chart({ s, mode }: { s: PositionSeries; mode: 'usd' | 'asset' }) {
  const W = 640, H = 220, PH = 80, padL = 8, padR = 8, padT = 10
  const pts = s.points
  const [hover, setHover] = React.useState<number | null>(null)
  if (pts.length < 2) return <div className="empty">Not enough history to draw yet.</div>
  const t0 = Date.parse(pts[0].t), t1 = Date.parse(pts[pts.length - 1].t)
  const x = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * (W - padL - padR)
  const X = pts.map((p) => x(Date.parse(p.t)))
  const nav = pts.map((p) => (mode === 'usd' ? p.navUsd : p.navAsset))
  const con = pts.map((p) => (mode === 'usd' ? p.contribUsd : null))
  const pnl = pts.map((p) => (mode === 'usd' ? p.pnlUsd : null))
  const vals = [...nav, ...con].filter((v): v is number => v != null)
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals)
  if (hi - lo < 1e-9) hi = lo + 1
  const y = (v: number) => padT + ((hi - v) / (hi - lo)) * (H - padT - 16)
  const stepPath = (vs: (number | null)[]) => {
    let d = '', on = false
    vs.forEach((v, i) => {
      if (v == null) { on = false; return }
      const Xi = X[i].toFixed(1), Y = y(v).toFixed(1)
      d += on ? `H${Xi}V${Y}` : `M${Xi},${Y}`
      on = true
    })
    return d
  }
  const navRuns = runs(nav, X).map((r) => ({ ...r, ys: r.ys.map(y) }))
  const navPath = navRuns.map((r) => monotone(r.xs, r.ys)).join('')
  // the fill closes to the zero line, so the shade is "what the position is worth", not chart junk
  const navArea = navRuns
    .filter((r) => r.xs.length > 1)
    .map((r) => `${monotone(r.xs, r.ys)}L${r.xs[r.xs.length - 1].toFixed(1)},${y(0).toFixed(1)}L${r.xs[0].toFixed(1)},${y(0).toFixed(1)}Z`)
    .join('')
  const pv = pnl.filter((v): v is number => v != null)
  const plo = Math.min(0, ...pv), phi = Math.max(0, ...pv, plo + 1)
  const py = (v: number) => 4 + ((phi - v) / (phi - plo)) * (PH - 8)
  const pnlRuns = runs(pnl, X).map((r) => ({ ...r, ys: r.ys.map(py) }))
  const pnlPath = pnlRuns.map((r) => monotone(r.xs, r.ys)).join('')
  const pnlArea = pnlRuns
    .filter((r) => r.xs.length > 1)
    .map((r) => `${monotone(r.xs, r.ys)}L${r.xs[r.xs.length - 1].toFixed(1)},${py(0).toFixed(1)}L${r.xs[0].toFixed(1)},${py(0).toFixed(1)}Z`)
    .join('')
  const onMove = (ev: React.MouseEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    const tx = t0 + ((ev.clientX - r.left) / r.width * W - padL) / (W - padL - padR) * (t1 - t0)
    let best = 0
    pts.forEach((p, i) => { if (Math.abs(Date.parse(p.t) - tx) < Math.abs(Date.parse(pts[best].t) - tx)) best = i })
    setHover(best)
  }
  const hp = hover != null ? pts[hover] : null
  const fmt = (v: number | null | undefined) => (v == null ? '—' : mode === 'usd' ? usd(v) : `${fmtAmt(v)} ${s.assetSymbol ?? ''}`)
  return (
    <div className="pnl-chart">
      <div className="pnl-read t70">
        {hp ? <>
          <span className="mono">{day(hp.t)}</span> · value <b>{fmt(mode === 'usd' ? hp.navUsd : hp.navAsset)}</b>
          {mode === 'usd' && <> · in <b>{hp.contribUsd == null ? 'unknown' : usd(hp.contribUsd)}</b> · PnL <b className={hp.pnlUsd != null && hp.pnlUsd < 0 ? 'bad' : 'ok'}>{signed(hp.pnlUsd)}</b></>}
        </> : <span className="t40">hover the line for a day’s numbers</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="pnl-svg" onMouseMove={onMove} onMouseLeave={() => setHover(null)} preserveAspectRatio="none">
        <defs>
          <linearGradient id="pnl-g-nav" x1="0" y1="0" x2="0" y2="1">
            <stop className="pnl-gs0" offset="0" />
            <stop className="pnl-gs1" offset="1" />
          </linearGradient>
        </defs>
        <line className="pnl-zero" x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} />
        <path className="pnl-area" d={navArea} fill="url(#pnl-g-nav)" />
        {mode === 'usd' && <path className="pnl-con" d={stepPath(con)} />}
        <path className="pnl-nav" d={navPath} />
        {s.events.map((e, i) => {
          const Xe = x(Date.parse(e.t))
          const c = e.flowUsd == null ? 'liq' : e.flowUsd > 0 ? 'in' : e.flowUsd < 0 ? 'out' : 'liq'
          return <line key={i} className={`pnl-tick ${c}`} x1={Xe} x2={Xe} y1={H - 12} y2={H - 5}><title>{`${e.t.slice(0, 16)} ${e.kind} ${usdShort(e.amountUsd)}`}</title></line>
        })}
        {hover != null && <line className="pnl-hover" x1={X[hover]} x2={X[hover]} y1={padT} y2={H - 16} />}
        {hover != null && nav[hover] != null && (
          // a zero-length round-capped stroke stays a circle: a <circle> would stretch into an ellipse under preserveAspectRatio="none"
          <path className="pnl-dot" d={`M${X[hover]},${y(nav[hover]!)}h0.01`} />
        )}
      </svg>
      {mode === 'usd' && (
        <svg viewBox={`0 0 ${W} ${PH}`} className="pnl-svg pnl-p" preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="pnl-g-up" x1="0" y1="0" x2="0" y2="1">
              <stop className="pnl-gs0 up" offset="0" />
              <stop className="pnl-gs1 up" offset="1" />
            </linearGradient>
            <linearGradient id="pnl-g-down" x1="0" y1="0" x2="0" y2="1">
              <stop className="pnl-gs1 down" offset="0" />
              <stop className="pnl-gs0 down" offset="1" />
            </linearGradient>
          </defs>
          <line className="pnl-zero" x1={padL} x2={W - padR} y1={py(0)} y2={py(0)} />
          <path className="pnl-area" d={pnlArea} fill={`url(#pnl-g-${(pv.at(-1) ?? 0) >= 0 ? 'up' : 'down'})`} />
          <path className={`pnl-line ${(pv.at(-1) ?? 0) >= 0 ? 'up' : 'down'}`} d={pnlPath} />
          {hover != null && <line className="pnl-hover" x1={X[hover]} x2={X[hover]} y1={2} y2={PH - 2} />}
          {hover != null && pnl[hover] != null && <path className={`pnl-dot ${pnl[hover]! >= 0 ? 'up' : 'down'}`} d={`M${X[hover]},${py(pnl[hover]!)}h0.01`} />}
        </svg>
      )}
      <div className="pnl-legend t50">
        <span><i className="sw nav" /> value</span>
        {mode === 'usd' && <><span><i className="sw con" /> put in</span><span><i className="sw pnl" /> PnL (lower)</span></>}
        <span><i className="sw tin" /> in</span><span><i className="sw tout" /> out</span><span><i className="sw tliq" /> liquidation</span>
        <span className="sp" /><span className="mono">{day(pts[0].t)} → {day(pts[pts.length - 1].t)}</span>
      </div>
    </div>
  )
}
