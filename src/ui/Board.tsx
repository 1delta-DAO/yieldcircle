/**
 * The board: what POSITIONS earn now, and what whole WALLETS earn
 * (pos-indexer tickets/0036, 0057). The old realized board is gone on
 * purpose — ranked by dollars earned it was a size ranking, and the top 25
 * were allocator contracts at 1.00× leverage.
 *
 * Positions rank one netted position's carry on equity at today's rates, and
 * every row says what its WALLET earns in total (Σ annual / Σ equity — each
 * position's APR weighted by its NAV): a 104.7 % loop on $16k inside a $1.16 m
 * wallet earning 24.7 % says both. Wallets rank that total itself.
 *
 * The index's default preset hides the positions whose figure is not a yield
 * anyone can take home — phantom, rate-capped, locked, strategy, exploited —
 * and leaves them out of a wallet's total; the board SAYS what it hid, and one
 * tap shows everything, flagged. A flag marks a row, it never deletes it.
 */
import React from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApp, go, marketHref } from '../state/AppState'
import { isSvmChain } from '../model/address'
import * as idx from '../index/api'
import { useProfiles } from '../social/queries'
import { FollowButton, Money, Who } from './social-bits'
import { Sk, pct, usdShort } from './bits'
import { ChainChip } from './ChainPicker'

type Sort = 'perDay' | 'apr'
type By = 'position' | 'wallet'

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

function Flags({ risk, detail }: { risk: string[]; detail?: Record<string, unknown> | null }) {
  if (!risk.length) return null
  return (
    <span className="flags">
      {risk.map((f) => {
        const d = detail?.[f]
        const more = Array.isArray(d) && d.length ? `\n${JSON.stringify(d[0])}` : ''
        return (
          <span key={f} className={`pill flag${f === 'exploited' ? ' bad' : ''}`} title={`${FLAG_TITLES[f] ?? f}${more}`}>
            {f}
          </span>
        )
      })}
    </span>
  )
}

/**
 * The ACCOUNT beside the position (pos-indexer tickets/0057 §E): the whole
 * wallet's net APR — every position's APR weighted by its share of NAV — and
 * how big a slice of that account this position is. A 101.9 % row that is
 * 1.3 % of a 14.3 % account says both, in the same row.
 */
function AccountCell({ r }: { r: idx.EarnerRow }) {
  const w = r.wallet
  if (!w) return <span className="v hide-m acct t40">—<small>account</small></span>
  const apr = w.apr24hPct ?? w.netAprPct
  const share = w.navUsd > 0 ? Math.min(1, Math.max(0, r.equityUsd / w.navUsd)) : null
  const whole = w.positions <= 1 || (share != null && share > 0.995)
  return (
    <span className="v hide-m acct"
      title={`The whole account: ${w.positions} position${w.positions === 1 ? '' : 's'} on ${usdShort(w.navUsd)} — Σ yearly carry ÷ Σ net value, each position's APR weighted by its share.${w.exact ? '' : ' A floor: a position has no rate yet.'}`}>
      <span className={apr == null ? 't40' : apr >= 0 ? 'ok' : 'warn'}>{apr == null ? '—' : `${w.exact ? '' : '≈ '}${pct(apr)}`}</span>
      <small>{whole ? 'the whole account' : share != null ? `${pct(share * 100, 1)} of ${usdShort(w.navUsd)}` : `on ${usdShort(w.navUsd)}`}</small>
    </span>
  )
}

interface BoardKey {
  by: By
  sort: Sort
  showAll: boolean
  people: boolean
  chains: string | undefined
}

/**
 * One factory for the board's queries, so the page and the idle prefetch ask
 * for byte-identical URLs — the index pre-warms these exact URLs, and the
 * browser cache holds the siblings so a toggle never waits.
 */
function boardQuery(k: BoardKey) {
  const p: idx.EarnersQuery = {
    sort: k.sort,
    preset: k.showAll ? 'all' : undefined,
    people: k.people,
    chainIds: k.chains,
    limit: 50,
  }
  return {
    queryKey: ['earners', k.by, k.sort, k.showAll, k.people, k.chains ?? 'all'] as const,
    queryFn: (): Promise<idx.EarnersResponse | idx.WalletEarnersResponse> =>
      k.by === 'wallet' ? idx.walletEarners(p) : idx.earners(p),
    staleTime: 60_000,
    retry: false,
  }
}

export function Board({ window: w, by: b }: { window?: string; by?: string }) {
  const { chainIds, allChains } = useApp()
  const sort: Sort = w === 'apr' ? 'apr' : 'perDay'
  const by: By = b === 'wallet' ? 'wallet' : 'position'
  const [showAll, setShowAll] = React.useState(false)
  const [contracts, setContracts] = React.useState(false)
  const chains = allChains ? undefined : chainIds.join(',')
  const key: BoardKey = { by, sort, showAll, people: !contracts, chains }

  const q = useQuery({ ...boardQuery(key), placeholderData: keepPreviousData })

  // the three sibling views (other sort, other unit) on idle, once this one
  // has painted — so every toggle is answered from the browser's cache
  const qc = useQueryClient()
  const painted = !!q.data && !q.isPlaceholderData
  React.useEffect(() => {
    if (!painted) return
    const siblings: BoardKey[] = [
      { ...key, sort: sort === 'apr' ? 'perDay' : 'apr' },
      { ...key, by: by === 'wallet' ? 'position' : 'wallet' },
      { ...key, by: by === 'wallet' ? 'position' : 'wallet', sort: sort === 'apr' ? 'perDay' : 'apr' },
    ]
    const run = () => siblings.forEach((s) => void qc.prefetchQuery(boardQuery(s)))
    // Safari has no requestIdleCallback
    const ric = typeof requestIdleCallback === 'function'
    const id = ric ? requestIdleCallback(run, { timeout: 2000 }) : setTimeout(run, 300)
    return () => (ric ? cancelIdleCallback(id as number) : clearTimeout(id as ReturnType<typeof setTimeout>))
  }, [painted, by, sort, showAll, contracts, chains])

  const data = q.data
  const positions = data?.by !== 'wallet' ? ((data?.rows ?? []) as idx.EarnerRow[]) : []
  const wallets = data?.by === 'wallet' ? (data.rows as idx.WalletEarnerRow[]) : []
  const accounts = data?.by === 'wallet' ? wallets.map((r) => r.account) : positions.map((r) => r.account)
  const hidden = Object.entries(data?.hidden ?? {})
  const flags = data?.ratingFlags
  const { profile } = useProfiles(accounts)
  const nav = (p: { t?: Sort; by?: By }) =>
    go('board', { t: (p.t ?? sort) === 'apr' ? 'apr' : 'day', by: (p.by ?? by) === 'wallet' ? 'wallet' : undefined })

  return (
    <>
      <div className="feed-h">
        <h1>Board</h1>
        <span className="sp" />
        <ChainChip />
        <div className="seg">
          <button aria-pressed={by === 'position'} onClick={() => nav({ by: 'position' })} title="one row per position">Positions</button>
          <button aria-pressed={by === 'wallet'} onClick={() => nav({ by: 'wallet' })} title="one row per wallet: its net APR across every position, weighted by NAV">Wallets</button>
        </div>
        <div className="seg">
          <button aria-pressed={sort === 'perDay'} onClick={() => nav({ t: 'perDay' })} title="most dollars a day at today’s rates">$/day</button>
          <button aria-pressed={sort === 'apr'} onClick={() => nav({ t: 'apr' })} title={by === 'wallet' ? 'highest net APR — exact wallets over $10k NAV only' : 'highest net APR — exact positions over $10k equity only'}>APR</button>
        </div>
      </div>

      <div className="note">
        {by === 'wallet' ? (
          <>
            What wallets <b>earn now</b>: every position’s net carry weighted by its equity — Σ yearly carry ÷ Σ NAV, at today’s rates.
            {showAll
              ? ' Every position counts.'
              : <> Positions whose rate is not a yield anyone can take home are left out of each total{hidden.length > 0 && <> ({hidden.map(([f, n]) => `${f} in ${n}`).join(' · ')} wallets)</>}.</>}
          </>
        ) : (
          <>
            What positions <b>earn now</b>: the net carry on equity at today’s rates, beside the whole wallet’s net APR.
            {showAll
              ? ' Every position is shown, flagged.'
              : <> Positions whose rate is not a yield anyone can take home are hidden{hidden.length > 0 && <> ({hidden.map(([f, n]) => `${f} ${n}`).join(' · ')})</>}.</>}
          </>
        )}
        {' '}
        <button className="linklike" onClick={() => setShowAll((x) => !x)}>{showAll ? 'hide them again' : by === 'wallet' ? 'count them' : 'show them, flagged'}</button>
        {' · '}
        <button className="linklike" onClick={() => setContracts((x) => !x)}>{contracts ? 'people only' : 'include contracts'}</button>
        . Wallets that marked themselves unlisted are not here.
      </div>
      {flags && flags.status !== 'ok' && (
        <div className="note warn">Community exploit flags are {flags.status} on this index right now — the exploited exclusion may be out of date.</div>
      )}

      <div className={`card${q.isPlaceholderData ? ' refetching' : ''}`}>
        {q.isLoading && <div className="empty"><Sk w={240} /></div>}
        {q.isError && <div className="empty">This deploy of the index has no earners board yet — it appears the moment the position-carry job runs.</div>}
        {!q.isLoading && !q.isError && !accounts.length && (
          <div className="empty">{!allChains && chainIds.every((id) => isSvmChain(id))
            ? 'The earners board is not on Solana yet — it ranks what the EVM index can prove.'
            : 'Nothing to rank with these filters.'}</div>
        )}
        <div className="list">
          {data?.by === 'wallet'
            ? wallets.map((r, i) => (
                <a key={r.account} className="row wrow board" href={`#/w/${r.account}`}>
                  <span className={`rank${i < 3 ? ' lead' : ''}`}>{i + 1}</span>
                  <Who account={r.account} profile={profile(r.account)} idx={r} plain
                    sub={
                      <>
                        {usdShort(r.navUsd)} NAV · {r.nCounted} position{r.nCounted === 1 ? '' : 's'}
                        {r.best?.marketName && r.nCounted > 1 && <> · best {r.best.marketName} {pct(r.best.aprPct)}</>}
                        {r.flaggedNavUsd > 0 && <span className="t40"> · {usdShort(r.flaggedNavUsd)} flagged, not counted</span>}
                      </>
                    } />
                  <span className="sp" />
                  <span className="v ok hide-m" title={r.exact ? 'every counted position carries a price and a rate' : 'a position has no rate or price: this is a floor, not a guess'}>
                    {r.exact ? '' : '≈ '}{pct(r.apr24hPct ?? r.netAprPct)}<small>wallet APR</small>
                  </span>
                  <span className="v" title={r.poolRealized7dUsd != null ? `pool yield realized over 7 days: ${usdShort(r.poolRealized7dUsd)} — a token's own appreciation (PT, LST, savings) is in its price, not in this figure` : undefined}>
                    <Money usd={r.perDayUsd} /><small>a day</small>
                  </span>
                  <span onClick={(e) => e.preventDefault()}><FollowButton kind="wallet" target={r.account} small /></span>
                </a>
              ))
            : positions.map((r, i) => {
                const name = r.legs[0]?.marketName ?? r.riskKey
                const wl = r.wallet
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
                    <Flags risk={r.risk} detail={r.riskDetail} />
                    <span className="v ok hide-m" title={r.exact ? 'every leg carries a price and a rate' : 'a leg has no rate or price: this is a floor, not a guess'}>
                      {r.exact ? '' : '≈ '}{pct(r.netAprPct)}
                      <small>{r.apr24hPct != null ? `${pct(r.apr24hPct)} 24h` : 'position APR'}</small>
                    </span>
                    <AccountCell r={r} />
                    <span className="v"><Money usd={r.perDayUsd} /><small>a day</small></span>
                    <span onClick={(e) => e.preventDefault()}><FollowButton kind="wallet" target={r.account} small /></span>
                  </a>
                )
              })}
        </div>
      </div>
    </>
  )
}
