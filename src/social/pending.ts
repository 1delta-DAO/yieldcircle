/**
 * The pending queue (docs/social.md §17): follows and a profile edit made
 * without a wallet prompt, held here until the user signs them all at once
 * as one `Batch`. A dot on the face top-left says something is waiting; the
 * profile sheet lists it and signs it.
 *
 * The queue holds INTENTS, not signatures — nothing is signed until apply,
 * so the service's ten-minute `signedAt` window never bites. Each entry is
 * the state the user wants ("follow", "unfollow"), never a toggle, so a queue
 * built on a stale read still lands where the user meant.
 *
 * Kept in `localStorage` per signing wallet, so a reload or a wallet switch
 * loses nothing; storage can be absent (private mode), and then the queue
 * lives as long as the tab. Every tab shares it through the `storage` event.
 */
import { useQuery } from '@tanstack/react-query'
import React from 'react'
import { normAddr } from '../model/address'
import * as api from './api'
import { useSocialRefresh } from './queries'
import { useSocialWrite, type FollowOp, type ProfileOp } from './sign'

export type TargetKind = FollowOp['targetKind']
export interface PendingFollow extends FollowOp { at: number }
export interface Queue {
  follows: PendingFollow[]
  profile: (ProfileOp & { at: number }) | null
  /** what the service said about an entry on the last apply, by `entryKey` / 'profile' */
  errors: Record<string, string>
}

const EMPTY: Queue = { follows: [], profile: null, errors: {} }
const LS = (account: string) => `yc.pending.v1.${account}`
/** a wallet target is case-blind (hex); a market uid is case-significant and kept verbatim */
export const entryKey = (kind: TargetKind, target: string) => `${kind}|${kind === 'wallet' ? normAddr(target) : target}`

// one cached object per account, so `useSyncExternalStore` sees a stable value
const cache = new Map<string, Queue>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function read(account: string | undefined): Queue {
  if (!account) return EMPTY
  const hit = cache.get(account)
  if (hit) return hit
  let q = EMPTY
  try {
    const raw = localStorage.getItem(LS(account))
    if (raw) q = { ...EMPTY, ...(JSON.parse(raw) as Partial<Queue>) }
  } catch { /* private mode or a hand-edited value: start empty */ }
  cache.set(account, q)
  return q
}
function write(account: string, q: Queue) {
  cache.set(account, q)
  try {
    if (!q.follows.length && !q.profile) localStorage.removeItem(LS(account))
    else localStorage.setItem(LS(account), JSON.stringify(q))
  } catch { /* private mode: the tab keeps it */ }
  emit()
}
function subscribe(l: () => void) {
  listeners.add(l)
  // another tab staged or applied: drop the cache and re-read
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith('yc.pending.v1.')) { cache.delete(e.key.slice('yc.pending.v1.'.length)); l() }
  }
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(l); window.removeEventListener('storage', onStorage) }
}

/** The queue of `account`, read-only. Any account: a wallet nobody staged for answers empty. */
export function useQueue(account: string | undefined): Queue {
  const a = account ? normAddr(account) : undefined
  return React.useSyncExternalStore(subscribe, () => read(a))
}

/** An entry changed: its old refusal, and a whole-batch one, no longer apply. */
const without = (errors: Record<string, string>, k: string) => {
  const { [k]: _, batch: _b, ...rest } = errors
  return rest
}
const norm = (p: ProfileOp) => JSON.stringify([p.handle, p.displayName, p.bio, p.avatarUrl, p.tags, p.visibility])

/**
 * Is the service new enough to take a `Batch`? Until it is, every write is
 * signed on the spot as before — so the app and the service deploy in any order.
 */
export function useBatchSupported(): boolean {
  const q = useQuery({ queryKey: ['typed-data'], queryFn: api.typedData, staleTime: 30 * 60_000, retry: false })
  return !!q.data?.types?.Batch
}

/** The connected wallet's queue and everything that changes it. */
export function usePending() {
  const w = useSocialWrite()
  const account = w.account
  const q = useQueue(account)
  const refresh = useSocialRefresh()
  const [applying, setApplying] = React.useState(false)
  const count = q.follows.length + (q.profile ? 1 : 0)

  /**
   * Want `on` for this target, where the service says `serverOn`. Asking for
   * what the service already has drops the entry — follow then unfollow nets
   * to nothing, and nothing is left to sign.
   */
  const stageFollow = (kind: TargetKind, target: string, on: boolean, serverOn: boolean) => {
    if (!account) return
    const cur = read(account)
    const k = entryKey(kind, target)
    const follows = cur.follows.filter((f) => entryKey(f.targetKind, f.target) !== k)
    if (on !== serverOn) follows.push({ targetKind: kind, target, action: on ? 'follow' : 'unfollow', at: Date.now() })
    write(account, { ...cur, follows, errors: without(cur.errors, k) })
  }
  /** The whole profile as the user wants it; equal to what is saved means nothing to sign. */
  const stageProfile = (p: ProfileOp, saved: ProfileOp | null) => {
    if (!account) return
    const cur = read(account)
    write(account, { ...cur, profile: saved && norm(saved) === norm(p) ? null : { ...p, at: Date.now() }, errors: without(cur.errors, 'profile') })
  }
  const dropFollow = (kind: TargetKind, target: string) => {
    if (!account) return
    const cur = read(account)
    const k = entryKey(kind, target)
    write(account, { ...cur, follows: cur.follows.filter((f) => entryKey(f.targetKind, f.target) !== k), errors: without(cur.errors, k) })
  }
  const dropProfile = () => {
    if (!account) return
    const cur = read(account)
    write(account, { ...cur, profile: null, errors: without(cur.errors, 'profile') })
  }

  /**
   * Sign the queue as one `Batch` and post it. All or nothing on the service,
   * so on a refusal the queue is kept whole and the failing entries are
   * marked; on a rejected signature it is kept untouched. Entries staged
   * while the wallet was open were not in what was signed, and stay queued.
   */
  const apply = async (): Promise<boolean> => {
    if (!account || !count || applying) return false
    const sent = read(account)
    setApplying(true)
    try {
      const follows: FollowOp[] = sent.follows.map(({ targetKind, target, action }) => ({ targetKind, target, action }))
      const profile: ProfileOp | null = sent.profile
        ? { handle: sent.profile.handle, displayName: sent.profile.displayName, bio: sent.profile.bio, avatarUrl: sent.profile.avatarUrl, tags: sent.profile.tags, visibility: sent.profile.visibility }
        : null
      await w.batch(follows, profile)
      const now = read(account)
      write(account, {
        follows: now.follows.filter((f) => !sent.follows.some((s) => s.at === f.at && entryKey(s.targetKind, s.target) === entryKey(f.targetKind, f.target))),
        profile: now.profile && now.profile.at !== sent.profile?.at ? now.profile : null,
        errors: {},
      })
      refresh.follows(account)
      refresh.profile(account)
      return true
    } catch (e) {
      const err = e as Error
      const errors: Record<string, string> = {}
      if (err instanceof api.SocialError && err.errors?.length) {
        for (const o of err.errors) {
          const i = /^follows\[(\d+)\]/.exec(o.at)?.[1]
          const f = i != null ? sent.follows[Number(i)] : undefined
          if (f) errors[entryKey(f.targetKind, f.target)] = o.error
          else if (o.at.startsWith('profile')) errors.profile = o.error
          else errors.batch = o.error
        }
      } else errors.batch = /rejected|denied/i.test(err.message) ? 'signature rejected' : err.message.slice(0, 120)
      write(account, { ...read(account), errors })
      return false
    } finally { setApplying(false) }
  }

  return { account, queue: q, count, applying, stageFollow, stageProfile, dropFollow, dropProfile, apply }
}
