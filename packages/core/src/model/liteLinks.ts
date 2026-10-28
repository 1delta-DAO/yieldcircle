import { normAddr } from './address'
import type { GroupId } from './assets'

/**
 * Every Lite address, written once (docs/mobile.md, "Deep links"): what a Lite link points at, the
 * web's hash for it, and the reverse — so the web's links, a shared Copy link and the phone's deep
 * links all read the same map. The apps go there through `@yieldcircle/app/nav`.
 */
export const APP_ORIGIN = 'https://app.yieldcircle.io'
/** The categories Lite lists (its Earn tiles); a Pro-only one (Stocks) has no Lite page. */
export const LITE_GROUPS: GroupId[] = ['USD', 'ETH', 'BTC', 'MORE']

export type LiteDest =
  | { to: 'home' }
  /** a category's list, or every category */
  | { to: 'earn'; group?: string }
  /** a strategy's ticket: `copy` the wallet copied, `lev` its leverage, `h` a held position's key, `m` the action asked for */
  | { to: 'strategy'; s: { id: string; kind: string; group: string }; copy?: string; lev?: string; h?: string; m?: string }
  /** You, or one of its positions opened (`h`) on an action (`m`) */
  | { to: 'you'; h?: string; m?: string }
  | { to: 'board'; by?: 'wallet' | 'strategy'; t?: string; x?: string }
  | { to: 'search'; q?: string }
  | { to: 'wallet'; account: string }

const qs = (p: Record<string, string | undefined>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) if (v != null && v !== '') q.set(k, v)
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** The web's hash for a Lite place: `#/lite/USD?s=…&k=loop&copy=0x…`. A deposit's `k=simple` is the default and left out. */
export function liteHash(d: LiteDest): string {
  switch (d.to) {
    case 'home': return '#/lite/'
    case 'earn': return `#/lite/${d.group ?? 'earn'}`
    case 'strategy': return `#/lite/${d.s.group}${qs({ s: d.s.id, k: d.s.kind === 'simple' ? undefined : d.s.kind, copy: d.copy, lev: d.lev, h: d.h, m: d.m })}`
    case 'you': return `#/lite/you${qs({ h: d.h, m: d.m })}`
    case 'board': return `#/lite/board${qs({ by: d.by, t: d.t, x: d.x })}`
    case 'search': return `#/lite/search${qs({ q: d.q })}`
    case 'wallet': return `#/lite/w/${normAddr(d.account)}`
  }
}
/** The whole address, for a link that leaves the app (a share, the phone opening the web). */
export const liteUrl = (d: LiteDest, origin = APP_ORIGIN) => `${origin}/${liteHash(d)}`
/** The same place in Pro, on the web: Lite's links to "every venue and setting". `rest` is a hash without its mode (`#/USD?s=…`). */
export const proUrl = (rest = '', origin = APP_ORIGIN) => `${origin}/#/pro/${rest.replace(/^#?\/?/, '').replace(/^(lite|pro)(\/|$)/, '')}`

/**
 * Back from an address to the place: the web's hash (`#/lite/…`, or one with no mode — Lite has the
 * same page) or a whole link to it. Null for a page Lite does not have (an asset, a market, Pro).
 */
export function parseLiteHash(link: string): LiteDest | null {
  const at = link.indexOf('#')
  const hash = at >= 0 ? link.slice(at + 1) : link.replace(/^[a-z]+:\/\/[^/]*/i, '')
  const [path, query = ''] = hash.replace(/^\/+/, '').split('?')
  const seg = path.split('/').filter(Boolean)
  if (seg[0] === 'pro') return null
  if (seg[0] === 'lite') seg.shift()
  const q = new URLSearchParams(query)
  const g = (k: string) => q.get(k) ?? undefined
  const head = seg[0]
  if (!head) return { to: 'home' }
  if (head === 'earn') return { to: 'earn' }
  if (head === 'you') return { to: 'you', h: g('h'), m: g('m') }
  if (head === 'board') { const by = g('by'); return { to: 'board', by: by === 'strategy' || by === 'wallet' ? by : undefined, t: g('t'), x: g('x') } }
  if (head === 'search') return { to: 'search', q: g('q') }
  if (head === 'w') return seg[1] ? { to: 'wallet', account: normAddr(seg[1]) } : null
  // a category Lite lists: its list, or one strategy on it
  if ((LITE_GROUPS as string[]).includes(head) && seg.length === 1) {
    const id = g('s')
    return id ? { to: 'strategy', s: { id, kind: g('k') ?? 'simple', group: head }, copy: g('copy'), lev: g('lev'), h: g('h'), m: g('m') } : { to: 'earn', group: head }
  }
  return null
}
