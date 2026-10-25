/**
 * One control for every long list of choices (docs/simplify-selections.md §1).
 *
 * The menu outgrew its chip rows: the dollar page had thirty-odd desks, the Stocks shelf up to
 * eighty tickers, and a `+N` that poured all of them into the row at once. Faceted search has a
 * settled answer for this (Baymard: six to ten values, never fold just one away; Algolia: search
 * inside the facet for the tail), and it serves both people who meet the list — the one browsing,
 * who wants a short ranked row, and the one who already knows the name, who wants a search box.
 *
 * So: a short row — All, the top few, anything picked — and **More (n)**, which opens the whole
 * list with a search on top, in sections (`section`), the wallet's own first. The ORDER is the
 * reader's (`orderKey`): the page's own ranking by default, or largest, yours first, A–Z — kept
 * in localStorage, because it is a preference, not a scratchpad.
 *
 * `FacetList` is the popover's body on its own, for a sheet that holds several facets at once
 * (the feed's Filters).
 */
import React from 'react'
import { Popover } from './bits'
import { useViewport } from './useViewport'

export interface FacetOption {
  key: string
  /** what the eye reads; `text` is what search and A–Z go by */
  text: string
  label?: React.ReactNode
  icon?: React.ReactNode
  count?: React.ReactNode
  title?: string
  /** the picker's section ("Issued dollars", "ETFs"); none = one plain list */
  section?: string
  /** the "Largest" order's measure; an option set with no sizes offers no such order */
  size?: number
  /** the wallet holds it: its own section, and the "Yours first" order */
  mine?: boolean
  /** always in the row, at its end (the euro, franc and pound: a few rows each, never ranked into view) */
  pin?: boolean
  /** extra words after the name in the list (`via`) */
  tail?: React.ReactNode
}

export type FacetOrder = 'default' | 'size' | 'mine' | 'az'

const ORDER_PREFIX = 'yieldcircle.order.'
/** The reader's order for one facet, kept across visits. */
export function useFacetOrder(key: string | undefined): [FacetOrder, (o: FacetOrder) => void] {
  const [o, setO] = React.useState<FacetOrder>(() => {
    if (!key) return 'default'
    try { const v = localStorage.getItem(ORDER_PREFIX + key); if (v === 'size' || v === 'mine' || v === 'az') return v } catch { /* private mode */ }
    return 'default'
  })
  const set = React.useCallback((v: FacetOrder) => {
    setO(v)
    if (key) try { if (v === 'default') localStorage.removeItem(ORDER_PREFIX + key); else localStorage.setItem(ORDER_PREFIX + key, v) } catch { /* quota, private mode */ }
  }, [key])
  return [o, set]
}

/** `options` arrive in the page's own ranking: every other order is a stable re-sort of it. */
export function ordered(options: FacetOption[], order: FacetOrder): FacetOption[] {
  const at = new Map(options.map((o, i) => [o.key, i]))
  const by = (f: (a: FacetOption, b: FacetOption) => number) => [...options].sort((a, b) => f(a, b) || at.get(a.key)! - at.get(b.key)!)
  if (order === 'size') return by((a, b) => (b.size ?? 0) - (a.size ?? 0))
  if (order === 'mine') return by((a, b) => Number(!!b.mine) - Number(!!a.mine))
  if (order === 'az') return by((a, b) => a.text.localeCompare(b.text))
  return options
}

/**
 * The row: the top `cap` in the chosen order (the pinned ones inside that count, at the end),
 * then whatever is picked and would otherwise hide, then More. One left over is shown, not folded.
 */
export function rowOf(options: FacetOption[], selected: string[], cap: number): { row: FacetOption[]; rest: number } {
  const pinned = options.filter((o) => o.pin)
  const head = options.filter((o) => !o.pin).slice(0, Math.max(1, cap - pinned.length))
  let row = [...head, ...pinned]
  const missing = options.filter((o) => selected.includes(o.key) && !row.includes(o))
  row = [...row, ...missing]
  if (options.length - row.length === 1) row = [...row, options.find((o) => !row.includes(o))!]
  return { row, rest: options.length - row.length }
}

const ORDER_WORDS: Record<FacetOrder, string> = { default: '', size: 'Largest', mine: 'Yours first', az: 'A–Z' }

export interface FacetListProps {
  /** plural noun for the search box: "Search 37 dollars" */
  noun: string
  options: FacetOption[]
  selected: string[]
  onPick: (key: string, e: React.MouseEvent) => void
  multi?: boolean
  /** section order; sections not named go last in the order met */
  sections?: string[]
  order?: FacetOrder
  onOrder?: (o: FacetOrder) => void
  /** the page's own ranking, in words ("Most offered") */
  defaultOrder?: string
  autoFocus?: boolean
  /** a row before the options (the issuer filter's match mode) */
  head?: React.ReactNode
}

/** The whole list: search, the order, sections. */
export function FacetList({ noun, options, selected, onPick, multi, sections, order = 'default', onOrder, defaultOrder = 'Ranked', autoFocus, head }: FacetListProps) {
  const [q, setQ] = React.useState('')
  const needle = q.trim().toLowerCase()
  const hit = (o: FacetOption) => !needle || o.text.toLowerCase().includes(needle) || o.key.toLowerCase().includes(needle)
  const list = ordered(options, order).filter(hit)
  const orders: FacetOrder[] = ['default', ...(options.some((o) => (o.size ?? 0) > 0) ? ['size' as const] : []), ...(options.some((o) => o.mine) ? ['mine' as const] : []), 'az']
  // the wallet's own lead, in a section of their own; the rest by section, in the given order
  const mine = list.filter((o) => o.mine)
  const groups = new Map<string, FacetOption[]>()
  for (const s of sections ?? []) groups.set(s, [])
  for (const o of list) if (!o.mine) { const s = o.section ?? ''; (groups.get(s) ?? groups.set(s, []).get(s)!).push(o) }
  const blocks: [string, FacetOption[]][] = [...(mine.length ? [['Yours', mine] as [string, FacetOption[]]] : []), ...[...groups].filter(([, v]) => v.length)]
  return (
    <div className="fpick">
      <input className="fp-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${options.length} ${noun}`} aria-label={`Search ${noun}`} autoFocus={autoFocus} />
      {onOrder && <div className="fp-order"><span className="t40">Order</span><span className="seg sm">{orders.map((o) => <button key={o} type="button" aria-pressed={order === o} onClick={() => onOrder(o)}>{o === 'default' ? defaultOrder : ORDER_WORDS[o]}</button>)}</span></div>}
      {head}
      <div className="fp-list" role="group" aria-label={noun}>
        {blocks.map(([name, opts]) => (
          <React.Fragment key={name || '-'}>
            {name && blocks.length > 1 && <div className="fp-h">{name}</div>}
            {opts.map((o) => {
              const on = selected.includes(o.key)
              return (
                <button key={o.key} type="button" className="fp-row" role={multi ? 'checkbox' : 'radio'} aria-checked={on} title={o.title} onClick={(e) => onPick(o.key, e)}>
                  <span className="cm-tick" aria-hidden>{on ? '✓' : ''}</span>
                  {o.icon}
                  <span className="fp-n">{o.label ?? o.text}{o.tail}</span>
                  {o.count != null && <span className="fp-c">{o.count}</span>}
                </button>
              )
            })}
          </React.Fragment>
        ))}
        {!list.length && <div className="fp-none t50">Nothing matches “{q}”.</div>}
      </div>
    </div>
  )
}

export interface FacetPickerProps extends Omit<FacetListProps, 'order' | 'onOrder' | 'autoFocus'> {
  /** the leading chip that clears the facet; absent = no such chip */
  all?: { label: React.ReactNode; count?: React.ReactNode; onClick: () => void }
  /** chips in the row before More: desktop and phone */
  max?: number
  maxPhone?: number
  /** keeps the reader's order under this key; absent = the page's ranking, no order picker */
  orderKey?: string
  /** `chip` (the asset pages) or `pchip` (the feed's facets) */
  chip?: 'chip' | 'pchip'
  className?: string
  ariaLabel: string
  /** after the row, inside it (a match mode) */
  children?: React.ReactNode
}

/** The row with its More. */
export function FacetPicker({ all, max = 6, maxPhone = 4, orderKey, chip = 'chip', className = 'chips', ariaLabel, children, ...list }: FacetPickerProps) {
  const phone = useViewport() === 'phone'
  const [order, setOrder] = useFacetOrder(orderKey)
  const [open, setOpen] = React.useState(false)
  const more = React.useRef<HTMLButtonElement>(null)
  const { row, rest } = rowOf(ordered(list.options, order), list.selected, phone ? maxPhone : max)
  const pick = (k: string, e: React.MouseEvent) => { list.onPick(k, e); if (!list.multi) setOpen(false) }
  return (
    <div className={`${className} frow`} role="group" aria-label={ariaLabel}>
      {all && <button type="button" className={`${chip} all`} aria-pressed={list.selected.length === 0} onClick={all.onClick}>{all.label}{all.count != null && <span className={chip === 'chip' ? 'c' : 'pc'}>{all.count}</span>}</button>}
      {row.map((o) => (
        <button key={o.key} type="button" className={chip} aria-pressed={list.selected.includes(o.key)} title={o.title} onClick={(e) => list.onPick(o.key, e)}>
          {o.icon}{chip === 'pchip' ? <span className="pn">{o.label ?? o.text}</span> : o.label ?? o.text}
          {o.count != null && <span className={chip === 'chip' ? 'c' : 'pc'}>{o.count}</span>}
          {o.mine && <i className="fmine" title="You hold it" />}
        </button>
      ))}
      {rest > 0 && <button ref={more} type="button" className={`${chip} more`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>More <span className={chip === 'chip' ? 'c' : 'pc'}>{rest}</span><svg viewBox="0 0 12 12" width="9" height="9" aria-hidden><path d="M2 4.2 6 8.2 10 4.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
      {children}
      <Popover anchor={more} open={open} onClose={() => setOpen(false)} width={320} align="left">
        <FacetList {...list} onPick={pick} order={order} onOrder={orderKey ? setOrder : undefined} autoFocus={!phone} />
      </Popover>
    </div>
  )
}
