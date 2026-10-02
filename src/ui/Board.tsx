/**
 * The board: what POSITIONS earn now (pos-indexer tickets/0036). The old
 * realized board is gone on purpose — ranked by dollars earned it was a size
 * ranking, and the top 25 were allocator contracts at 1.00× leverage. This
 * one ranks the position, not the wallet: the carry on equity at today's
 * rates, beside the realized 7 d figure the ledger proved.
 *
 * The index's default preset hides the rows whose figure is not a yield
 * anyone can take home — phantom, rate-capped, locked, strategy, exploited —
 * and the board SAYS what it hid; one tap shows everything, flagged. A flag
 * marks a row, it never deletes it.
 */
import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApp, go, marketHref } from '../state/AppState'
import { isSvmChain } from '../model/address'
import * as idx from '../index/api'
import { useProfiles } from '../social/queries'
import { FollowButton, Money, Who } from './social-bits'
import { Sk, pct, usdShort } from './bits'
import { ChainChip } from './ChainPicker'

type Sort = 'perDay' | 'apr'

const FLAG_TITLES: Record<string, string> = {
  phantom: 'a market that cannot pay this claim — its value is out of every sum',
  'illiquid-exit': 'bigger than the market’s available cash, or utilization ≥ 98%',
  'rate-capped': 'the rate is the model’s ceiling: a dead market compounding what nobody can withdraw',
  locked: 'async or request-based exit, a fixed term, or a PT before maturity',
  strategy: 'trading P&L or LP fees annualised — not lending yield',
  leveraged: 'supply over equity past 3×',
  'rate-spike': 'the live rate is far above its own 24 h mean',
  'rate-unverified': 'a rate outside the plausibility band (−50% … +300%)',
  thin: 'a vault with almost no money or almost no holders',
  stress: 'the index’s own stress signals are lit on a leg’s market',
  exploited: 'wallets with checkable positions flagged this as exploited / under exploit / bad debt — evidence attached',
}

function Flags({ row }: { row: idx.EarnerRow }) {
  if (!row.risk.length) return null
  return (
    <span className="flags">
      {row.risk.map((f) => {
        const d = row.riskDetail?.[f]
        const detail = Array.isArray(d) && d.length ? `\n${JSON.stringify(d[0])}` : ''
        return (
          <span key={f} className={`pill flag${f === 'exploited' ? ' bad' : ''}`} title={`${FLAG_TITLES[f] ?? f}${detail}`}>
            {f}
          </span>
        )
      })}
    </span>
  )
}

export function Board({ window: w }: { window?: string }) {
  const { chainIds, allChains } = useApp()
  const sort: Sort = w === 'apr' ? 'apr' : 'perDay'
  const [showAll, setShowAll] = React.useState(false)
  const [contracts, setContracts] = React.useState(false)

  const q = useQuery({
    queryKey: ['earners', sort, showAll, contracts, allChains ? 'all' : chainIds.join(',')],
    queryFn: () =>
      idx.earners({
        sort,
        preset: showAll ? 'all' : undefined,
        people: !contracts,
        chainIds: allChains ? undefined : chainIds.join(','),
        limit: 50,
      }),
    staleTime: 60_000,
    retry: false,
  })

  const rows = q.data?.rows ?? []
  const hidden = Object.entries(q.data?.hidden ?? {})
  const flags = q.data?.ratingFlags
  const { profile } = useProfiles(rows.map((r) => r.account))

  return (
    <>
      <div className="feed-h">
        <h1>Board</h1>
        <span className="sp" />
        <ChainChip />
        <div className="seg">
          <button aria-pressed={sort === 'perDay'} onClick={() => go('board', { t: 'day' })} title="most dollars a day at today’s rates">$/day</button>
          <button aria-pressed={sort === 'apr'} onClick={() => go('board', { t: 'apr' })} title="highest net APR — exact positions over $10k equity only">APR</button>
        </div>
      </div>

      <div className="note">
        What positions <b>earn now</b>: the net carry on equity at today’s rates — a projection, so the proven
        7-day figure sits beside it. Positions whose rate is not a yield anyone can take home are hidden
        {hidden.length > 0 && <> ({hidden.map(([f, n]) => `${f} ${n}`).join(' · ')})</>}
        {' '}
        <button className="linklike" onClick={() => setShowAll((x) => !x)}>{showAll ? 'hide them again' : 'show them, flagged'}</button>
        {' · '}
        <button className="linklike" onClick={() => setContracts((x) => !x)}>{contracts ? 'people only' : 'include contracts'}</button>
        . Wallets that marked themselves unlisted are not here.
      </div>
      {flags && flags.status !== 'ok' && (
        <div className="note warn">Community exploit flags are {flags.status} on this index right now — the exploited exclusion may be out of date.</div>
      )}

      <div className="card">
        {q.isLoading && <div className="empty"><Sk w={240} /></div>}
        {q.isError && <div className="empty">This deploy of the index has no earners board yet — it appears the moment the position-carry job runs.</div>}
        {!q.isLoading && !q.isError && !rows.length && (
          <div className="empty">{!allChains && chainIds.every((id) => isSvmChain(id))
            ? 'The earners board is not on Solana yet — it ranks what the EVM index can prove.'
            : 'Nothing to rank with these filters.'}</div>
        )}
        <div className="list">
          {rows.map((r, i) => {
            const name = r.legs[0]?.marketName ?? r.riskKey
            return (
              <a key={r.key} className="row wrow board" href={`#/w/${r.account}`}>
                <span className={`rank${i < 3 ? ' lead' : ''}`}>{i + 1}</span>
                <Who account={r.account} profile={profile(r.account)} idx={r} plain
                  sub={
                    <>
                      <span className="mono" onClick={(e) => { e.preventDefault(); e.stopPropagation(); location.hash = marketHref(r.marketUids[0]) }}>{name}</span>
                      {r.marketUids.length > 1 && <> +{r.marketUids.length - 1}</>}
                      {r.leverage != null && r.leverage > 1.05 && <> · {r.leverage.toFixed(1)}×</>}
                      {' · '}{usdShort(r.equityUsd)} equity
                    </>
                  } />
                <span className="sp" />
                <Flags row={r} />
                <span className="v ok hide-m" title={r.exact ? 'every leg carries a price and a rate' : 'a leg has no rate or price: this is a floor, not a guess'}>
                  {r.exact ? '' : '≈ '}{pct(r.netAprPct)}<small>{r.apr24hPct != null ? `${pct(r.apr24hPct)} 24h` : 'net APR'}</small>
                </span>
                <span className="v"><Money usd={r.perDayUsd} /><small>a day{r.realized7dUsd != null ? ` · ${usdShort(r.realized7dUsd)} proven 7d` : ''}</small></span>
                <span onClick={(e) => e.preventDefault()}><FollowButton kind="wallet" target={r.account} small /></span>
              </a>
            )
          })}
        </div>
      </div>
    </>
  )
}
