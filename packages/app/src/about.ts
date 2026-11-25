import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { loadAssetNotes } from '@yieldcircle/core/model/assetNotes'
import { assetFacts, similarAssets, strategyAbout } from '@yieldcircle/core/model/assetAbout'
import { canonGroup } from '@yieldcircle/core/model/assetGroup'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { useAsset } from './index/queries'
import { useLiteMenu } from './lite'

/**
 * What an asset is and who issues it (core's `model/assetAbout.ts`), for both apps: Lite's asset
 * page and the asset-strategy section of a ticket. The notes are a lazy chunk (~840 kB), read
 * once and kept.
 */
export function useAssetNotes() {
  return useQuery({ queryKey: ['asset-notes'], queryFn: loadAssetNotes, staleTime: Infinity, gcTime: Infinity })
}

/** A strategy's parts: what it holds, what it borrows, how it earns. Empty until the notes arrive. */
export function useStrategyAbout(s: Strategy | null) {
  const notes = useAssetNotes()
  return React.useMemo(() => (s && notes.data ? strategyAbout(s, notes.data) : []), [s, notes.data])
}

/**
 * Lite's asset page: the index's figures for the asset (`useAsset`; a Solana-only token has none
 * yet, and the page reads without them), its note and issuer, the Lite rows that hold it, and
 * assets that earn the same way.
 */
export function useAssetPage(group: string) {
  const key = canonGroup(group)
  const a = useAsset(key)
  const notes = useAssetNotes()
  const L = useLiteMenu()
  const d = a.data
  const sym = d?.symbol ?? key.split('::')[1] ?? key
  const facts = React.useMemo(() => assetFacts(notes.data, key, sym, { id: d?.issuer, name: d?.issuerName }), [notes.data, key, sym, d?.issuer, d?.issuerName])
  const on = (g: string | undefined) => !!g && canonGroup(g) === key
  const rows = React.useMemo(() => L.rows.filter((r) => on(r.s.assetGroup) || (r.s.kind === 'simple' && on(r.s.shareGroup))), [L.rows, key]) // eslint-disable-line react-hooks/exhaustive-deps
  const similar = React.useMemo(() => similarAssets(key, L.b.all, notes.data), [key, L.b.all, notes.data])
  // the asset's own mark and name where the index has none: the first row that holds it
  const row = rows[0]?.s
  const logo = d?.logoUri ?? (row ? (row.kind === 'loop' ? row.logoLong : on(row.shareGroup) ? row.shareLogo ?? row.logo : row.tokenLogo) : undefined) ?? undefined
  return { key, a, d, sym, name: d?.name ?? key.split('::')[0] ?? key, logo, facts, rows, similar, L, loading: notes.isLoading || (a.isLoading && !a.isError) }
}
