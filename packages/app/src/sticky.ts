import React from 'react'
import { asAmount, type Amount } from '@yieldcircle/core/model/amount'
import { usePlatform } from './platform'

/**
 * `useState` that outlives the component: the value is kept in the platform's scratchpad (the
 * web's sessionStorage) under `key`, so an amount typed into a ticket or a filter picked on a page
 * is still there after a click away and Back — or a trip to the wallet app. A scratchpad, never a
 * preference.
 */
const PREFIX = 'yieldcircle.sticky.'
/** `seed`, when given, wins over what was kept — a link that says what to show. */
export function useSticky<T>(key: string, init: T | (() => T), seed?: { value: T }): [T, React.Dispatch<React.SetStateAction<T>>] {
  const { scratch } = usePlatform()
  const [v, setV] = React.useState<T>(() => {
    if (seed) return seed.value
    try {
      const raw = scratch.get(PREFIX + key)
      if (raw != null) return JSON.parse(raw) as T
    } catch { /* private mode, or a value this build can't read */ }
    return typeof init === 'function' ? (init as () => T)() : init
  })
  React.useEffect(() => {
    try { scratch.set(PREFIX + key, JSON.stringify(v)) } catch { /* quota, private mode */ }
  }, [key, v]) // eslint-disable-line react-hooks/exhaustive-deps
  return [v, setV]
}

/** a ticket's amount box, kept as its TEXT (tickets/0014): a reload cannot bring back a rounded float. A number kept by an older build reads as typed text. */
export function useStickyAmount(key: string, init: () => Amount): [Amount, (a: Amount) => void] {
  const [v, setV] = useSticky<Amount>(key, init)
  return [asAmount(v), setV]
}
