/**
 * The curator filter — WHO manages it.
 *
 * `ProtocolFilter` says where a dollar sits, `IssuerFilter` says whose credit
 * it is. Neither can answer the question a depositor in a managed vault is
 * actually exposed to: **who picked the market, and are they any good at it?**
 * For the curated half of the vault universe the depositor does not choose
 * the market at all — a desk chooses it for them, every day, sometimes across
 * four lenders at once.
 *
 * Single-select, unlike the other two: the index resolves one desk to its
 * vault addresses and filters the ledger on those, so "Steakhouse or Gauntlet"
 * is not a query this axis answers. A desk with no vaults in scope answers an
 * EMPTY feed rather than the unfiltered one — the same rule as every other
 * filter here.
 */
import React from 'react'
import { useApp } from '../state/AppState'
import { useCurators } from '../index/queries'
import type { AccountCurator, CuratorRow } from '../index/api'
import { usdShort } from './bits'
import { useSticky } from '../state/sticky'

/** `cand:1:0x5555…` → "the desk at 0x5555…" — an unnamed desk is not a nameless one. */
export function curatorLabel(c: { curatorId: string; name?: string | null }): string {
  if (c.name) return c.name
  const addr = c.curatorId.startsWith('cand:') ? c.curatorId.split(':')[2] : null
  return addr ? `desk ${addr.slice(0, 6)}…${addr.slice(-4)}` : c.curatorId
}

export const curatorHref = (id: string) => `#/c/${encodeURIComponent(id)}`

export function useCuratorFilter(scope = 'page') {
  const { chainIds, allChains } = useApp()
  const q = useCurators(allChains ? undefined : chainIds.join(','), 60)
  const [picked, setPicked] = useSticky<string | undefined>(`${scope}:curator`, undefined)
  const list = q.data?.curators ?? []
  React.useEffect(() => {
    if (!q.data || !picked) return
    if (!list.some((c) => c.curatorId === picked)) setPicked(undefined)
  }, [list, picked, q.data])
  return {
    curators: list,
    isLoading: q.isLoading,
    picked,
    setPicked,
    /** what to send the index; undefined = no filter */
    param: picked,
  }
}
export type CuratorFilterState = ReturnType<typeof useCuratorFilter>

/**
 * Only desks the index can say something about get a chip — a desk with no
 * read AUM is a page, not a filter, because filtering by it would promise
 * rows that are not there.
 */
export function CuratorChips({ f, max = 6 }: { f: CuratorFilterState; max?: number }) {
  const [showAll, setShowAll] = React.useState(false)
  const offer = f.curators.filter((c) => (c.aumUsd ?? 0) > 0 || (c.nMoves ?? 0) > 0)
  if (!offer.length) return null
  const shown = showAll ? offer : offer.slice(0, max)
  const hidden = offer.length - shown.length
  const title = (c: CuratorRow) =>
    `${curatorLabel(c)} — ${c.nVaults ?? 0} vaults, ${usdShort(c.aumUsd ?? 0)} read` +
    (c.verified ? ', listed in a curator registry we read' : ', not in any curator registry we read') +
    ' · click again to clear'
  return (
    <div className="ichips" role="group" aria-label="Curators">
      {/*
        NOT "all desks": the issuer row above already owns that phrase for
        whose CREDIT a row carries, and two chip rows that begin with the same
        word are two filters a reader cannot tell apart.
      */}
      <button className="pchip all" aria-pressed={!f.picked} onClick={() => f.setPicked(undefined)}>All curators</button>
      {shown.map((c) => (
        <button
          key={c.curatorId}
          className="pchip"
          aria-pressed={f.picked === c.curatorId}
          title={title(c)}
          onClick={() => f.setPicked(f.picked === c.curatorId ? undefined : c.curatorId)}
        >
          {c.logoUri ? <img src={c.logoUri} alt="" loading="lazy" /> : <i className="plogo">c</i>}
          <span className="pn">{curatorLabel(c)}</span>
          <span className="pc">{c.nVaults ?? 0}</span>
        </button>
      ))}
      {hidden > 0 && <button className="pchip more" onClick={() => setShowAll(true)}>+{hidden}</button>}
      {showAll && offer.length > max && <button className="pchip more" onClick={() => setShowAll(false)}>less</button>}
    </div>
  )
}

/**
 * The desk behind a row. The dot is the ARM that established it, because a
 * name match is not a proof and must not read like one:
 *
 *   ● proved   an on-chain role getter said so
 *   ◐ stated   a registry or a curated override said so
 *   ○ guessed  a normalised name matched a registry name
 */
const MARK: Record<string, string> = { proved: '●', stated: '◐', guessed: '○' }

export function CuratorMark({
  c,
  sub,
}: {
  c: (AccountCurator & { arm?: string; confidence?: string }) | null | undefined
  /** say how the address relates to the desk (the wallet page wants it; a feed row does not) */
  sub?: boolean
}) {
  if (!c) return null
  return (
    <a
      className="cmark"
      href={curatorHref(c.curatorId)}
      onClick={(e) => e.stopPropagation()}
      title={
        `${curatorLabel(c)} — ${c.via === 'vault' ? 'this address is one of its vaults' : `an address it controls${c.role ? ` (${c.role})` : ''}`}` +
        `; ${c.nVaults} vaults` +
        (c.verified ? ', listed in a curator registry we read' : ', not in any curator registry we read')
      }
    >
      {c.logoUri ? <img src={c.logoUri} alt="" loading="lazy" /> : <i className="plogo">c</i>}
      <span className="cn">{curatorLabel(c)}</span>
      {c.confidence && <span className="cc">{MARK[c.confidence] ?? ''}</span>}
      {sub && <span className="cs">{c.via === 'vault' ? 'vault of' : 'runs'}</span>}
    </a>
  )
}
