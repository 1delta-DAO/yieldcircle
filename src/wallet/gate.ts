import { useQuery } from '@tanstack/react-query'
import { isAddr } from '../model/address'

/**
 * The beta gate as the app sees it (`functions/_middleware.ts`). A visitor who
 * came in on the access code (`/?access=…`) is in without ever having joined
 * the waitlist; the middleware marks their HTML with `window.ycPass` so the
 * app can ask them to. The cookie itself is HttpOnly — this flag is the only
 * way the bundle learns it.
 */
declare global { interface Window { ycPass?: boolean } }

export const onAccessCode = () => window.ycPass === true

/** The overlay's waitlist flow, served to an access-code holder (a new tab, so the app stays put). */
export const WAITLIST_HREF = '/?waitlist'

/**
 * Whether a wallet already holds a place: whitelisted or waitlisted. Same
 * origin, the gate's own endpoint — membership is not a secret.
 */
async function gateCheck(address: string): Promise<{ listed: boolean; waitlisted?: boolean }> {
  const r = await fetch(`/gate/check?address=${address}`)
  if (!r.ok) throw new Error(`gate check ${r.status}`)
  return r.json()
}

export function useOnList(address: string | undefined) {
  const on = !!address && isAddr(address) && onAccessCode()
  return useQuery({
    queryKey: ['gate-check', address?.toLowerCase()],
    queryFn: () => gateCheck(address!),
    enabled: on,
    staleTime: 60_000,
    refetchOnWindowFocus: true, // they join in the other tab, then come back to this one
    select: (d) => d.listed || !!d.waitlisted,
  })
}
