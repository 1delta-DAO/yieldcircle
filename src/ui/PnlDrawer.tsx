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
import { Sk, Tok, TxLink, pct, usd, usdShort } from './bits'
import { chainLabel } from '../sdk/queries'
import { marketHref } from '../state/AppState'
import { moneyOf } from '../model/desk'
import { protocolKeyOf } from '../model/uid'
import { isLoopscale } from '../model/strategies'
import { prettyProtocol } from './ProtocolFilter'
import { useSticky } from '../state/sticky'

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
  'price-mixed': 'the price record alternated with a second source at another level; those hours were dropped and the token’s own track kept',
}
const KIND_CLASS: Record<string, string> = {
  deposit: 'k-in', transfer_in: 'k-in', repay: 'k-in',
  withdraw: 'k-out', transfer_out: 'k-out',
  borrow: 'k-borrow', liquidated: 'k-liq', redeemed: 'k-liq',
}
const day = (t: string) => t.slice(0, 10)
/** The venue by name: `MORPHO_BLUE` → Morpho Markets; a Loopscale pair's key names its two mints and reads as Loopscale. */
const venueOf = (lk: string | undefined) => (lk ? prettyProtocol(isLoopscale(lk) ? 'LOOPSCALE' : protocolKeyOf(lk)) : '')
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
    // a transaction's moves share one snapshot: the first one's (one pass, not a find per time)
    const firstAt = new Map<string, number | null>()
    for (const e of s.events) if (!firstAt.has(e.t)) firstAt.set(e.t, e.pnl)
    for (const t of [...firstAt.keys()].sort()) {
      const cur = firstAt.get(t) ?? null
      m.set(t, cur != null && prev != null ? cur - prev : null)
      prev = cur
    }
    return m
  }, [s.events])
  /** what each leg holds now — its newest amount, in its own asset, and that at its price */
  const holdings = React.useMemo(() => s.legs.map((_, li) => {
    for (let k = s.points.length - 1; k >= 0; k--) {
      const a = s.points[k].legs[li]
      if (a == null) continue
      const px = s.points[k].prices?.[li]
      return { amount: a, value: px == null ? null : Math.abs(a) * px }
    }
    return { amount: null, value: null }
  }), [s])
  return (
    <div className="pnl">
      <div className="pnl-h">
        <b>{syms.join(' / ')}</b> <span className="t50" title={s.legs[0]?.lenderKey}>· {venueOf(s.legs[0]?.lenderKey)} · {chainLabel(s.chainId)}</span>
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
        {s.exact ? 'Exact: every leg walks on its own units and the lender’s own index.' : 'Approximate — open Legs below for why.'}
        {m.coveredShare != null && m.coveredShare < 0.999 && <span className="t50"> · {pct((1 - m.coveredShare) * 100, 1)} of the time had no price and is left out.</span>}
        {' '}<span className="t50">Rewards are not included.</span>
      </div>

      {toggle && (
        <div className="seg sm pnl-mode" role="group" aria-label="Valued in">
          <button aria-pressed={toggle.pick === 'own'} onClick={() => toggle.setPick('own')}>{toggle.own}</button>
          <button aria-pressed={toggle.pick === 'USD'} onClick={() => toggle.setPick('USD')}>USD</button>
        </div>
      )}
      <Chart s={s} f={f} unitLabel={unitOf.label} rates={!priceBet} />

      <div className="pnl-folds">
        <Fold title="Legs" sub="what it holds and owes · tap one for its market"
          count={<>{s.legs.length} · <span className={s.exact ? 'ok' : 'warn'}>{s.exact ? 'exact' : 'approx'}</span></>}>
          <div className="pnl-fold-in">
          <div className="pnl-legc">
            {s.legs.map((l, i) => {
              const debt = isDebtSide(l.side)
              const held = holdings[i]
              return (
                <button type="button" key={i} className="pnl-leg-c" onClick={() => { location.hash = marketHref(l.marketUid) }}>
                  <span className="pnl-leg-h">
                    <Tok sym={l.symbol ?? '?'} size={18} />
                    <b title={l.symbol ?? undefined}>{l.symbol ?? '?'}</b>
                    <span className={`pill ${debt ? 'debt' : 'dep'}`}>{debt ? 'debt' : l.side}</span>
                    <span className="sp" />
                    <span className={`pnl-chk ${l.exact ? 'ok' : 'warn'}`}>{l.exact ? '✓ exact' : '≈ approx'}</span>
                  </span>
                  <span className="pnl-leg-amt">
                    {l.closed || held.amount == null || held.amount === 0
                      ? <span className="t50">0 {l.symbol ?? ''}</span>
                      : <><b>{fmtAmt(Math.abs(held.amount))}</b> <span className="t70">{l.symbol ?? ''}</span>{held.value != null && <span className="t50"> · {f.v(held.value)}</span>}</>}
                  </span>
                  <span className="t70" title={`unit kind ${l.unitKind}`}>
                    {l.walk === 'units' ? 'units' : 'amount'} · {l.indexSource === 'log' ? 'lender’s index' : l.indexSource === 'cache' ? 'hourly index' : 'no index'}
                    {l.priceSource === 'pendle' && ' · priced at Pendle’s market'}
                  </span>
                  <span className="t50">
                    {l.rows} row{l.rows === 1 ? '' : 's'} · {l.closed ? 'closed — its moves net to zero' : l.openedInRange ? 'walks back to 0 ✓' : `older (${pct(l.openResidual * 100, 1)} before first row)`}
                  </span>
                  {(l.flags.length > 0 || (l.unpricedPoints ?? 0) > 0) && (
                    <span className="pnl-flags">
                      {l.flags.map((x) => <span key={x} className="t50 pnl-flag">{FLAG_WORDS[x] ?? x}</span>)}
                      {(l.unpricedPoints ?? 0) > 0 && <span className="warn pnl-flag">no price for {l.symbol ?? 'this asset'} on {l.unpricedPoints} day{l.unpricedPoints === 1 ? '' : 's'} — a hole in the price record, left out</span>}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {s.unanchored.length > 0 && (
            <div className="note">Not in the record: {s.unanchored.map((u) => `${u.rows} ${u.side} row${u.rows === 1 ? '' : 's'} in ${u.marketUid.split(':')[0]}`).join(', ')} — no read has anchored that leg yet.</div>
          )}
          </div>
        </Fold>
        <Statement intervals={s.intervals} f={f} />
        <Fold title="Moves" sub="newest first" count={(s.eventsTotal ?? s.events.length) > s.events.length ? `newest ${s.events.length} of ${s.eventsTotal}` : String(s.events.length)}>
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
        </Fold>
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
    <Fold title="Holding periods" sub="from one transaction to the next, merged per day" count={String(rows.length)}>
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
    </Fold>
  )
}

/**
 * A closed section: the header row is the button, the body expands as a
 * 0fr→1fr grid track (the positions card's). The body mounts on first open —
 * hundreds of move rows are not rendered for a drawer that is only glanced at.
 */
function Fold({ title, sub, count, children }: { title: string; sub?: string; count?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [seen, setSeen] = React.useState(false)
  return (
    <div className="pnl-fold">
      <button type="button" className="pnl-fold-h" aria-expanded={open} onClick={() => { setOpen((o) => !o); setSeen(true) }}>
        <span className="pnl-fold-t"><b>{title}</b>{sub && <small className="t50">{sub}</small>}</span>
        <span className="sp" />
        {count != null && <span className="pnl-fold-n mono t50">{count}</span>}
        <svg className="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className={`gsum-x${open ? ' open' : ''}`} inert={!open}>
        <div className="gsum-xi"><div className="pnl-fold-b">{seen && children}</div></div>
      </div>
    </div>
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

/**
 * The amount scale on a chart's right edge: a label at each value, placed
 * where the chart draws it. In order of priority — a label that would sit on
 * one already placed (the zero line just above the low) is left out.
 */
function yLabels(vs: number[], y: (v: number) => number, h: number, fmt: (v: number) => string) {
  const placed: number[] = []
  return vs.map((v, i) => {
    const at = y(v)
    if (placed.some((p) => Math.abs(p - at) < 16)) return null
    placed.push(at)
    return <span key={i} className="pnl-ax t40" style={{ top: `${(at / h) * 100}%` }}>{fmt(v)}</span>
  })
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

/** One number of a hover readout: the label over it, both one line, so the readout never reflows. */
function Cell({ k, v, c }: { k: string; v: string; c?: string }) {
  return <div className="pnl-cell" title={k}><span className="t50 pnl-one">{k}</span><b className={`pnl-one ${c ?? ''}`}>{v}</b></div>
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
function Chart({ s, f, unitLabel, rates }: { s: PositionSeries; f: Fmt; unitLabel: string; rates: boolean }) {
  const W = 640, H = 200, CH = 90, RH = 120, padL = 8, padR = 8
  const pts = s.points
  const [hover, setHover] = React.useState<number | null>(null)
  // the move ticks are detail: off until asked for, and kept for the tab
  const [moves, setMoves] = useSticky('pnl-moves', false)
  const gid = React.useId().replace(/:/g, '')
  const hasRates = rates && pts.some((p) => p.aprWindowPct != null)
  const cr = React.useMemo(() => (hasRates ? carryOf(s) : null), [s, hasRates])
  if (pts.length < 2) return <div className="empty">Not enough history to draw yet.</div>
  // the time axis starts at the first priced point: a record counted from the
  // ledger's floor with no price for months drew all its amounts in the last sliver
  const i0 = Math.max(0, pts.findIndex((p) => p.nav != null))
  const t0 = Date.parse(pts[i0].t), t1 = Date.parse(pts[pts.length - 1].t)
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
  const cy = (v: number) => 6 + ((chi - v) / (chi - clo)) * (CH - (moves ? 22 : 12))

  const onMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    const tx = t0 + ((ev.clientX - r.left) / r.width * W - padL) / (W - padL - padR) * (t1 - t0)
    let best = i0
    pts.forEach((p, i) => { if (i > i0 && Math.abs(Date.parse(p.t) - tx) < Math.abs(Date.parse(pts[best].t) - tx)) best = i })
    setHover(best)
  }
  const hp = pts[hover ?? (lastI >= 0 ? lastI : pts.length - 1)]
  const hpPnl = hp.nav == null ? null : hp.pnl
  const hoverLine = (y1: number, y2: number) => hover != null && <line className="pnl-hover" x1={xi(hover)} x2={xi(hover)} y1={y1} y2={y2} />
  return (
    <div className="pnl-chart">
      {/* the readout keeps one shape under the cursor: every line is always there and never wraps, so the charts do not jump */}
      <div className="pnl-read">
        <b className={`pnl-big ${(hpPnl ?? 0) < 0 ? 'bad' : 'ok'}`}>{f.sg(hpPnl)}</b>
        <span className="pnl-read-m">
          <span className="t70 pnl-one"><span className="mono">{day(hp.t)}</span> · value <b>{f.v(hp.nav)}</b> · in it <b>{f.v(hp.contrib)}</b></span>
          <span className="t50 pnl-one pnl-px">{(hp.prices && priceLine(s, hp.prices, s.unit, unitLabel)) || '\u00a0'}</span>
        </span>
      </div>
      <div className="pnl-rwrap">
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
        {yLabels([phi, plo, 0], py, H, (v) => (v === 0 ? f.vs(0) : `${v > 0 ? '+' : '−'}${f.vs(Math.abs(v))}`))}
      </div>
      <div className="pnl-rwrap">
        <svg viewBox={`0 0 ${W} ${CH}`} className="pnl-svg pnl-p" onPointerMove={onMove} onPointerLeave={() => setHover(null)} preserveAspectRatio="none">
          <line className="pnl-zero" x1={padL} x2={W - padR} y1={cy(0)} y2={cy(0)} />
          <path className="pnl-con" d={path(con, cy, true)} />
          <path className="pnl-nav" d={path(nav, cy)} />
          {moves && s.events.map((e, i) => {
            const X = x(Date.parse(e.t))
            const c = e.flow == null ? 'liq' : e.flow > 0 ? 'in' : e.flow < 0 ? 'out' : 'liq'
            return <line key={i} className={`pnl-tick ${c}`} x1={X} x2={X} y1={CH - 12} y2={CH - 3}><title>{`${e.t.slice(0, 16)} ${e.kind} ${f.vs(e.value)}`}</title></line>
          })}
          {hoverLine(2, moves ? CH - 14 : CH - 2)}
        </svg>
        {yLabels([chi], cy, CH, f.vs)}
      </div>
      <div className="pnl-legend t50">
        <span><i className={`sw pnl ${dir}`} /> PnL so far</span>
        <span><i className="sw nav" /> value</span>
        <span><i className="sw con" /> in it (value − PnL)</span>
        {moves && <><span><i className="sw tin" /> in</span><span><i className="sw tout" /> out</span><span><i className="sw tliq" /> liquidation</span></>}
        <label className="pnl-opt" title="a tick on the value chart for every move: green in, amber out, red a liquidation">
          <input type="checkbox" checked={moves} onChange={(e) => setMoves(e.target.checked)} /> moves
        </label>
        <span className="sp" />
        <span className="mono" title={i0 > 0 ? `the record runs from ${day(pts[0].t)}; it has no price before ${day(pts[i0].t)}` : undefined}>{day(pts[i0].t)} → {day(pts[pts.length - 1].t)}</span>
      </div>
      {hasRates && (
        <Fold title="Interest & carry" sub="what it earned at the time, and what each leg earned or cost"
          count={cr && cr.spikes.length > 0 ? <span className="bad">{cr.spikes.length} debt-cost spike{cr.spikes.length === 1 ? '' : 's'}</span> : undefined}>
          <div className="pnl-fold-in">
            <Rates s={s} cr={cr} xi={xi} W={W} H={RH} padL={padL} padR={padR} hover={hover} onMove={onMove} onLeave={() => setHover(null)} at={hover ?? (lastI >= 0 ? lastI : pts.length - 1)} />
          </div>
        </Fold>
      )}
    </div>
  )
}

/**
 * The rates AT THE TIME, under the PnL: what the position earned over the
 * trailing window (net, on its equity — the slope of the PnL line as an APR),
 * the record so far (dashed: the headline APR as it stood that day), and each
 * leg's own rate over the same window — a deposit's yield, a debt's cost. A
 * loop whose carry is high today and was negative for weeks reads as exactly
 * that, instead of the list's forward APR looking like the record. The scale
 * is held to the middle of the values (a position's first days on a sliver of
 * equity swing to thousands of %); a point outside it sits on the edge.
 */
function Rates({ s, cr, xi, W, H, padL, padR, hover, onMove, onLeave, at }: {
  s: PositionSeries
  cr: { points: (CarryPoint | null)[]; spikes: number[] } | null
  xi: (i: number) => number
  W: number; H: number; padL: number; padR: number
  hover: number | null
  onMove: (ev: React.PointerEvent<SVGSVGElement>) => void
  onLeave: () => void
  at: number
}) {
  const pts = s.points
  if (!pts.some((p) => p.aprWindowPct != null)) return null
  const net = pts.map((p) => p.aprWindowPct ?? null)
  const rec = pts.map((p) => p.aprPct ?? null)
  const legs = s.legs.map((_, li) => pts.map((p) => p.legRates?.[li] ?? null))
  const all = [...net, ...rec, ...legs.flat()].filter((v): v is number => v != null).sort((a, b) => a - b)
  const q = (f: number) => all[Math.min(all.length - 1, Math.max(0, Math.round(f * (all.length - 1))))]
  let lo = Math.min(0, q(0.05)), hi = Math.max(0, q(0.95))
  const pad = (hi - lo) * 0.12 || 1
  lo -= lo < 0 ? pad : 0
  hi += pad
  const ry = (v: number) => 6 + ((hi - Math.min(hi, Math.max(lo, v))) / (hi - lo)) * (H - 12)
  const line = (vs: (number | null)[]) => {
    let d = '', on = false
    vs.forEach((v, i) => {
      if (v == null) { on = false; return }
      d += `${on ? 'L' : 'M'}${xi(i).toFixed(1)},${ry(v).toFixed(1)}`
      on = true
    })
    return d
  }
  const hp = pts[at]
  const legName = (li: number) => `${s.legs[li].symbol ?? '?'} ${isDebtSide(s.legs[li].side) ? 'cost' : 'earned'}`
  const w = s.aprWindowDays ?? 7
  const pc = (v: number | null | undefined) => (v == null ? '—' : pct(v))
  const hc = cr?.points[at] ?? null
  const spikes = cr ? cr.spikes.length : 0
  const sp = hc?.debt != null ? hc.dep - hc.debt : null
  return (
    <>
      <div className="pnl-cells">
        <Cell k={`Net APR, trailing ${w} d`} v={pc(hp.aprWindowPct)} c={(hp.aprWindowPct ?? 0) < 0 ? 'bad' : 'ok'} />
        {s.legs.map((_, li) => <Cell key={li} k={legName(li)} v={pc(hp.legRates?.[li])} />)}
        <Cell k="Record so far" v={pc(hp.aprPct)} />
      </div>
      {/* there whenever the position has a carry — a point without one shows dashes rather than taking the block away */}
      {cr && (
        <div className="pnl-carry-read">
          <div className="pnl-cells">
            <Cell k="Spread" v={sp == null ? '—' : signedPts(sp)} c={sp == null ? undefined : sp < 0 ? 'bad' : 'ok'} />
            <Cell k="Leverage" v={hc?.lev == null ? '—' : `${hc.lev.toFixed(1)}×`} />
            <Cell k="Debt-cost spikes" v={spikes ? `${spikes} day${spikes === 1 ? '' : 's'}` : 'none'} c={spikes ? 'bad' : undefined} />
          </div>
          <div className="t50 pnl-one pnl-why">
            {sp == null ? '\u00a0' : sp < 0
              ? 'The debt costs more than the deposit earns — leverage multiplies the loss.'
              : 'The deposit earns more than the debt costs — leverage multiplies the gain.'}
          </div>
        </div>
      )}
      <div className="pnl-rwrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="pnl-svg pnl-r" onPointerMove={onMove} onPointerLeave={onLeave} preserveAspectRatio="none">
          <line className="pnl-zero" x1={padL} x2={W - padR} y1={ry(0)} y2={ry(0)} />
          {legs.map((vs, li) => <path key={li} className={`pnl-leg ${isDebtSide(s.legs[li].side) ? 'debt' : 'dep'}`} d={line(vs)} />)}
          <path className="pnl-rec" d={line(rec)} />
          <path className="pnl-net" d={line(net)} />
          {hover != null && <line className="pnl-hover" x1={xi(hover)} x2={xi(hover)} y1={2} y2={H - 2} />}
        </svg>
        <span className="pnl-ax t40" style={{ top: `${(ry(hi - pad * 0.5) / H) * 100}%` }}>{pct(hi - pad, 0)}</span>
        <span className="pnl-ax t40" style={{ top: `${(ry(0) / H) * 100}%` }}>0 %</span>
        {lo < 0 && <span className="pnl-ax t40" style={{ top: `${(ry(lo + pad * 0.5) / H) * 100}%` }}>{pct(lo + pad, 0)}</span>}
      </div>
      {cr && <Carry cr={cr} xi={xi} W={W} padL={padL} padR={padR} hover={hover} onMove={onMove} onLeave={onLeave} />}
      <div className="pnl-legend t50">
        <span><i className="sw rnet" /> net APR, trailing {w} d</span>
        <span><i className="sw rrec" /> record so far</span>
        <span><i className="sw rdep" /> deposit earned</span>
        <span><i className="sw rdebt" /> debt cost</span>
        <span className="sp" /><span title="realized: what the balances actually earned over the window, interest and price. The APR in the positions list is today's rates carried forward.">realized, not today's rates</span>
      </div>
    </>
  )
}
const isDebtSide = (side: string) => side === 'borrow' || side === 'debt'
const signedPts = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)} pts`

interface CarryPoint {
  /** what the deposits earned, % a year, weighted by each leg's value */
  dep: number
  /** what the debt cost, the same way; null with no debt */
  debt: number | null
  /** deposits ÷ equity */
  lev: number | null
}
/**
 * The carry under a loop: what its deposits earned against what its debt
 * cost, per point, each weighted by the legs' value then. The net APR on
 * equity is `dep + (lev − 1) × (dep − debt)`, so the spread and the leverage
 * ARE the story — a 1.5-point negative spread at 10× is a −6 % position, and
 * on the net line alone that reads as a mystery. A spike is a day whose debt
 * cost sits ≥ 2 points (and ≥ 30 %) above its own median of the previous
 * week: the rates are trailing-window realized rates, so a one-hour spike
 * shows up smoothed, never invented.
 */
function carryOf(s: PositionSeries): { points: (CarryPoint | null)[]; spikes: number[] } | null {
  if (!s.legs.some((l) => isDebtSide(l.side)) || !s.legs.some((l) => !isDebtSide(l.side))) return null
  const points = s.points.map((p): CarryPoint | null => {
    let dv = 0, dr = 0, bv = 0, br = 0
    s.legs.forEach((l, li) => {
      const r = p.legRates?.[li], a = p.legs[li], px = p.prices?.[li]
      if (r == null || a == null || px == null) return
      const v = Math.abs(a * px)
      if (!(v > 0)) return
      if (isDebtSide(l.side)) { bv += v; br += v * r } else { dv += v; dr += v * r }
    })
    if (!(dv > 0)) return null
    return { dep: dr / dv, debt: bv > 0 ? br / bv : null, lev: p.nav != null && p.nav > 0 ? dv / p.nav : null }
  })
  if (!points.some((c) => c?.debt != null)) return null
  const spikes: number[] = []
  const t = s.points.map((p) => Date.parse(p.t))
  points.forEach((c, i) => {
    if (c?.debt == null) return
    const prev = points
      .map((x, j) => ({ x, j }))
      .filter(({ x, j }) => j < i && x?.debt != null && t[i] - t[j] <= 7 * 86_400_000)
      .map(({ x }) => x!.debt!)
      .sort((a, b) => a - b)
    if (prev.length < 3) return
    const med = prev[Math.floor(prev.length / 2)]
    if (c.debt - med >= Math.max(2, 0.3 * Math.abs(med))) spikes.push(i)
  })
  return { points, spikes }
}

/**
 * The carry strip: deposit earned (green) and debt cost (amber) on their OWN
 * scale — on the net APR's scale they are two flat lines near zero — with the
 * gap between them filled green where the deposit out-earns the debt and red
 * where the debt costs more, and a red mark on every debt-cost spike.
 */
function Carry({ cr, xi, W, padL, padR, hover, onMove, onLeave }: {
  cr: { points: (CarryPoint | null)[]; spikes: number[] }
  xi: (i: number) => number
  W: number; padL: number; padR: number
  hover: number | null
  onMove: (ev: React.PointerEvent<SVGSVGElement>) => void
  onLeave: () => void
}) {
  const H = 70
  const vs = cr.points.flatMap((c) => (c ? [c.dep, ...(c.debt != null ? [c.debt] : [])] : [])).sort((a, b) => a - b)
  if (vs.length < 2) return null
  const q = (f: number) => vs[Math.min(vs.length - 1, Math.max(0, Math.round(f * (vs.length - 1))))]
  let lo = q(0.05), hi = q(0.95)
  const pad = (hi - lo) * 0.15 || 1
  lo -= pad
  hi += pad
  const y = (v: number) => 8 + ((hi - Math.min(hi, Math.max(lo, v))) / (hi - lo)) * (H - 14)
  const line = (get: (c: CarryPoint) => number | null) => {
    let d = '', on = false
    cr.points.forEach((c, i) => {
      const v = c ? get(c) : null
      if (v == null) { on = false; return }
      d += `${on ? 'L' : 'M'}${xi(i).toFixed(1)},${y(v).toFixed(1)}`
      on = true
    })
    return d
  }
  // the gap between the two lines, split where they cross
  const fills: { d: string; neg: boolean }[] = []
  for (let i = 0; i + 1 < cr.points.length; i++) {
    const a = cr.points[i], b = cr.points[i + 1]
    if (a?.debt == null || b?.debt == null) continue
    const x0 = xi(i), x1 = xi(i + 1)
    const d0 = a.dep - a.debt, d1 = b.dep - b.debt
    const quad = (xa: number, da: number, ta: number, xb: number, db: number, tb: number) =>
      `M${xa.toFixed(1)},${y(da).toFixed(1)}L${xb.toFixed(1)},${y(db).toFixed(1)}L${xb.toFixed(1)},${y(tb).toFixed(1)}L${xa.toFixed(1)},${y(ta).toFixed(1)}Z`
    if (d0 * d1 >= 0) {
      fills.push({ d: quad(x0, a.dep, a.debt, x1, b.dep, b.debt), neg: d0 + d1 < 0 })
    } else {
      const f = d0 / (d0 - d1)
      const xm = x0 + f * (x1 - x0), vm = a.dep + f * (b.dep - a.dep)
      fills.push({ d: quad(x0, a.dep, a.debt, xm, vm, vm), neg: d0 < 0 })
      fills.push({ d: quad(xm, vm, vm, x1, b.dep, b.debt), neg: d1 < 0 })
    }
  }
  return (
    <>
      <div className="pnl-rwrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="pnl-svg pnl-carry" onPointerMove={onMove} onPointerLeave={onLeave} preserveAspectRatio="none">
          {fills.map((f, i) => <path key={i} className={`pnl-gap ${f.neg ? 'neg' : 'pos'}`} d={f.d} />)}
          <path className="pnl-leg dep" d={line((c) => c.dep)} />
          <path className="pnl-leg debt" d={line((c) => c.debt)} />
          {cr.spikes.map((i) => (
            <line key={i} className="pnl-spike" x1={xi(i)} x2={xi(i)} y1={1} y2={H - 1}>
              <title>{`debt cost ${pct(cr.points[i]!.debt!)} — a spike over the previous week`}</title>
            </line>
          ))}
          {hover != null && <line className="pnl-hover" x1={xi(hover)} x2={xi(hover)} y1={2} y2={H - 2} />}
          <line className="pnl-zero" x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} style={lo < 0 && hi > 0 ? undefined : { display: 'none' }} />
        </svg>
        <span className="pnl-ax t40" style={{ top: `${(y(hi - pad) / H) * 100}%` }}>{pct(hi - pad, 1)}</span>
        <span className="pnl-ax t40" style={{ top: `${(y(lo + pad) / H) * 100}%` }}>{pct(lo + pad, 1)}</span>
      </div>
      <div className="pnl-legend t50">
        <span><i className="sw rdep" /> deposit earned</span>
        <span><i className="sw rdebt" /> debt cost</span>
        <span><i className="sw gpos" /> earns more than it costs</span>
        <span><i className="sw gneg" /> costs more than it earns</span>
        {cr.spikes.length > 0 && <span><i className="sw spike" /> debt-cost spike</span>}
      </div>
    </>
  )
}
