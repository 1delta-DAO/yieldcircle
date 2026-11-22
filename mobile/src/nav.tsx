import React from 'react'
import { Linking } from 'react-native'
import { router, type Href } from 'expo-router'
import { NavProvider, type Nav } from '@yieldcircle/app/nav'
import { parseLiteHash, proUrl, type LiteDest } from '@yieldcircle/core/model/liteLinks'
import { readMode } from './mode'

const qs = (p: Record<string, string | undefined>) => {
  const q = Object.entries(p).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join('&')
  return q ? `?${q}` : ''
}

/**
 * A Lite place as an expo-router path: the phone's half of core's route map (docs/mobile.md, "Deep
 * links"). A position opened from You is its strategy's sheet found by the position's key (`_`: no row).
 */
export function pathOf(d: LiteDest): string {
  switch (d.to) {
    // the phone has no Home: Earn is the first page, and a link home opens it
    case 'home': return '/lite'
    case 'earn': return `/lite${qs({ g: d.group })}`
    case 'strategy': return `/strategy/${encodeURIComponent(d.s.id)}${qs({ copy: d.copy, lev: d.lev, h: d.h, m: d.m, oa: d.oa })}`
    case 'you': return d.h ? `/strategy/_${qs({ h: d.h, m: d.m })}` : '/you'
    case 'board': return `/lite/board${qs({ by: d.by, t: d.t, x: d.x })}`
    case 'search': return `/search${qs({ q: d.q })}`
    case 'wallet': return `/w/${d.account}`
  }
}

/**
 * A link to Borrow, the one page the phone has that the web's Lite does not (so core's Lite map does
 * not carry it): `#/borrow` or `#/pro/borrow` with `s` an offer, `u` an asset, `h` a running loan,
 * `m` and `out` — and the asset page's `#/<group>?k=borrow&…`. An offer, an asset or a loan opens
 * the sheet (`app/borrow/[id].tsx`); none of them, the tab of the shell the reader is in.
 */
function borrowPathOfLink(link: string): string | null {
  const at = link.indexOf('#')
  const hash = at >= 0 ? link.slice(at + 1) : link.replace(/^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#]*\.[^/?#]*)?/i, '') // the scheme, and a domain: `yieldcircle://borrow` has none
  const [path, query = ''] = hash.replace(/^\/+/, '').split('?')
  const seg = path.split('/').filter(Boolean)
  if (seg[0] === 'lite' || seg[0] === 'pro') seg.shift()
  const q = new URLSearchParams(query)
  if (seg[0] !== 'borrow' && !(seg.length === 1 && q.get('k') === 'borrow')) return null
  const g = (k: string) => q.get(k) ?? undefined
  if (!g('s') && !g('u') && !g('h')) return `/${readMode()}/borrow`
  return `/borrow/${encodeURIComponent(g('s') ?? '_')}${qs({ u: g('u'), h: g('h'), m: g('m'), out: g('out') })}`
}

/** An incoming link — a shared Copy link or the app's own scheme — as the path to open, or null when the phone has no such page. */
export const pathOfLink = (link: string): string | null => { const d = borrowPathOfLink(link) ?? parseLiteHash(link); return typeof d === 'string' ? d : d ? pathOf(d) : null }

const PHONE_NAV: Nav = {
  go: (d) => router.push(pathOf(d) as Href),
  // the phone has no hrefs: every tap goes through `go`
  href: () => undefined,
  // Pro's every venue and setting is the web's for now (docs/mobile-plan.md phase 6)
  pro: (rest) => { void Linking.openURL(proUrl(rest)) },
}

export function PhoneNav({ children }: { children: React.ReactNode }) {
  return <NavProvider value={PHONE_NAV}>{children}</NavProvider>
}
