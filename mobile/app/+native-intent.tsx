import { pathOfLink } from '../src/nav'

/**
 * Every link the system hands the app — `yieldcircle://lite/USD?s=…`, or the web's own
 * `https://app.yieldcircle.io/#/lite/…` once the domain is associated (docs/mobile.md) — read
 * through core's route map. Anything that names no Lite page passes through as it came: the
 * wallet's return (`yieldcircle://`, AppKit's redirect) must never move the screen under a ticket.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const bare = path.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/#?]*/i, '').replace(/^[/#]+/, '')
    if (!bare) return path
    return pathOfLink(path) ?? path
  } catch {
    return path
  }
}
