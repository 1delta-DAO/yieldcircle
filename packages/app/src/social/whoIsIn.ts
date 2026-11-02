import React from 'react'
import { normAddr } from '@yieldcircle/core/model/address'
import { followedFirst } from '@yieldcircle/core/model/lite'
import type { ThreadRef } from '@yieldcircle/core/model/uid'
import { useHolders } from '../index/queries'
import { useCounts, useLatest, useMyFollows, useProfiles } from './queries'

/**
 * Who's in it, on Lite's ticket (fomo's holders on a coin page): the market's biggest holders
 * without you, the people you follow first, five of them — each with what they said on the
 * strategy's thread — and how much that thread holds.
 */
export function useWhoIsIn(uid: string | null, thread: ThreadRef | null, account: string | undefined) {
  const f = useMyFollows(account)
  const holders = useHolders(uid ?? undefined, undefined, 12)
  const mine = account ? normAddr(account) : null
  const all = (holders.data?.holders ?? []).filter((h) => normAddr(h.account) !== mine)
  const fset = React.useMemo(() => new Set(f.wallets.map((a) => a.toLowerCase())), [f.wallets])
  const rows = followedFirst(all, fset).slice(0, 5)
  const { profile } = useProfiles(rows.map((h) => h.account))
  const latest = useLatest(thread ? rows.map((h) => ({ ...thread, author: h.account })) : [])
  const counts = useCounts(thread ? [thread] : [])
  return {
    rows,
    isLoading: holders.isLoading,
    /** how many of all its holders you follow */
    nFollowed: all.filter((h) => fset.has(h.account.toLowerCase())).length,
    follows: (a: string) => fset.has(a.toLowerCase()),
    profile,
    said: (a: string) => (thread ? latest(thread.kind, thread.key, a) : null),
    /** messages on the thread */
    n: thread ? counts.count(thread.kind, thread.key) : 0,
  }
}
