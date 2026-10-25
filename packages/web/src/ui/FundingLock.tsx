import { dateOf, type LoopStrategy } from '@yieldcircle/core/model/strategies'
import { useFundingLock } from '../sdk/queries'
import { Info, pct, usd } from './bits'

const signedUsd = (x: number) => `${x >= 0 ? '+' : '−'}${usd(Math.abs(x))}`

/**
 * "Lock the funding rate" on a loop whose collateral earns perp funding (sUSDe, wstUSR): what a
 * Pendle Boros SHORT on Arbitrum would fix the funding at, sized on the whole position `C`. A
 * quote only — the lock is a separate position on another chain, never part of the loop's
 * transaction. Shows nothing for a collateral that earns no lockable funding, or while unknown.
 */
export function FundingLock({ s, C }: { s: LoopStrategy; C: number }) {
  const q = useFundingLock(s, C)
  const h = q.data
  if (!h || h.summary.fixedAprPct == null || h.summary.floatingAprPct == null) return null
  const { fixedAprPct: fixed, floatingAprPct: floating, lockSpreadPct, allInCostAprPct, depositUsd, lockedUntil } = h.summary
  const net = (lockSpreadPct ?? fixed - floating) - (allInCostAprPct ?? 0)
  const perYear = h.notionalUsd * net / 100
  const until = lockedUntil ? dateOf(lockedUntil) : null
  const legs = h.legs.map((l) => `${l.asset} on ${l.quote.venue}`).join(' · ')
  return (
    <div className="tsec">
      <span className="lbl">Lock the funding rate <Info label="Locking the funding rate">
        <p style={{ margin: '0 0 6px' }}>Most of what {s.holds} pays is perp funding{h.profile?.fundingShare ? ` (${h.profile.fundingShare})` : ''}, and funding floats: the loop's net yield assumes today's rate holds.</p>
        <p style={{ margin: '0 0 6px' }}>On Pendle Boros (Arbitrum) you can swap that floating funding for a fixed rate until{until ? ` ${until}` : ' the market matures'}: you pay the funding the market tracks and receive the fixed rate. Sized here on the whole {usd(h.notionalUsd)} position.</p>
        <p style={{ margin: 0 }}>It is not a perfect hedge. {s.holds}'s yield blends many exchanges and assets and is smoothed; each Boros market tracks one exchange's funding on one asset ({legs}). It needs its own margin on Arbitrum, can be liquidated if funding spikes, and ends at maturity, when it must be redone.</p>
      </Info></span>
      <div className="cells">
        <div className="c"><span className="k">Fixed on Boros</span><span className="v">{pct(fixed)}</span><span className="s">{until ? `until ${until}` : legs}</span></div>
        <div className="c"><span className="k">Funding now</span><span className="v">{pct(floating)}</span><span className="s">floating · {legs}</span></div>
        <div className="c"><span className="k">Per year vs now</span><span className={`v ${perYear >= 0 ? 'ok' : 'warn'}`}>{signedUsd(perYear)}</span><span className="s">after {pct(allInCostAprPct ?? 0)} Boros fees</span></div>
        <div className="c"><span className="k">Margin needed</span><span className="v">{usd(depositUsd)}</span><span className="s">on Arbitrum, its own deposit</span></div>
      </div>
      <div className="plain" style={{ marginTop: 8 }}>{net >= 0
        ? <>The fixed rate is above today's funding: locking <b>adds</b> about {usd(perYear)} a year at today's rates, and removes the risk of funding falling.</>
        : <>The fixed rate is below today's funding: locking <b>gives up</b> about {usd(-perYear)} a year at today's rates, in exchange for certainty if funding falls.</>}
        {' '}A separate position on Arbitrum, opened after the loop — not part of this transaction.</div>
    </div>
  )
}
