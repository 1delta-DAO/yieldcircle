/**
 * The floors: what the menu of strategies lets in.
 *
 * Every switch here is also reachable from the `+` under a list that is
 * holding rows back — this is the same state seen whole, for the times when
 * the question is "what am I not being shown at all?" rather than "what is
 * missing from this list?". The two that cost a request say so, because a
 * control that quietly triples the page weight is not an honest control.
 *
 * It used to be a gear in the header. It is a section of the profile sheet
 * now, beside the chains: both are settings of the reader, not of a page.
 */
import React from 'react'
import { DEFAULTS, FILTER_KEYS, NO_CAP, useSettings, type Settings } from '../state/Settings'

const MONEY = (x: number) => (x === 0 ? 'Any' : x >= 1e6 ? `$${x / 1e6}m+` : `$${x / 1e3}k+`)

export function SettingsPanel() {
  const { st, set, reset, widened } = useSettings()
  return (
    <div className="setmenu">
      <div className="sm-h">
        <b>What the menu shows</b>
        <button className="sm-reset" disabled={widened === 0} onClick={() => reset()}>Reset</button>
      </div>
      <p className="sm-p">The list is curated by default: real size, a collateral that earns on its own, a carry that pays more than it costs. Widen it here — every row a switch lets in says on the row what was wrong with it.</p>

      <Row label="Deposit size" note="one more request">
        <Seg value={st.minTvlUsd} onPick={(v) => set({ minTvlUsd: v })} opts={[2_000_000, 250_000, 0]} fmt={MONEY} />
      </Row>
      <Row label="Borrow liquidity" note="loops">
        <Seg value={st.minBorrowLiquidityUsd} onPick={(v) => set({ minBorrowLiquidityUsd: v })} opts={[100_000, 25_000, 0]} fmt={MONEY} />
      </Row>
      <Row label="Risk cap" note="the API's 1-5 score">
        <Seg value={st.maxRisk} onPick={(v) => set({ maxRisk: v })} opts={[2, 4, 5]} fmt={(v) => (v === 2 ? 'Careful' : v === 4 ? 'Standard' : 'Any')} />
      </Row>

      <Check on={st.showRateBets} onChange={(v) => set({ showRateBets: v })}
        label="Rate bets" sub="loops whose collateral earns nothing by itself" />
      <Check on={st.showNegative} onChange={(v) => set({ showNegative: v })}
        label="Negative carry" sub="loops that cost more than they pay" />
      <Check on={st.minRate === 0 && st.maxRate === NO_CAP} onChange={(v) => set(v ? { minRate: 0, maxRate: NO_CAP } : { minRate: DEFAULTS.minRate, maxRate: DEFAULTS.maxRate })}
        label="Extreme rates" sub="under 0.01 % and over 25 % — idle markets and spikes" />
      <Check on={st.wideNet} onChange={(v) => set({ wideNet: v })}
        label="Wider pair search" sub="ask the optimizer without collateral tags — finds untagged collateral (sUSDp, syzUSD), costs a request per chain" />

      <div className="sm-h" style={{ marginTop: 14 }}><b>Trading</b></div>
      <Row label="Loop slippage" note="open, lever, close">
        <Seg value={st.loopSlippageBp} onPick={(v) => set({ loopSlippageBp: v })} opts={[5, 10, 30, 50]} fmt={(v) => `${v / 100}%`} />
      </Row>
      <p className="sm-p">A loop pairs an asset with its own denomination (an LST with its coin, a savings dollar with a dollar), so the price barely moves between the quote and the block. Tight is cheaper: on Solana what the swap fills above its minimum stays idle in your wallet. Too tight only means a reverted transaction, never a worse fill.</p>
    </div>
  )
}

function Row({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="sm-row">
      <div className="sm-l">{label}{note && <small>{note}</small>}</div>
      {children}
    </div>
  )
}
function Seg<T extends number>({ value, opts, fmt, onPick }: { value: T; opts: T[]; fmt: (v: T) => string; onPick: (v: T) => void }) {
  return (
    <div className="seg sm">
      {opts.map((o) => <button key={o} aria-pressed={value === o} onClick={() => onPick(o)}>{fmt(o)}</button>)}
    </div>
  )
}
function Check({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub: string }) {
  return (
    <button className="sm-check" role="checkbox" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="sm-tick" aria-hidden>{on ? '✓' : ''}</span>
      <span className="sm-t"><b>{label}</b><small>{sub}</small></span>
    </button>
  )
}

/** Whether anything at all has been widened — the word the lists use for their own state. */
export const isCurated = (st: Settings) => FILTER_KEYS.every((k) => st[k] === DEFAULTS[k])
