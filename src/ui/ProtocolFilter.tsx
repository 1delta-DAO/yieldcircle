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

/**
 * Names that beat the index's. `MetaMorpho` is a contract, not a product anyone
 * shops for, and beside a bare `Morpho` it does not say "vaults, not markets".
 */
const NAMES: Record<string, string> = {
  MORPHO_BLUE: 'Morpho Markets', 'vault.morpho': 'Morpho Vaults', 'vault.morpho_blue': 'Morpho Vaults',
  MORPHO_MIDNIGHT: 'Morpho Midnight', COMPOUND_V3: 'Compound V3', LODESTAR: 'Lodestar', COOLER: 'Cooler',
}
/**
 * Keys the index keeps apart for its own reasons that are one choice to a
 * person: `vault.morpho_blue` holds the Morpho vaults (V1 and V2) of chains the
 * index reads from another source — the same product as `vault.morpho`. The
 * chip carries the first key; the filter sends all of them.
 */
const ALIAS: Record<string, string> = { 'vault.morpho_blue': 'vault.morpho' }
const MEMBERS: Record<string, string[]> = {}
for (const [k, to] of Object.entries(ALIAS)) (MEMBERS[to] ??= [to]).push(k)
const expand = (k: string) => MEMBERS[k] ?? [k]

/** Fold aliased facets into their primary: rows and markets add, wallets can only be bounded (one wallet may sit in both). */
function fold(list: ProtocolFacet[]): ProtocolFacet[] {
  const by = new Map<string, ProtocolFacet>()
  for (const p of list) {
    const key = ALIAS[p.protocol] ?? p.protocol
    const cur = by.get(key)
    if (!cur) { by.set(key, { ...p, protocol: key }); continue }
    by.set(key, {
      ...cur, name: cur.name ?? p.name, logoUri: cur.logoUri ?? p.logoUri,
      chains: [...new Set([...cur.chains, ...p.chains])],
      rows: cur.rows + p.rows, markets: cur.markets + p.markets, wallets: Math.max(cur.wallets, p.wallets),
    })
  }
  return [...by.values()].sort((a, b) => b.rows - a.rows)
}

/** `CAPY_FI` → `Capy Fi`, for the few keys no lender listing names. */
export function prettyProtocol(key: string): string {
  if (NAMES[key]) return NAMES[key]
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
export const protocolName = (p: ProtocolFacet) => NAMES[p.protocol] ?? p.name ?? prettyProtocol(p.protocol)

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

export function useProtocolFilter(window: '1h' | '6h' | '24h' | '7d' = '7d', scope = 'page', seed?: string[]) {
  const { chainIds, allChains } = useApp()
  const q = useProtocols(window, allChains ? undefined : chainIds.join(','))
  const [picked, setPicked] = useSticky<string[]>(`${scope}:protocols`, [], seed && { value: seed })
  // a protocol that leaves the window (or the chain scope) must not go on
  // filtering invisibly — drop it from the selection the moment it is gone
  const protocols = React.useMemo(() => fold(q.data?.protocols ?? []), [q.data])
  const available = React.useMemo(() => new Set(protocols.map((p) => p.protocol)), [protocols])
  React.useEffect(() => {
    // a placeholder (last visit, or the previous window) is not the truth about what is available yet
    if (!q.data || q.isPlaceholderData) return
    // a key from a link may be in any case, or be an alias of the chip that stands for it
    const canon = new Map(protocols.map((p) => [p.protocol.toLowerCase(), p.protocol]))
    const resolve = (k: string) => canon.get((ALIAS[k] ?? k).toLowerCase()) ?? canon.get(k.toLowerCase())
    setPicked((cur) => {
      if (cur.every((p) => available.has(p))) return cur
      return [...new Set(cur.map(resolve).filter((p): p is string => !!p))]
    })
  }, [available, q.data])
  const keys = React.useMemo(() => picked.flatMap(expand), [picked])
  return {
    protocols,
    isLoading: q.isLoading,
    picked,
    setPicked,
    /** every index key the picks stand for — what a row's leg is matched against */
    keys,
    /** what to send the index; undefined = no filter */
    param: keys.length ? keys.join(',') : undefined,
  }
}
export type ProtocolFilterState = ReturnType<typeof useProtocolFilter>
