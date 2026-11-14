import React from 'react'
import { normAddr } from '@yieldcircle/core/model/address'
import { useSession } from '../session'
import { isDone, isOk, useTraces, type Trace } from './txTrace'
import { useNow } from './txWords'

/** How long a success stays on the pill: a failure stays until it is opened or dismissed. */
export const LINGER_MS = 8_000

/**
 * Every transaction of every account the session acts as — the EVM wallet, the Solana one and the
 * paper account (on the phone it has no connector to show up as) — newest first, and which of them
 * a pill shows: everything in flight, then a success for a moment and a failure until it is
 * dismissed. The web's tray and the phone's pill read it, so they cannot drift.
 */
export function useActivity(signers: [string?, string?] = []) {
  const s = useSession()
  const paperAcct = s.paper?.active ? s.paper.session?.evm : undefined
  // `signers`: the app's own wallets, when the session's account may be someone else's (the web's `?as=`)
  const a = useTraces(s.account), b = useTraces(s.solSigner), c = useTraces(paperAcct), d = useTraces(signers[0]), e = useTraces(signers[1])
  const all = React.useMemo(() => {
    const seen = new Set<string>()
    return [...a, ...b, ...c, ...d, ...e].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true))).sort((x, y) => y.at - x.at)
  }, [a, b, c, d, e])
  const live = all.filter((t) => !isDone(t))
  const fresh = (t: Trace, now: number) => isDone(t) && !t.seen && (!isOk(t) || now - (t.doneAt ?? 0) < LINGER_MS)
  const now = useNow(live.length > 0 || all.some((t) => fresh(t, Date.now())))
  const shown = [...live, ...all.filter((t) => fresh(t, now))]
  return { all, live, shown, lead: shown[0], now, accounts: [s.account, s.solSigner, paperAcct, ...signers].filter((x): x is string => !!x).map(normAddr) }
}
