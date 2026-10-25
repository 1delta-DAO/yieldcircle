import React from 'react'

/**
 * Lite or Pro — the web's `#/lite` and `#/pro` (docs/lite-plan.md), kept like the web's setting.
 * Lite is the default for anyone who has not chosen.
 */
export type Mode = 'lite' | 'pro'
const KEY = 'yc.mode'
const listeners = new Set<() => void>()

export const readMode = (): Mode => {
  try { return localStorage.getItem(KEY) === 'pro' ? 'pro' : 'lite' } catch { return 'lite' }
}
export function setMode(m: Mode) {
  try { localStorage.setItem(KEY, m) } catch { /* the choice lives for this run */ }
  listeners.forEach((f) => f())
}
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }

export const useMode = () => React.useSyncExternalStore(subscribe, readMode)
