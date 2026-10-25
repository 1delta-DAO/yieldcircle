/**
 * Lite or Pro (docs/lite.md): which of the two products a visitor is in.
 *
 * One build, two shells. The route carries the mode as a prefix (`#/lite/…`, `#/pro/…`); this is
 * the saved choice, read by `parseRoute` for a link that names none (`#/`, `#/USD?s=…`). It lives
 * apart from `Settings` because the route is parsed outside React, on every hash change, and must
 * read it synchronously. A visitor who has never chosen starts on Lite.
 *
 * Only the switch in the profile sheet (and Lite's You page) saves a choice: opening a Pro page
 * from a Lite ticket's Details, or following a `#/pro/…` link, is a visit, not a decision.
 */
export type AppMode = 'lite' | 'pro'
export const DEFAULT_MODE: AppMode = 'lite'
const LS = 'yieldcircle.mode'

export function readMode(): AppMode {
  try {
    const v = localStorage.getItem(LS)
    return v === 'pro' || v === 'lite' ? v : DEFAULT_MODE
  } catch { return DEFAULT_MODE }
}
export function writeMode(m: AppMode) {
  try { localStorage.setItem(LS, m) } catch { /* private mode: the prefix still carries it for this visit */ }
}
