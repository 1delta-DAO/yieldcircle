/**
 * The chain scope.
 *
 * The selection is global — it says which world every page is looking at — so
 * it has one home, the profile sheet, where the whole list is spelled out. It
 * left the header when the header became a Revolut-style bar (profile, search,
 * stats, balance): a row of chain marks was the widest thing in it, and on a
 * phone it had already folded into a button beside four others.
 *
 * What a page shows instead is a CHIP, on the pages whose lists the scope
 * actually narrows (Home, Earn, Board). It names the scope and opens the same
 * list, so the filter sits beside the thing it filters and a phone is never
 * stuck on whatever scope it last had on a desktop.
 *
 * "All" stays the ABSENCE of a selection rather than a member of it (see
 * `AppState`), so a chain added tomorrow is in scope without anyone
 * re-picking. Each line has an `only`, because narrowing to one chain is the
 * thing people want most of the time.
 */
import React from 'react'
import { useApp } from '../state/AppState'
import { CHAINS } from '../sdk/queries'
import { ChainMark } from './ChainMark'
import { Popover } from './bits'

/** The scope as a filter chip, opening the list. */
export function ChainChip() {
  const { chains, allChains, chainLabelFor } = useApp()
  const btn = React.useRef<HTMLButtonElement>(null)
  const [open, setOpen] = React.useState(false)
  const picked = allChains ? CHAINS.slice(0, 3) : CHAINS.filter((c) => chains.includes(c.id))
  return (
    <>
      <button ref={btn} className={`chainbtn${allChains ? '' : ' on'}`} aria-haspopup="dialog" aria-expanded={open}
        aria-label={`Chains — ${chainLabelFor()}`} onClick={() => setOpen((o) => !o)}>
        {/* the marks of what is in scope, overlapped like a stack of coins; past three it is a count anyway */}
        <span className="marks" aria-hidden>
          {picked.slice(0, 3).map((c) => <ChainMark key={c.id} chainId={c.id} size={15} />)}
        </span>
        <span className="cl">{allChains ? 'All chains' : chainLabelFor()}</span>
        <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden><path d="M2 4.2 6 8.2 10 4.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} width={232} align="right">
        <div style={{ maxHeight: 'min(64vh, 560px)', overflowY: 'auto' }}>
          <ChainList onOnly={() => setOpen(false)} />
        </div>
      </Popover>
    </>
  )
}

/** Every chain, with a tick and an `only` — the chip's popover and the profile sheet both draw this. */
export function ChainList({ onOnly }: { onOnly?: () => void }) {
  const { chains, setChains, toggleChain, allChains } = useApp()
  return (
    <div className="chainmenu" role="group" aria-label="Chains">
      <button className="cm-row" role="checkbox" aria-checked={allChains} onClick={() => setChains([])}>
        <span className="cm-tick" aria-hidden>{allChains ? '✓' : ''}</span>
        <span className="cm-n">All chains</span>
      </button>
      <div className="cm-sep" role="separator" />
      {/* in "All" mode no single chain is ticked, and ticking one narrows to it
          rather than removing it from a selection that is empty */}
      {CHAINS.map((c) => {
        const on = chains.includes(c.id)
        return (
          <div key={c.id} className="cm-line">
            <button className="cm-row" role="checkbox" aria-checked={on} onClick={() => toggleChain(c.id)}>
              <span className="cm-tick" aria-hidden>{on ? '✓' : ''}</span>
              <ChainMark chainId={c.id} size={16} />
              <span className="cm-n">{c.label}</span>
            </button>
            <button className="cm-only" onClick={() => { setChains([c.id]); onOnly?.() }}
              aria-label={`Only ${c.label}`}>only</button>
          </div>
        )
      })}
    </div>
  )
}
