/**
 * The leaderboard. The metric is **realized yield** — what a position actually
 * earned, `units × Δindex` valued in dollars — because that is the one number
 * the index can prove and a screenshot cannot.
 *
 * Where the deploy has no rollup yet the board falls back to net deposits in
 * the window and SAYS SO on the page. A proxy labelled as yield would be worth
 * less than nothing here.
 */
import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApp } from '../state/AppState'
import * as idx from '../index/api'
import { useProfiles } from '../social/queries'
import { FollowButton, Money, Who } from './social-bits'
import { Sk, pct, usdShort } from './bits'
import { go } from '../state/AppState'

// the three the rollup keeps; an "all time" board would need a rollup of its
// own, not a wider window, because the index cache does not go back far enough
type Win = '24h' | '7d' | '30d'
const WINDOWS: Win[] = ['24h', '7d', '30d']
const HOURS: Record<Win, number> = { '24h': 24, '7d': 168, '30d': 720 }

export function Board({ window: w }: { window?: string }) {
  const { chainIds, allChains, chainLabelFor } = useApp()
  const win: Win = WINDOWS.includes(w as Win) ? (w as Win) : '7d'
  const chainId = allChains || chainIds.length > 1 ? undefined : chainIds[0]

  const real = useQuery({
    queryKey: ['leaderboard', win, chainId ?? 'all'],
    queryFn: () => idx.leaderboard({ window: win, limit: 50, chainId }),
    staleTime: 5 * 60_000,
    retry: false,
  })
  // the fallback: aggregate the window's tape per wallet, client-side
  const fallback = useQuery({
    enabled: real.isError,
    queryKey: ['board-fallback', win, chainIds.join(',')],
    queryFn: async () => {
      const since = new Date(Date.now() - HOURS[win] * 3600_000).toISOString()
      const r = await idx.recentEvents({ since, limit: 1000, chainIds: allChains ? undefined : chainIds.join(',') })
      const by = new Map<string, { account: string; netUsd: number; n: number }>()
      for (const e of r.events) {
        if (e.accountKind === 'vault' || e.accountKind === 'protocol' || e.accountKind === 'router' || e.accountKind === 'dex' || e.accountKind === 'wrapper') continue
        if (e.side === 'borrow') continue
        const v = e.amountUsd
        if (v == null) continue
        const sign = /withdraw|redeem|burn/.test(e.kind) ? -1 : /deposit|supply|mint/.test(e.kind) ? 1 : 0
        if (!sign) continue
        const cur = by.get(e.account) ?? { account: e.account, netUsd: 0, n: 0 }
        cur.netUsd += sign * v
        cur.n++
        by.set(e.account, cur)
      }
      return [...by.values()].filter((x) => x.netUsd > 0).sort((a, b) => b.netUsd - a.netUsd).slice(0, 50)
    },
    staleTime: 5 * 60_000,
  })

  const rows = real.data?.rows
  const alt = fallback.data
  const accounts = rows?.map((r) => r.account) ?? alt?.map((a) => a.account) ?? []
  const { profile } = useProfiles(accounts)
  const loading = real.isLoading || (real.isError && fallback.isLoading)

  return (
    <>
      <div className="feed-h">
        <h1>Leaderboard</h1>
        <span className="sp" />
        <div className="seg">{WINDOWS.map((x) => <button key={x} aria-pressed={win === x} onClick={() => go('board', { t: x })}>{x}</button>)}</div>
      </div>

      {real.isError ? (
        <div className="note"><b>Showing net deposits, not yield.</b> This deploy of the index has no realized-yield rollup yet, so the board ranks what wallets put to work in the window. Realized yield is <span className="mono">units × Δindex</span>, valued — it appears here the moment the rollup does.</div>
      ) : (
        <div className="note">Realized yield is what the position <b>earned</b>: its units multiplied by the change in its market’s index, valued in dollars. Flows in and out are removed, so adding money never looks like a profit. Wallets that marked themselves unlisted are not here.</div>
      )}

      <div className="card">
        {loading && <div className="empty"><Sk w={240} /></div>}
        {!loading && !accounts.length && <div className="empty">Nothing to rank in this window.</div>}
        <div className="list">
          {rows?.map((r, i) => (
            <a key={r.account} className="row wrow board" href={`#/w/${r.account}`}>
              <span className={`rank${i < 3 ? ' lead' : ''}`}>{i + 1}</span>
              <Who account={r.account} profile={profile(r.account)} idx={r} plain
                sub={r.nPositions ? `${r.nPositions} position${r.nPositions === 1 ? '' : 's'}${r.exact === false ? ' · approximate' : ''}` : undefined} />
              <span className="sp" />
              {r.ratePct != null && <span className="v ok hide-m">{pct(r.ratePct)}<small>on {usdShort(r.avgPositionUsd)}</small></span>}
              <span className="v"><Money usd={r.realizedUsd} /><small>earned</small></span>
              <span onClick={(e) => e.preventDefault()}><FollowButton kind="wallet" target={r.account} small /></span>
            </a>
          ))}
          {!rows && alt?.map((a, i) => (
            <a key={a.account} className="row wrow board" href={`#/w/${a.account}`}>
              <span className={`rank${i < 3 ? ' lead' : ''}`}>{i + 1}</span>
              <Who account={a.account} profile={profile(a.account)} plain sub={`${a.n} move${a.n === 1 ? '' : 's'}`} />
              <span className="sp" />
              <span className="v"><Money usd={a.netUsd} /><small>put to work</small></span>
              <span onClick={(e) => e.preventDefault()}><FollowButton kind="wallet" target={a.account} small /></span>
            </a>
          ))}
        </div>
      </div>
    </>
  )
}
