import React from 'react'
import { PlatformProvider, type Platform } from '@yieldcircle/app/platform'
import { isRemote, openWallet } from '../wallet/deeplink'
import { useSwitchTo } from '../wallet/useSwitchTo'
import { solSignAndSend, useSolWallet } from '../wallet/solana'

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
}

export function WebPlatform({ children }: { children: React.ReactNode }) {
  return <PlatformProvider value={WEB}>{children}</PlatformProvider>
}
