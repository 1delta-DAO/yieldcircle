import React from 'react'
import { normAddr } from '@yieldcircle/core/model/address'
import { liteMoves } from '@yieldcircle/core/model/moves'
import type { LiteRow } from '@yieldcircle/core/model/lite'
import { useFeedPage, useRateLeaders } from './index/queries'
import { useLatest, useMyFollows, useThreadOf } from './social/queries'
import { subjectOf, type TxBundle } from '@yieldcircle/core/index/types'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import type { Message } from '@yieldcircle/core/social/types'

export type MovesTab = 'following' | 'everyone'
/** how many of the board's top wallets "Everyone" watches: the ones that put real money to work */
const TOP_N = 40

/**
 * Lite's moves (Home, You; fomo's feed with its Following toggle): what the people you follow did,
 * or what the wallets with the best rates did (the rate board, not the biggest wallets —
 * docs/rate-boards.md), filtered by core's `liteMoves`. A first visit — no wallet, no follows —
 * opens on Everyone, so it still shows people. `followingOnly` (You): no Everyone, and nothing
 * without follows. `chains`: the scope as the index takes it, absent for every chain.
 */
export function useLiteMoves({ rows, account, limit = 8, chains, followingOnly }: { rows: LiteRow[]; account: string | undefined; limit?: number; chains?: string; followingOnly?: boolean }) {
  const f = useMyFollows(account)
  const has = !!account && f.wallets.length + f.markets.length > 0
  const [picked, setTab] = React.useState<MovesTab | null>(null)
  const tab: MovesTab = followingOnly ? 'following' : picked ?? (has ? 'following' : 'everyone')
  const followed = useFeedPage({ follower: account, follow: 'all', chainIds: chains }, 40, has && tab === 'following')
  const top = useRateLeaders(tab === 'everyone')
  const me = account ? normAddr(account) : null
  const accounts = (top.data?.rows ?? []).map((r) => normAddr(r.account)).filter((a) => a !== me).slice(0, TOP_N)
  const everyone = useFeedPage({ accounts: accounts.join(','), chainIds: chains }, 80, tab === 'everyone' && accounts.length > 0)
  const feed = tab === 'following' ? followed : everyone
  const txs = React.useMemo(() => liteMoves(feed.data?.txs ?? [], rows, tab, limit), [feed.data, rows, tab, limit])
  const loading = feed.isLoading || (tab === 'everyone' && top.isLoading)
  return { tab, setTab, has, txs, loading }
}

/** What each mover said on the strategy they moved in (Say why) — the mover's own, never a stranger's. */
export function useMoveReasons(txs: { t: TxBundle; r: LiteRow | null }[]) {
  const threadFor = useThreadOf()
  const subjects = txs.flatMap(({ t, r }) => {
    const th = r ? threadFor(r.s) : null
    const who = subjectOf(t).account
    return th && who ? [{ ...th, author: who }] : []
  })
  const latest = useLatest(subjects)
  return (s: Strategy, who: string): Message | null => {
    const th = threadFor(s)
    return th && who ? latest(th.kind, th.key, who) : null
  }
}
