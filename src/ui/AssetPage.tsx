import React from 'react'
import { whatIs, type Group } from '../model/assets'
import { markPicks, type Strategy } from '../model/strategies'
import { go, type Route, useApp } from '../state/AppState'
import type { Holding } from '../model/positions'
import { useBook } from './useBook'
import { Ticket } from './Ticket'
import { GroupIcon, Info, KindPill, RiskDot, Sk, StratMark, Tok, Toks, amt, num, pct, usd } from './bits'
import { chainLabel } from '../sdk/queries'
import { uidOf } from '../model/uid'
import { useCounts } from '../social/queries'
import { Comments } from './social-bits'
import { marketHref } from '../state/AppState'

/** One list, one number per row. The list decides which; the ticket decides how much and how levered. */
export function AssetPage({ group, route }: { group: Group; route: Route }) {
  const b = useBook()
  const { allChains, chainLabelFor } = useApp()
  const inGroup = b.all.filter((s) => s.group === group.id)
  const assets = [...new Set([...inGroup.map((s) => s.asset), ...b.books.filter((x) => x.group === group.id).map((x) => x.asset)])]
  const u = assets.includes(route.u) ? route.u : 'all'
  const sel = route.s ? b.all.find((s) => s.id === route.s) ?? null : null
  const kind: 'simple' | 'loop' = sel ? sel.kind : route.k ?? 'simple'
  const all = inGroup.filter((s) => u === 'all' || s.asset === u)
  const picks = React.useMemo(() => markPicks(inGroup), [inGroup.length])
  const list = all.filter((s) => s.kind === kind).sort((x, y) => (Number(picks.has(y.id)) - Number(picks.has(x.id))) || y.rate - x.rate)
  const nS = all.filter((s) => s.kind === 'simple').length, nL = all.filter((s) => s.kind === 'loop').length
  const books = b.books.filter((x) => x.group === group.id && (u === 'all' || x.asset === u))
  const idle = books.filter((x) => x.idle && x.idle.usd >= 1)
  const bestFor = (a: string) => inGroup.filter((s) => s.asset === a).sort((x, y) => y.rate - x.rate)[0]
  const bestSimpleFor = (a: string) => inGroup.filter((s) => s.asset === a && s.kind === 'simple').sort((x, y) => y.rate - x.rate)[0]
  // a loop is identified by BOTH legs: several loops on one venue share the collateral market
  const matches = (s: Strategy, h: Holding) => h.kind === s.kind && (s.kind === 'simple' ? h.earnUid === s.earnUid : h.earnUid === s.marketLongUid && (!h.debtUid || h.debtUid.toLowerCase() === s.marketShortUid.toLowerCase()))
  const held = (s: Strategy) => b.holdings.find((h) => matches(s, h))
  // holdings in scope, each paired with the catalogue strategy it belongs to (none → not actionable here)
  // 💬 on every row in ONE request: the service takes up to 1000 subjects a call
  const uids = React.useMemo(() => list.map((x) => ({ s: x, uid: uidOf(x) })).filter((x): x is { s: Strategy; uid: string } => !!x.uid), [list])
  const counts = useCounts(React.useMemo(() => uids.map((x) => ({ kind: 'market' as const, key: x.uid })), [uids]))
  const commentsOn = (x: Strategy) => { const u = uidOf(x); return u ? counts.count('market', u) : 0 }
  const running: { h: Holding; s: Strategy | null }[] = b.holdings.filter((h) => !h.directional && h.group === group.id && (u === 'all' || h.asset === u)).sort((x, y) => y.valueUsd - x.valueUsd)
    .map((h) => ({ h, s: inGroup.find((s) => matches(s, h)) ?? null }))
  return (
    <>
      <a className="crumb" href="#/explore">‹ Explore</a>
      <div className={`asset${sel ? '' : ' noticket'}`}>
        <div className="main">
          <div className="hdr">
            <div className="t">{u === 'all' ? <GroupIcon id={group.id} color={group.color} size={36} /> : <Tok sym={u} size={36} />}<div><h1>{group.name}{u !== 'all' && <span className="t50"> · {u}</span>}</h1><div className="sub">{u === 'all' ? group.desc : whatIs(u)}{allChains ? '' : ` · ${chainLabelFor()}`}</div></div></div>
            <div className="chips">
              <button className="chip" aria-pressed={u === 'all'} onClick={() => go(group.id, { s: route.s, k: route.k })}>All <span className="c">{inGroup.length}</span></button>
              {assets.map((a) => <button key={a} className="chip" aria-pressed={u === a} onClick={() => go(group.id, { u: a, s: route.s, k: route.k })}><Tok sym={a} />{a} <span className="c">{inGroup.filter((s) => s.asset === a).length}</span></button>)}
            </div>
          </div>
          {idle.length > 0 && (
            <div className="idle-strip">{idle.map((x) => { const best = bestSimpleFor(x.asset), bestAny = bestFor(x.asset); return (
              <button key={x.asset} className="idle-row" disabled={!best} onClick={() => best && go(group.id, { u: x.asset, s: best.id, k: 'simple' })}>
                <Tok sym={x.asset} /><span className="t"><b>{amt(x.asset, x.idle!.amount, x.idle!.usd)}</b> {x.asset} idle{bestAny ? <> <span className="t50">· <span className="hide-m">could earn </span>up to</span> <b className="ok">{pct(bestAny.rate)}</b></> : ''}</span><span className="sp" />{best && <span className="cta">Put to work ›</span>}
              </button>) })}</div>
          )}
          {b.account && running.length > 0 && (
            <section className="sec" style={{ marginTop: 14 }}><div className="sec-h"><h2>Your positions</h2><span className="sub">{usd(running.reduce((a, r) => a + r.h.valueUsd, 0))} at work in {group.name.toLowerCase()}{u !== 'all' ? ` · ${u}` : ''}.</span></div>
              <div className="card"><table className="tbl strat-t">
                <colgroup><col /><col style={{ width: 96 }} /><col style={{ width: 100 }} /><col className="hide-m hide-t" style={{ width: 70 }} /><col className="hide-m hide-t" style={{ width: 138 }} /><col style={{ width: 32 }} /></colgroup>
                <thead><tr><th>Position</th><th className="r">Value</th><th className="r">Earning</th><th className="r hide-m hide-t">Health</th><th className="r hide-m hide-t">Manage</th><th /></tr></thead>
                <tbody>{running.map(({ h, s }) => { const open = (m: 'add' | 'reduce' | 'manage') => s && go(group.id, { u, s: s.id, k: s.kind, m }); return (
                  <tr key={h.key} aria-selected={!!s && sel?.id === s.id} onClick={() => (s ? open('add') : undefined)} style={s ? undefined : { cursor: 'default' }}>
                    <td><div className="nm">{s ? (s.kind === 'loop' ? <Toks a={s.holds} b={s.debt} logoA={s.logoLong} logoB={s.logoShort} /> : <StratMark sym={s.holds} logo={s.logo} venueKey={s.protocolKey} brand={s.brand} />) : <Tok sym={h.symbol} logo={h.logo} />}<span><b>{h.label.split(' · ')[0]}</b> <span className="t50">· {h.venue}</span></span><KindPill kind={h.kind} /></div>
                      <small className="hide-m">{chainLabel(h.chainId)}{h.leverage && h.leverage > 1.05 ? ` · ${h.leverage.toFixed(1)}×` : ''}{h.kind === 'loop' && h.debtSymbol ? ` · owes ${amt(h.debtSymbol, h.debtAmount ?? 0)}` : ''}</small></td>
                    <td className="r"><span>{usd(h.valueUsd)}</span><small>{h.kind === 'loop' ? 'equity' : num(h.amount, h.amount >= 100 ? 0 : 3)}</small></td>
                    <td className="r"><span className={h.apr != null && h.apr >= 0 ? 'ok' : h.apr != null ? 'bad' : ''}>{h.apr != null ? pct(h.apr) : '—'}</span><small>{usd(h.valueUsd * (h.apr ?? 0) / 100)}/yr</small></td>
                    <td className="r hide-m hide-t">{h.health != null ? <span className={h.health < 1.1 ? 'bad' : h.health < 1.25 ? 'warn' : 'ok'}>{h.health.toFixed(2)}</span> : <span className="t40">—</span>}</td>
                    <td className="r hide-m hide-t" onClick={(e) => e.stopPropagation()}>{s ? <span className="acts"><button className="btn sm" onClick={() => open('add')}>Add</button><button className="btn sm" onClick={() => open(h.kind === 'loop' ? 'manage' : 'reduce')}>{h.kind === 'loop' ? 'Manage' : 'Withdraw'}</button></span> : <span className="t40" style={{ fontSize: 12 }}>not in the menu</span>}</td>
                    <td className="r t40" style={{ width: 20 }}>{s ? '›' : ''}</td>
                  </tr>) })}</tbody>
              </table></div></section>
          )}
          <div className="kind-bar">
            <div className="seg kind"><button aria-pressed={kind === 'simple'} onClick={() => go(group.id, { u, k: 'simple' })}>Deposits <span className="c">{nS}</span></button><button aria-pressed={kind === 'loop'} onClick={() => go(group.id, { u, k: 'loop' })}>Loops <span className="c">{nL}</span></button></div>
            <span className="hint">{kind === 'simple' ? 'Hold one token that grows. No debt, nothing to liquidate.' : 'Borrow against the token to hold more of it. Higher yield, liquidation risk. Leverage is set in the ticket.'}</span>
          </div>
          <div className="card">
            {b.isLoading && !list.length ? (
              <table className="tbl strat-t"><tbody>{[0, 1, 2, 3].map((i) => <tr key={i}><td><Sk w={200} /></td><td className="r"><Sk w={60} /></td><td className="hide-m"><Sk w={60} /></td><td /></tr>)}</tbody></table>
            ) : list.length ? (
              <table className="tbl strat-t">
                <colgroup><col /><col style={{ width: 110 }} /><col className="hide-m" style={{ width: 100 }} /><col style={{ width: 52 }} /><col style={{ width: 32 }} /></colgroup>
                <thead><tr><th>{kind === 'simple' ? 'Deposit' : 'Loop'}</th><th className="r">{kind === 'simple' ? 'APY' : <>Net yield <Info label="Net yield">Net yield on your money at the Balanced tier: earn the collateral rate on the whole position, pay the borrow rate on the borrowed part. The ticket shows all three tiers.</Info></>}</th><th className="hide-m">Risk</th><th className="r">Talk</th><th /></tr></thead>
                <tbody>{list.map((s) => { const h = held(s); const pick = picks.has(s.id); return (
                  <tr key={s.id} aria-selected={sel?.id === s.id} onClick={() => go(group.id, { u, s: s.id, k: s.kind })}>
                    <td><div className="nm">{s.kind === 'loop' ? <Toks a={s.holds} b={s.debt} logoA={s.logoLong} logoB={s.logoShort} /> : <StratMark sym={s.holds} logo={s.logo} venueKey={s.protocolKey} brand={s.brand} />}<span><b>{s.holds}</b> <span className="t50">{s.kind === 'simple' ? `· ${s.via}` : `/ ${s.debt} · ${s.venue}`}</span></span>{pick && <><span className="pill pick">our pick</span><span className="pick-star" title="our pick">★</span></>}{h && <span className="pill run">running</span>}</div>
                      <small className="hide-m">{u === 'all' ? `${s.asset} · ` : ''}{chainLabel(s.chainId)}{s.kind === 'simple' ? ` · ${s.exitWord.toLowerCase()}` : ''}</small></td>
                    <td className="r"><span className={s.rate >= 3 ? 'ok' : s.rate < 0 ? 'bad' : ''}>{pct(s.rate)}</span>{s.kind === 'simple' && <small>{s.source}</small>}</td>
                    <td className="hide-m"><RiskDot r={s.risk} label={s.riskLabel} /></td>
                    <td className="r" onClick={(e) => e.stopPropagation()}>
                      <Comments n={commentsOn(s)} onClick={() => { const u = uidOf(s); if (u) location.hash = marketHref(u) }} />
                    </td>
                    <td className="r t40" style={{ width: 20 }}>›</td>
                  </tr>) })}</tbody>
              </table>
            ) : <div className="empty">No {kind === 'simple' ? 'plain deposit' : 'loop'} for this filter{b.errors.length ? ` (${b.errors[0].message})` : ''}.</div>}
          </div>
        </div>
        <aside className={sel ? '' : 'closed'} id="aside">{sel && <Ticket key={sel.id + (route.m ?? '')} s={sel} idle={b.idlePerChain} holding={held(sel) ?? null} mode={route.m} copy={route.copy} onClose={() => go(group.id, { u, k: sel.kind })} />}</aside>
      </div>
      {sel && <div className="scrim" onClick={() => go(group.id, { u, k: sel.kind })} />}
    </>
  )
}
export { KindPill }
