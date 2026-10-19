import React from 'react'
import { GROUPS, nameOf, type Group, type GroupId } from '../model/assets'
import { go } from '../state/AppState'
import { useBook } from './useBook'
import { GroupIcon, Sk, Tok, amt, deskLogos, pct, usd, usdShort } from './bits'
import type { AssetBook } from '../model/positions'
import type { Strategy } from '../model/strategies'
import { isSavings } from '../model/nature'
import { BACKEND_BASE_URL } from '../config/backend'
import { ChainChip } from './ChainPicker'
import { useRateHistory } from '../sdk/queries'
import { steadyRate, type HistoryGet } from '../model/rateHistory'
import { Avg30 } from './Spark'
import { useBorrowOffers } from '../sdk/queries'
import { useApp } from '../state/AppState'
import type { BorrowOffer } from '../model/borrow'
import { borrowRoom } from './BorrowList'
import { canonUid } from '../model/uid'
import { softHide } from '../model/visibility'
import { useSettings } from '../state/Settings'

/**
 * Earn: a digest, not an index. Four group tiles (your money there, the best rate, how many
 * strategies), then the reader's own assets and what each could earn, then the best desk per
 * row across all groups. The full per-desk listing lives on each group's page, one tap away.
 *
 * It was the whole catalogue on one page — every desk of every group, banded by whose credit
 * ("Issued dollars", "Yield desks") — which after the regrouping ran to ~70 rows and four screens
 * of scrolling on a phone. The bands went with the big table; a group page's chips are the desk
 * index now, and a digest row carries its group as a small tag instead.
 *
 * Earn is "deposit, and earn on it"; borrowing has its own tab since tickets/0011, so nothing
 * here quotes a borrow rate. Two things still point across: a held asset's row says how much could
 * be taken out against it ("or borrow up to"), and the Stocks tile is the shelf's LEND side — the
 * dollars lent to the people who put stocks up, which is earning.
 */
export function Earn() {
  const b = useBook()
  const { chainIds } = useApp()
  const bo = useBorrowOffers(chainIds)
  // the whole menu's 30-day history (shared cache: the group pages and the
  // ticket read the same answers), once the catalogue has settled
  const get = useRateHistory(b.all, !b.isFetching)
  // ranked on the STEADY rate: a desk whose best row is a one-night spike is
  // ranked by what that row has paid over the month, not by tonight
  const rank = (s: Strategy) => steadyRate(s, get)
  // the best strategy per desk row, and how many sit behind it
  const bestBy = new Map<string, Strategy>(); const countBy = new Map<string, number>()
  // a saving beats a market-exposure row (a perp LP, a managed fund) whatever the rates: the digest's
  // "best rate" is read as interest, and JLP's is not
  for (const s of b.all) {
    countBy.set(s.asset, (countBy.get(s.asset) ?? 0) + 1)
    const cur = bestBy.get(s.asset); if (!cur || savingsFirst(s, cur, rank) > 0) bestBy.set(s.asset, s)
  }
  // top desks the reader does NOT hold (the held ones lead their own section above) — savings only
  const held = new Set(b.books.map((x) => x.asset))
  const top = [...bestBy.values()].filter((s) => !held.has(s.asset) && isSavings(s.nature)).sort((x, y) => rank(y) - rank(x)).slice(0, 6)
  return (
    <>
      <div className="feed-h earn-h">
        <h1>Earn</h1>
        <span className="sub t50 hide-m">deposit, and earn on it</span>
        <span className="sp" />
        <ChainChip />
      </div>
      {b.errors.length > 0 && !b.anyData && <div className="err">The listing could not be loaded from <b>{new URL(BACKEND_BASE_URL).host}</b>: {b.errors[0].message}{/portal\.1delta\.io/.test(BACKEND_BASE_URL) && <><br /><span className="t70">This build is on the public, per-IP rate-limited endpoint. Unset <code>VITE_BACKEND_BASE_URL</code> to use the credited default, then rebuild.</span></>}</div>}
      <nav className="tiles" aria-label="Asset groups" style={{ marginTop: 16 }}>
        {GROUPS.map((g) => g.id === 'STOCKS'
          ? <StockTile key={g.id} g={g} offers={bo.offers.filter((o) => o.group === 'STOCKS')} earn={b.earnAll} books={b.books.filter((x) => x.group === g.id)} loading={bo.isLoading || b.isLoading} />
          : <GroupTile key={g.id} g={g} strategies={b.all.filter((s) => s.group === g.id)} books={b.books.filter((x) => x.group === g.id)} loading={b.isLoading} rank={rank} get={get} />)}
      </nav>
      {b.books.length > 0 && (
        <section className="sec">
          <div className="sec-h"><h2>Your money</h2><span className="sub">what each asset could earn</span></div>
          <div className="card"><table className="tbl slim"><tbody>
            {b.books.map((x) => <BookRow key={x.asset} x={x} best={bestBy.get(x.asset)} get={get} room={borrowRoom(x.asset, b.idlePerChain, bo.offers)} />)}
          </tbody></table></div>
        </section>
      )}
      <section className="sec">
        <div className="sec-h"><h2>Best rates</h2><span className="sub">the top desk of every group’s listing</span></div>
        <div className="card"><table className="tbl slim"><tbody>
          {b.isLoading && !top.length && [0, 1, 2, 3].map((i) => <tr key={i}><td><Sk w={140} /></td><td className="r"><Sk w={90} /></td><td /></tr>)}
          {top.map((s) => <TopRow key={s.asset} s={s} n={countBy.get(s.asset) ?? 0} get={get} />)}
        </tbody></table></div>
      </section>
      <section className="sec"><div className="note"><b>Live.</b> Rates and sizes come from the 1delta API (plain deposits from the earn listing, loops from the pair optimizer), filtered to base assets, low-to-medium risk and real size. Each group’s page lists every desk and strategy, and says how many rows the floors are holding back; Filters in your profile menu (top left) move them. A loop is opened in one flash-funded transaction.</div></section>
    </>
  )
}

/** One group: your money in it, the best it pays, and the door to its full listing. */
function GroupTile({ g, strategies, books, loading, rank, get }: { g: Group; strategies: Strategy[]; books: AssetBook[]; loading: boolean; rank: (s: Strategy) => number; get: HistoryGet }) {
  const total = books.reduce((a, x) => a + x.totalUsd, 0)
  const best = strategies.length ? strategies.reduce((m, s) => (savingsFirst(s, m, rank) > 0 ? s : m)) : null
  const busy = loading && !strategies.length
  return (
    <a className="tile" href={`#/${g.id}`} style={{ '--gc': g.color } as React.CSSProperties}>
      <div className="h"><GroupIcon id={g.id} color={g.color} size={22} /><span className="n">{g.id === 'MORE' ? 'More' : g.name}</span></div>
      <div className={`v${total ? '' : ' t40'}`}>{busy ? <Sk w={64} h={15} /> : total ? usd(total) : '—'}</div>
      <div className="ft">
        <span>{best ? <><span className="t50">up to </span><b className="ok">{pct(best.rate)}</b><Avg30 s={best} get={get} prefix=" · 30d " /></> : busy ? <Sk w={70} /> : <span className="t40">—</span>}</span>
        <small>{busy ? '…' : `${strategies.length} strateg${strategies.length === 1 ? 'y' : 'ies'} ›`}</small>
      </div>
    </a>
  )
}

/** > 0 when `a` should lead `b`: a saving first, then the steadier rate. */
const savingsFirst = (a: Strategy, b: Strategy, rank: (s: Strategy) => number) =>
  Number(isSavings(a.nature)) - Number(isSavings(b.nature)) || rank(a) - rank(b)

/** An asset the reader holds: the balance as it stands, the best rate waiting for it — and, where a market lends against it, how much it could raise. */
function BookRow({ x, best, get, room }: { x: AssetBook; best: Strategy | undefined; get: HistoryGet; room: number }) {
  return (
    <tr onClick={() => go(x.group, { u: x.asset, k: best?.kind ?? (room >= 1 ? 'borrow' : undefined) })}>
      <td><div className="nm"><Tok sym={x.asset} logo={deskLogos(x.asset, best?.tokenLogo)} />{nameOf(x.asset)}<GroupTag gid={x.group} className="hide-m" /></div></td>
      <td className="r">{amt(x.asset, (x.idle?.amount ?? 0) + (x.idle?.price ? x.atWorkUsd / x.idle.price : 0), x.totalUsd)}{x.atWorkUsd ? <small className="ok">{pct(x.blended)} on {Math.round(x.atWorkUsd / x.totalUsd * 100)}%</small> : <small className="t40">idle</small>}</td>
      <td className="r upto">{best ? <><span className="t50">up to</span> <span className={best.rate >= 3 ? 'ok' : ''}>{pct(best.rate)}</span><small>{best.kind === 'loop' ? `${best.rec}× loop` : 'deposit'}<Avg30 s={best} get={get} prefix=" · 30d " />{room >= 1 && <span className="hide-m"> · or borrow up to {usdShort(room)}</span>}</small></> : room >= 1 ? <><span className="t50">borrow up to</span> <span>{usdShort(room)}</span><small>without selling</small></> : <span className="t40">—</span>}</td>
      <td className="r t40" style={{ width: 20 }}>›</td>
    </tr>
  )
}

/**
 * The Stocks tile, in Earn: the shelf's lend side — dollars lent into the markets where people
 * borrow against tokenized stocks (Kamino xStocks' USDC, Aave's stock hub). Their stocks back the
 * loan; the rate is what they pay. The loans themselves are on the Borrow tab.
 */
function StockTile({ g, offers, earn, books, loading }: { g: Group; offers: BorrowOffer[]; earn: Strategy[]; books: AssetBook[]; loading: boolean }) {
  const { st } = useSettings()
  const rows = React.useMemo(() => {
    const debts = new Set(offers.filter((o) => o.out === 'USD').map((o) => canonUid(o.debt.uid)).filter((k): k is string => !!k))
    const seen = new Set<string>()
    return earn.filter((s) => s.kind === 'simple' && !!s.marketUid && debts.has(canonUid(s.marketUid) ?? '') && softHide(s, st) == null && !seen.has(s.id) && !!seen.add(s.id))
  }, [offers, earn, st])
  const best = rows.reduce<Strategy | null>((m, s) => (!m || s.rate > m.rate ? s : m), null)
  const total = books.reduce((a, x) => a + x.totalUsd, 0)
  const busy = loading && !rows.length
  return (
    <a className="tile stocks" href="#/STOCKS?k=simple" style={{ '--gc': g.color } as React.CSSProperties}>
      <div className="h"><GroupIcon id={g.id} color={g.color} size={22} /><span className="n">{g.name}</span><span className="pill new">new</span></div>
      <div className={`v${total ? '' : ' t40'}`}>{busy ? <Sk w={64} h={15} /> : total ? usd(total) : '—'}</div>
      <div className="ft">
        <span>{best ? <><span className="t50">lend up to </span><b className="ok">{pct(best.rate)}</b></> : busy ? <Sk w={70} /> : <span className="t40">—</span>}</span>
        <small>{busy ? '…' : `${rows.length} market${rows.length === 1 ? '' : 's'} to lend to ›`}</small>
      </div>
    </a>
  )
}

/** A desk worth a look: its best strategy, tagged with the group it sits in. */
function TopRow({ s, n, get }: { s: Strategy; n: number; get: HistoryGet }) {
  return (
    <tr onClick={() => go(s.group, { u: s.asset, k: s.kind })}>
      <td><div className="nm"><Tok sym={s.asset} logo={deskLogos(s.asset, s.tokenLogo)} />{nameOf(s.asset)}<GroupTag gid={s.group} /></div></td>
      <td className="r upto"><span className="t50">up to</span> <span className={s.rate >= 3 ? 'ok' : ''}>{pct(s.rate)}</span><small>{s.kind === 'loop' ? `${s.rec}× loop` : 'deposit'}<Avg30 s={s} get={get} prefix=" · 30d " /><span className="hide-m"> · {n} strateg{n !== 1 ? 'ies' : 'y'}</span></small></td>
      <td className="r t40" style={{ width: 20 }}>›</td>
    </tr>
  )
}

/** Which group a row belongs to, said quietly — the row itself is the desk. */
function GroupTag({ gid, className }: { gid: GroupId; className?: string }) {
  const g = GROUPS.find((x) => x.id === gid)!
  return <span className={`gtag${className ? ` ${className}` : ''}`}><i style={{ background: g.color }} />{gid === 'MORE' ? 'More' : gid === 'STOCKS' ? 'Stocks' : gid}</span>
}
