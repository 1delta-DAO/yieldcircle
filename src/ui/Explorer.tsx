import React from 'react'
import { GROUPS, whatIs, type GroupId } from '../model/assets'
import { go } from '../state/AppState'
import { useBook } from './useBook'
import { GroupIcon, KindPill, Sk, Tok, amt, pct, usd } from './bits'
import type { AssetBook, Holding } from '../model/positions'
import type { Strategy } from '../model/strategies'
import { chainLabel } from '../sdk/queries'
import { BACKEND_BASE_URL } from '../config/backend'

/** The explorer is a balance overview: positions (group → asset → idle / strategies), then one slim block per group. */
export function Explorer() {
  const b = useBook()
  const byGroup = (g: GroupId) => b.books.filter((x) => x.group === g)
  const tot = b.books.reduce((a, x) => a + x.totalUsd, 0), idle = b.books.reduce((a, x) => a + x.idleUsd, 0), work = b.books.reduce((a, x) => a + x.atWorkUsd, 0), yearly = b.books.reduce((a, x) => a + x.yearlyUsd, 0)
  return (
    <>
      {b.account && (
        <section className="sec" style={{ marginTop: 6 }}>
          <div className="sec-h"><h2>Your positions</h2>
            <span className="sub mono">{b.positionsLoading && !b.books.length ? <Sk w={260} /> : `${usd(tot)} · idle ${usd(idle)} · at work ${usd(work)}${work ? ` at ${pct(yearly / work * 100)}` : ''} · ≈ ${usd(yearly)} / year`}</span></div>
          {b.positionsError && <div className="err">Positions could not be read: {b.positionsError.message}</div>}
          {!b.positionsLoading && !b.books.length && !b.positionsError && <div className="note">Nothing on the selected chains: no idle balance in a base asset, no deposit, no loop.</div>}
          <div className="gcards">{GROUPS.filter((g) => byGroup(g.id).length).map((g) => <GroupCard key={g.id} gid={g.id} books={byGroup(g.id)} directional={b.holdings.filter((h) => h.directional && h.group === g.id)} />)}</div>
        </section>
      )}
      <section className="sec" style={{ marginTop: b.account ? 28 : 6 }}><div className="sec-h"><h2>Explore</h2><span className="sub">What you can hold, and what it can earn. Tap an asset for its strategies.</span></div></section>
      {b.errors.length > 0 && !b.anyData && <div className="err">The listing could not be loaded from <b>{new URL(BACKEND_BASE_URL).host}</b>: {b.errors[0].message}{/portal\.1delta\.io/.test(BACKEND_BASE_URL) && <><br /><span className="t70">This build is on the public, per-IP rate-limited endpoint. Set <code>VITE_BACKEND_BASE_URL</code> for the build (on Cloudflare Pages: an environment variable for Production <i>and</i> Preview, then retry the deployment; Vite bakes it in at build time).</span></>}</div>}
      {GROUPS.map((g) => <GroupBlock key={g.id} gid={g.id} strategies={b.all.filter((s) => s.group === g.id)} books={byGroup(g.id)} loading={b.isLoading} hasAccount={!!b.account} />)}
      <section className="sec"><div className="note"><b>Live.</b> Rates and sizes come from the 1delta API (plain deposits from the earn listing, loops from the pair optimizer), filtered to base assets, low-to-medium risk and real size. A loop is opened in one flash-funded transaction.</div></section>
    </>
  )
}

function GroupCard({ gid, books, directional }: { gid: GroupId; books: AssetBook[]; directional: Holding[] }) {
  const g = GROUPS.find((x) => x.id === gid)!
  const total = books.reduce((a, b) => a + b.totalUsd, 0), idle = books.reduce((a, b) => a + b.idleUsd, 0), work = books.reduce((a, b) => a + b.atWorkUsd, 0), yearly = books.reduce((a, b) => a + b.yearlyUsd, 0)
  return (
    <div className="card">
      <div className="ch"><GroupIcon id={g.id} color={g.color} size={24} /><span className="t">{g.name}</span><span className="m">{usd(total)}</span><span className="sp" />
        <span className="m hide-m">idle {usd(idle)} · at work {usd(work)}{work ? ` · ${pct(yearly / work * 100)}` : ''}</span></div>
      <div className="list">{books.map((b) => <AssetRows key={b.asset} b={b} />)}</div>
      {directional.length > 0 && <div className="empty" style={{ borderTop: '1px solid var(--line)' }}>{directional.length} directional loop{directional.length > 1 ? 's' : ''} ({directional.map((h) => h.label.replace(' loop', '')).join(', ')}) with {usd(directional.reduce((a, h) => a + h.valueUsd, 0))} equity not shown: the debt is in another denomination, so it is a price bet rather than a carry.</div>}
    </div>
  )
}
export function AssetRows({ b, sel }: { b: AssetBook; sel?: string }) {
  const g = GROUPS.find((x) => x.id === b.group)!
  return (
    <>
      <div className="row arow"><div className="nm"><Tok sym={b.asset} /><span>{b.asset}</span><span className="t50 hide-m" style={{ fontWeight: 400, fontSize: 12 }}>{whatIs(b.asset)}</span></div>
        <div className="v">{g.unit === '$' || !b.idle?.price ? usd(b.totalUsd) : amt(b.asset, b.idle.amount + b.atWorkUsd / b.idle.price)}<small>{b.holdings.length ? `${pct(b.blended)} on the part at work` : 'nothing at work'}</small></div></div>
      {b.idle && b.idle.usd >= 1 && (
        <button className={`row prow idle${b.holdings.length ? '' : ' last'}`} onClick={() => go(b.group, { u: b.asset })}>
          <div className="nm"><span className="tok" style={{ background: '#1f1f1f', color: 'var(--tx50)' }}>—</span><span>Idle <span className="t50">· in wallet, earning nothing</span></span></div>
          <div className="sub hide-m">{b.idle.chainId ? chainLabel(b.idle.chainId) : ''}</div>
          <div className="v">{amt(b.asset, b.idle.amount, b.idle.usd)}<small>{g.unit === '$' ? '0%' : usd(b.idle.usd)}</small></div>
          <div className="v t50" style={{ fontSize: 12.5 }}>Put to work ›</div>
        </button>
      )}
      {b.holdings.map((h, i) => (
        <button key={h.key} className={`row prow${i === b.holdings.length - 1 ? ' last' : ''}`} aria-selected={sel === h.earnUid} onClick={() => go(h.group, { u: h.asset, k: h.kind })}>
          <div className="nm"><Tok sym={h.label.split(' ')[0]} logo={h.logo} /><span>{h.label}</span><KindPill kind={h.kind} /></div>
          <div className="sub hide-m">{h.venue} · {chainLabel(h.chainId)}{h.health != null ? <> · health <span className={h.health < 1.15 ? 'warn' : ''}>{h.health.toFixed(2)}</span></> : ''}</div>
          <div className="v">{usd(h.valueUsd)}<small>{h.kind === 'loop' ? 'equity' : 'deposit'}</small></div>
          <div className="v ok">{h.apr != null ? pct(h.apr) : <span className="t40">—</span>}<small>{h.leverage && h.leverage > 1.05 ? `${h.leverage.toFixed(1)}× · ` : ''}≈ {usd(h.valueUsd * (h.apr ?? 0) / 100)}/yr</small></div>
        </button>
      ))}
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
      <div className="gh"><GroupIcon id={g.id} color={g.color} /><span className="n">{g.name}</span><span className="sub">{total ? `${usd(total)}${idle ? ` · ${usd(idle)} idle` : ''}` : g.desc}</span><span className="sp" /><a className="more" href={`#/${gid}`}>{loading && !strategies.length ? '…' : `${strategies.length} strateg${strategies.length === 1 ? 'y' : 'ies'} ›`}</a></div>
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
