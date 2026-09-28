/**
 * The reader's standing, in the header: where they rank on the board and what
 * that rank is made of, or — before they are on it — who is following them.
 * Both are social facts, which is the half of this app a balance cannot say.
 *
 * The rank is looked up in the board the index already serves (the 7-day
 * window, the one the Board tab opens on). A wallet outside the first hundred
 * has no rank here rather than an estimated one.
 */
import React from 'react'
import { useQuery } from '@tanstack/react-query'
import * as idx from '../index/api'
import { useFollowers } from '../social/queries'
import { usdShort } from './bits'

export function useMyStats(account: string | undefined) {
  const board = useQuery({
    enabled: !!account,
    queryKey: ['leaderboard-me', '7d'],
    queryFn: () => idx.leaderboard({ window: '7d', limit: 100 }),
    staleTime: 5 * 60_000,
    retry: false,
  })
  const f = useFollowers(account)
  const a = account?.toLowerCase()
  const i = a ? (board.data?.rows ?? []).findIndex((r) => r.account.toLowerCase() === a) : -1
  return {
    rank: i >= 0 ? i + 1 : null,
    earned: i >= 0 ? board.data!.rows[i].realizedUsd : null,
    followers: f.data ? f.data.followers.length : null,
  }
}

/** The chip: rank when there is one, followers otherwise; nothing while there is neither to show. */
export function StatsChip({ account }: { account: string }) {
  const s = useMyStats(account)
  if (s.rank == null && !s.followers) return null
  return (
    <a className="statchip" href="#/board" title={s.rank != null ? `#${s.rank} on the 7-day board` : 'The leaderboard'}>
      {s.rank != null ? (
        <><b>#{s.rank}</b><small>{usdShort(s.earned)} · 7d</small></>
      ) : (
        <><b>{s.followers}</b><small>follower{s.followers === 1 ? '' : 's'}</small></>
      )}
    </a>
  )
}

/** The same facts spelled out, for the sheets — a phone has no room for the chip. */
export function MyStats({ account }: { account: string }) {
  const s = useMyStats(account)
  return (
    <div className="mystats">
      <a href="#/board"><b>{s.rank != null ? `#${s.rank}` : '—'}</b><small>{s.rank != null ? `${usdShort(s.earned)} earned · 7d` : 'not ranked · 7d'}</small></a>
      <a href={`#/w/${account.toLowerCase()}`}><b>{s.followers ?? '—'}</b><small>follower{s.followers === 1 ? '' : 's'}</small></a>
    </div>
  )
}
