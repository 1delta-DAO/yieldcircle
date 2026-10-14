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
import { earnersQuery, useAssetClasses, useCrowns } from '../index/queries'
import { ClassChip } from './AssetClassFilter'
import { usePaperBoard, useProfiles } from '../social/queries'
import { chainLabel } from '../sdk/queries'
import { CrownIcon, FollowButton, Money, Who, crownTitle } from './social-bits'
import { Sk, pct, usdShort } from './bits'
import { costWord } from './PaperMoves'
import { usePaper } from '../state/Paper'
import { ChainChip } from './ChainPicker'
import { StrategyRows, strategyTitle } from './BoardStrategies'

type Sort = 'perDay' | 'apr'
/** `strategy` is the default (docs/board-strategies.md); `position` the flat list, one row per position */
type By = 'strategy' | 'position' | 'wallet'

/**
 * The exposure chips (pos-indexer tickets/0072): what money a position's
 * supply side is in — a wstETH/USDC loop is ETH, an sUSDe/USDC loop a dollar,
 * and the debt never decides it. `More` is every money without a chip, and
 * mixed or unnamed books. Wallets rank on their book IN that exposure.
 */
const CHIPS: { id: idx.ExposureChip | undefined; word: string; title: string }[] = [
  { id: undefined, word: 'All', title: 'every position' },
  { id: 'usd', word: 'Dollar', title: 'dollars and their savings, PTs and vaults' },
  { id: 'eth', word: 'ETH', title: 'ether and staked ether — whatever is borrowed against it' },
  { id: 'btc', word: 'BTC', title: 'bitcoin wrappers and staked bitcoin' },
  { id: 'sol', word: 'SOL', title: 'SOL and its liquid-staking tokens' },
  { id: 'hype', word: 'HYPE', title: 'HYPE and staked HYPE' },
  { id: 'more', word: 'More', title: 'BNB, AVAX, MON, euro, gold, baskets (JLP, GM) and mixed books' },
]
const chipOf = (x: string | undefined): idx.ExposureChip | undefined =>
  CHIPS.find((c) => c.id === x)?.id
const EXPOSURE_WORD: Record<string, string> = { usd: 'dollar', eth: 'ETH', btc: 'BTC', sol: 'SOL', hype: 'HYPE', more: 'other-money' }
/**
 * The Stocks chip (pos-indexer docs/asset-classes.md): positions whose supply
 * side is tokenized equity — `/earners?assetClasses=stocks`. It rides in the
 * SAME `?x=` as the exposure chips and is exclusive with them: a stock is no
 * money the exposure chips name (its exposure is null), so ETH + Stocks could
 * only ever be empty, and one key keeps one view one URL.
 */
const STOCKS = 'stocks'

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

export function Flags({ risk, detail }: { risk: string[]; detail?: Record<string, unknown> | null }) {
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

/**
 * On a phone the row has room for one value cell, so it carries BOTH metrics:
 * the sorted-by one is the big number, the other is the caption. The desktop
 * cells keep `hide-m`; this one is `only-m`.
 */
export function MobileV({ sort, apr, exact, perDay }: { sort: Sort; apr: number | null; exact: boolean; perDay: number | null }) {
  return sort === 'apr'
    ? (
      <span className={`v only-m${apr != null && apr < 0 ? ' warn' : ' ok'}`}>
        {apr == null ? '—' : <>{exact ? '' : '≈ '}{pct(apr)}</>}
        <small><Money usd={perDay} /> a day</small>
      </span>
    )
    : (
      <span className="v only-m">
        <Money usd={perDay} />
        <small>{apr == null ? '—' : `${exact ? '' : '≈ '}${pct(apr)}`} APR</small>
      </span>
    )
}

interface BoardKey {
  by: By
  sort: Sort
  showAll: boolean
  people: boolean
  chains: string | undefined
  exposure: idx.ExposureChip | undefined
  /** `stocks` under the Stocks chip; never together with `exposure` */
  assetClasses?: string
  /** `#/board?s=<key>`: who runs one strategy */
  strategyKey?: string
}

/**
 * One factory for the board's queries (`earnersQuery`, shared with the Start
 * page), so the page and the idle prefetch ask for byte-identical URLs — the
 * index pre-warms these exact URLs, and the browser cache holds the siblings
 * so a toggle never waits.
 */
const boardQuery = (k: BoardKey) =>
  earnersQuery({ by: k.by, sort: k.sort, preset: k.showAll ? 'all' : undefined, people: k.people, chainIds: k.chains, exposure: k.exposure, assetClasses: k.assetClasses, strategyKey: k.strategyKey })

/**
 * Who wears the crowns for what the board is showing: the overall podium,
 * or one chain's when exactly one chain is picked (pos-indexer 0059). The
 * crowns rank wallet APR on the default view; the board below may be sorted
 * or cut otherwise, so this strip is the podium, not the top of the list.
 */
function Reigning({ scope }: { scope: string }) {
  const q = useCrowns()
  const podium = (q.data?.crowns ?? []).filter((c) => c.scope === scope).sort((a, b) => a.place - b.place)
  const { profile } = useProfiles(podium.map((c) => c.account))
  if (!podium.length) return null
  return (
    <div className="reigning">
      {podium.map((c) => (
        <a key={c.place} className={`reign p${c.place}`} href={`#/w/${c.account}`}
          title={`${crownTitle(c)} since ${new Date(c.since).toLocaleString()} — place ${c.place} of the wallet APR board${scope === 'all' ? '' : ' on this chain, ranked on its positions here alone'}`}>
          <CrownIcon place={c.place} size={18} />
          <span className="reign-t">
            <small>{crownTitle(c)}</small>
            <Who account={c.account} profile={profile(c.account)} size={22} plain sub={<>{pct(c.aprPct)} · {usdShort(c.navUsd ?? 0)}</>} />
          </span>
        </a>
      ))}
    </div>
  )
}

/** The board: the real earners, or the paper accounts (`?by=paper`, tickets/0006) — two components, so a switch never changes one's hooks. */
export function Board(p: { window?: string; by?: string; x?: string; s?: string }) {
  return p.by === 'paper' ? <PaperBoard window={p.window} /> : <RealBoard {...p} />
}

/**
 * The paper board (tickets/0006 §G): paper accounts ranked by what their strategies earned since
 * the start, or by the net APR of what they have at work. Valued by the server at real time — never
 * at anyone's paper clock — and kept apart from the real board: play money never ranks beside money.
 */
function PaperBoard({ window: w }: { window?: string }) {
  const sort = w === 'apr' ? 'apr' : 'return'
  const q = usePaperBoard(sort)
  const rows = q.data?.rows ?? []
  return (
    <>
      <div className="feed-h">
        <h1>Board</h1>
        <span className="sp" />
        <div className="seg">
          <button aria-pressed={false} onClick={() => go('board', {})}>Strategies</button>
          <button aria-pressed={false} onClick={() => go('board', { by: 'wallet' })}>Wallets</button>
          <button aria-pressed onClick={() => go('board', { by: 'paper' })} title="paper accounts: play money on real rates">Paper</button>
        </div>
        <div className="seg">
          <button aria-pressed={sort === 'return'} onClick={() => go('board', { by: 'paper' })} title="what the strategies earned since the start, over what was put in">Return</button>
          <button aria-pressed={sort === 'apr'} onClick={() => go('board', { by: 'paper', t: 'apr' })} title="the net APR of what is at work now">Net APR</button>
        </div>
      </div>
      <div className="note"><span className="pill paper">paper</span> Paper accounts, ranked by what their <b>strategies</b> earned — not what the gas coins did, and net of every fee, swap and bridge it took to get there — valued hourly by the server at real rates and real time. A book shows once it is a day old with $1,000 at work. <a className="pri" href="#/">Start one ›</a></div>
      <div className={`card board-paper${q.isFetching && q.data ? ' refetching' : ''}`}>
        {q.isLoading && <div className="empty"><Sk w={240} /></div>}
        {q.isError && <div className="empty">The paper board is not answering right now.</div>}
        {!q.isLoading && !q.isError && !rows.length && <div className="empty">No paper books yet — be the first.</div>}
        <div className="list">
          {rows.map((r, i) => (
            <a key={r.account} className="row wrow board" href={`#/w/${r.account}`}>
              <span className={`rank${i < 3 && !r.warming ? ' lead' : ''}`}>{r.warming ? '·' : i + 1}</span>
              <Who account={r.account} plain profile={{ account: r.account, handle: r.handle, displayName: r.displayName, bio: null, avatarUrl: null, tags: r.tags ?? [], visibility: 'public' }}
                sub={<>{usdShort(r.deployedUsd)} at work · {r.positions} position{r.positions === 1 ? '' : 's'}{r.chains.length ? ` · ${r.chains.slice(0, 3).map(chainLabel).join(', ')}${r.chains.length > 3 ? ` +${r.chains.length - 3}` : ''}` : ''}{r.warming ? <span className="t40"> · warming up</span> : null}{r.worstHealth != null && r.worstHealth < 1 ? <span className="liq-warn"> · would have been liquidated</span> : null}</>} />
              <span className="sp" />
              <span className={`v apr ${r.returnPct >= 0 ? 'ok' : 'bad'}`}>{pct(r.returnPct, 3)}<small>return</small></span>
              <span className="v hide-m">{pct(r.netAprPct)}<small>net APR</small></span>
              {r.frictionUsd != null && <span className="v hide-m" title="What getting money to work has cost: swaps, bridges, network fees, loop entries and exits. Already inside the return.">{r.frictionUsd > 0 ? `−${costWord(r.frictionUsd)}` : '$0'}<small>friction</small></span>}
            </a>
          ))}
        </div>
      </div>
    </>
  )
}

function RealBoard({ window: w, by: b, x, s: strategyKey }: { window?: string; by?: string; x?: string; s?: string }) {
  // on a paper account the board that ranks you is the paper one — said up front, one tap away
  const onPaper = usePaper().active
  const { chainIds, allChains } = useApp()
  const sort: Sort = w === 'day' ? 'perDay' : 'apr'
  // `?s=` lists one strategy's holders: the flat rows, cut by the index to that key
  const by: By = strategyKey ? 'position' : b === 'wallet' ? 'wallet' : b === 'position' ? 'position' : 'strategy'
  // a strategy names its own money, so the chips do not cut its holders
  const stocks = !strategyKey && x === STOCKS
  const exposure = stocks || strategyKey ? undefined : chipOf(x)
  const [showAll, setShowAll] = React.useState(false)
  const [contracts, setContracts] = React.useState(false)
  const chains = allChains ? undefined : chainIds.join(',')
  const key: BoardKey = { by, sort, showAll, people: !contracts, chains, exposure, assetClasses: stocks ? STOCKS : undefined, strategyKey }
  // the Stocks chip exists where an index answers the class facet; the board waits for that answer
  // under it, because it is also how `api.ts` knows the cut will be honoured rather than ignored
  const classes = useAssetClasses('7d', chains)
  const canStocks = !!classes.data?.supported

  const q = useQuery({ ...boardQuery(key), placeholderData: keepPreviousData, enabled: !stocks || !classes.isLoading })
  const loading = q.isLoading || (stocks && classes.isLoading && !q.data)

  // the sibling views (other sort, other unit, the main chips) on idle, once
  // this one has painted — so every toggle is answered from the browser's cache
  const qc = useQueryClient()
  const painted = !!q.data && !q.isPlaceholderData
  React.useEffect(() => {
    if (!painted) return
    const other: By = by === 'wallet' ? 'strategy' : 'wallet'
    const siblings: BoardKey[] = strategyKey ? [{ ...key, sort: sort === 'apr' ? 'perDay' : 'apr' }] : [
      { ...key, sort: sort === 'apr' ? 'perDay' : 'apr' },
      { ...key, by: other },
      { ...key, by: other, sort: sort === 'apr' ? 'perDay' : 'apr' },
      // the chips the index pre-warms, for this view: a tap on one is a cache hit
      ...(['eth', 'usd', 'btc'] as const).filter((e) => e !== exposure).map((e) => ({ ...key, exposure: e, assetClasses: undefined })),
      ...(exposure || stocks ? [{ ...key, exposure: undefined, assetClasses: undefined }] : []),
    ]
    const run = () => siblings.forEach((s) => void qc.prefetchQuery(boardQuery(s)))
    // Safari has no requestIdleCallback
    const ric = typeof requestIdleCallback === 'function'
    const id = ric ? requestIdleCallback(run, { timeout: 2000 }) : setTimeout(run, 300)
    return () => (ric ? cancelIdleCallback(id as number) : clearTimeout(id as ReturnType<typeof setTimeout>))
  }, [painted, by, sort, showAll, contracts, chains, exposure, stocks, strategyKey])

  const data = q.data
  const positions = data?.by === 'position' ? data.rows : []
  const wallets = data?.by === 'wallet' ? data.rows : []
  const strategies = data?.by === 'strategy' ? data.rows : []
  const accounts = data?.by === 'wallet' ? wallets.map((r) => r.account)
    : data?.by === 'strategy' ? strategies.map((r) => r.account)
    : positions.map((r) => r.account)
  // the faces beside each strategy's best ask for their profiles in the same request
  const { profile } = useProfiles([...accounts, ...strategies.flatMap((r) => r.strategy.faces)])
  const partial = !!data?.partial
  const hidden = Object.entries(data?.hidden ?? {})
  const flags = data?.ratingFlags
  // the podium for this view: one chain picked → that chain's, else overall
  const scope = !allChains && chainIds.length === 1 ? chainIds[0] : 'all'
  const crowns = useCrowns().data?.crowns
  // the crowns are the whole-wallet board's: never worn inside an exposure cut
  const crownOf = (a: string) => (exposure || stocks || strategyKey ? undefined : crowns?.find((c) => c.scope === scope && c.account === a.toLowerCase()))
  // a wallet with several positions on the list wears it on its first row only
  const firstRow = new Map<string, number>()
  accounts.forEach((a, i) => { if (!firstRow.has(a)) firstRow.set(a, i) })
  const rank = (a: string, i: number) => {
    const c = firstRow.get(a) === i ? crownOf(a) : undefined
    return c
      ? <span className="rank lead crowned" title={crownTitle(c)}><CrownIcon place={c.place} size={16} /></span>
      : <span className={`rank${i < 3 ? ' lead' : ''}`}>{i + 1}</span>
  }
  const nav = (p: { t?: Sort; by?: By; x?: idx.ExposureChip | typeof STOCKS | null }) =>
    go('board', {
      t: (p.t ?? sort) === 'perDay' ? 'day' : undefined,
      by: (p.by ?? by) === 'strategy' ? undefined : (p.by ?? by),
      x: p.x === null ? undefined : (p.x ?? (stocks ? STOCKS : exposure)),
    })
  const inWord = stocks ? 'tokenized-stock' : exposure ? EXPOSURE_WORD[exposure] : null

  return (
    <>
      <div className="feed-h">
        <h1>Board</h1>
        <span className="sp" />
        <ChainChip />
        <div className="seg">
          <button aria-pressed={by === 'strategy'} onClick={() => nav({ by: 'strategy' })} title="one row per strategy, its best position as the face — every position is one tap away">Strategies</button>
          <button aria-pressed={by === 'wallet'} onClick={() => nav({ by: 'wallet' })} title="one row per wallet: its net APR across every position, weighted by NAV">Wallets</button>
          <button aria-pressed={false} onClick={() => go('board', { by: 'paper' })} title="paper accounts: play money on real rates">Paper</button>
        </div>
        <div className="seg">
          <button aria-pressed={sort === 'apr'} onClick={() => nav({ t: 'apr' })} title={by === 'wallet' ? 'highest net APR — exact wallets over $10k NAV only' : 'highest net APR — exact positions over $10k equity only'}>APR</button>
          <button aria-pressed={sort === 'perDay'} onClick={() => nav({ t: 'perDay' })} title="most dollars a day at today’s rates">$/day</button>
        </div>
      </div>

      <div className="denoms" role="group" aria-label="What the position is held in">
        <span className="denoms-lbl t50">Held in</span>
        {CHIPS.map((c) => (
          <button key={c.word} className="dchip" aria-pressed={!stocks && exposure === c.id} title={c.title} onClick={() => nav({ x: c.id ?? null })}>{c.word}</button>
        ))}
        {(canStocks || stocks) && (
          <button className="dchip" aria-pressed={stocks} onClick={() => nav({ x: STOCKS })}
            title="tokenized stocks, ETFs and pre-IPO shares — whatever is borrowed against them">Stocks</button>
        )}
      </div>

      <div className="note">
        {stocks ? (by === 'wallet'
          ? <>Wallets with positions whose supply side is <b>tokenized stock</b> — never what they borrow. </>
          : <>Positions whose supply side is <b>tokenized stock</b> (stocks, ETFs, pre-IPO) — what is borrowed against it does not decide. </>)
        : inWord && (by === 'wallet'
          ? <>Each wallet is ranked on its <b>{inWord}</b> book alone — the positions whose supply side is {inWord}, never what they borrow. </>
          : <>Positions whose supply side is <b>{inWord}</b> — what is borrowed against it does not decide. </>)}
        {by === 'wallet' ? (
          <>
            What wallets <b>earn now</b>: every position’s net carry weighted by its equity — Σ yearly carry ÷ Σ NAV, at today’s rates.
            {showAll
              ? ' Every position counts.'
              : <> Positions whose rate is not a yield anyone can take home are left out of each total{hidden.length > 0 && <> ({hidden.map(([f, n]) => `${f} in ${n}`).join(' · ')} wallets)</>}.</>}
          </>
        ) : by === 'strategy' ? (
          <>
            What strategies <b>earn now</b>: positions folded by what they run, {sort === 'apr'
              ? <>ranked by the best position in each — its holders’ average beside it</>
              : <>ranked by what each pays all its holders a day</>}, at today’s rates.
            {partial && <span className="t50"> Folded from each index’s top 200 positions — an index that does not group yet — so a strategy with no position that high is missing.</span>}
            {showAll
              ? ' Every position counts, flagged.'
              : <> Positions whose rate is not a yield anyone can take home are left out{hidden.length > 0 && <> ({hidden.map(([f, n]) => `${f} ${n}`).join(' · ')})</>}.</>}
          </>
        ) : (
          <>
            {strategyKey
              ? <>Who runs <b>{positions[0] ? strategyTitle(positions[0], strategyKey).name : 'this strategy'}</b>{positions[0]?.legs.length ? ` ${strategyTitle(positions[0], strategyKey).word}` : ''}{positions[0] && <> on {chainLabel(positions[0].chainId)}</>}, ranked — <a className="pri" href="#/board">every strategy</a>.{data?.partial && <span className="t50"> From the index’s top 200 positions: it does not cut by strategy yet.</span>} </>
              : <>Every position, one row each — <a className="pri" href={`#/board${sort === 'perDay' ? '?t=day' : ''}`}>fold them by strategy</a>. </>}
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
        {by === 'strategy' && <>{' · '}<button className="linklike" onClick={() => nav({ by: 'position' })}>every position</button></>}
        . Wallets that marked themselves unlisted are not here.
      </div>
      {onPaper && <div className="paper-card" style={{ marginBottom: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="pill paper">paper</span>
        <span className="t70" style={{ fontSize: 13, flex: 1, minWidth: 200 }}>This board ranks real money. Paper accounts are ranked on their own board.</span>
        <button className="btn paper sm" onClick={() => go('board', { by: 'paper' })}>See the paper board</button>
      </div>}
      <Reigning scope={scope} />
      {flags && flags.status !== 'ok' && (
        <div className="note warn">Community exploit flags are {flags.status} on this index right now — the exploited exclusion may be out of date.</div>
      )}

      <div className={`card${q.isPlaceholderData ? ' refetching' : ''}`}>
        {loading && <div className="empty"><Sk w={240} /></div>}
        {q.isError && <div className="empty">{stocks
          ? 'This deploy of the index cannot cut the board by asset class yet — All still works.'
          : exposure
          ? 'This deploy of the index cannot cut the board by what positions are held in yet — All still works.'
          : 'This deploy of the index has no earners board yet — it appears the moment the position-carry job runs.'}</div>}
        {!loading && !q.isError && !accounts.length && (
          <div className="empty">{!allChains && chainIds.every((id) => isSvmChain(id))
            ? 'Nothing on Solana to rank with these filters.'
            : inWord ? `No ${inWord} positions to rank with these filters.` : 'Nothing to rank with these filters.'}</div>
        )}
        <div className="list">
          {data?.by === 'strategy'
            ? <StrategyRows rows={strategies} sort={sort} partial={partial} profile={profile}
                filter={{ sort, preset: showAll ? 'all' : undefined, people: !contracts, exposure, assetClasses: key.assetClasses }} />
            : data?.by === 'wallet'
            ? wallets.map((r, i) => (
                <a key={r.account} className="row wrow board" href={`#/w/${r.account}`}>
                  {rank(r.account, i)}
                  <Who account={r.account} profile={profile(r.account)} idx={r} plain
                    sub={
                      <>
                        {usdShort(r.navUsd)} {inWord ? `in ${inWord}` : 'NAV'} · {r.nCounted} position{r.nCounted === 1 ? '' : 's'}
                        {inWord && r.wallet && r.wallet.navUsd > r.navUsd * 1.005 && <span className="t40"> · of {usdShort(r.wallet.navUsd)} at {pct(r.wallet.apr24hPct ?? r.wallet.netAprPct)}</span>}
                        {r.best?.marketName && r.nCounted > 1 && <> · best {r.best.strategyKey
                          ? <span className="mono" title="who else runs this strategy" onClick={(e) => { e.preventDefault(); e.stopPropagation(); go('board', { s: r.best!.strategyKey }) }}>{r.best.marketName}</span>
                          : r.best.marketName} {pct(r.best.aprPct)}</>}
                        {r.flaggedNavUsd > 0 && <span className="t40"> · {usdShort(r.flaggedNavUsd)} flagged, not counted</span>}
                      </>
                    } />
                  <span className="sp" />
                  <span className="v ok apr hide-m" title={r.exact ? 'every counted position carries a price and a rate' : 'a position has no rate or price: this is a floor, not a guess'}>
                    {r.exact ? '' : '≈ '}{pct(r.apr24hPct ?? r.netAprPct)}<small>wallet APR</small>
                  </span>
                  <span className="v hide-m" title={r.poolRealized7dUsd != null ? `pool yield realized over 7 days: ${usdShort(r.poolRealized7dUsd)} — a token's own appreciation (PT, LST, savings) is in its price, not in this figure` : undefined}>
                    <Money usd={r.perDayUsd} /><small>a day</small>
                  </span>
                  <MobileV sort={sort} apr={r.apr24hPct ?? r.netAprPct} exact={r.exact} perDay={r.perDayUsd} />
                  <span onClick={(e) => e.preventDefault()}><FollowButton kind="wallet" target={r.account} small /></span>
                </a>
              ))
            : positions.map((r, i) => <PositionRow key={r.key} r={r} sort={sort} profile={profile} rank={rank(r.account, i)} />)}
        </div>
      </div>
    </>
  )
}

/** One position on the board: the flat list's row, and a strategy's holders under its opened row. */
export function PositionRow({ r, sort, profile, rank }: { r: idx.EarnerRow; sort: Sort; profile: ReturnType<typeof useProfiles>['profile']; rank: React.ReactNode }) {
  const name = r.legs[0]?.marketName ?? r.riskKey
  return (
    <a className="row wrow board" href={`#/w/${r.account}`} title="open this wallet — the position’s PnL history is a click on its row there">
      {rank}
      <Who account={r.account} profile={profile(r.account)} idx={r} plain
        sub={
          <>
            <span className="mono" onClick={(e) => { e.preventDefault(); e.stopPropagation(); location.hash = marketHref(r.marketUids[0]) }}>{name}</span>
            {' '}<ClassChip x={r.assetClass ? r : r.legs.find((l) => l.side !== 'borrow' && l.assetClass)} />
            {r.marketUids.length > 1 && <> +{r.marketUids.length - 1}</>}
            {r.leverage != null && r.leverage > 1.05 && <> · {r.leverage.toFixed(1)}×</>}
            {' · '}{usdShort(r.equityUsd)} equity
          </>
        } />
      <span className="sp" />
      <Flags risk={r.risk} detail={r.riskDetail} />
      <span className="v ok apr hide-m" title={`${r.apr24hPct != null ? 'the 24 h mean — what the board ranks on; ' : ''}${r.exact ? 'every leg carries a price and a rate' : 'a leg has no rate or price: this is a floor, not a guess'}`}>
        {r.exact ? '' : '≈ '}{pct(r.apr24hPct ?? r.netAprPct)}
        <small>{r.apr24hPct != null ? `${pct(r.netAprPct)} now` : 'position APR'}</small>
      </span>
      <AccountCell r={r} />
      <span className="v hide-m"><Money usd={r.perDayUsd} /><small>a day</small></span>
      <MobileV sort={sort} apr={r.apr24hPct ?? r.netAprPct} exact={r.exact} perDay={r.perDayUsd} />
      <span onClick={(e) => e.preventDefault()}><FollowButton kind="wallet" target={r.account} small /></span>
    </a>
  )
}
