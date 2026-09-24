/**
 * The issuer filter — whose credit, not where.
 *
 * `ProtocolFilter` answers "where does this sit": Morpho, Aave, a Fluid
 * vault. It is the only vocabulary this feed has had, and it cannot answer
 * the question a depositor actually asks about a dollar: **whose solvency,
 * administration and redemption terms am I holding?** A USDC deposit into a
 * Morpho market collateralised by PT-reUSD is Re's credit on Pendle's
 * contracts, and until this filter existed you could not find it by either
 * name.
 *
 * Three facts, one control (pos-indexer docs/issuer-exposure.md):
 *
 * - **direct** — the token's own contract. `PT-sUSDE` is Pendle's;
 * - **exposure** — the credit behind it, plus the credit behind the market's
 *   collateral or the vault's allocation. The same row is Ethena's;
 * - **any** (the default) — both, and it is a **union, not a sum**. A row
 *   whose token is Circle's *and* whose market allocation also reaches
 *   Circle is one Circle row. Do not present the three as a partition.
 *
 * Like the protocol chips this is LOCAL and offers only desks with rows in
 * the window, because every empty choice is a promise the page cannot keep.
 * A desk that leaves the window is dropped from the selection rather than
 * left filtering invisibly.
 */
import React from 'react'
import { useApp } from '../state/AppState'
import { useIssuers } from '../index/queries'
import type { IssuerFacet, IssuerMatch } from '../index/api'
import { useSticky } from '../state/sticky'

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

export function useIssuerFilter(window: '1h' | '6h' | '24h' | '7d' = '7d', scope = 'page') {
  const { chainIds, allChains } = useApp()
  const q = useIssuers(window, allChains ? undefined : chainIds.join(','))
  const [picked, setPicked] = useSticky<string[]>(`${scope}:issuers`, [])
  const [match, setMatch] = useSticky<IssuerMatch>(`${scope}:issuerMatch`, 'any')
  const available = React.useMemo(
    () => new Set((q.data?.issuers ?? []).map((i) => i.issuer)),
    [q.data],
  )
  React.useEffect(() => {
    if (!q.data) return
    setPicked((cur) => (cur.every((i) => available.has(i)) ? cur : cur.filter((i) => available.has(i))))
  }, [available, q.data])
  return {
    issuers: q.data?.issuers ?? [],
    isLoading: q.isLoading,
    picked,
    setPicked,
    match,
    setMatch,
    /** what to send the index; undefined = no filter */
    param: picked.length ? picked.join(',') : undefined,
    /** only meaningful with `param`; the index defaults to `any` anyway */
    matchParam: picked.length && match !== 'any' ? match : undefined,
  }
}
export type IssuerFilterState = ReturnType<typeof useIssuerFilter>

const MATCHES: { k: IssuerMatch; label: string; title: string }[] = [
  { k: 'any', label: 'any', title: "the token's own desk OR the credit behind it — a union, so the three modes do not add up" },
  { k: 'direct', label: 'issued by', title: 'only rows whose token IS this desk’s contract' },
  { k: 'exposure', label: 'exposed to', title: 'only rows that reach this desk through what backs them — the token it wraps, the collateral, the vault’s allocation' },
]

export function IssuerChips({ f, max = 8 }: { f: IssuerFilterState; max?: number }) {
  const [showAll, setShowAll] = React.useState(false)
  if (f.isLoading && !f.issuers.length) return null
  if (!f.issuers.length) return null
  const shown = showAll ? f.issuers : f.issuers.slice(0, max)
  const hidden = f.issuers.length - shown.length
  const toggle = (k: string) =>
    f.setPicked(f.picked.includes(k) ? f.picked.filter((x) => x !== k) : [...f.picked, k])
  const title = (i: IssuerFacet) =>
    `${i.name} — ${i.rows} rows, ${i.wallets} wallets, ${i.markets} markets` +
    (i.via ? `; ${i.via} of them reach it only through what backs them` : '') +
    ' · alt-click for only this one'
  return (
    <div className="ichips" role="group" aria-label="Issuers">
      <button className="pchip all" aria-pressed={f.picked.length === 0} onClick={() => f.setPicked([])}>All desks</button>
      {shown.map((i) => (
        <button key={i.issuer} className="pchip" aria-pressed={f.picked.includes(i.issuer)}
          onClick={(e) => (e.altKey ? f.setPicked([i.issuer]) : toggle(i.issuer))}
          title={title(i)}>
          <span className="pn">{i.name}</span>
          <span className="pc">{compact(i.rows)}</span>
          {i.via === i.rows && <span className="pv" title="every row here reaches this desk indirectly">via</span>}
        </button>
      ))}
      {hidden > 0 && <button className="pchip more" onClick={() => setShowAll(true)}>+{hidden}</button>}
      {showAll && f.issuers.length > max && <button className="pchip more" onClick={() => setShowAll(false)}>less</button>}
      {/* the mode only means anything once a desk is picked, so it appears with one */}
      {f.picked.length > 0 && (
        <span className="seg sm imatch">
          {MATCHES.map((m) => (
            <button key={m.k} aria-pressed={f.match === m.k} title={m.title} onClick={() => f.setMatch(m.k)}>{m.label}</button>
          ))}
        </span>
      )}
    </div>
  )
}

/**
 * The desk chips on a row: the instrument first, then the credit behind it,
 * dimmer — because a two-hop attribution is a weaker claim, not a smaller
 * risk. Renders nothing when the row names no desk, which is the common
 * case (nobody issues WETH) and where an "unknown" chip would be noise.
 */
export function DeskChips({ x, max = 2 }: { x: { issuer?: { id: string; name: string } | null; issuerExposures?: { id: string; name: string; hops: number }[] | null }; max?: number }) {
  const via = (x.issuerExposures ?? []).filter((e) => e.id !== x.issuer?.id)
  if (!x.issuer && !via.length) return null
  return (
    <span className="desk">
      {x.issuer && <span className="desk-chip" title={`issued by ${x.issuer.name}`}>{x.issuer.name}</span>}
      {via.slice(0, max).map((e) => (
        <span key={e.id} className="desk-chip via" title={`the credit behind it reaches ${e.name}${e.hops > 1 ? ` at ${e.hops} hops — a weaker claim` : ''}`}>via {e.name}</span>
      ))}
      {via.length > max && <span className="desk-chip via" title={via.map((e) => e.name).join(', ')}>+{via.length - max}</span>}
    </span>
  )
}
