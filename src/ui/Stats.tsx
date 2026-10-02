/**
 * The reader's standing, in the header: where they rank on the board and what
 * that rank is made of, or — before they are on it — who is following them.
 * Both are social facts, which is the half of this app a balance cannot say.
 *
 * The rank is the wallet's best position on the board the Board tab opens on
 * (the $/day earners board, pos-indexer tickets/0036). A wallet outside the
 * first hundred rows has no rank here rather than an estimated one.
 */
import React from 'react'
import { useQuery } from '@tanstack/react-query'
import * as idx from '../index/api'
import { useFollowers } from '../social/queries'
import { usdShort } from './bits'

export function useMyStats(account: string | undefined) {
  const board = useQuery({
    enabled: !!account,
    queryKey: ['earners-me'],
    queryFn: () => idx.earners({ sort: 'perDay', limit: 100 }),
    staleTime: 5 * 60_000,
    retry: false,
  })
  const f = useFollowers(account)
  const a = account?.toLowerCase()
  const i = a ? (board.data?.rows ?? []).findIndex((r) => r.account.toLowerCase() === a) : -1
  return {
    rank: i >= 0 ? i + 1 : null,
    perDay: i >= 0 ? board.data!.rows[i].perDayUsd : null,
    followers: f.data ? f.data.followers.length : null,
  }
}

/** The chip: rank when there is one, followers otherwise; nothing while there is neither to show. */
export function StatsChip({ account }: { account: string }) {
  const s = useMyStats(account)
  if (s.rank == null && !s.followers) return null
  return (
    <a className="statchip" href="#/board" title={s.rank != null ? `#${s.rank} on the board` : 'The board'}>
      {s.rank != null ? (
        <><b>#{s.rank}</b><small>{usdShort(s.perDay)}/day</small></>
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
      <a href="#/board"><b>{s.rank != null ? `#${s.rank}` : '—'}</b><small>{s.rank != null ? `${usdShort(s.perDay)}/day on the board` : 'not on the board'}</small></a>
      <a href={`#/w/${account.toLowerCase()}`}><b>{s.followers ?? '—'}</b><small>follower{s.followers === 1 ? '' : 's'}</small></a>
    </div>
  )
}
