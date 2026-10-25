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
import { useIssuers } from '@yieldcircle/app/index/queries'
import type { IssuerMatch } from '@yieldcircle/core/index/api'
import { useSticky } from '../state/sticky'
import { Tip } from './bits'


export function useIssuerFilter(window: '1h' | '6h' | '24h' | '7d' = '7d', scope = 'page', seed?: { issuers: string[]; match: IssuerMatch }) {
  const { chainIds, allChains } = useApp()
  const q = useIssuers(window, allChains ? undefined : chainIds.join(','))
  const [picked, setPicked] = useSticky<string[]>(`${scope}:issuers`, [], seed && { value: seed.issuers })
  const [match, setMatch] = useSticky<IssuerMatch>(`${scope}:issuerMatch`, 'any', seed && { value: seed.match })
  const available = React.useMemo(
    () => new Set((q.data?.issuers ?? []).map((i) => i.issuer)),
    [q.data],
  )
  React.useEffect(() => {
    // a placeholder (last visit, or the previous window) is not the truth about what is available yet
    if (!q.data || q.isPlaceholderData) return
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

/** the match mode, in the words the sheet and the summary use */
export const ISSUER_MATCHES: { k: IssuerMatch; label: string; title: string }[] = [
  { k: 'any', label: 'any', title: "the token's own desk OR the credit behind it — a union, so the three modes do not add up" },
  { k: 'direct', label: 'issued by', title: 'only rows whose token IS this desk’s contract' },
  { k: 'exposure', label: 'exposed to', title: 'only rows that reach this desk through what backs them — the token it wraps, the collateral, the vault’s allocation' },
]

/**
 * The desk chips on a row: the instrument first, then the credit behind it,
 * dimmer — because a two-hop attribution is a weaker claim, not a smaller
 * risk. Renders nothing when the row names no desk, which is the common
 * case (nobody issues WETH) and where an "unknown" chip would be noise.
 */
/**
 * DeskChips as one glyph, for a row with no room to spell them out: the chips
 * beside a market pill on a feed card ate the width the market's own name needed.
 * The issuer and the credit behind it are in the popover.
 */
export function DeskMark({ x }: { x: Parameters<typeof DeskChips>[0]['x'] }) {
  const via = (x.issuerExposures ?? []).filter((e) => e.id !== x.issuer?.id)
  if (!x.issuer && !via.length) return null
  return (
    <Tip
      className="xglyph"
      tip={
        <>
          {x.issuer && <div>Issued by <b>{x.issuer.name}</b>.</div>}
          {via.length > 0 && (
            <div>
              The credit behind it reaches{' '}
              {via.map((e, i) => (
                <React.Fragment key={e.id}>
                  {i > 0 && ', '}
                  <b>{e.name}</b>
                  {e.hops > 1 && <> ({e.hops} hops — a weaker claim)</>}
                </React.Fragment>
              ))}
              .
            </div>
          )}
        </>
      }
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label={x.issuer ? `issued by ${x.issuer.name}` : 'issuer exposure'}>
        <path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l8 5H4z" />
      </svg>
    </Tip>
  )
}

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
