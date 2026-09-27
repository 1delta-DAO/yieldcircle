import React from 'react'

/**
 * `useState` that outlives the component: the value is kept in sessionStorage
 * under `key`, so an amount typed into a ticket or a filter picked on a page
 * is still there after a click away and Back. Per tab, gone when the tab is
 * closed — it is a scratchpad, never a preference.
 */
const PREFIX = 'yieldcircle.sticky.'
/** `seed`, when given, wins over what was kept — a link that says what to show. */
export function useSticky<T>(key: string, init: T | (() => T), seed?: { value: T }): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [v, setV] = React.useState<T>(() => {
    if (seed) return seed.value
    try {
      const raw = sessionStorage.getItem(PREFIX + key)
      if (raw != null) return JSON.parse(raw) as T
    } catch { /* private mode, or a value this build can't read */ }
    return typeof init === 'function' ? (init as () => T)() : init
  })
  React.useEffect(() => {
    try { sessionStorage.setItem(PREFIX + key, JSON.stringify(v)) } catch { /* quota, private mode */ }
  }, [key, v])
  return [v, setV]
}

/**
 * Where Back goes. Every history entry the app makes is stamped with its depth,
 * so the app knows whether the previous entry is one of its own pages — and
 * only then steps back; a tab that landed here from a link goes home instead
 * of leaving the site.
 */
const depth = () => (history.state as { yc?: number } | null)?.yc
/** a page load with no stamp is where this visit came in: depth 0; a new entry pushed by a hash change is one deeper than the last */
let last = -1
function stamp(fresh: boolean) {
  if (depth() == null) history.replaceState({ ...(history.state ?? {}), yc: fresh ? 0 : last + 1 }, '')
  last = depth()!
  return last
}
export function useBack(): { canGoBack: boolean; back: () => void } {
  const [d, setD] = React.useState(() => (last < 0 ? stamp(true) : last))
  React.useEffect(() => {
    const h = () => setD(stamp(false))
    addEventListener('hashchange', h)
    return () => removeEventListener('hashchange', h)
  }, [])
  return { canGoBack: d > 0, back: () => (d > 0 ? history.back() : (location.hash = '#/')) }
}
