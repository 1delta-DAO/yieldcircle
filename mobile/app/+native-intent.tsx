import { pathOfLink } from '../src/nav'

/**
 * Every link the system hands the app — `yieldcircle://lite/USD?s=…`, or the web's own
 * `https://app.yieldcircle.io/#/lite/…` once the domain is associated (docs/mobile.md) — read
 * through core's route map. Anything that names no Lite page passes through as it came. A wallet's
 * return must never move the screen under a ticket: the bare `yieldcircle://` (AppKit's redirect)
 * and Phantom's / Solflare's answers (`yieldcircle://?nonce=…&data=…`, or on iOS
 * `https://app.yieldcircle.io/wallet-return?nonce=…` — `WALLET_RETURN` in `src/appkit.ts`; read by
 * their provider's own listener) open nothing while the app runs — expo-router navigates only when a
 * path comes back.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    const bare = path.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/#?]*/i, '').replace(/^[/#]+/, '')
    if (bare === 'wallet-return' || bare.startsWith('wallet-return?')) return initial ? '/' : ''
    if (!bare || bare.startsWith('?')) return initial ? path : ''
    return pathOfLink(path) ?? path
  } catch {
    return path
  }
}
