import { CHAINS } from '../sdk/queries'
import type { IssuerMatch } from '../index/api'

/**
 * The feed's filters as a link, so a view can be sent to someone:
 *
 *   #/?t=everyone&c=avalanche,ethereum&p=AAVE_V3,BENQI
 *
 * The feed is the home page, so its link is the home's. `#/feed?…` — where it
 * lived before — is still read, so the links already sent keep working.
 *
 *   c    chains, by lowercase label (`43114` is read too)
 *   p    protocol keys, as the index names them
 *   i    issuer desks          im  issuer match (direct | exposure; `any` is left out)
 *   cur  one curator id
 *
 * A link that carries ANY of these carries all of them: what it leaves out is
 * cleared, not kept from the reader's last visit — otherwise a sent view would
 * arrive mixed with whatever the reader had picked. A bare `#/` (the tab,
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
  curator: string | undefined
}

const KEYS = ['c', 'p', 'i', 'im', 'cur']
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
  return {
    // every chain named is every chain — the same normalisation `setChains` does
    chains: chains.length === CHAINS.length ? [] : chains,
    protocols: [...new Set(list(p.get('p')))],
    issuers: [...new Set(list(p.get('i')))],
    match: im && MATCHES.includes(im) ? im : 'any',
    curator: p.get('cur') || undefined,
  }
}

/** The canonical feed hash for a tab and its filters. */
export function feedHash(tab: string, f: FeedFilters): string {
  const q = new URLSearchParams()
  if (tab !== 'menu') q.set('t', tab)
  if (f.chains.length && f.chains.length < CHAINS.length) q.set('c', f.chains.map(slugOf).sort().join(','))
  if (f.protocols.length) q.set('p', [...f.protocols].sort().join(','))
  if (f.issuers.length) {
    q.set('i', [...f.issuers].sort().join(','))
    if (f.match !== 'any') q.set('im', f.match)
  }
  if (f.curator) q.set('cur', f.curator)
  // commas are safe in a hash and a link that reads `avalanche,ethereum` is one a person can edit
  const s = q.toString().replace(/%2C/g, ',')
  return '#/' + (s ? '?' + s : '')
}

/** Same filters, whatever order they were picked in. */
export const sameFilters = (a: FeedFilters, b: FeedFilters) => feedHash('', a) === feedHash('', b)
