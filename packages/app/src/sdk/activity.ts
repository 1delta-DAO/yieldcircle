import React from 'react'
import { normAddr } from '@yieldcircle/core/model/address'
import type { Holding } from '@yieldcircle/core/model/positions'
import { holdingFor } from './txOutcome'
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

/** How long after it settles an action still lights its row up, and what is said to have just arrived. */
const ARRIVAL_MS = 3 * 60_000
const GLOW_MS = 3_000
/** traces whose row has glowed: once each, per run */
const glowed = new Set<string>()
const settledOk = (t: Trace) => t.phase === 'settled' && !t.note

/**
 * The strategies an action just landed in (ticket 0016 §3): each row glows once, for a few
 * seconds, the first time a list shows it after the action settled. `on`: the list is the one in
 * front — not while the ticket still covers it, so the glow is seen when it closes.
 */
export function useArrivals(on = true): Set<string> {
  const { all } = useActivity()
  const [, bump] = React.useReducer((x: number) => x + 1, 0)
  const fresh = on ? all.filter((t) => settledOk(t) && !!t.receipt?.strategyId && !glowed.has(t.id) && Date.now() - (t.doneAt ?? 0) < ARRIVAL_MS) : []
  const ids = fresh.map((t) => t.id).join()
  React.useEffect(() => {
    if (!ids) return
    const timer = setTimeout(() => { ids.split(',').forEach((i) => glowed.add(i)); bump() }, GLOW_MS)
    return () => clearTimeout(timer)
  }, [ids])
  return React.useMemo(() => new Set(fresh.map((t) => t.receipt!.strategyId!)), [ids])
}

/**
 * The positions this device opened in the last day (a deposit, a loop, a loan that did not exist
 * before the action): You shows them first, marked new (ticket 0016 §4). The trace store keeps a
 * day, so that is how long "new" lasts.
 */
export function useNewHoldings(holdings: Holding[]): Set<string> {
  const { all } = useActivity()
  return React.useMemo(() => new Set(all
    .filter((t) => settledOk(t) && t.receipt && !t.receipt.holdingKey && ['deposit', 'open', 'borrow'].includes(t.receipt.kind))
    .map((t) => holdingFor(holdings, t)?.key)
    .filter((k): k is string => !!k)), [all, holdings])
}

/**
 * What the balance chip says for a moment after an action lands (ticket 0016 §4): money put to work
 * moves from idle to at work, so the total does not jump — the chip says where it went instead.
 */
export function chipNews(t: Trace): string | null {
  const r = t.receipt, v = r?.usd
  if (!r || !v || !(v >= 0.01)) return null
  const m = v >= 1000 ? `$${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k` : `$${v.toFixed(v >= 100 ? 0 : 2)}`
  switch (r.kind) {
    case 'deposit': case 'open': case 'collateral': return `+${m} at work`
    case 'withdraw': case 'close': return `${m} back in your wallet`
    case 'borrow': return `+${m} borrowed`
    case 'repay': return `${m} paid back`
    case 'bridge': case 'swap': return `${m} ${r.kind === 'bridge' ? 'arrived' : 'swapped'}`
    default: return null
  }
}
/**
 * The chip's line for the action that settled in the last `ms`. Read from the time alone, so every
 * chip on screen (the phone keeps one per page in its stack) says it while it is fresh.
 */
export function useChipNews(ms = 8_000): string | null {
  const { all } = useActivity()
  const [, bump] = React.useReducer((x: number) => x + 1, 0)
  const t = all.find((x) => settledOk(x) && Date.now() - (x.doneAt ?? 0) < ms && !!chipNews(x))
  React.useEffect(() => {
    if (!t) return
    const timer = setTimeout(bump, Math.max(0, ms - (Date.now() - (t.doneAt ?? 0))) + 50)
    return () => clearTimeout(timer)
  }, [t?.id])
  return t ? chipNews(t) : null
}

/**
 * A number that moves to its new value instead of jumping (the chip's total), over `ms`. At once the
 * first time and from nothing — a total arriving after its read is not a change to show.
 */
export function useTween(to: number, ms = 800): number {
  const [v, setV] = React.useState(to)
  const from = React.useRef(to)
  React.useEffect(() => {
    const a = from.current
    from.current = to
    if (!Number.isFinite(a) || !a || !to || Math.abs(to - a) < 0.5) { setV(to); return }
    // a timer, not a frame callback: this file runs on both apps (`platform.test.ts`)
    const t0 = Date.now()
    const timer = setInterval(() => { const k = Math.min(1, (Date.now() - t0) / ms); setV(a + (to - a) * (1 - Math.pow(1 - k, 3))); if (k >= 1) clearInterval(timer) }, 16)
    return () => clearInterval(timer)
  }, [to])
  return v
}
