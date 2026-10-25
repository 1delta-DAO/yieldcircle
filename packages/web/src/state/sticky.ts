import React from 'react'

// the ticket scratchpad is shared (`@yieldcircle/app/sticky`, over the platform's sessionStorage); Back is the web's own
export { useSticky, useStickyAmount } from '@yieldcircle/app/sticky'

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
