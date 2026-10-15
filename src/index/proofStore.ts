/**
 * One per-key cache of the index's strategy book (`POST /strategies/proof`):
 * who holds each strategy, by `bookKeyOf` key. Shared by Start, the board's
 * strategy rows and the borrow ticket.
 *
 * Per KEY, not per request, for the same reason as `sdk/rateHistoryStore.ts`:
 * the key list grows as the catalogue lands chain by chain, and a cache keyed
 * by the whole list re-asked every key on each step. It used to wait for the
 * list to hold still for 800 ms instead, which put that wait (and a second
 * full request whenever one more chain landed) between the catalogue and
 * Start's first card. Here only the keys not already held (or older than
 * `TTL_MS`) are queued, and the queue goes out as one request a tick later.
 * The index answers rows only for strategies someone holds; a key it was
 * asked about and left out is remembered as `null` ("nobody, yet").
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { strategyProofs, type StrategyProofRow } from './api'

const TTL_MS = 2 * 60_000
/** the index answers at most 5 000 keys per request */
const MAX_PER_REQUEST = 2000

interface Entry { row: StrategyProofRow | null; at: number }
const entries = new Map<string, Entry>()
const inflight = new Set<string>()
let queue = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null
let version = 0
const listeners = new Set<() => void>()

const notify = () => { version++; listeners.forEach((l) => l()) }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const getVersion = () => version

function wants(key: string, now: number): boolean {
  if (inflight.has(key) || queue.has(key)) return false
  const e = entries.get(key)
  return !e || now - e.at > TTL_MS
}

async function flush() {
  timer = null
  const keys = [...queue].sort()
  queue = new Set()
  await Promise.all(Array.from({ length: Math.ceil(keys.length / MAX_PER_REQUEST) }, async (_, i) => {
    const chunk = keys.slice(i * MAX_PER_REQUEST, (i + 1) * MAX_PER_REQUEST)
    chunk.forEach((k) => inflight.add(k))
    // never rejects: a failed index answers [] (`strategyProofs`), read as nobody holding them
    const rows = await strategyProofs(chunk)
    const now = Date.now()
    const by = new Map(rows.map((r) => [r.key, r]))
    for (const k of chunk) entries.set(k, { row: by.get(k) ?? null, at: now })
    chunk.forEach((k) => inflight.delete(k))
    notify()
  }))
}

/** Queue the keys not already held; one request goes out on the next tick. */
export function requestProofs(keys: Iterable<string>) {
  const now = Date.now()
  let added = false
  for (const k of keys) if (k && wants(k, now)) { queue.add(k); added = true }
  if (added && !timer) timer = setTimeout(() => void flush(), 30)
}

/** Has every one of `keys` been answered (a stale answer counts: it is on screen while it refreshes)? */
export const proofsHeld = (keys: Iterable<string>) => { for (const k of keys) if (!entries.has(k)) return false; return true }

/**
 * The proofs of `keys`, fetched as needed: `data` holds the ones someone holds
 * (a new map whenever an answer lands), `current` says every key has been
 * answered, so a list that ranks BY the proofs can wait for them rather than
 * reshuffle when they land, and `held(keys)` asks the same of any subset.
 */
export function useProofsFor(keys: string[]) {
  const v = useSyncExternalStore(subscribe, getVersion, getVersion)
  const joined = keys.join(' ')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (joined) requestProofs(joined.split(' ')) }, [joined])
  return useMemo(() => {
    const data = new Map<string, StrategyProofRow>()
    for (const k of keys) { const r = entries.get(k)?.row; if (r) data.set(k, r) }
    return { data, current: proofsHeld(keys), held: proofsHeld }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, joined])
}
