/**
 * One per-uid cache of the 30-day rate history (`/v1/data/earn/rate-history`),
 * shared by every surface that shows a rate: the asset list, the ticket, the
 * Earn digest, Hot, the market header and search.
 *
 * Per UID, not per request: those surfaces ask for overlapping sets that change
 * as the catalogue lands, and a cache keyed by the whole set refetched the same
 * rows for every new combination (five requests for one page view). Here a
 * surface names the uids it needs, only the ones not already held (or older
 * than `TTL_MS`) are queued, and the queue goes out as ONE request a tick later
 * — so a page that mounts the list, the ticket and a header in one render still
 * costs one call. The origin answers a uid it has no history for in `missing`;
 * that is remembered too (as `null`), so it is not asked for again until TTL.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { fetchRateHistory } from './api'
import type { RateHistoryItem } from '../model/rateHistory'

const TTL_MS = 30 * 60_000
/** after a failed request, wait this long before asking for the same uids again */
const FAIL_BACKOFF_MS = 5 * 60_000
const MAX_PER_REQUEST = 1000

interface Entry { item: RateHistoryItem | null; at: number }
const entries = new Map<string, Entry>()
const failedAt = new Map<string, number>()
const inflight = new Set<string>()
let queue = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null
let version = 0
const listeners = new Set<() => void>()

const notify = () => { version++; listeners.forEach((l) => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const getVersion = () => version

function wants(uid: string, now: number): boolean {
  if (inflight.has(uid) || queue.has(uid)) return false
  const f = failedAt.get(uid)
  if (f && now - f < FAIL_BACKOFF_MS) return false
  const e = entries.get(uid)
  return !e || now - e.at > TTL_MS
}

async function flush() {
  timer = null
  const uids = [...queue].sort()
  queue = new Set()
  for (let i = 0; i < uids.length; i += MAX_PER_REQUEST) {
    const chunk = uids.slice(i, i + MAX_PER_REQUEST)
    chunk.forEach((u) => inflight.add(u))
    try {
      const r = await fetchRateHistory(chunk)
      const now = Date.now()
      for (const u of chunk) entries.set(u, { item: r.items?.[u] ?? null, at: now })
      chunk.forEach((u) => failedAt.delete(u))
    } catch {
      const now = Date.now()
      chunk.forEach((u) => failedAt.set(u, now))
    } finally {
      chunk.forEach((u) => inflight.delete(u))
      notify()
    }
  }
}

/** Queue the uids not already held; one request goes out on the next tick. */
export function requestRateHistory(uids: Iterable<string>) {
  const now = Date.now()
  let added = false
  for (const u of uids) if (u && wants(u, now)) { queue.add(u); added = true }
  if (added && !timer) timer = setTimeout(() => void flush(), 30)
}

export type HistoryLookup = (uid: string) => RateHistoryItem | undefined
const lookup: HistoryLookup = (uid) => entries.get(uid)?.item ?? undefined

/**
 * The history of `uids`, fetched as needed. Returns a lookup that changes
 * identity whenever an answer lands, so memos keyed on it recompute. `enabled`
 * holds the request back while a list is still growing.
 */
export function useHistoryFor(uids: string[], enabled = true): HistoryLookup {
  const v = useSyncExternalStore(subscribe, getVersion, getVersion)
  const key = enabled ? uids.join(',') : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (key) requestRateHistory(key.split(',')) }, [key])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (uid: string) => lookup(uid), [v])
}
