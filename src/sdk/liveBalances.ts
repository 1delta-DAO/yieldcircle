import type { QueryClient } from '@tanstack/react-query'
import { useEffect, useSyncExternalStore } from 'react'

/**
 * Which chains read their balances LIVE instead of from the index (pos-indexer tickets/0044).
 *
 * The index answers the first paint and every quiet reload; it trails the chain by a few seconds
 * (a flush) and, for the gas coin, by up to a minute. Where that matters the chain is read live:
 *
 *   - while a ticket is open on it (`useLiveBalances`): the idle amount next to an amount you are
 *     about to sign is the chain's, not the snapshot's;
 *   - for LIVE_AFTER_TX_MS after one of our transactions on it lands (`balancesChanged`, once `txTrace.ts` calls it final): the
 *     index catches up in seconds, but a read that lands a block early would show the old balance.
 *
 * Everything else — the book, the header chip, other chains — stays on the index.
 */
const LIVE_AFTER_TX_MS = 3 * 60_000
const holds = new Map<string, number>()
const until = new Map<string, number>()
const subs = new Set<() => void>()
let snapshot = ''
const recompute = () => {
  const now = Date.now()
  const live = new Set<string>()
  for (const [c, n] of holds) if (n > 0) live.add(c)
  for (const [c, t] of until) if (t > now) live.add(c); else until.delete(c)
  const next = [...live].sort().join(',')
  if (next !== snapshot) { snapshot = next; for (const f of subs) f() }
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }

/** The chains read live right now, as a stable comma-joined key. */
export function useLiveChains(): Set<string> {
  const key = useSyncExternalStore(subscribe, () => snapshot)
  return new Set(key ? key.split(',') : [])
}

/** Hold `chainId` live while the calling component is mounted (an open ticket). */
export function useLiveBalances(chainId: string | undefined) {
  useEffect(() => {
    if (!chainId) return
    holds.set(chainId, (holds.get(chainId) ?? 0) + 1); recompute()
    return () => { holds.set(chainId, (holds.get(chainId) ?? 1) - 1); recompute() }
  }, [chainId])
}

/**
 * One of our transactions is FINAL on these chains (`txTrace.ts` calls this, never a component):
 * read them live for a while, and drop every cached balance so the next read is fresh (the
 * index's too — it is a few seconds behind).
 */
export function balancesChanged(qc: QueryClient, ...chainIds: (string | undefined)[]) {
  const t = Date.now() + LIVE_AFTER_TX_MS
  for (const c of chainIds) if (c) until.set(c, t)
  recompute()
  setTimeout(recompute, LIVE_AFTER_TX_MS + 50)
  // only these chains' reads (`['balances', account, chainId, assets]`): a bridge's SOURCE landing
  // used to re-read the destination too, before anything had arrived, and that answer stuck
  const hit = new Set(chainIds.filter(Boolean))
  void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'balances' && hit.has(String(q.queryKey[2])) })
  void qc.invalidateQueries({ queryKey: ['balances-index'] })
}
