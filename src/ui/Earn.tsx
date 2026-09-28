import React from 'react'
import { GROUPS, whatIs, type GroupId } from '../model/assets'
import { go } from '../state/AppState'
import { useBook } from './useBook'
import { GroupIcon, Sk, Tok, amt, pct, usd } from './bits'
import type { AssetBook } from '../model/positions'
import type { Strategy } from '../model/strategies'
import { BACKEND_BASE_URL } from '../config/backend'
import { ChainChip } from './ChainPicker'

/**
 * Earn: what you can hold, and what it can earn — every group, every asset,
 * the best a row pays and how many strategies are behind it. Tap one for its
 * strategies and the ticket.
 *
 * It was "Explore", which was half this and half a balance sheet. The
 * balances moved to the chip in the top-right of the header (`Positions`),
 * because they are the reader's own and belong on every page, not on one.
 */
export function Earn() {
  const b = useBook()
  const byGroup = (g: GroupId) => b.books.filter((x) => x.group === g)
  return (
    <>
      <div className="feed-h earn-h">
        <h1>Earn</h1>
        <span className="sub t50 hide-m">what you can hold, and what it can earn</span>
        <span className="sp" />
        <ChainChip />
      </div>
      <nav className="pchips" aria-label="Asset groups">
        {GROUPS.map((g) => (
          <a key={g.id} className="pchip" href={`#/${g.id}`}>
            <GroupIcon id={g.id} color={g.color} size={15} />{g.id === 'MORE' ? 'More' : g.id}
          </a>
        ))}
      </nav>
      {b.errors.length > 0 && !b.anyData && <div className="err">The listing could not be loaded from <b>{new URL(BACKEND_BASE_URL).host}</b>: {b.errors[0].message}{/portal\.1delta\.io/.test(BACKEND_BASE_URL) && <><br /><span className="t70">This build is on the public, per-IP rate-limited endpoint. Set <code>VITE_BACKEND_BASE_URL</code> for the build (on Cloudflare Pages: an environment variable for Production <i>and</i> Preview, then retry the deployment; Vite bakes it in at build time).</span></>}</div>}
      {GROUPS.map((g) => <GroupBlock key={g.id} gid={g.id} strategies={b.all.filter((s) => s.group === g.id)} books={byGroup(g.id)} loading={b.isLoading} hasAccount={!!b.account} />)}
      <section className="sec"><div className="note"><b>Live.</b> Rates and sizes come from the 1delta API (plain deposits from the earn listing, loops from the pair optimizer), filtered to base assets, low-to-medium risk and real size. Every list says underneath it how many rows those floors are holding back, and Filters in your profile menu (top left) move them. A loop is opened in one flash-funded transaction.</div></section>
    </>
  )
}

function GroupBlock({ gid, strategies, books, loading, hasAccount }: { gid: GroupId; strategies: Strategy[]; books: AssetBook[]; loading: boolean; hasAccount: boolean }) {
  const g = GROUPS.find((x) => x.id === gid)!
  const assets = [...new Set([...strategies.map((s) => s.asset), ...books.map((b) => b.asset)])]
  const rows = assets.map((a) => {
    const os = strategies.filter((s) => s.asset === a)
    const best = os.length ? os.reduce((m, o) => (o.rate > m.rate ? o : m)) : null
    const b = books.find((x) => x.asset === a)
    const venues = new Set(os.map((o) => o.venue.split(' · ')[0])).size
    return { a, os, best, b, venues }
  }).filter((r) => r.os.length || r.b).sort((x, y) => (y.b?.totalUsd ?? 0) - (x.b?.totalUsd ?? 0) || (y.best?.rate ?? 0) - (x.best?.rate ?? 0))
  if (!rows.length && !loading) return null
  const total = books.reduce((a, b) => a + b.totalUsd, 0), idle = books.reduce((a, b) => a + b.idleUsd, 0)
  return (
    <section className="sec grp" id={`g-${gid}`}>
      <div className="gh"><GroupIcon id={g.id} color={g.color} size={16} /><span className="n">{g.name}</span><span className="sub">{total ? `${usd(total)}${idle ? ` · ${usd(idle)} idle` : ''}` : g.desc}</span><span className="sp" /><a className="more" href={`#/${gid}`}>{loading && !strategies.length ? '…' : `${strategies.length} strateg${strategies.length === 1 ? 'y' : 'ies'} ›`}</a></div>
      <div className="card"><table className="tbl slim"><tbody>
        {loading && !rows.length && [0, 1, 2].map((i) => <tr key={i}><td><Sk w={120} /></td><td className="what"><Sk w={220} /></td><td className="r"><Sk w={90} /></td><td /></tr>)}
        {rows.map(({ a, os, best, b, venues }) => (
          <tr key={a} onClick={() => go(gid, { u: a, k: best?.kind })}>
            <td><div className="nm"><Tok sym={a} />{a}</div></td>
            <td className="what">{whatIs(a)}{venues ? <span className="t40"> · {venues} venue{venues > 1 ? 's' : ''}</span> : ''}</td>
            {hasAccount && <td className={`r ${b ? '' : 't40'}`}>{b ? <>{amt(a, (b.idle?.amount ?? 0) + (b.idle?.price ? b.atWorkUsd / b.idle.price : 0), b.totalUsd)}{b.atWorkUsd ? <small className="ok">{pct(b.blended)} on {Math.round(b.atWorkUsd / b.totalUsd * 100)}%</small> : <small className="t40">idle</small>}</> : '—'}</td>}
            <td className="r upto">{best ? <><span className="t50">up to</span> <span className={best.rate >= 3 ? 'ok' : ''}>{pct(best.rate)}</span><small>{best.kind === 'loop' ? `${best.rec}× loop` : 'deposit'}<span className="hide-m"> · {os.length} strateg{os.length !== 1 ? 'ies' : 'y'}</span></small></> : <span className="t40">—</span>}</td>
            <td className="r t40" style={{ width: 20 }}>›</td>
          </tr>
        ))}
      </tbody></table></div>
    </section>
  )
}
