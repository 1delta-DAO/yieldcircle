import React from 'react'
import { PlatformProvider, type Platform } from '@yieldcircle/app/platform'
import { NavProvider, type Nav } from '@yieldcircle/app/nav'
import { liteHash } from '@yieldcircle/core/model/liteLinks'
import { proHref } from './AppState'
import { isRemote, openWallet } from '../wallet/deeplink'
import { useSwitchTo } from '../wallet/useSwitchTo'
import { solSignAndSend, useSolWallet } from '../wallet/solana'
import { realTradingGated } from '../wallet/gate'

/** The web's side of the shared ticket machinery (`@yieldcircle/app/platform`): sessionStorage, its deep links, the Wallet Standard. */
const WEB: Platform = {
  scratch: {
    get: (k) => sessionStorage.getItem(k),
    set: (k, v) => sessionStorage.setItem(k, v),
    remove: (k) => sessionStorage.removeItem(k),
  },
  openWallet: (id) => { openWallet(id) },
  isRemote: (id) => isRemote(id),
  useSwitchTo,
  useSol: useSolWallet,
  solSignAndSend,
  gated: realTradingGated,
}

/** The web's side of `@yieldcircle/app/nav`: core's route map as hashes. Pro is a visit (`proHref`): the saved mode stays. */
const WEB_NAV: Nav = {
  go: (d) => { location.hash = liteHash(d) },
  href: liteHash,
  pro: (rest = '') => { location.hash = proHref(rest || '#/') },
}

export function WebPlatform({ children }: { children: React.ReactNode }) {
  return <PlatformProvider value={WEB}><NavProvider value={WEB_NAV}>{children}</NavProvider></PlatformProvider>
}
