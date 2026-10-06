/**
 * One position's PnL record (pos-indexer tickets/0061, docs/pnl-series.md).
 *
 * The position's life is cut at every transaction into holding periods; in
 * each the balances do not move, so what it earned there is its PnL, and the
 * record is their sum: PnL, and the APR on the capital-days it had at work
 * (each period weighted by its value AND its length — an hour weighs an hour).
 *
 * An APR is only stated where it means a rate: every leg the same money
 * (`moneyOf`, the test the catalogue uses for a carry). A WETH deposit
 * against USDC debt is a price position: its PnL is shown with what came from
 * interest and what from prices, and no APR. A one-money position other than
 * dollars is valued in its own money by default (an ETH loop's APR in ether),
 * with dollars one tap away.
 *
 * History, not the live position: the connected user's own row may open it too.
 */
import React from 'react'
import { Drawer } from './Drawer'
import { usePositionSeries } from '../index/queries'
import type { PositionSeries, SeriesEvent, SeriesInterval } from '../index/api'
import { Sk, TxLink, pct, usd, usdShort } from './bits'
import { chainLabel } from '../sdk/queries'
import { marketHref } from '../state/AppState'
import { moneyOf } from '../model/desk'

const FLAG_WORDS: Record<string, string> = {
  'negative-units': 'the ledger misses a move here: walked back, the balance goes below zero (drawn at zero)',
  'dex-transfers-unseen': 'vault shares bought or sold on a DEX are not ledger rows — this record can miss them',
  'index-backfilled': 'the interest index starts later than this record: flat before its first point',
  'index-spliced': 'the interest index had a break (two sources, or a bad sample) and was joined at it',
  'no-index': 'no interest index for this market: drawn without interest',
  snapshot: 'a row states an absolute balance and is not walked',
  'amountless-row': 'a “withdraw all” row names no amount',
  'converted-row': 'a row without units was converted at the index of its hour',
  uncalibrated: 'the index scale could not be checked against the read',
  'no-decimals': 'token decimals unknown (18 assumed)',
  impaired: 'the market cannot pay this leg — its value is a phantom',
  'unpriced-flow': 'a move had no price at all',
  'flow-priced-nearby': 'a move had no price in its own hour and is valued at the nearest price within two weeks',
  'price-despiked': 'a price point that broke from both its neighbours (another source’s odd hour) was replaced by theirs',
}
const KIND_CLASS: Record<string, string> = {
  deposit: 'k-in', transfer_in: 'k-in', repay: 'k-in',
  withdraw: 'k-out', transfer_out: 'k-out',
  borrow: 'k-borrow', liquidated: 'k-liq', redeemed: 'k-liq',
}
const day = (t: string) => t.slice(0, 10)
const fmtAmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : Math.abs(n) >= 1 ? 2 : 6 })
const daysTxt = (d: number) => (d >= 1 ? `${d.toFixed(d >= 10 ? 0 : 1)} days` : d * 24 >= 1 ? `${(d * 24).toFixed(0)} h` : `${Math.max(1, Math.round(d * 1440))} min`)

/** How the numbers read in the record's unit: dollars, or `1.25 ETH`. */
function useFmt(unit: string, label: string) {
  return React.useMemo(() => {
    const v = (x: number | null | undefined) => (x == null ? '—' : unit === 'USD' ? usd(x) : `${fmtAmt(x)} ${label}`)
    const vs = (x: number | null | undefined) => (x == null ? '—' : unit === 'USD' ? usdShort(x) : `${fmtAmt(x)} ${label}`)
    const sg = (x: number | null | undefined) => (x == null ? '—' : `${x >= 0 ? '+' : '−'}${v(Math.abs(x))}`)
    return { v, vs, sg }
  }, [unit, label])
}
type Fmt = ReturnType<typeof useFmt>

/**
 * The money of the whole position, from its legs: `USD` / `ETH` / `BTC` when
 * every leg is that money, the legs' one asset group when they are all one
 * token the taxonomy does not place, else null (a price position).
 */
function moneyOfPosition(s: PositionSeries): { unit: string; label: string } | null {
  const ms = s.legs.map((l) => moneyOf({ symbol: l.symbol ?? undefined, address: l.asset ?? undefined, chainId: s.chainId }))
  if (ms.length && ms.every((m) => m && m === ms[0])) return { unit: ms[0]!, label: ms[0]! }
  const gs = new Set(s.legs.map((l) => l.assetGroup))
  if (gs.size === 1 && s.legs[0]?.assetGroup) return { unit: s.legs[0].assetGroup, label: s.legs[0].symbol ?? s.legs[0].assetGroup }
  return null
}

export function PnlDrawer({ account, posKey, onClose }: { account: string; posKey: string | undefined; onClose: () => void }) {
  // the dollar record decides the money; a one-money position other than
  // dollars is then shown in its own money unless the reader picks dollars
  const [pick, setPick] = React.useState<'own' | 'USD'>('own')
  React.useEffect(() => setPick('own'), [posKey])
  const base = usePositionSeries(account, posKey, 'USD')
  const money = base.data ? moneyOfPosition(base.data) : null
  const unit = pick === 'USD' || !money ? 'USD' : money.unit
  const inUnit = usePositionSeries(account, unit === 'USD' ? undefined : posKey, unit)
  const s = unit === 'USD' ? base.data : inUnit.data
  const loading = base.isLoading || (unit !== 'USD' && inUnit.isLoading)
  const err = base.error ?? (unit !== 'USD' ? inUnit.error : null)
  return (
    <Drawer open={!!posKey} onClose={onClose} side="right" label="Position record" wide>
      {loading && <div className="empty"><Sk w={260} /></div>}
      {err ? <div className="note">The index could not build this record: {(err as Error).message}</div> : null}
      {s && !loading && (
        <Body s={s} money={money} f={{ unit, label: unit === 'USD' ? '$' : money?.label ?? unit }}
          toggle={money && money.unit !== 'USD' ? { own: money.label, pick, setPick } : null} />
      )}
    </Drawer>
  )
}

function Body({ s, money, f: unitOf, toggle }: {
  s: PositionSeries
  money: { unit: string; label: string } | null
  f: { unit: string; label: string }
  toggle: { own: string; pick: 'own' | 'USD'; setPick: (p: 'own' | 'USD') => void } | null
}) {
  const f = useFmt(unitOf.unit, unitOf.label)
  const m = s.summary
  const last = s.points.at(-1)
  const syms = [...new Set(s.legs.map((l) => l.symbol ?? '?'))]
  const priceBet = !money
  /**
   * What the position earned between the previous move and this one — the
   * interest and the price on the balance it held in between. The running
   * total is the chart's; a column of totals read as a loss on every row
   * while the position was down overall.
   */
  const sinceByT = React.useMemo(() => {
    const m = new Map<string, number | null>()
    let prev: number | null = 0
    for (const t of [...new Set(s.events.map((e) => e.t))].sort()) {
      const cur = s.events.find((e) => e.t === t)?.pnl ?? null
      m.set(t, cur != null && prev != null ? cur - prev : null)
      prev = cur
    }
    return m
  }, [s.events])
  return (
    <div className="pnl">
      <div className="pnl-h">
        <b>{syms.join(' / ')}</b> <span className="t50">· {s.legs[0]?.lenderKey} · {chainLabel(s.chainId)}</span>
        <div className="t50 pnl-sub">
          {s.since ? <>older than the ledger — counted from {day(s.since)}, as if opened that day</> : s.start ? <>opened {day(s.start)}</> : 'no history'}
        </div>
      </div>

      <div className="pnl-record">
        {priceBet ? (
          <>
            <b className={m.pnl >= 0 ? 'ok' : 'bad'}>{f.sg(m.pnl)}</b> over {daysTxt(m.openDays)}: {f.sg(m.interest)} from interest, {f.sg(m.priceMove)} from prices.
            <div className="t50 pnl-sub">No APR: its legs are different money, so this is a price position as much as a yield.</div>
          </>
        ) : (
          <>
            Earned <b className={m.pnl >= 0 ? 'ok' : 'bad'}>{f.sg(m.pnl)}</b> on <b>{f.v(m.avgCapital)}</b> average equity over <b>{daysTxt(m.openDays)}</b>
            {m.aprPct != null && <> — <b className={m.aprPct >= 0 ? 'ok' : 'bad'}>{pct(m.aprPct)} APR</b></>}
          </>
        )}
      </div>

      <div className="pnl-stats">
        <Stat k="Value now" v={f.v(last?.nav)} />
        <Stat k="Average equity" v={f.v(m.avgCapital)} s={`${daysTxt(m.openDays)} at work · ${m.intervals} holding period${m.intervals === 1 ? '' : 's'}`} />
        {priceBet
          ? <Stat k="PnL" v={<span className={m.pnl >= 0 ? 'ok' : 'bad'}>{f.sg(m.pnl)}</span>} />
          : <Stat k="APR" v={<span className={(m.aprPct ?? 0) >= 0 ? 'ok' : 'bad'}>{m.aprPct == null ? '—' : pct(m.aprPct)}</span>} s="PnL ÷ equity × time at work" />}
      </div>

      <div className={`pnl-exact ${s.exact ? 'ok' : 'warn'}`}>
        {s.exact ? 'Exact: every leg walks on its own units and the lender’s own index.' : 'Approximate — see the legs below for why.'}
        {m.coveredShare != null && m.coveredShare < 0.999 && <span className="t50"> · {pct((1 - m.coveredShare) * 100, 1)} of the time had no price and is left out</span>}
        {' '}<span className="t50">Rewards are not included.</span>
      </div>

      {toggle && (
        <div className="seg sm pnl-mode" role="group" aria-label="Valued in">
          <button aria-pressed={toggle.pick === 'own'} onClick={() => toggle.setPick('own')}>{toggle.own}</button>
          <button aria-pressed={toggle.pick === 'USD'} onClick={() => toggle.setPick('USD')}>USD</button>
        </div>
      )}
      <Chart s={s} f={f} unitLabel={unitOf.label} />

      <Statement intervals={s.intervals} f={f} />

      <h3 className="pnl-t">Legs</h3>
      <table className="tbl pnl-legs">
        <thead><tr><th>Leg</th><th>Walk</th><th className="r">Rows</th><th>Check</th></tr></thead>
        <tbody>
          {s.legs.map((l, i) => (
            <tr key={i} onClick={() => { location.hash = marketHref(l.marketUid) }}>
              <td><b>{l.symbol ?? '?'}</b> <span className="t50">{l.side === 'borrow' ? 'debt' : l.side}</span></td>
              <td className="t70" title={`unit kind ${l.unitKind}`}>{l.walk === 'units' ? 'units' : 'amount'} · {l.indexSource === 'log' ? 'lender’s index' : l.indexSource === 'cache' ? 'hourly index' : 'no index'}{l.priceSource === 'pendle' && <div className="t50">priced at Pendle’s market</div>}</td>
              <td className="r">{l.rows}</td>
              <td>
                <span className={l.exact ? 'ok' : 'warn'}>{l.exact ? 'exact' : 'approx'}</span>
                <span className="t50"> · {l.closed ? 'closed — its moves net to zero' : l.openedInRange ? 'walks back to 0 ✓' : `older (${pct(l.openResidual * 100, 1)} before first row)`}</span>
                {l.flags.map((x) => <div key={x} className="t50 pnl-flag">{FLAG_WORDS[x] ?? x}</div>)}
                {(l.unpricedPoints ?? 0) > 0 && <div className="warn pnl-flag">no price for {l.symbol ?? 'this asset'} on {l.unpricedPoints} day{l.unpricedPoints === 1 ? '' : 's'} — a hole in the price record, left out</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {s.unanchored.length > 0 && (
        <div className="note">Not in the record: {s.unanchored.map((u) => `${u.rows} ${u.side} row${u.rows === 1 ? '' : 's'} in ${u.marketUid.split(':')[0]}`).join(', ')} — no read has anchored that leg yet.</div>
      )}

      <h3 className="pnl-t">Moves <span className="t50">({s.events.length}) · newest first</span></h3>
      <div className="pnl-ev">
        <div className="pnl-e pnl-eh t50">
          <span>time</span><span>move</span><span>amount</span><span className="r">value</span>
          <span className="r" title="the position's value right after the transaction">position after</span>
          <span className="r" title="interest and price on the balance held since the previous transaction — not the move itself: a deposit or a borrow is not a gain or a loss">earned before it</span>
          <span />
        </div>
        {[...s.events].reverse().map((e, i, all) => (
          // one transaction can be several moves (a deposit and a borrow):
          // what the position earned before it is stated once, on its first row
          <EventRow key={i} e={e} s={s} f={f} since={i > 0 && all[i - 1].t === e.t ? undefined : sinceByT.get(e.t)} />
        ))}
      </div>
      <div className="t40 pnl-key mono" title="the position key the index answered for">{s.key}</div>
    </div>
  )
}

/**
 * The holding periods, merged per day (a loop opened in five transactions is
 * one row), newest first: how long, the value from → to, what it earned and
 * that as a share of the value at work — never annualised, an hour's swing
 * is not a rate.
 */
function Statement({ intervals, f }: { intervals: SeriesInterval[]; f: Fmt }) {
  const [all, setAll] = React.useState(false)
  const rows = React.useMemo(() => {
    const by = new Map<string, SeriesInterval[]>()
    for (const iv of intervals) by.set(day(iv.from), [...(by.get(day(iv.from)) ?? []), iv])
    return [...by.entries()].map(([d, xs]) => {
      const days = xs.reduce((t, x) => t + x.days, 0)
      const cap = xs.reduce((t, x) => t + x.capitalDays, 0)
      const pnl = xs.reduce((t, x) => t + x.pnl, 0)
      return {
        d, n: xs.length, days, pnl,
        start: xs[0].navStart, end: xs[xs.length - 1].navEnd,
        ret: cap > 0 && days > 0 ? (pnl / (cap / days)) * 100 : null,
        complete: xs.every((x) => x.complete), liquidation: xs.some((x) => x.liquidation),
      }
    }).reverse()
  }, [intervals])
  if (!rows.length) return null
  const shown = all ? rows : rows.slice(0, 30)
  return (
    <>
      <h3 className="pnl-t">Holding periods <span className="t50">· from one transaction to the next, merged per day</span></h3>
      <div className="pnl-ev">
        {shown.map((r) => (
          <div key={r.d} className="pnl-e pnl-iv">
            <span className="t50 mono">{r.d}</span>
            <span className="t70">{daysTxt(r.days)}{r.n > 1 ? <small className="t40"> · {r.n} periods</small> : null}</span>
            <span className="t70">{f.vs(r.start)} → {f.vs(r.end)}</span>
            <span className={`r ${r.pnl >= 0 ? 'ok' : 'bad'}`}>{f.sg(r.pnl)}</span>
            <span className="r t70" title="PnL ÷ the average value at work in it — not annualised">{r.ret == null ? '—' : pct(r.ret, 2)}</span>
            <span className="r" title={r.liquidation ? 'ended in a liquidation' : r.complete ? '' : 'part of it had no price: left out'}>{r.liquidation ? <span className="bad">liq</span> : r.complete ? '' : <span className="warn">?</span>}</span>
          </div>
        ))}
      </div>
      {rows.length > 30 && !all && <button className="lnk pnl-more" onClick={() => setAll(true)}>show all {rows.length} days</button>}
    </>
  )
}

function EventRow({ e, s, f, since }: { e: SeriesEvent; s: PositionSeries; f: Fmt; since: number | null | undefined }) {
  const leg = s.legs[e.leg]
  return (
    <div className="pnl-e">
      <span className="t50 mono">{e.t.slice(0, 16).replace('T', ' ')}</span>
      <span className={`verb ${KIND_CLASS[e.kind] ?? ''}`}>{e.kind.replace('_', ' ')}</span>
      <span>{e.amount != null ? `${fmtAmt(e.amount)} ${leg?.symbol ?? ''}` : '—'}</span>
      <span className="r" title={e.flow == null ? 'no price for this move' : e.flow === 0 ? 'not the holder’s choice (a liquidation): counted in the PnL' : e.flow > 0 ? 'money put into the position' : 'money taken out of the position'}>
        {e.flow == null ? <span className="bad">?</span> : f.vs(e.value)}
        <small className="t40"> {e.flow == null ? '' : e.flow > 0 ? 'in' : e.flow < 0 ? 'out' : ''}</small>
      </span>
      <span className="r t70" title={`the value right after this transaction (PnL so far ${f.sg(e.pnl)})`}>{f.vs(e.nav)}</span>
      <span className={`r ${since == null ? 't40' : since < 0 ? 'bad' : 'ok'}`} title="interest and price on the balance held since the previous transaction">
        {since === undefined ? '' : since == null ? '?' : f.sg(since)}
      </span>
      <TxLink chainId={s.chainId} hash={e.txHash} />
    </div>
  )
}

/** The legs' prices on a day (one entry per token), so a swing in the PnL can be read off the price that made it. */
function priceLine(s: PositionSeries, prices: (number | null)[], unit: string, label: string): string {
  const seen = new Set<string>()
  const out: string[] = []
  s.legs.forEach((l, i) => {
    const sym = l.symbol ?? '?'
    const p = prices[i]
    if (seen.has(sym) || p == null) return
    seen.add(sym)
    const digits = p >= 1000 ? 0 : p >= 10 ? 2 : 4
    const n = p.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    out.push(`${sym} ${unit === 'USD' ? `$${n}` : `${n} ${label}`}`)
  })
  return out.join(' · ')
}

function Stat({ k, v, s }: { k: string; v: React.ReactNode; s?: string }) {
  return <div className="pnl-stat"><span className="t50">{k}</span><b>{v}</b>{s && <small className="t50">{s}</small>}</div>
}

/**
 * The PnL so far on top — the running sum, the number the record states, drawn
 * the way a trading app draws it: one line over a fill to zero, green when it
 * ends up, red when down. Under it, smaller, the money it was made on: the
 * value (solid) and what is in it on net (dashed), with a tick for every move —
 * green in, amber out, red a liquidation. A day with no price is a gap, never
 * a straight line.
 */
function Chart({ s, f, unitLabel }: { s: PositionSeries; f: Fmt; unitLabel: string }) {
  const W = 640, H = 200, CH = 90, padL = 8, padR = 8
  const pts = s.points
  const [hover, setHover] = React.useState<number | null>(null)
  const gid = React.useId().replace(/:/g, '')
  if (pts.length < 2) return <div className="empty">Not enough history to draw yet.</div>
  const t0 = Date.parse(pts[0].t), t1 = Date.parse(pts[pts.length - 1].t)
  const x = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * (W - padL - padR)
  const xi = (i: number) => x(Date.parse(pts[i].t))
  const pnl = pts.map((p) => (p.nav == null ? null : p.pnl))
  const nav = pts.map((p) => p.nav)
  const con = pts.map((p) => p.contrib)
  /** the line's pieces between gaps, as [index, value] runs */
  const runs = (vs: (number | null)[]) => {
    const out: [number, number][][] = []
    let cur: [number, number][] | null = null
    vs.forEach((v, i) => {
      if (v == null) { cur = null; return }
      if (!cur) out.push((cur = []))
      cur.push([i, v])
    })
    return out
  }
  const path = (vs: (number | null)[], yy: (v: number) => number, step = false) =>
    runs(vs).map((r) => r.map(([i, v], k) => {
      const X = xi(i).toFixed(1), Y = yy(v).toFixed(1)
      return k === 0 ? `M${X},${Y}` : step ? `H${X}V${Y}` : `L${X},${Y}`
    }).join('')).join('')
  /** the same runs, each closed down to the zero line */
  const area = (vs: (number | null)[], yy: (v: number) => number) =>
    runs(vs).map((r) => {
      const z = yy(0).toFixed(1)
      return `M${xi(r[0][0]).toFixed(1)},${z}` + r.map(([i, v]) => `L${xi(i).toFixed(1)},${yy(v).toFixed(1)}`).join('') + `L${xi(r[r.length - 1][0]).toFixed(1)},${z}Z`
    }).join('')

  // top: the PnL so far
  const pv = pnl.filter((v): v is number => v != null)
  let plo = Math.min(0, ...pv), phi = Math.max(0, ...pv)
  if (phi - plo < 1e-12) phi = plo + 1
  const py = (v: number) => 10 + ((phi - v) / (phi - plo)) * (H - 20)
  const lastI = pnl.reduce<number>((b, v, i) => (v != null ? i : b), -1)
  const dir = (pv.at(-1) ?? 0) >= 0 ? 'up' : 'down'

  // bottom: the money at work
  const cv = [...nav, ...con].filter((v): v is number => v != null)
  let clo = Math.min(0, ...cv), chi = Math.max(0, ...cv)
  if (chi - clo < 1e-12) chi = clo + 1
  const cy = (v: number) => 6 + ((chi - v) / (chi - clo)) * (CH - 22)

  const onMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    const tx = t0 + ((ev.clientX - r.left) / r.width * W - padL) / (W - padL - padR) * (t1 - t0)
    let best = 0
    pts.forEach((p, i) => { if (Math.abs(Date.parse(p.t) - tx) < Math.abs(Date.parse(pts[best].t) - tx)) best = i })
    setHover(best)
  }
  const hp = pts[hover ?? (lastI >= 0 ? lastI : pts.length - 1)]
  const hpPnl = hp.nav == null ? null : hp.pnl
  const hoverLine = (y1: number, y2: number) => hover != null && <line className="pnl-hover" x1={xi(hover)} x2={xi(hover)} y1={y1} y2={y2} />
  return (
    <div className="pnl-chart">
      <div className="pnl-read">
        <b className={`pnl-big ${(hpPnl ?? 0) < 0 ? 'bad' : 'ok'}`}>{f.sg(hpPnl)}</b>
        <span className="t70"><span className="mono">{day(hp.t)}</span> · value <b>{f.v(hp.nav)}</b> · in it <b>{f.v(hp.contrib)}</b></span>
        {hp.prices && <span className="t50 pnl-px">{priceLine(s, hp.prices, s.unit, unitLabel)}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="pnl-svg" onPointerMove={onMove} onPointerLeave={() => setHover(null)} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" className={`pnl-gs0 ${dir}`} />
            <stop offset="1" className={`pnl-gs1 ${dir}`} />
          </linearGradient>
        </defs>
        <path className="pnl-area" fill={`url(#${gid})`} d={area(pnl, py)} />
        <line className="pnl-zero" x1={padL} x2={W - padR} y1={py(0)} y2={py(0)} />
        <path className={`pnl-line ${dir}`} d={path(pnl, py)} />
        {lastI >= 0 && hover == null && <line className={`pnl-dot ${dir}`} x1={xi(lastI)} x2={xi(lastI)} y1={py(pnl[lastI]!)} y2={py(pnl[lastI]!)} />}
        {hover != null && pnl[hover] != null && <line className={`pnl-dot ${dir}`} x1={xi(hover)} x2={xi(hover)} y1={py(pnl[hover]!)} y2={py(pnl[hover]!)} />}
        {hoverLine(4, H - 4)}
      </svg>
      <svg viewBox={`0 0 ${W} ${CH}`} className="pnl-svg pnl-p" onPointerMove={onMove} onPointerLeave={() => setHover(null)} preserveAspectRatio="none">
        <line className="pnl-zero" x1={padL} x2={W - padR} y1={cy(0)} y2={cy(0)} />
        <path className="pnl-con" d={path(con, cy, true)} />
        <path className="pnl-nav" d={path(nav, cy)} />
        {s.events.map((e, i) => {
          const X = x(Date.parse(e.t))
          const c = e.flow == null ? 'liq' : e.flow > 0 ? 'in' : e.flow < 0 ? 'out' : 'liq'
          return <line key={i} className={`pnl-tick ${c}`} x1={X} x2={X} y1={CH - 12} y2={CH - 3}><title>{`${e.t.slice(0, 16)} ${e.kind} ${f.vs(e.value)}`}</title></line>
        })}
        {hoverLine(2, CH - 14)}
      </svg>
      <div className="pnl-legend t50">
        <span><i className={`sw pnl ${dir}`} /> PnL so far</span>
        <span><i className="sw nav" /> value</span>
        <span><i className="sw con" /> in it (value − PnL)</span>
        <span><i className="sw tin" /> in</span><span><i className="sw tout" /> out</span><span><i className="sw tliq" /> liquidation</span>
        <span className="sp" /><span className="mono">{day(pts[0].t)} → {day(pts[pts.length - 1].t)}</span>
      </div>
    </div>
  )
}
