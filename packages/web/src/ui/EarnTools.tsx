import React from 'react'
import { EARN_FILTER, EARN_SORTS, MIN_TVLS, earnActive, filtersOn, type EarnFilter, type EarnKind, type EarnSort } from '@yieldcircle/core/model/earnFilter'
import type { Risk } from '@yieldcircle/core/model/strategies'
import { useSticky } from '../state/sticky'
import { usdShort } from './bits'

/** An Earn list's search, sort and filters, kept for this tab per list (`useSticky`). */
export function useEarnFilter(key: string) {
  const [f, setF] = useSticky<EarnFilter>(`earnf:${key}`, EARN_FILTER)
  // an older shape in the tab's storage: the defaults fill what it lacks
  const cur = { ...EARN_FILTER, ...f }
  return { f: cur, set: (p: Partial<EarnFilter>) => setF({ ...cur, ...p }), reset: () => setF(EARN_FILTER), active: earnActive(cur) }
}
export type EarnFilterState = ReturnType<typeof useEarnFilter>

const RISKS: { id: Risk; word: string }[] = [{ id: 3, word: 'Any' }, { id: 2, word: 'Up to medium' }, { id: 1, word: 'Low only' }]
const KINDS: { id: EarnKind; word: string }[] = [{ id: 'all', word: 'All' }, { id: 'simple', word: 'Deposits' }, { id: 'loop', word: 'Levered' }]

/**
 * One bar over an Earn list: search, sort, and a Filters button that opens risk, size, exit and
 * (where the list mixes them) kind. Counts what it kept, and resets in one tap.
 */
export function EarnTools({ st, n, total, kinds, placeholder = 'Search a token, venue or curator' }: { st: EarnFilterState; /** rows kept */ n: number; /** rows before the filters */ total: number; /** offer Deposits / Levered: the list mixes them */ kinds?: boolean; placeholder?: string }) {
  const { f, set, reset, active } = st
  const nf = filtersOn(f)
  const [open, setOpen] = React.useState(nf > 0)
  return (
    <div className="etools">
      <div className="etools-row">
        <span className="etools-q">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          <input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder={placeholder} aria-label="Search this list" />
        </span>
        <label className="etools-sort"><span className="hide-m">Sort</span>
          <select value={f.sort} onChange={(e) => set({ sort: e.target.value as EarnSort })} aria-label="Sort by">
            {EARN_SORTS.map((o) => <option key={o.id} value={o.id}>{o.word}</option>)}
          </select>
        </label>
        <button type="button" className={`btn sm etools-fbtn${nf ? ' on' : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>Filters{nf > 0 && <span className="c">{nf}</span>}</button>
      </div>
      {open && (
        <div className="etools-f">
          {kinds && <Seg label="Kind" opts={KINDS} v={f.kind} on={(kind) => set({ kind })} />}
          <Seg label="Risk" opts={RISKS} v={f.risk} on={(risk) => set({ risk })} />
          <Seg label="Size" opts={MIN_TVLS.map((x) => ({ id: x as number, word: x ? `${usdShort(x)}+` : 'Any' }))} v={f.minTvl} on={(minTvl) => set({ minTvl })} />
          <Seg label="Exit" opts={[{ id: false, word: 'Any' }, { id: true, word: 'Any time' }]} v={f.instant} on={(instant) => set({ instant })} title="Only rows the money can leave in the same block: no cooldown, queue, lock or maturity" />
        </div>
      )}
      {active && (
        <div className="etools-n t70" aria-live="polite">
          {n === total ? `${n} row${n === 1 ? '' : 's'}` : `${n} of ${total}`}
          <button type="button" className="lnk" onClick={reset}>Reset</button>
        </div>
      )}
    </div>
  )
}

function Seg<V extends string | number | boolean>({ label, opts, v, on, title }: { label: string; opts: { id: V; word: string }[]; v: V; on: (v: V) => void; title?: string }) {
  return (
    <div className="etools-g" title={title}>
      <span className="t50">{label}</span>
      <div className="seg sm" role="group" aria-label={label}>
        {opts.map((o) => <button key={String(o.id)} type="button" aria-pressed={v === o.id} onClick={() => on(o.id)}>{o.word}</button>)}
      </div>
    </div>
  )
}
