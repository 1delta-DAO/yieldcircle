import React from 'react'
import { DEFAULTS, FILTER_KEYS, sanitizeSettings, type Settings } from '@yieldcircle/core/model/settings'

// the data half (the type, the defaults, the floors) is core's; this file is the provider and its storage
export * from '@yieldcircle/core/model/settings'

const LS = 'yieldcircle.settings'
function read(): Settings {
  try {
    const raw = localStorage.getItem(LS)
    if (!raw) return DEFAULTS
    return sanitizeSettings(JSON.parse(raw) as Partial<Settings>)
  } catch { return DEFAULTS }
}

interface SettingsCtx {
  st: Settings
  set: (patch: Partial<Settings>) => void
  reset: () => void
  /** true when nothing has been widened — what the copy calls "curated" */
  isDefault: boolean
  /** how far from the defaults, for the badge on the button */
  widened: number
}
const Ctx = React.createContext<SettingsCtx | null>(null)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [st, setSt] = React.useState<Settings>(read)
  const set = React.useCallback((patch: Partial<Settings>) => {
    setSt((cur) => {
      const next = { ...cur, ...patch }
      try { localStorage.setItem(LS, JSON.stringify(next)) } catch { /* private mode */ }
      return next
    })
  }, [])
  // Reset puts the FILTERS back; the slippage is a trading preference and survives it
  const reset = React.useCallback(() => {
    setSt((cur) => {
      const next = { ...DEFAULTS, slippageBp: cur.slippageBp }
      try { localStorage.setItem(LS, JSON.stringify(next)) } catch { /* private mode */ }
      return next
    })
  }, [])
  const widened = FILTER_KEYS.filter((k) => st[k] !== DEFAULTS[k]).length
  return <Ctx.Provider value={{ st, set, reset, isDefault: widened === 0, widened }}>{children}</Ctx.Provider>
}
export const useSettings = () => { const c = React.useContext(Ctx); if (!c) throw new Error('SettingsProvider missing'); return c }
