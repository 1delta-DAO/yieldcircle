import React from 'react'
import { Linking } from 'react-native'
import { router, type Href } from 'expo-router'
import { NavProvider, type Nav } from '@yieldcircle/app/nav'
import { parseLiteHash, proUrl, type LiteDest } from '@yieldcircle/core/model/liteLinks'

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
    case 'home': return '/lite'
    case 'earn': return `/lite/earn${qs({ g: d.group })}`
    case 'strategy': return `/strategy/${encodeURIComponent(d.s.id)}${qs({ copy: d.copy, lev: d.lev, h: d.h, m: d.m })}`
    case 'you': return d.h ? `/strategy/_${qs({ h: d.h, m: d.m })}` : '/you'
    case 'board': return `/lite/board${qs({ by: d.by, t: d.t, x: d.x })}`
    case 'search': return `/search${qs({ q: d.q })}`
    case 'wallet': return `/w/${d.account}`
  }
}

/** An incoming link — a shared Copy link or the app's own scheme — as the path to open, or null when Lite has no such page. */
export const pathOfLink = (link: string): string | null => { const d = parseLiteHash(link); return d ? pathOf(d) : null }

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
