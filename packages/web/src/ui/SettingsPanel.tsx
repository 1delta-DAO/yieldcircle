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
import { PaperSettings } from './PaperPanel'
import { AUTO_SLIPPAGE_BP, DEFAULTS, FILTER_CONTROLS, FILTER_KEYS, SLIPPAGE_OPTS, slippageFor, useSettings, type FilterControl, type Settings } from '@yieldcircle/app/state/Settings'

export function SettingsPanel() {
  const { reset, widened } = useSettings()
  return (
    <div className="setmenu">
      <div className="sm-h">
        <b>What the menu shows</b>
        <button className="sm-reset" disabled={widened === 0} onClick={() => reset()}>Reset</button>
      </div>
      <p className="sm-p">The list is curated by default: real size, a collateral that earns on its own, a carry that pays more than it costs. Widen it here — every row a switch lets in says on the row what was wrong with it.</p>

      <FilterControls controls={FILTER_CONTROLS} />

      <div className="sm-h" style={{ marginTop: 14 }}><b>Trading</b></div>
      <Row label="Max slippage" note="loops, fixed-rate PTs">
        <SlippagePicker />
      </Row>
      <PaperSettings />
      <p className="sm-p">Auto takes {AUTO_SLIPPAGE_BP.pegged / 100}% when both sides are the same money (an LST and its coin, a savings dollar and a dollar, a PT and its underlying) and {AUTO_SLIPPAGE_BP.floating / 100}% when one is priced on its own. Tight is cheaper: on Solana what the swap fills above its minimum stays idle in your wallet. Too tight only means a reverted transaction, never a worse fill.</p>
    </div>
  )
}

/**
 * The one slippage switch, here and in a ticket that trades on a book. `pegged` (a ticket's own
 * pair) spells out what Auto picks for it; without it Auto is just Auto.
 */
export function SlippagePicker({ pegged }: { pegged?: boolean }) {
  const { st, set } = useSettings()
  return (
    <div className="seg sm">
      {SLIPPAGE_OPTS.map((o) => <button key={String(o)} aria-pressed={st.slippageBp === o} onClick={() => set({ slippageBp: o })}>
        {o == null ? (pegged == null ? 'Auto' : `Auto ${slippageFor({ ...st, slippageBp: null }, pegged) / 100}%`) : `${o / 100}%`}
      </button>)}
    </div>
  )
}

export function Row({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="sm-row">
      <div className="sm-l">{label}{note && <small>{note}</small>}</div>
      {children}
    </div>
  )
}
/** A list of core's filter controls (`FILTER_CONTROLS`, Lite's `LITE_CONTROLS`), drawn the one way. */
export function FilterControls({ controls }: { controls: FilterControl[] }) {
  const { st, set } = useSettings()
  return <>{controls.map((c) => c.kind === 'seg' ? (
    <Row key={c.key} label={c.label} note={c.note}>
      <div className="seg sm">
        {c.opts.map((o) => <button key={o.v} aria-pressed={st[c.key] === o.v} onClick={() => set({ [c.key]: o.v })}>{o.word}</button>)}
      </div>
    </Row>
  ) : <Check key={c.id} on={c.on(st)} onChange={(v) => set(c.to(v))} label={c.label} sub={c.sub} />)}</>
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
