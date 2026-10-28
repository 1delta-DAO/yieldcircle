import React from 'react'
import type { LiteDest } from '@yieldcircle/core/model/liteLinks'

/**
 * Going somewhere, for code both apps share (docs/lite-design-review.md §5): a Lite place by what it
 * is (`LiteDest`, core's route map), never by a hash or an expo-router path. The web fills it from
 * its hash routes (`packages/web/src/state/nav.ts`), the phone from expo-router (`mobile/src/nav.ts`).
 */
export interface Nav {
  /** open the place */
  go: (d: LiteDest) => void
  /** its address where the app has links (the web's `href`), else undefined: then a tap calls `go` */
  href: (d: LiteDest) => string | undefined
  /** the same thing in Pro (`rest`: a hash with no mode, `#/USD?s=…`): on the web a visit, on the phone the web app */
  pro: (rest?: string) => void
}

const Ctx = React.createContext<Nav | null>(null)
export function NavProvider({ value, children }: { value: Nav; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export const useNav = () => {
  const c = React.useContext(Ctx)
  if (!c) throw new Error('NavProvider missing')
  return c
}
