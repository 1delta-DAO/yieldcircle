/**
 * Why the rate is what it is.
 *
 * Every rate in this app is one number, and one number cannot say the thing a
 * lender most needs to know: how much room is left before it moves, and how
 * violently it moves when the room runs out. A market at 8.3 % with 12 % of
 * its deposits free and a kink two points away is not the same product as a
 * market at 8.3 % with half of it free — and until this popover existed the
 * two rendered identically.
 *
 * So the curve is drawn as the market's own model states it, on a LINEAR axis
 * across the whole 0–100 % of utilisation. A rate model that is flat to the
 * kink and then vertical looks flat-then-vertical here, because that is what
 * it is; rescaling the tail to make the low end legible would flatter the very
 * markets this is meant to warn about. The exact numbers sit under the chart,
 * where precision belongs.
 *
 * Two honesty rules:
 *
 *   1. **A market with no curve says so.** Fourteen lender families do not
 *      price debt off utilisation at all (Liquity, Sky, Frankencoin, Resupply,
 *      Teller, …) and a vault has no curve because it is a wrapper over
 *      markets that each have their own. Those render a sentence, never an
 *      empty chart.
 *   2. **The curve is the market's rate, not the headline.** Incentives are
 *      not on it, and the foot says so wherever the row carries any.
 */
import React from 'react'
import { useIrm } from '../sdk/queries'
import type { IrmCurve, IrmPoint } from '../sdk/types'
import { Popover, Sk, pct, usdShort } from './bits'

export type IrmSide = 'supply' | 'borrow'

const numOf = (v: string | number | null | undefined): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Where the curve bends — to the point, not to the grid.
 *
 * The endpoint samples the model every five points of utilisation, so the
 * bend almost never lands on a sample: Aave's USDC market on Ethereum turns at
 * 92 %, and reading the steepest sampled point back calls it 95 %. Three
 * points of headroom is the difference between "there is room" and "there is
 * not", so the kink is RECOVERED instead of rounded — the last segment that is
 * still flat and the first that is already steep are both straight lines, and
 * a piecewise-linear model bends exactly where they cross.
 *
 * `null` when nothing bends: some models rise evenly, and inventing a kink for
 * them would be worse than saying there isn't one.
 */
export function kinkOf(points: IrmPoint[]): number | null {
  const slope = (i: number) => {
    const du = points[i + 1].utilization - points[i].utilization
    return du > 0 ? (points[i + 1].borrowRate - points[i].borrowRate) / du : null
  }
  let best = 0, at = -1
  for (let i = 1; i < points.length - 1; i++) {
    const before = slope(i - 1), after = slope(i)
    if (before == null || after == null) continue
    // a bend, not a wobble: the slope after has to be half again as steep and
    // materially different, so a straight line's floating-point noise is not
    // reported as a kink
    if (after > before * 1.5 + 0.5 && after - before > best) { best = after - before; at = i }
  }
  if (at < 0) return null
  // the two straight pieces on either side of the sample that jumped: the one
  // before it is still entirely below the bend, the one after entirely above
  const lo = at - 2, hi = at
  if (lo < 0 || hi + 1 >= points.length) return points[at].utilization
  const a = slope(lo), b = slope(hi)
  if (a == null || b == null || !(b - a > 1e-9)) return points[at].utilization
  const p1 = points[lo], p3 = points[hi]
  const cross = (p3.borrowRate - p1.borrowRate + a * p1.utilization - b * p3.utilization) / (a - b)
  // it can only be between the last flat sample and the first steep one; a
  // crossing outside that says the model is not piecewise-linear here
  const from = points[at - 1].utilization, to = points[at].utilization
  return Number.isFinite(cross) && cross >= from - 1e-9 && cross <= to + 1e-9 ? cross : points[at].utilization
}

const W = 312, H = 132, PAD = { l: 34, r: 10, t: 10, b: 18 }

function Chart({ c, side }: { c: IrmCurve; side: IrmSide }) {
  const pts = c.points
  const maxY = Math.max(0.01, ...pts.map((p) => Math.max(p.borrowRate, p.depositRate)))
  const x = (u: number) => PAD.l + Math.min(1, Math.max(0, u)) * (W - PAD.l - PAD.r)
  const y = (r: number) => H - PAD.b - (Math.min(maxY, Math.max(0, r)) / maxY) * (H - PAD.t - PAD.b)
  const path = (k: 'borrowRate' | 'depositRate') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.utilization).toFixed(1)} ${y(p[k]).toFixed(1)}`).join(' ')
  const u = c.currentUtilization
  const now = numOf(side === 'supply' ? c.depositRate : c.variableBorrowRate)
  const kink = kinkOf(pts)
  return (
    <svg className="irm-c" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
      aria-label={`Rate curve: at ${Math.round(u * 100)} % utilisation the ${side === 'supply' ? 'deposit' : 'borrow'} rate is ${now == null ? 'unknown' : now.toFixed(2)} %`}>
      {/* frame: the floor and the left edge, nothing else — gridlines on a
          hockey stick are noise */}
      <line className="ax" x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} />
      <line className="ax" x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} />
      {/* past the kink is the part that costs money; it is shaded, not hidden */}
      {kink != null && <rect className="irm-past" x={x(kink)} y={PAD.t} width={W - PAD.r - x(kink)} height={H - PAD.t - PAD.b} />}
      <path className="irm-b" d={path('borrowRate')} />
      <path className="irm-s" d={path('depositRate')} />
      {/* where the market is right now */}
      <line className="irm-now" x1={x(u)} y1={PAD.t} x2={x(u)} y2={H - PAD.b} />
      {now != null && <circle className={side === 'supply' ? 'irm-d s' : 'irm-d b'} cx={x(u)} cy={y(now)} r={3.5} />}
      <text className="irm-t" x={PAD.l - 4} y={PAD.t + 4} textAnchor="end">{pct(maxY, 0)}</text>
      <text className="irm-t" x={PAD.l - 4} y={H - PAD.b} textAnchor="end">0</text>
      <text className="irm-t" x={PAD.l} y={H - 5}>0%</text>
      <text className="irm-t" x={W - PAD.r} y={H - 5} textAnchor="end">100% used</text>
      {/* the kink rides the TOP of the shaded band: every real kink sits in the
          last fifth of the axis, where a bottom tick lands on top of "100% used" */}
      {kink != null && <text className="irm-t" x={kink > 0.5 ? x(kink) - 4 : x(kink) + 4} y={PAD.t + 9} textAnchor={kink > 0.5 ? 'end' : 'start'}>kink {Math.round(kink * 100)}%</text>}
    </svg>
  )
}

function Body({ c, side, rewards }: { c: IrmCurve; side: IrmSide; rewards?: number }) {
  const u = c.currentUtilization
  const dep = numOf(c.depositRate), bor = numOf(c.variableBorrowRate)
  const kink = kinkOf(c.points)
  const atFull = c.points[c.points.length - 1]
  const free = numOf(c.totalLiquidityUsd), deposits = numOf(c.totalDepositsUsd), debt = numOf(c.totalDebtUsd)
  return (
    <>
      <Chart c={c} side={side} />
      <div className="irm-k">
        <span className="irm-p"><span className="irm-key s">lenders earn</span><b className="ok">{pct(dep)}</b></span>
        <span className="irm-p"><span className="irm-key b">borrowers pay</span><b className="warn">{pct(bor)}</b></span>
      </div>
      <p>
        <b>{Math.round(u * 100)}%</b> of the deposits are lent out
        {deposits != null && <> — {usdShort(deposits)} in, {usdShort(debt)} borrowed, <b>{usdShort(free)}</b> free to leave</>}.
      </p>
      {kink != null ? (
        <p>
          It bends at <b>{Math.round(kink * 100)}%</b>: past that the borrow rate climbs steeply, to {pct(atFull.borrowRate, 0)} at full use. That is
          what pulls deposits back in — and what a withdrawal waits for.
        </p>
      ) : (
        <p>This market's rate rises evenly with use: no kink to fall off.</p>
      )}
      <p className="foot">
        The curve is the market's own interest-rate model, read at this block.
        {rewards && rewards > 0.05 ? ` The ${pct(rewards)} of incentives in the headline rate is not on it.` : ' Incentives, where a row has any, are not on it.'}
      </p>
    </>
  )
}

/**
 * The opener: a quiet link that costs nothing until it is clicked, because the
 * curve is a second request per market and no one needs it to read the row.
 */
export function IrmLink({ uid, side, label, rewards }: { uid: string | null | undefined; side: IrmSide; label?: string; rewards?: number }) {
  const ref = React.useRef<HTMLButtonElement>(null)
  const [open, setOpen] = React.useState(false)
  const q = useIrm(uid, open)
  if (!uid) return null
  return (
    <>
      <button ref={ref} type="button" className="irm-l" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}>
        <svg viewBox="0 0 24 16" width="17" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M1 14h14c4 0 6-4 8-13" />
        </svg>
        {label ?? 'rate curve'}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={340}>
        <div className="pop-text irm">
          {q.isLoading ? <Sk w={200} h={100} />
            : q.data ? <Body c={q.data} side={side} rewards={rewards} />
            : <p>{q.error ? 'The rate curve could not be read for this market.' : 'This market does not price off a utilisation curve, so there is no curve to draw — its rate is set another way.'}</p>}
        </div>
      </Popover>
    </>
  )
}
