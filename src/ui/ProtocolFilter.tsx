/**
 * The protocol filter.
 *
 * It offers only the protocols with something in the window — a filter that
 * lists forty venues where thirty are empty is worse than no filter, because
 * every empty choice is a promise the page cannot keep. The index's
 * `/protocols` facet answers exactly that, with the counts that justify each
 * one, so the chip can say `Morpho 3.5k` instead of asking for faith.
 *
 * It is LOCAL on purpose. The chain selector is global — it says which world
 * you are looking at, and every surface should agree about that. Which
 * protocols you want to see is a question about the list in front of you, so
 * it lives beside that list and resets when you leave it.
 *
 * `lenderKey` groups by PROTOCOL, not by instance: seven `AAVE_V4_<address>`
 * pools and six `COMPOUND_V3_<asset>` comets are two choices here, not
 * thirteen. The index derives that (`protocolKeyOf`); the names and logos are
 * the same ones every row already carries.
 */
import React from 'react'
import { useApp } from '../state/AppState'
import { useProtocols } from '../index/queries'
import type { ProtocolFacet } from '../index/api'
import { useSticky } from '../state/sticky'

/** `CAPY_FI` → `Capy Fi`, for the few keys no lender listing names. */
export function prettyProtocol(key: string): string {
  if (key.startsWith('vault.')) {
    const p = key.slice(6).replace(/[-_]/g, ' ')
    return p.replace(/\b\w/g, (c) => c.toUpperCase()) + ' vaults'
  }
  return key
    .replace(/_V(\d)$/, ' v$1')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
export const protocolName = (p: ProtocolFacet) => p.name ?? prettyProtocol(p.protocol)

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

export function useProtocolFilter(window: '1h' | '6h' | '24h' | '7d' = '7d', scope = 'page') {
  const { chainIds, allChains } = useApp()
  const q = useProtocols(window, allChains ? undefined : chainIds.join(','))
  const [picked, setPicked] = useSticky<string[]>(`${scope}:protocols`, [])
  // a protocol that leaves the window (or the chain scope) must not go on
  // filtering invisibly — drop it from the selection the moment it is gone
  const available = React.useMemo(() => new Set((q.data?.protocols ?? []).map((p) => p.protocol)), [q.data])
  React.useEffect(() => {
    if (!q.data) return
    setPicked((cur) => (cur.every((p) => available.has(p)) ? cur : cur.filter((p) => available.has(p))))
  }, [available, q.data])
  return {
    protocols: q.data?.protocols ?? [],
    isLoading: q.isLoading,
    picked,
    setPicked,
    /** what to send the index; undefined = no filter */
    param: picked.length ? picked.join(',') : undefined,
  }
}
export type ProtocolFilterState = ReturnType<typeof useProtocolFilter>

export function ProtocolChips({ f, max = 10 }: { f: ProtocolFilterState; max?: number }) {
  const [showAll, setShowAll] = React.useState(false)
  if (f.isLoading && !f.protocols.length) return null
  if (!f.protocols.length) return null
  const shown = showAll ? f.protocols : f.protocols.slice(0, max)
  const hidden = f.protocols.length - shown.length
  const toggle = (k: string) =>
    f.setPicked(f.picked.includes(k) ? f.picked.filter((x) => x !== k) : [...f.picked, k])
  return (
    <div className="pchips" role="group" aria-label="Protocols">
      <button className="pchip all" aria-pressed={f.picked.length === 0} onClick={() => f.setPicked([])}>All</button>
      {shown.map((p) => (
        <button key={p.protocol} className="pchip" aria-pressed={f.picked.includes(p.protocol)}
          onClick={(e) => (e.altKey ? f.setPicked([p.protocol]) : toggle(p.protocol))}
          title={`${protocolName(p)} — ${p.rows} rows, ${p.wallets} wallets, ${p.markets} markets · alt-click for only this one`}>
          {p.logoUri ? <img src={p.logoUri} alt="" width={15} height={15} loading="lazy" /> : <i className="plogo">{protocolName(p).slice(0, 1)}</i>}
          <span className="pn">{protocolName(p)}</span>
          <span className="pc">{compact(p.rows)}</span>
        </button>
      ))}
      {hidden > 0 && <button className="pchip more" onClick={() => setShowAll(true)}>+{hidden}</button>}
      {showAll && f.protocols.length > max && <button className="pchip more" onClick={() => setShowAll(false)}>less</button>}
    </div>
  )
}
