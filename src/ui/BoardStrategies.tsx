/**
 * The board by STRATEGY (docs/board-strategies.md): one row per strategy,
 * its best position as the face, and the group beside it — how many wallets
 * run it, on how much, at what leverage. When one loop pays best, ten wallets
 * running it used to fill half the board; now it is one row that says "12
 * wallets", and the other ideas get the first screen.
 *
 * The row is the strategy: it opens the list of who runs it (`#/board?s=`),
 * its action is Copy (a strategy is something you open; a wallet is something
 * you follow — Follow stays on each holder), and its 💬 is the strategy's own
 * thread (`threadOfBookKey`).
 */
import React from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type * as idx from '../index/api'
import { earnersQuery, useMarket, useProtocols, useStrategyProofs, useVaultsAt } from '../index/queries'
import { useCounts, useProfiles, useStrategyThreads } from '../social/queries'
import { go, marketHref, walletHref } from '../state/AppState'
import { chainLabel } from '../sdk/queries'
import { groupByStrategy, isNewStrategy } from '../model/boardGroups'
import { bookKeyOf, parseLoopKey, protocolKeyOf, threadOfBookKey } from '../model/uid'
import type { Strategy } from '../model/strategies'
import { useMenu } from './useMenu'
import { Comments, Face, Money, Who } from './social-bits'
import { ProtocolLogo, Sk, pct, protocolIconUrls, usdShort } from './bits'
import { Flags, MobileV, PositionRow } from './Board'

type Sort = idx.EarnersSort
const isLifetime = (s: Sort) => s === 'pnl' || s === 'yield'
type ProfileOf = ReturnType<typeof useProfiles>['profile']
const isDebt = (side: string) => side === 'borrow' || side === 'debt'
/** The index names an isolated market after a leg (`Collateral PT-…`, `Loan USDG`): that repeats the title, so the protocol says where instead. */
const tellsMore = (market: string | null) => !!market && !/^(Collateral|Loan|Supply|Borrow)\s/i.test(market)

/** A strategy in words, from its best position's legs: `nOPAL / USDC` loop on `Kamino Nest Market nOPAL`. */
export function strategyTitle(r: idx.EarnerRow, key: string): { name: string; word: string; market: string | null; uid: string | undefined } {
  const held = (uid: string) => r.legs.find((l) => l.marketUid === uid && !isDebt(l.side)) ?? r.legs.find((l) => l.marketUid === uid)
  const lp = parseLoopKey(key)
  if (lp) {
    const h = held(lp.long)
    const d = r.legs.find((l) => l.marketUid === lp.short && isDebt(l.side))
    return { name: `${h?.symbol ?? '?'} / ${d?.symbol ?? '?'}`, word: 'loop', market: h?.marketName ?? null, uid: lp.long }
  }
  if (key.startsWith('dep:')) {
    const h = held(key.slice(4))
    return { name: h?.symbol ?? h?.marketName ?? '?', word: 'deposit', market: h?.marketName ?? null, uid: key.slice(4) }
  }
  return { name: r.legs[0]?.marketName ?? r.riskKey, word: '', market: null, uid: r.marketUids[0] }
}

/** The catalogue row of each strategy key — what Copy opens. Off-menu strategies get no Copy here: their best holder's page has it. */
function useMenuByKey() {
  const menu = useMenu()
  return React.useMemo(() => {
    const m = new Map<string, Strategy>()
    for (const s of [...menu.all, ...menu.hidden, ...menu.overflow] as Strategy[]) {
      const k = bookKeyOf(s)
      if (!k) continue
      if (!m.has(k)) m.set(k, s)
      // EVM refs are hex, their case carries nothing; a base58 key cannot collide on case
      if (!m.has(k.toLowerCase())) m.set(k.toLowerCase(), s)
    }
    return (key: string) => m.get(key) ?? m.get(key.toLowerCase()) ?? null
  }, [menu.all, menu.hidden, menu.overflow])
}

/** The protocols' own names and marks — the same facet the feed's protocol filter reads. */
function useVenueOf() {
  const facets = useProtocols('7d').data
  return React.useMemo(() => {
    const m = new Map((facets?.protocols ?? []).map((f) => [f.protocol, f]))
    return (lenderKey: string) => m.get(protocolKeyOf(lenderKey)) ?? null
  }, [facets])
}

/** A strategy's thread: on its ticket when the menu has it, else on its market's page. */
const talkTo = (st: Strategy | null, uid: string | undefined) => (e: React.MouseEvent) => {
  e.preventDefault()
  if (st) go(st.group, { u: st.asset, s: st.id, k: st.kind, talk: '1' })
  else if (uid) location.hash = marketHref(uid)
}

/** Copy the strategy as `who` runs it — or, off the menu, open their page, whose Copy carries the warning. */
function CopyOrOpen({ st, r }: { st: Strategy | null; r: idx.EarnerRow }) {
  return st
    ? <button type="button" className="btn sm pri copyb" title={`Open ${st.kind === 'loop' ? 'this loop' : 'this deposit'} as a ticket${r.leverage && r.leverage > 1.05 ? ` — the best runs it at ${r.leverage.toFixed(1)}×, you choose your own` : ''}`}
        onClick={() => go(st.group, { u: st.asset, s: st.id, k: st.kind, copy: r.account })}>Copy</button>
    : <a className="btn sm copyb off" href={walletHref(r.account)} title="Not in the menu: copy it from the best holder’s page, with its warning">Open</a>
}

/**
 * A deposit's market when its leg names nothing: `USDG deposit · Morpho` alone
 * does not say whether the money backs a curated vault or one isolated market
 * lent against a tokenized stock. A vault the index has no name for is asked
 * by its share token (`Steakhouse Financial USDG`); an isolated market by its
 * uid, which says the collateral (`against cbBTC`) or failing that the
 * market's own name minus the protocol (`cbBTC-USDC 86`).
 */
function useDepositMarket(t: ReturnType<typeof strategyTitle>, chainId: string, venue: idx.ProtocolFacet | null): string | null {
  const ask = t.word === 'deposit' && !tellsMore(t.market) ? t.uid : undefined
  const vault = !!ask && ask.startsWith('vault.')
  const addr = vault ? ask.split(':')[2] : undefined
  const v = useVaultsAt(addr).data?.vaults.find((x) => x.chainId === chainId && x.name)
  const m = useMarket(vault ? undefined : ask).data
  if (!ask) return null
  if (vault) return v?.name ?? null
  if (m?.collateralSymbol) return `against ${m.collateralSymbol}`
  const own = m?.lenderName?.trim()
  const rest = own && venue?.name && own.startsWith(venue.name) ? own.slice(venue.name.length).trim() : own
  return rest && rest !== t.name && rest !== m?.assetSymbol ? rest : null
}

/** What the row's second line says: protocol · market (when it tells more) · chain · leverage. */
function Where({ r, t, venue, lev }: { r: idx.EarnerRow; t: ReturnType<typeof strategyTitle>; venue: idx.ProtocolFacet | null; lev: string | null }) {
  const named = useDepositMarket(t, r.chainId, venue)
  const market = tellsMore(t.market) ? t.market : named
  return <>{venue?.name && <>{venue.name} · </>}{market && <>{market} · </>}{chainLabel(r.chainId)}{lev && <> · {lev}</>}</>
}

const levRange = (g: idx.StrategyGroup) => {
  const { leverageMin: a, leverageMax: b } = g
  if (a == null || b == null || b <= 1.05) return null
  return Math.abs(b - a) < 0.05 ? `${b.toFixed(1)}×` : `${a.toFixed(1)}–${b.toFixed(1)}×`
}

/**
 * The board's own filters, carried into a strategy's holders: the members of a
 * row ARE the positions those filters let in (the index's rule), and an older
 * index's holders are filtered out of the same top 200 the row was folded from.
 */
export interface HolderFilter { sort: Sort; preset?: 'all'; people: boolean; exposure?: idx.ExposureChip; assetClasses?: string }

/**
 * The strategy rows. `partial`: folded from each index's top 200 (an index
 * that does not group yet), so the holder counts are lifted from the strategy
 * book where it knows more (`/strategies/proof`, every person ≥ $1k a leg).
 */
export function StrategyRows({ rows, sort, partial, filter, profile }: {
  rows: idx.StrategyBoardRow[]
  sort: Sort
  partial: boolean
  filter: HolderFilter
  profile: ProfileOf
}) {
  const copyOf = useMenuByKey()
  const loops = useStrategyThreads()
  const subjects = React.useMemo(
    () => rows.map((r) => threadOfBookKey(r.strategy.key, loops)).filter((s): s is NonNullable<typeof s> => !!s),
    [rows, loops],
  )
  const counts = useCounts(subjects)
  const venueOf = useVenueOf()
  const keyList = partial ? rows.map((r) => r.strategy.key).filter((k) => !k.startsWith('pos:')).join(' ') : ''
  const keys = React.useMemo(() => (keyList ? keyList.split(' ') : []), [keyList])
  const proofs = useStrategyProofs(keys).data
  const [open, setOpen] = React.useState<string | null>(null)
  return (
    <>
      {rows.map((r, i) => {
        const t = threadOfBookKey(r.strategy.key, loops)
        return (
          <StrategyRow key={r.strategy.key} r={r} i={i} sort={sort} profile={profile}
            proof={proofs?.get(r.strategy.key) ?? null} st={copyOf(r.strategy.key)}
            comments={t ? counts.count(t.kind, t.key) : 0} venue={venueOf(r.lenderKey)}
            open={open === r.strategy.key} onToggle={() => setOpen((k) => (k === r.strategy.key ? null : r.strategy.key))}
            filter={filter} />
        )
      })}
    </>
  )
}

function StrategyRow({ r, i, sort, profile, proof, st, comments, venue, open, onToggle, filter }: {
  r: idx.StrategyBoardRow
  venue: idx.ProtocolFacet | null
  i: number
  sort: Sort
  profile: ProfileOf
  proof: idx.StrategyProofRow | null
  st: Strategy | null
  comments: number
  open: boolean
  onToggle: () => void
  filter: HolderFilter
}) {
  const g = r.strategy
  const t = strategyTitle(r, g.key)
  // a book that knows more holders than the folded top 200 did says so — as a floor, like the Start cards
  const lifted = !!proof && proof.wallets > g.wallets
  const wallets = lifted ? proof!.wallets : g.wallets
  const equity = lifted ? Math.max(proof!.equityUsd, g.equityUsd) : g.equityUsd
  const lev = levRange(g)
  const apr = r.apr24hPct ?? r.netAprPct
  const perDay = sort === 'perDay' ? g.perDayUsd : r.perDayUsd
  const others = g.faces.filter((a) => a !== r.account).slice(0, 2)
  const holdersHref = `#/board?s=${encodeURIComponent(g.key)}`
  // one block per strategy — the row, its "more" line and its opened holders share one rule underneath
  return (
    <div className={`srow-g${open ? ' open' : ''}`}>
      <div className="row wrow board srow">
        <span className={`rank${i < 3 ? ' lead' : ''}`}>{i + 1}</span>
        <a className="strat-n" href={holdersHref}>
          <span className="strat-logo"><ProtocolLogo urls={protocolIconUrls(protocolKeyOf(r.lenderKey), venue?.logoUri)} name={venue?.name ?? r.lenderKey} /></span>
          <span className="wn">
            <b>{t.name}{t.word && <span className="t50"> {t.word}</span>}{isNewStrategy(g) && <span className="pill new" title="its first holder on the board opened it less than a week ago">new</span>}</b>
            <small>
              <Where r={r} t={t} venue={venue} lev={lev} />
              {' · '}<span title={lifted ? 'Wallets holding at least $1k in exactly this strategy, read off the chain — smaller holders are not counted, so there are at least this many.' : 'the wallets the board ranks in this strategy with these filters'}>
                {wallets}{lifted ? '+' : ''} wallet{wallets === 1 ? '' : 's'}
              </span> · {usdShort(equity)}
            </small>
          </span>
        </a>
        <a className="strat-best hide-m" href={walletHref(r.account)}>
          <Who account={r.account} profile={profile(r.account)} idx={r} size={22} plain
            sub={<>best{r.leverage != null && r.leverage > 1.05 ? ` · ${r.leverage.toFixed(1)}×` : ''} · {usdShort(r.equityUsd)}</>} />
          {others.length > 0 && <span className="strat-faces">{others.map((a) => <Face key={a} account={a} profile={profile(a)} size={18} />)}</span>}
        </a>
        {/* a cell even when empty: the grid's columns line up row under row */}
        <span className="srow-flags"><Flags risk={r.risk} detail={r.riskDetail} /></span>
        {isLifetime(sort) ? <GroupMade r={r} sort={sort} /> : <>
        <span className="v ok apr hide-m" title={sort === 'apr' ? 'the best position’s 24 h APR — what the board ranks strategies on' : 'the best position’s 24 h APR'}>
          {r.exact ? '' : '≈ '}{pct(apr)}
          <small>{g.positions > 1 && g.aprPct != null ? `avg ${pct(g.aprPct)}` : 'one position'}</small>
        </span>
        <span className="v hide-m" title={sort === 'perDay' ? 'what this strategy pays all its holders a day — what the board ranks strategies on' : 'what the best position earns a day'}>
          <Money usd={perDay} /><small>{sort === 'perDay' ? 'a day, all' : 'a day'}</small>
        </span>
        <MobileV sort={sort} apr={apr} exact={r.exact} perDay={perDay} />
        </>}
        <Comments n={comments} onClick={talkTo(st, t.uid)} />
        <CopyOrOpen st={st} r={r} />
      </div>
      {g.positions > 1 ? (
        <button type="button" className="strat-more linklike" aria-expanded={open} onClick={onToggle}>
          {open ? '▾ hide them' : `▸ ${g.positions - 1} more position${g.positions === 2 ? '' : 's'} on the board run this`}
        </button>
      ) : wallets > 1 && (
        // alone on the board, but the book counts more holders — smaller or flagged stakes the APR board does not rank
        <a className="strat-more" href={holdersHref}>▸ all {wallets}{lifted ? '+' : ''} wallets that hold it</a>
      )}
      {open && <Holders strategyKey={g.key} filter={filter} href={holdersHref} />}
    </div>
  )
}

/**
 * A strategy under a lifetime sort (pos-indexer tickets/0084): what its best holder made, and
 * what all its holders made together — the figure the board ranks strategies on.
 */
function GroupMade({ r, sort }: { r: idx.StrategyBoardRow; sort: Sort }) {
  const g = r.strategy
  const f = r.lifetime
  const all = sort === 'yield' ? g.yieldUsd : g.pnlUsd
  const best = f ? (sort === 'yield' ? f.yieldUsd : f.pnlUsd) : null
  const bestApr = f ? (sort === 'yield' ? f.yieldAprPct : f.pnlAprPct) : null
  const word = sort === 'yield' ? 'yield' : 'PnL'
  const tone = (v: number | null | undefined) => (v == null ? 't40' : v >= 0 ? 'ok' : 'bad')
  return (
    <>
      <span className={`v hide-m ${tone(best)} apr`} title={`the best holder’s lifetime ${word}${sort === 'yield' ? ' — without the money’s own move against the dollar' : ', every price move included'}; its APR on the capital it had at work`}>
        {f?.basis === 'held' ? '≈ ' : ''}{usdShort(best)}<small>{pct(bestApr)} best</small>
      </span>
      <span className={`v hide-m ${tone(all)}`} title={`Σ lifetime ${word} over every holder on the board with a record — what the board ranks strategies on`}>
        {usdShort(all)}<small>{word}, all</small>
      </span>
      <span className={`v only-m ${tone(all)}`}>{usdShort(all)}<small>{word}, all · best {usdShort(best)}</small></span>
    </>
  )
}

/** The holders under an opened strategy row: its top ten positions, the flat board's own rows. */
function Holders({ strategyKey, filter, href }: { strategyKey: string; filter: HolderFilter; href: string }) {
  const q = useQuery({
    ...earnersQuery({ by: 'position', sort: filter.sort, preset: filter.preset, people: filter.people, exposure: filter.exposure, assetClasses: filter.assetClasses, strategyKey, limit: 10 }),
    placeholderData: keepPreviousData,
  })
  const rows = q.data?.by === 'position' ? q.data.rows : []
  const { profile } = useProfiles(rows.map((r) => r.account))
  return (
    <div className="strat-holders">
      {q.isLoading && <div className="empty"><Sk w={200} /></div>}
      {q.isError && <div className="empty">The index is not answering for this strategy right now.</div>}
      {rows.map((r, i) => <PositionRow key={r.key} r={r} sort={filter.sort} profile={profile} rank={<span className="rank">{i + 1}</span>} />)}
      {rows.length >= 10 && <a className="strat-more" href={href}>everyone who runs it ›</a>}
    </div>
  )
}

/**
 * The head of `#/board?s=<key>`: WHICH strategy the list below runs, said
 * once — its rows then only need to say who. Folded from the holders the page
 * already has (the index's `strategyKey=` answer, all one key), with the
 * strategy book's holder count where it knows more.
 */
export function StrategyBanner({ rows, strategyKey, sort, partial, onPerDay }: { rows: idx.EarnerRow[]; strategyKey: string; sort: Sort; partial: boolean; onPerDay: () => void }) {
  const g = React.useMemo(() => groupByStrategy(rows.map((r) => ({ ...r, strategyKey })), sort)[0] ?? null, [rows, strategyKey, sort])
  const copyOf = useMenuByKey()
  const venueOf = useVenueOf()
  const loops = useStrategyThreads()
  const thread = threadOfBookKey(strategyKey, loops)
  const counts = useCounts(thread ? [thread] : [])
  const proof = useStrategyProofs(React.useMemo(() => (strategyKey.startsWith('pos:') ? [] : [strategyKey]), [strategyKey])).data?.get(strategyKey) ?? null
  if (!g) return null
  const t = strategyTitle(g, strategyKey)
  const venue = venueOf(g.lenderKey)
  const st = copyOf(strategyKey)
  const lifted = !!proof && proof.wallets > g.strategy.wallets
  const wallets = lifted ? proof!.wallets : g.strategy.wallets
  const equity = lifted ? Math.max(proof!.equityUsd, g.strategy.equityUsd) : g.strategy.equityUsd
  return (
    <div className="sbanner">
      <span className="strat-logo"><ProtocolLogo urls={protocolIconUrls(protocolKeyOf(g.lenderKey), venue?.logoUri)} name={venue?.name ?? g.lenderKey} /></span>
      <div className="sb-t">
        <small className="t50">Strategy · <a className="pri" href={`#/board?by=strategy${sort === 'perDay' ? '&t=day' : sort === 'apr' ? '&t=apr' : sort === 'yield' ? '&t=yield' : ''}`}>every strategy</a></small>
        <b>{t.name}{t.word && <span className="t50"> {t.word}</span>}{isNewStrategy(g.strategy) && <span className="pill new">new</span>}</b>
        <span className="t50"><Where r={g} t={t} venue={venue} lev={levRange(g.strategy)} /> · {wallets}{lifted ? '+' : ''} wallet{wallets === 1 ? '' : 's'} · {usdShort(equity)}</span>
      </div>
      {isLifetime(sort) ? <>
        <div className="sb-v hide-m"><b className={(g.strategy[sort === 'yield' ? 'yieldUsd' : 'pnlUsd'] ?? 0) >= 0 ? 'ok' : 'bad'}>{usdShort(g.strategy[sort === 'yield' ? 'yieldUsd' : 'pnlUsd'])}</b><small>{sort === 'yield' ? 'yield' : 'PnL'}, all below</small></div>
        <div className="sb-v hide-m"><b><Money usd={g.strategy.perDayUsd} /></b><small>a day now, all below</small></div>
      </> : <>
      <div className="sb-v hide-m"><b className="ok">{pct(g.apr24hPct ?? g.netAprPct)}</b><small>best{g.strategy.positions > 1 && g.strategy.aprPct != null ? ` · avg ${pct(g.strategy.aprPct)}` : ''}</small></div>
      <div className="sb-v hide-m"><b><Money usd={g.strategy.perDayUsd} /></b><small>a day, all below</small></div>
      </>}
      <Comments n={thread ? counts.count(thread.kind, thread.key) : 0} onClick={talkTo(st, t.uid)} />
      <CopyOrOpen st={st} r={g} />
      {/* the book counts holders the APR list leaves out: under $10k, or no exact rate. $/day lists every size */}
      {lifted && wallets > g.strategy.wallets && (partial
        // an index that cannot cut by strategy: the list is whoever of them made its top 200 — every size waits for that index
        ? <small className="sb-gap t50">{wallets}+ wallets hold it; the {g.strategy.wallets} below are the ones in the index’s top 200 positions — the rest show once it lists by strategy.</small>
        : sort === 'apr' && <small className="sb-gap t50">{wallets}+ wallets hold it; this list ranks the {g.strategy.wallets} the APR board does — positions over $10k with an exact rate. <button type="button" className="linklike" onClick={onPerDay}>Every size, by $/day ›</button></small>)}
    </div>
  )
}
