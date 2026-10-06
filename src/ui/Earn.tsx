import React from 'react'
import { GROUPS, assetLogo, nameOf, type Group, type GroupId } from '../model/assets'
import { go } from '../state/AppState'
import { useBook } from './useBook'
import { GroupIcon, Sk, Tok, amt, pct, usd } from './bits'
import type { AssetBook } from '../model/positions'
import type { Strategy } from '../model/strategies'
import { isSavings } from '../model/nature'
import { BACKEND_BASE_URL } from '../config/backend'
import { ChainChip } from './ChainPicker'
import { useRateHistory } from '../sdk/queries'
import { steadyRate, type HistoryGet } from '../model/rateHistory'
import { Avg30 } from './Spark'

/**
 * Earn: a digest, not an index. Four group tiles (your money there, the best rate, how many
 * strategies), then the reader's own assets and what each could earn, then the best desk per
 * row across all groups. The full per-desk listing lives on each group's page, one tap away.
 *
 * It was the whole catalogue on one page — every desk of every group, banded by whose credit
 * ("Issued dollars", "Yield desks") — which after the regrouping ran to ~70 rows and four screens
 * of scrolling on a phone. The bands went with the big table; a group page's chips are the desk
 * index now, and a digest row carries its group as a small tag instead.
 */
export function Earn() {
  const b = useBook()
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
        <span className="sub t50 hide-m">what you can hold, and what it can earn</span>
        <span className="sp" />
        <ChainChip />
      </div>
      {b.errors.length > 0 && !b.anyData && <div className="err">The listing could not be loaded from <b>{new URL(BACKEND_BASE_URL).host}</b>: {b.errors[0].message}{/portal\.1delta\.io/.test(BACKEND_BASE_URL) && <><br /><span className="t70">This build is on the public, per-IP rate-limited endpoint. Unset <code>VITE_BACKEND_BASE_URL</code> to use the credited default, then rebuild.</span></>}</div>}
      <nav className="tiles" aria-label="Asset groups" style={{ marginTop: 16 }}>
        {GROUPS.map((g) => <GroupTile key={g.id} g={g} strategies={b.all.filter((s) => s.group === g.id)} books={b.books.filter((x) => x.group === g.id)} loading={b.isLoading} rank={rank} get={get} />)}
      </nav>
      {b.books.length > 0 && (
        <section className="sec">
          <div className="sec-h"><h2>Your money</h2><span className="sub">what each asset could earn</span></div>
          <div className="card"><table className="tbl slim"><tbody>
            {b.books.map((x) => <BookRow key={x.asset} x={x} best={bestBy.get(x.asset)} get={get} />)}
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
    <a className="tile" href={`#/${g.id}`}>
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

/** An asset the reader holds: the balance as it stands, and the best rate waiting for it. */
function BookRow({ x, best, get }: { x: AssetBook; best: Strategy | undefined; get: HistoryGet }) {
  return (
    <tr onClick={() => go(x.group, { u: x.asset, k: best?.kind })}>
      <td><div className="nm"><Tok sym={x.asset} logo={assetLogo(x.asset) ?? best?.tokenLogo} />{nameOf(x.asset)}<GroupTag gid={x.group} className="hide-m" /></div></td>
      <td className="r">{amt(x.asset, (x.idle?.amount ?? 0) + (x.idle?.price ? x.atWorkUsd / x.idle.price : 0), x.totalUsd)}{x.atWorkUsd ? <small className="ok">{pct(x.blended)} on {Math.round(x.atWorkUsd / x.totalUsd * 100)}%</small> : <small className="t40">idle</small>}</td>
      <td className="r upto">{best ? <><span className="t50">up to</span> <span className={best.rate >= 3 ? 'ok' : ''}>{pct(best.rate)}</span><small>{best.kind === 'loop' ? `${best.rec}× loop` : 'deposit'}<Avg30 s={best} get={get} prefix=" · 30d " /></small></> : <span className="t40">—</span>}</td>
      <td className="r t40" style={{ width: 20 }}>›</td>
    </tr>
  )
}

/** A desk worth a look: its best strategy, tagged with the group it sits in. */
function TopRow({ s, n, get }: { s: Strategy; n: number; get: HistoryGet }) {
  return (
    <tr onClick={() => go(s.group, { u: s.asset, k: s.kind })}>
      <td><div className="nm"><Tok sym={s.asset} logo={assetLogo(s.asset) ?? s.tokenLogo} />{nameOf(s.asset)}<GroupTag gid={s.group} /></div></td>
      <td className="r upto"><span className="t50">up to</span> <span className={s.rate >= 3 ? 'ok' : ''}>{pct(s.rate)}</span><small>{s.kind === 'loop' ? `${s.rec}× loop` : 'deposit'}<Avg30 s={s} get={get} prefix=" · 30d " /><span className="hide-m"> · {n} strateg{n !== 1 ? 'ies' : 'y'}</span></small></td>
      <td className="r t40" style={{ width: 20 }}>›</td>
    </tr>
  )
}

/** Which group a row belongs to, said quietly — the row itself is the desk. */
function GroupTag({ gid, className }: { gid: GroupId; className?: string }) {
  const g = GROUPS.find((x) => x.id === gid)!
  return <span className={`gtag${className ? ` ${className}` : ''}`}><i style={{ background: g.color }} />{gid === 'MORE' ? 'More' : gid}</span>
}
