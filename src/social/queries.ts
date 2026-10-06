import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import React from 'react'
import { normAddr } from '../model/address'
import { threadOf, type ThreadRef } from '../model/uid'
import type { Strategy } from '../model/strategies'
import * as api from './api'
import { entryKey, useQueue, type TargetKind } from './pending'
import type { Follow, Profile, SubjectKind } from './types'

const MIN = 60_000

export function useThread(kind: SubjectKind | undefined, key: string | undefined) {
  return useQuery({
    enabled: !!kind && !!key,
    queryKey: ['thread', kind, key],
    queryFn: () => api.thread(kind!, key!),
    staleTime: 20_000,
  })
}

/**
 * What this deployment of the service accepts, from `/typed-data` (the same
 * query `useBatchSupported` reads). Until the service lists `strategy`, a
 * loop keeps talking on its collateral market — so the app and the service
 * deploy in either order, and nobody signs a write the service would refuse.
 */
export function useStrategyThreads(): boolean {
  const q = useQuery({ queryKey: ['typed-data'], queryFn: api.typedData, staleTime: 30 * MIN, retry: false })
  return !!q.data?.subjectKinds?.includes('strategy')
}
/** `threadOf`, bound to what the service takes. */
export function useThreadOf(): (s: Strategy) => ThreadRef | null {
  const loops = useStrategyThreads()
  return React.useCallback((s: Strategy) => threadOf(s, loops), [loops])
}

/** The Talk tab: what people said, newest first, paged on the last id. */
export function useRecentMessages(f: { chainIds?: string; protocols?: string }, enabled = true) {
  return useInfiniteQuery({
    enabled,
    queryKey: ['messages-recent', f.chainIds ?? '', f.protocols ?? ''],
    queryFn: ({ pageParam }) => api.recentMessages({ kinds: ['market', 'strategy'], ...f, before: pageParam, limit: 30 }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => (last.messages.length < 30 ? undefined : last.next),
    staleTime: 20_000,
    refetchInterval: 60_000,
  })
}
/**
 * What each mover SAID about the strategy they moved in — one request for a
 * page of cards. Asked only of a service that has the route (it shipped with
 * `strategy` threads); before that it answers nothing and the cards stay as
 * they were.
 */
export function useLatest(subjects: { kind: SubjectKind; key: string; author: string }[]) {
  const ready = useStrategyThreads()
  const want = subjects.slice(0, 200)
  const stable = want.map((s) => `${s.kind}/${s.key}/${s.author}`).sort().join(',')
  const q = useQuery({
    enabled: ready && want.length > 0,
    queryKey: ['latest', stable],
    queryFn: () => api.latest(want),
    staleTime: MIN,
    retry: false,
  })
  const map = q.data?.latest ?? {}
  return (kind: SubjectKind, key: string, author: string) => map[`${kind}|${key}|${normAddr(author)}`] ?? null
}

/** A wallet's own messages. */
export function useAccountMessages(account: string | undefined) {
  return useQuery({
    enabled: !!account,
    queryKey: ['messages-by', normAddr(account)],
    queryFn: () => api.accountMessages(account!),
    staleTime: MIN,
    retry: false,
  })
}

/**
 * 💬 counts for a whole list in ONE request. The catalogue can be 60 rows and
 * the feed 40; both fit in the service's 1000-subject batch.
 */
export function useCounts(subjects: { kind: SubjectKind; key: string }[]) {
  const stable = subjects.map((s) => `${s.kind}/${s.key}`).sort().join(',')
  const q = useQuery({
    enabled: subjects.length > 0,
    queryKey: ['counts', stable],
    queryFn: () => api.counts(subjects),
    staleTime: MIN,
  })
  const counts = q.data?.counts ?? {}
  return { count: (kind: SubjectKind, key: string) => counts[kind]?.[key] ?? 0, isLoading: q.isLoading }
}

export function useProfile(account: string | undefined) {
  return useQuery({
    enabled: !!account,
    queryKey: ['profile', normAddr(account)],
    queryFn: () => api.profile(account!),
    staleTime: MIN,
  })
}

/** Profiles for every address in a view, batched. Missing ones resolve to null and stay cached as null. */
export function useProfiles(accounts: string[]) {
  const want = [...new Set(accounts.map((a) => normAddr(a)).filter(Boolean))].sort()
  const q = useQuery({
    enabled: want.length > 0,
    queryKey: ['profiles', want.join(',')],
    queryFn: () => api.profiles(want),
    staleTime: 5 * MIN,
  })
  const map = q.data ?? {}
  return { profile: (a: string): Profile | null => map[normAddr(a)] ?? null, isLoading: q.isLoading }
}

/** Is the handle free for this wallet — asked a moment after typing stops, never for the one already held. */
export function useHandleCheck(handle: string, account: string | undefined, current: string | null) {
  const [h, setH] = React.useState(handle)
  React.useEffect(() => { const t = setTimeout(() => setH(handle), 400); return () => clearTimeout(t) }, [handle])
  return useQuery({
    enabled: !!account && /^[a-z0-9_]{3,20}$/.test(h) && h !== current,
    queryKey: ['handle', h, account],
    queryFn: () => api.handleCheck(h, account),
    staleTime: 30_000,
    retry: false,
  })
}

export function useFollowers(account: string | undefined) {
  return useQuery({ enabled: !!account, queryKey: ['followers', normAddr(account)], queryFn: () => api.followers(account!), staleTime: MIN })
}

/**
 * The wallet-link cluster of an address (docs/wallet-links.md): its primary
 * and every linked member. Answers the address itself, alone, when nothing
 * is linked — so callers never branch on "has links".
 */
export function useWalletLinks(account: string | undefined) {
  return useQuery({
    enabled: !!account && api.SOCIAL_LINKS_READY,
    queryKey: ['wallet-links', normAddr(account)],
    queryFn: () => api.walletLinks(account!),
    staleTime: 5 * MIN,
    retry: false,
  })
}

/**
 * Who the connected wallet follows — the feed's scope and every Follow
 * button's state. The pending queue (`pending.ts`) is laid over the service's
 * answer, so a follow shows at once everywhere, before it is signed;
 * `isPending` tells the two apart and `serverFollowing` is the signed truth.
 */
export function useMyFollows(account: string | undefined) {
  const q = useQuery({
    enabled: !!account,
    queryKey: ['follows', normAddr(account)],
    queryFn: () => api.follows(account!),
    staleTime: 30_000,
  })
  const queue = useQueue(account)
  const signed = q.data?.follows ?? []
  const pend = new Map(queue.follows.map((f) => [entryKey(f.targetKind, f.target), f]))
  const follows: (Follow & { pending?: boolean })[] = [
    ...signed.filter((f) => pend.get(entryKey(f.targetKind, f.target))?.action !== 'unfollow'),
    ...queue.follows
      .filter((p) => p.action === 'follow' && !signed.some((f) => entryKey(f.targetKind, f.target) === entryKey(p.targetKind, p.target)))
      .map((p) => ({ targetKind: p.targetKind, target: p.target, pending: true })),
  ]
  const serverFollowing = (kind: TargetKind, target: string) =>
    signed.some((f) => entryKey(f.targetKind, f.target) === entryKey(kind, target))
  return {
    follows,
    wallets: follows.filter((f) => f.targetKind === 'wallet').map((f) => normAddr(f.target)),
    // a market target is stored VERBATIM (a uid's protocol segment is case-significant)
    markets: follows.filter((f) => f.targetKind === 'market').map((f) => f.target),
    /** a desk the feed expands to its vault addresses (pos-indexer tickets/0013 §8.4) */
    curators: follows.filter((f) => f.targetKind === 'curator').map((f) => f.target),
    /** loops (tickets/0005), which the feed expands to their two markets */
    strategies: follows.filter((f) => f.targetKind === 'strategy').map((f) => f.target),
    isFollowing: (kind: TargetKind, target: string) => {
      const p = pend.get(entryKey(kind, target))
      return p ? p.action === 'follow' : serverFollowing(kind, target)
    },
    serverFollowing,
    isPending: (kind: TargetKind, target: string) => pend.has(entryKey(kind, target)),
    /** follows queued but not signed — the feed's Following tab cannot show them yet */
    pendingCount: queue.follows.length,
    isLoading: q.isLoading,
  }
}

// ---------------------------------------------------------------- ratings

/** The vocabulary, from the service. Cached hard: it changes with a deploy, not with a page. */
export function useRatingLabels() {
  return useQuery({ queryKey: ['rating-labels'], queryFn: api.ratingLabels, staleTime: 30 * MIN, retry: false })
}

/**
 * Everything said about one subject, with every component of every weight.
 * `follower` adds the trust-graph view — the same votes restricted to the
 * wallets you follow, and EMPTY when you follow nobody.
 */
export function useRatings(kind: api.RatingSubjectKind | undefined, key: string | undefined, follower?: string) {
  return useQuery({
    enabled: !!kind && !!key,
    queryKey: ['ratings', kind, key, follower ?? null],
    queryFn: () => api.ratings(kind!, key!, follower),
    staleTime: 30_000,
    retry: false,
  })
}

/** 🚀 / 💀 counts for a whole list in one request. Counts, not weights — see the api note. */
export function useRatingCounts(subjects: { kind: api.RatingSubjectKind; key: string }[]) {
  const stable = subjects.map((s) => `${s.kind}/${s.key}`).sort().join(',')
  const q = useQuery({
    enabled: subjects.length > 0,
    queryKey: ['rating-counts', stable],
    queryFn: () => api.ratingCounts(subjects),
    staleTime: MIN,
    retry: false,
  })
  const counts = q.data?.counts ?? {}
  return {
    ratingOf: (kind: api.RatingSubjectKind, key: string): api.RatingCount | null => counts[kind]?.[key] ?? null,
    isLoading: q.isLoading,
  }
}

/** After a write, drop what it changed so the next render reads the server's version. */
export function useSocialRefresh() {
  const qc = useQueryClient()
  return {
    thread: (kind: SubjectKind, key: string) => {
      void qc.invalidateQueries({ queryKey: ['thread', kind, key] })
      void qc.invalidateQueries({ queryKey: ['counts'] })
      void qc.invalidateQueries({ queryKey: ['messages-recent'] })
      void qc.invalidateQueries({ queryKey: ['messages-by'] })
      void qc.invalidateQueries({ queryKey: ['latest'] })
    },
    follows: (account?: string) => { void qc.invalidateQueries({ queryKey: ['follows', normAddr(account)] }); void qc.invalidateQueries({ queryKey: ['followers'] }); void qc.invalidateQueries({ queryKey: ['feed1'] }) },
    profile: (account?: string) => { void qc.invalidateQueries({ queryKey: ['profile', normAddr(account)] }); void qc.invalidateQueries({ queryKey: ['profiles'] }) },
    links: () => { void qc.invalidateQueries({ queryKey: ['wallet-links'] }); void qc.invalidateQueries({ queryKey: ['profiles'] }); void qc.invalidateQueries({ queryKey: ['profile'] }) },
    ratings: (kind: api.RatingSubjectKind, key: string) => { void qc.invalidateQueries({ queryKey: ['ratings', kind, key] }); void qc.invalidateQueries({ queryKey: ['rating-counts'] }) },
  }
}
