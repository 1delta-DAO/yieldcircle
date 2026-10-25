import { CHAINS } from '@yieldcircle/app/sdk/queries'
import type { IssuerMatch } from '@yieldcircle/core/index/api'
import { ASSET_CLASS_MATCHES, parseAssetClassParam, type AssetClassMatch } from '@yieldcircle/core/model/assetClass'

/**
 * The feed's filters as a link, so a view can be sent to someone:
 *
 *   #/feed?t=everyone&c=avalanche,ethereum&p=AAVE_V3,BENQI
 *
 * `#/?…` — the feed's address while it was the home page — is still read, so
 * the links already sent keep working.
 *
 *   c    chains, by lowercase label (`43114` is read too)
 *   p    protocol keys, as the index names them
 *   i    issuer desks          im  issuer match (direct | exposure; `any` is left out)
 *   ac   asset classes or the alias `stocks` (pos-indexer docs/asset-classes.md)
 *        acm  class match (direct | exposure; `any` is left out)
 *   cur  one curator id
 *
 * A link that carries ANY of these carries all of them: what it leaves out is
 * cleared, not kept from the reader's last visit — otherwise a sent view would
 * arrive mixed with whatever the reader had picked. A bare `#/feed` (the tab,
 * a crumb) carries none and leaves the reader's own filters alone.
 *
 * Defaults are dropped and lists sorted, so one view is one URL.
 */
export interface FeedFilters {
  /** empty = every chain, as in `AppState` */
  chains: string[]
  protocols: string[]
  issuers: string[]
  match: IssuerMatch
  /** classes / the `stocks` alias, as `assetClasses=` takes them; absent = none (a caller building a link may leave it out) */
  assetClasses?: string[]
  assetClassMatch?: AssetClassMatch
  curator: string | undefined
}

const KEYS = ['c', 'p', 'i', 'im', 'ac', 'acm', 'cur']
const MATCHES: IssuerMatch[] = ['any', 'direct', 'exposure']

const slugOf = (id: string) => CHAINS.find((c) => c.id === id)?.label.toLowerCase().replace(/\s+/g, '-') ?? id
const chainOf = (s: string) => CHAINS.find((c) => c.id === s || slugOf(c.id) === s.toLowerCase())?.id
const list = (v: string | null) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : [])

/** The filters a feed hash carries, or null when it is not the feed or carries none. */
export function readFeedLink(hash = location.hash): FeedFilters | null {
  const h = hash.replace(/^#\/?/, '')
  const at = h.indexOf('?')
  const path = at < 0 ? h : h.slice(0, at)
  const head = path.replace(/\/$/, '')
  if ((head !== '' && head !== 'feed') || at < 0) return null
  const p = new URLSearchParams(h.slice(at + 1))
  if (!KEYS.some((k) => p.has(k))) return null
  const chains = [...new Set(list(p.get('c')).map(chainOf).filter((c): c is string => !!c))]
  const im = p.get('im') as IssuerMatch | null
  const acm = p.get('acm') as AssetClassMatch | null
  // a word neither index accepts would be a 400: dropped here, never sent
  const ac = list(p.get('ac')).map((x) => x.toLowerCase()).filter((x) => Array.isArray(parseAssetClassParam(x)))
  return {
    // every chain named is every chain — the same normalisation `setChains` does
    chains: chains.length === CHAINS.length ? [] : chains,
    protocols: [...new Set(list(p.get('p')))],
    issuers: [...new Set(list(p.get('i')))],
    match: im && MATCHES.includes(im) ? im : 'any',
    assetClasses: [...new Set(ac)],
    assetClassMatch: acm && ASSET_CLASS_MATCHES.includes(acm) ? acm : 'any',
    curator: p.get('cur') || undefined,
  }
}

/** The canonical feed hash for a tab and its filters. */
export function feedHash(tab: string, f: FeedFilters): string {
  const q = new URLSearchParams()
  if (tab !== 'menu') q.set('t', tab)
  const c = chainsParam(f.chains)
  if (c) q.set('c', c)
  if (f.protocols.length) q.set('p', [...f.protocols].sort().join(','))
  if (f.issuers.length) {
    q.set('i', [...f.issuers].sort().join(','))
    if (f.match !== 'any') q.set('im', f.match)
  }
  if (f.assetClasses?.length) {
    q.set('ac', [...f.assetClasses].sort().join(','))
    if (f.assetClassMatch && f.assetClassMatch !== 'any') q.set('acm', f.assetClassMatch)
  }
  if (f.curator) q.set('cur', f.curator)
  // commas are safe in a hash and a link that reads `avalanche,ethereum` is one a person can edit
  const s = q.toString().replace(/%2C/g, ',')
  return '#/feed' + (s ? '?' + s : '')
}

/**
 * The chains as a link's `c=`: lowercase labels, sorted, commas — undefined for every chain. Every
 * page that takes chains from its address spells them this way (the feed above, the board below).
 */
export const chainsParam = (chains: string[]) =>
  chains.length && chains.length < CHAINS.length ? chains.map(slugOf).sort().join(',') : undefined

/**
 * The board's chains as a link (`#/board?c=ethereum,base&by=wallet`): `c=` sets them, `c=all` sets
 * every chain, and a board link without `c` leaves the reader's own — the board's other params
 * (`by`, `t`, `x`, `s`) say nothing about chains. Null when it is not the board or carries no `c`.
 */
export function readBoardChains(hash = location.hash): string[] | null {
  const h = hash.replace(/^#\/?/, '')
  const at = h.indexOf('?')
  if (at < 0 || h.slice(0, at).replace(/\/$/, '') !== 'board') return null
  const c = new URLSearchParams(h.slice(at + 1)).get('c')
  if (c == null) return null
  if (c.trim().toLowerCase() === 'all') return []
  const chains = [...new Set(list(c).map(chainOf).filter((x): x is string => !!x))]
  // a `c=` that names no chain this build knows is no selection at all, not "every chain"
  if (!chains.length) return null
  return chains.length === CHAINS.length ? [] : chains
}

/** The chains any link carries — a feed link's, or a board link's — or null when it sets none. */
export const readLinkChains = (hash = location.hash): string[] | null => readFeedLink(hash)?.chains ?? readBoardChains(hash)

/** Same filters, whatever order they were picked in. */
export const sameFilters = (a: FeedFilters, b: FeedFilters) => feedHash('', a) === feedHash('', b)
