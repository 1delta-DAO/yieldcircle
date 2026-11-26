import React from 'react'
import { useWhoIs } from '@yieldcircle/app/social/queries'
import type { Route } from '../state/AppState'

/**
 * An `@name` link (`#/@alice`, `#/lite/@alice`): asks the social service whose profile holds the
 * handle and swaps the address for that wallet's `#/w/<addr>`, in the same mode and with the same
 * query, without leaving the `@` address in the history for Back to bounce off.
 */
export function HandleLink({ route }: { route: Route }) {
  const handle = route.handle!
  const q = useWhoIs(handle)
  React.useEffect(() => {
    if (!q.data) return
    const query = location.hash.split('?')[1]
    location.replace(`#/${route.asked ? route.asked + '/' : ''}w/${q.data}${query ? '?' + query : ''}`)
  }, [q.data, route.asked])
  if (q.isPending || q.data) return <div className="empty">Looking up @{handle}…</div>
  if (q.isError) return <div className="empty">Could not look up @{handle} right now. <a className="pri" href="" onClick={(e) => { e.preventDefault(); q.refetch() }}>Try again</a>.</div>
  // Pro's search lives in its header; Lite has a page for it
  return (
    <div className="empty">
      No profile is called @{handle}.{route.lite && <> <a className="pri" href={`#/lite/search?q=${encodeURIComponent('@' + handle)}`}>Search for it</a>.</>}
    </div>
  )
}
