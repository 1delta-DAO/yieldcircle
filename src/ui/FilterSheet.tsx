/**
 * The feed's facets behind one button (docs/simplify-selections.md §2).
 *
 * The feed and Hot stacked a chip row per facet — protocol, issuer, curator — each with its own
 * `+N`, and they cost the first screen of a page whose job is to be READ. Here they are one
 * `Filters` button opening a sheet with a tab per facet (`FacetList`: search, sections, counts),
 * and a summary line of what is on, each with its ×. The summary is what makes the fold safe:
 * a feed narrowed by a filter you cannot see is a feed that lies (Baymard: 28 % of sites show
 * no such summary).
 *
 * The asset-class chips stay out in the open: at most six, and the coarse cut people make first.
 */
import React from 'react'
import { Popover, ProtocolLogo, curatorIconUrls, issuerIconUrls, protocolIconUrls, usdShort } from './bits'
import { FacetList, type FacetOption } from './FacetPicker'
import { protocolName, type ProtocolFilterState } from './ProtocolFilter'
import { ISSUER_MATCHES, type IssuerFilterState } from './IssuerFilter'
import { curatorLabel, type CuratorFilterState } from './CuratorFilter'

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))
const toggle = (cur: string[], k: string) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k])

type Tab = 'protocol' | 'issuer' | 'curator'
interface Facets { pf: ProtocolFilterState; inf?: IssuerFilterState; cf?: CuratorFilterState }

/** The curators worth a filter: a desk with no read AUM and no moves would promise rows that are not there. */
const curatorsOf = (cf: CuratorFilterState) => cf.curators.filter((c) => (c.aumUsd ?? 0) > 0 || (c.nMoves ?? 0) > 0)

export function FilterButton({ pf, inf, cf }: Facets) {
  const btn = React.useRef<HTMLButtonElement>(null)
  const [open, setOpen] = React.useState(false)
  const tabs: { k: Tab; label: string; n: number }[] = [
    { k: 'protocol', label: 'Protocol', n: pf.picked.length },
    ...(inf ? [{ k: 'issuer' as const, label: 'Issuer', n: inf.picked.length }] : []),
    ...(cf ? [{ k: 'curator' as const, label: 'Curator', n: cf.picked ? 1 : 0 }] : []),
  ]
  const [tab, setTab] = React.useState<Tab>('protocol')
  const on = tabs.find((t) => t.k === tab) ? tab : 'protocol'
  const n = tabs.reduce((a, t) => a + t.n, 0)
  return (
    <>
      <button ref={btn} type="button" className={`pchip fbtn${n ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 6h16M7 12h10M10 18h4" /></svg>
        <span className="pn">Filters</span>{n > 0 && <span className="pc">{n}</span>}
      </button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} width={340} align="left">
        {tabs.length > 1 && <div className="fs-tabs"><span className="seg sm">{tabs.map((t) => <button key={t.k} type="button" aria-pressed={on === t.k} onClick={() => setTab(t.k)}>{t.label}{t.n > 0 && <span className="c"> {t.n}</span>}</button>)}</span></div>}
        {on === 'protocol' && <FacetList key="p" noun="protocols" multi selected={pf.picked} autoFocus
          options={pf.protocols.map((p): FacetOption => ({ key: p.protocol, text: protocolName(p), count: compact(p.rows), title: `${protocolName(p)} — ${p.rows} rows, ${p.wallets} wallets, ${p.markets} markets · alt-click for only this one`, icon: <ProtocolLogo urls={protocolIconUrls(p.protocol, p.logoUri)} name={protocolName(p)} /> }))}
          onPick={(k, e) => pf.setPicked(e.altKey ? [k] : toggle(pf.picked, k))} />}
        {on === 'issuer' && inf && <FacetList key="i" noun="issuers" multi selected={inf.picked} autoFocus
          head={inf.picked.length > 0 && <div className="fp-order"><span className="t40">Match</span><span className="seg sm">{ISSUER_MATCHES.map((m) => <button key={m.k} type="button" aria-pressed={inf.match === m.k} title={m.title} onClick={() => inf.setMatch(m.k)}>{m.label}</button>)}</span></div>}
          options={inf.issuers.map((i): FacetOption => ({ key: i.issuer, text: i.name, count: compact(i.rows), tail: i.via === i.rows ? <span className="pv">via</span> : undefined,
            title: `${i.name} — ${i.rows} rows, ${i.wallets} wallets, ${i.markets} markets${i.via ? `; ${i.via} of them reach it only through what backs them` : ''} · alt-click for only this one`, icon: <ProtocolLogo urls={issuerIconUrls(i.issuer)} name={i.name} /> }))}
          onPick={(k, e) => inf.setPicked(e.altKey ? [k] : toggle(inf.picked, k))} />}
        {on === 'curator' && cf && <FacetList key="c" noun="curators" selected={cf.picked ? [cf.picked] : []} autoFocus
          options={curatorsOf(cf).map((c): FacetOption => ({ key: c.curatorId, text: curatorLabel(c), count: c.nVaults ?? 0, title: `${curatorLabel(c)} — ${c.nVaults ?? 0} vaults, ${usdShort(c.aumUsd ?? 0)} read${c.verified ? ', listed in a curator registry we read' : ', not in any curator registry we read'}`, icon: <ProtocolLogo urls={curatorIconUrls(c.curatorId, c.logoUri)} name={curatorLabel(c)} /> }))}
          onPick={(k) => cf.setPicked(cf.picked === k ? undefined : k)} />}
      </Popover>
    </>
  )
}

/** What is narrowing the list, each with its ×, and Clear. Nothing when nothing is on. */
export function AppliedFilters({ pf, inf, cf }: Facets) {
  const chips: { key: string; label: React.ReactNode; off: () => void }[] = []
  for (const k of pf.picked) {
    const p = pf.protocols.find((x) => x.protocol === k)
    chips.push({ key: `p:${k}`, label: p ? protocolName(p) : k, off: () => pf.setPicked(pf.picked.filter((x) => x !== k)) })
  }
  if (inf) {
    const how = inf.match === 'any' ? '' : ` (${ISSUER_MATCHES.find((m) => m.k === inf.match)!.label})`
    for (const k of inf.picked) chips.push({ key: `i:${k}`, label: `${inf.issuers.find((x) => x.issuer === k)?.name ?? k}${how}`, off: () => inf.setPicked(inf.picked.filter((x) => x !== k)) })
  }
  if (cf?.picked) { const c = cf.curators.find((x) => x.curatorId === cf.picked); chips.push({ key: 'c', label: c ? curatorLabel(c) : 'this curator', off: () => cf.setPicked(undefined) }) }
  if (!chips.length) return null
  const clear = () => { pf.setPicked([]); inf?.setPicked([]); cf?.setPicked(undefined) }
  return (
    <>
      {chips.map((c) => <button key={c.key} type="button" className="pchip applied" aria-label={`Remove ${typeof c.label === 'string' ? c.label : 'filter'}`} onClick={c.off}><span className="pn">{c.label}</span><span aria-hidden className="x">×</span></button>)}
      {chips.length > 1 && <button type="button" className="lnk t50 fclear" onClick={clear}>Clear</button>}
    </>
  )
}

/** The line: the button, then what it has on. */
export function FilterBar(f: Facets) {
  return <div className="filterbar"><FilterButton {...f} /><AppliedFilters {...f} /></div>
}
