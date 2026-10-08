/**
 * What a token IS — the description an asset page (`ui/TokenPage.tsx`) opens
 * with. The one source is token-lists' `asset-notes.json` (its
 * scripts/notes/README.md): curated notes checked against the issuer's docs,
 * and a derived one-liner read off the props the token lists already curate.
 * Keyed by the index's asset GROUP (case-significant, `model/assetGroup.ts`),
 * valid on every chain the group lives on. `node scripts/notes.mjs` copies it
 * into src/data; a note is written in token-lists, never here.
 *
 * ~840 kB (~110 kB gzipped), so it is a lazy chunk: only an asset page loads it.
 */
import { baseInfo } from './assets'
import { canonGroup } from './assetGroup'

export interface AssetNote {
  /** one line, ≤ 90 chars */
  what: string
  /** 2–4 sentences */
  body?: string
  backing?: string | null
  /** null: the token earns nothing itself */
  yieldSource?: string | null
  redemption?: string | null
  issuer?: string | null
  links?: string[]
  /** ISO day the facts were last checked */
  updated?: string
  confidence?: 'high' | 'medium' | 'low'
  /** something is off (price, contract, identity): shown as a caveat */
  verify?: string
  source: 'curated' | 'derived' | 'menu'
}

let pending: Promise<Record<string, AssetNote>> | undefined
export const loadAssetNotes = () =>
  (pending ??= import('../data/asset-notes.json').then((m) => m.default as unknown as Record<string, AssetNote>))

/** The group's note, else the one-line `what` of a base asset the menu knows (USDC: "Circle stablecoin"). */
export function noteOf(notes: Record<string, AssetNote> | undefined, group: string, symbol: string | null | undefined): AssetNote | undefined {
  const n = notes?.[group] ?? notes?.[canonGroup(group)]
  if (n) return n
  const sym = symbol ?? group
  const base = baseInfo(sym)
  return base && base.sym.toUpperCase() === sym.toUpperCase() ? { what: base.what, source: 'menu' } : undefined
}
