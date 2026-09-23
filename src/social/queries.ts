import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from './api'
import type { Profile, SubjectKind } from './types'

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
    queryKey: ['profile', account?.toLowerCase()],
    queryFn: () => api.profile(account!),
    staleTime: MIN,
  })
}

/** Profiles for every address in a view, batched. Missing ones resolve to null and stay cached as null. */
export function useProfiles(accounts: string[]) {
  const want = [...new Set(accounts.map((a) => a.toLowerCase()).filter(Boolean))].sort()
  const q = useQuery({
    enabled: want.length > 0,
    queryKey: ['profiles', want.join(',')],
    queryFn: () => api.profiles(want),
    staleTime: 5 * MIN,
  })
  const map = q.data ?? {}
  return { profile: (a: string): Profile | null => map[a.toLowerCase()] ?? null, isLoading: q.isLoading }
}

export function useFollowers(account: string | undefined) {
  return useQuery({ enabled: !!account, queryKey: ['followers', account?.toLowerCase()], queryFn: () => api.followers(account!), staleTime: MIN })
}

/** Who the connected wallet follows — the feed's scope and every Follow button's state. */
export function useMyFollows(account: string | undefined) {
  const q = useQuery({
    enabled: !!account,
    queryKey: ['follows', account?.toLowerCase()],
    queryFn: () => api.follows(account!),
    staleTime: 30_000,
  })
  const follows = q.data?.follows ?? []
  return {
    follows,
    wallets: follows.filter((f) => f.targetKind === 'wallet').map((f) => f.target.toLowerCase()),
    // a market target is stored VERBATIM (a uid's protocol segment is case-significant)
    markets: follows.filter((f) => f.targetKind === 'market').map((f) => f.target),
    /** a desk the feed expands to its vault addresses (pos-indexer tickets/0013 §8.4) */
    curators: follows.filter((f) => f.targetKind === 'curator').map((f) => f.target),
    isFollowing: (kind: 'wallet' | 'market' | 'curator', target: string) =>
      follows.some((f) => f.targetKind === kind && (kind === 'wallet' ? f.target.toLowerCase() === target.toLowerCase() : f.target === target)),
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
    thread: (kind: SubjectKind, key: string) => { void qc.invalidateQueries({ queryKey: ['thread', kind, key] }); void qc.invalidateQueries({ queryKey: ['counts'] }) },
    follows: (account?: string) => { void qc.invalidateQueries({ queryKey: ['follows', account?.toLowerCase()] }); void qc.invalidateQueries({ queryKey: ['followers'] }); void qc.invalidateQueries({ queryKey: ['feed1'] }) },
    profile: (account?: string) => { void qc.invalidateQueries({ queryKey: ['profile', account?.toLowerCase()] }); void qc.invalidateQueries({ queryKey: ['profiles'] }) },
    ratings: (kind: api.RatingSubjectKind, key: string) => { void qc.invalidateQueries({ queryKey: ['ratings', kind, key] }); void qc.invalidateQueries({ queryKey: ['rating-counts'] }) },
  }
}
