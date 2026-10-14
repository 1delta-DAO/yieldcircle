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
import { earnersQuery, useProtocols, useStrategyProofs } from '../index/queries'
import { useCounts, useProfiles, useStrategyThreads } from '../social/queries'
import { go, marketHref, walletHref } from '../state/AppState'
import { chainLabel } from '../sdk/queries'
import { isNewStrategy } from '../model/boardGroups'
import { bookKeyOf, parseLoopKey, protocolKeyOf, threadOfBookKey } from '../model/uid'
import type { Strategy } from '../model/strategies'
import { useMenu } from './useMenu'
import { Comments, Face, Money, Who } from './social-bits'
import { ProtocolLogo, Sk, pct, protocolIconUrls, usdShort } from './bits'
import { Flags, MobileV, PositionRow } from './Board'

type Sort = 'perDay' | 'apr'
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
  // the protocols' own names and marks — the same facet the feed's protocol filter reads
  const facets = useProtocols('7d').data
  const venueOf = React.useMemo(() => {
    const m = new Map((facets?.protocols ?? []).map((f) => [f.protocol, f]))
    return (lenderKey: string) => m.get(protocolKeyOf(lenderKey)) ?? null
  }, [facets])
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
  const talk = (e: React.MouseEvent) => {
    e.preventDefault()
    if (st) go(st.group, { u: st.asset, s: st.id, k: st.kind, talk: '1' })
    else if (t.uid) location.hash = marketHref(t.uid)
  }
  return (
    <>
      <div className={`row wrow board srow${open ? ' open' : ''}`}>
        <span className={`rank${i < 3 ? ' lead' : ''}`}>{i + 1}</span>
        <a className="strat-n" href={holdersHref} title="who runs this strategy, ranked">
          <span className="strat-logo"><ProtocolLogo urls={protocolIconUrls(protocolKeyOf(r.lenderKey), venue?.logoUri)} name={venue?.name ?? r.lenderKey} /></span>
          <span className="wn">
            <b>{t.name}{t.word && <span className="t50"> {t.word}</span>}{isNewStrategy(g) && <span className="pill new" title="its first holder on the board opened it less than a week ago">new</span>}</b>
            <small>
              {venue?.name && <>{venue.name} · </>}{tellsMore(t.market) && <>{t.market} · </>}{chainLabel(r.chainId)}{lev && <> · {lev}</>}
              {' · '}<span title={lifted ? 'Wallets holding at least $1k in exactly this strategy, read off the chain — smaller holders are not counted, so there are at least this many.' : 'the wallets the board ranks in this strategy with these filters'}>
                {wallets}{lifted ? '+' : ''} wallet{wallets === 1 ? '' : 's'}
              </span> · {usdShort(equity)}
            </small>
          </span>
        </a>
        <a className="strat-best hide-m" href={walletHref(r.account)} title="the best position in this strategy — open the wallet">
          <Who account={r.account} profile={profile(r.account)} idx={r} size={22} plain
            sub={<>best{r.leverage != null && r.leverage > 1.05 ? ` · ${r.leverage.toFixed(1)}×` : ''} · {usdShort(r.equityUsd)}</>} />
          {others.length > 0 && <span className="strat-faces">{others.map((a) => <Face key={a} account={a} profile={profile(a)} size={18} />)}</span>}
        </a>
        <span className="sp" />
        <Flags risk={r.risk} detail={r.riskDetail} />
        <span className="v ok apr hide-m" title={sort === 'apr' ? 'the best position’s 24 h APR — what the board ranks strategies on' : 'the best position’s 24 h APR'}>
          {r.exact ? '' : '≈ '}{pct(apr)}
          <small>{g.positions > 1 && g.aprPct != null ? `avg ${pct(g.aprPct)}` : 'one position'}</small>
        </span>
        <span className="v hide-m" title={sort === 'perDay' ? 'what this strategy pays all its holders a day — what the board ranks strategies on' : 'what the best position earns a day'}>
          <Money usd={perDay} /><small>{sort === 'perDay' ? 'a day, all' : 'a day'}</small>
        </span>
        <MobileV sort={sort} apr={apr} exact={r.exact} perDay={perDay} />
        <Comments n={comments} onClick={talk} />
        {st
          ? <button type="button" className="btn sm pri copyb" title={`Open ${st.kind === 'loop' ? 'this loop' : 'this deposit'} as a ticket${r.leverage && r.leverage > 1.05 ? ` — the best runs it at ${r.leverage.toFixed(1)}×, you choose your own` : ''}`}
              onClick={() => go(st.group, { u: st.asset, s: st.id, k: st.kind, copy: r.account })}>Copy</button>
          : <a className="btn sm copyb off" href={walletHref(r.account)} title="Not in the menu: copy it from the best holder’s page, with its warning">Open</a>}
      </div>
      {g.positions > 1 && (
        <button type="button" className="strat-more linklike" aria-expanded={open} onClick={onToggle}>
          {open ? '▾ hide them' : `▸ ${g.positions - 1} more position${g.positions === 2 ? '' : 's'} on the board run this`}
        </button>
      )}
      {open && <Holders strategyKey={g.key} filter={filter} href={holdersHref} />}
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
