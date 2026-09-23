/**
 * The chain scope, in the header.
 *
 * Two renderings of ONE control, chosen by width, because the selection is
 * global — it says which world every page is looking at — and a control that
 * disappears is a setting you cannot get back to. With five chains the row of
 * buttons stopped fitting: the labels went first (a mark is enough once you
 * know the colours), and below 640px the whole thing was hidden, which left a
 * phone stuck on whatever scope it last had on a desktop.
 *
 *   wide    the segmented row — a mark per chain, one click to toggle
 *   narrow  a button that names the scope, opening the same list as a menu
 *
 * The row carries no names: the header is capped at `--page` (1240px), and
 * six labelled buttons need 470 of it — more than is left once the nav has
 * its eight destinations, so the row was compressed and `.seg`'s
 * `overflow:hidden` ate Avalanche at every width. The marks are coloured and
 * distinct, each button carries its name as a title, and the menu spells all
 * five out for anyone who wants the words.
 *
 * One list, two depths. The ROW draws the first five of `CHAINS` — the ones
 * with the most of everything, and as many marks as a header that also holds
 * eight destinations can take. The MENU spells out all fifteen; nothing
 * separates them, because they are the same kind of thing: the API answers
 * with strategies on Monad, HyperEVM, Plasma and Optimism too.
 *
 * The row therefore ENDS in the menu. `.chainbtn` only exists below 1080px, so
 * a desktop that shows the row and nothing else could reach five chains and
 * never the other ten — a list you cannot open is the same as a list that is
 * not there. The trailing button opens the same popover, and when the scope
 * holds chains the row does not draw it wears their marks instead of its
 * count, so "Monad only" never reads as "nothing is selected".
 *
 * "All" stays the ABSENCE of a selection rather than a member of it (see
 * `AppState`), so a chain added tomorrow is in scope without anyone
 * re-picking. Alt-click narrows to one chain on the row; the menu spells that
 * out as an `only` on each line, because alt-click is not a thing on a touch
 * screen and it is the thing people want most of the time.
 */
import React from 'react'
import { useApp } from '../state/AppState'
import { CHAINS } from '../sdk/queries'
import { ChainMark } from './ChainMark'
import { Popover } from './bits'

/** what the row draws, and what the trailing button stands for */
const ROW = CHAINS.slice(0, 5)
const OFF_ROW = CHAINS.slice(5)

export function ChainPicker() {
  const { chains, setChains, toggleChain, allChains, chainLabelFor } = useApp()
  const btn = React.useRef<HTMLButtonElement>(null)
  const more = React.useRef<HTMLButtonElement>(null)
  const [open, setOpen] = React.useState<null | 'btn' | 'more'>(null)
  const picked = allChains ? ROW : CHAINS.filter((c) => chains.includes(c.id))
  const offRowPicked = OFF_ROW.filter((c) => chains.includes(c.id))
  return (
    <>
      <div className="seg chainseg" role="group" aria-label="Chains">
        <button aria-pressed={allChains} onClick={() => setChains([])} title="Every chain">All</button>
        {ROW.map((c) => (
          <button key={c.id} aria-pressed={chains.includes(c.id)} aria-label={c.label}
            title={`${c.label} — alt-click for only this one`}
            onClick={(e) => (e.altKey ? setChains([c.id]) : toggleChain(c.id))}>
            <ChainMark chainId={c.id} size={15} />
          </button>
        ))}
        <button ref={more} aria-haspopup="dialog" aria-expanded={open === 'more'}
          aria-pressed={offRowPicked.length > 0}
          aria-label={`More chains — ${OFF_ROW.map((c) => c.label).join(', ')}`}
          title={OFF_ROW.map((c) => c.label).join(', ')}
          onClick={() => setOpen((o) => (o === 'more' ? null : 'more'))}>
          {offRowPicked.length ? (
            <>
              {offRowPicked.slice(0, 2).map((c) => <ChainMark key={c.id} chainId={c.id} size={15} />)}
              {offRowPicked.length > 2 ? <span style={{ fontSize: 11.5 }}>+{offRowPicked.length - 2}</span> : null}
            </>
          ) : (
            <span style={{ fontSize: 11.5 }}>+{OFF_ROW.length}</span>
          )}
        </button>
      </div>

      <button ref={btn} className="chainbtn" aria-haspopup="dialog" aria-expanded={open === 'btn'}
        aria-label={`Chains — ${chainLabelFor()}`} onClick={() => setOpen((o) => (o === 'btn' ? null : 'btn'))}>
        {/* the marks of what is in scope, overlapped like a stack of coins; past three it is a count anyway */}
        <span className="marks" aria-hidden>
          {picked.slice(0, 3).map((c) => <ChainMark key={c.id} chainId={c.id} size={15} />)}
        </span>
        <span className="cl">{allChains ? 'All chains' : chainLabelFor()}</span>
        <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden><path d="M2 4.2 6 8.2 10 4.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      <Popover anchor={open === 'more' ? more : btn} open={open !== null} onClose={() => setOpen(null)} width={232} align="right">
        <div className="chainmenu" role="group" aria-label="Chains"
          style={{ maxHeight: 'min(64vh, 560px)', overflowY: 'auto' }}>
          <button className="cm-row" role="checkbox" aria-checked={allChains} onClick={() => setChains([])}>
            <span className="cm-tick" aria-hidden>{allChains ? '✓' : ''}</span>
            <span className="cm-n">All chains</span>
          </button>
          <div className="cm-sep" role="separator" />
          {/* in "All" mode no single chain is ticked — the same thing the segmented row says, and
              clicking one there narrows to it rather than removing it from a selection that is empty */}
          {CHAINS.map((c) => {
            const on = chains.includes(c.id)
            return (
              <React.Fragment key={c.id}>
                <div className="cm-line">
                  <button className="cm-row" role="checkbox" aria-checked={on} onClick={() => toggleChain(c.id)}>
                    <span className="cm-tick" aria-hidden>{on ? '✓' : ''}</span>
                    <ChainMark chainId={c.id} size={16} />
                    <span className="cm-n">{c.label}</span>
                  </button>
                  <button className="cm-only" onClick={() => { setChains([c.id]); setOpen(null) }}
                    aria-label={`Only ${c.label}`}>only</button>
                </div>
              </React.Fragment>
            )
          })}
        </div>
      </Popover>
    </>
  )
}
