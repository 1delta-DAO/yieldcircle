import React from 'react'
import { nameOf, whatIs, type Group } from '../model/assets'
import { exitTerms, markPicks, type Strategy } from '../model/strategies'
import { go, type Route, useApp } from '../state/AppState'
import type { Holding } from '../model/positions'
import { useBook } from './useBook'
import { HoldingTicket, Ticket } from './Ticket'
import { GroupIcon, Info, KindPill, LegsPill, Sk, StratMark, Tok, Toks, amt, num, pct, usd, usdShort } from './bits'
import { chainLabel } from '../sdk/queries'
import { uidOf } from '../model/uid'
import { useCounts } from '../social/queries'
import { Comments } from './social-bits'
import { marketHref } from '../state/AppState'
import { HiddenBar } from './Hidden'
import { HIDES, hideDetail, letIn } from '../model/visibility'
import { useRateHistory } from '../sdk/queries'
import { isSpike, seriesFor, steadyRate } from '../model/rateHistory'
import { RateTrend, useSparkRewards } from './Spark'

/** One list, one number per row. The list decides which; the ticket decides how much and how levered. */
export function AssetPage({ group, route }: { group: Group; route: Route }) {
  const b = useBook()
  const { allChains, chainLabelFor } = useApp()
  const inGroup = b.all.filter((s) => s.group === group.id)
  const assets = [...new Set([...inGroup.map((s) => s.asset), ...b.books.filter((x) => x.group === group.id).map((x) => x.asset)])]
  const u = assets.includes(route.u) ? route.u : 'all'
  // a floor hides a row from the list, never from the wallet that is in it: the held-back rows are whole strategies
  const sel = route.s ? b.all.find((s) => s.id === route.s) ?? b.hidden.find((s) => s.id === route.s) ?? null : null
  // a position with no row at all is still the wallet's: managed from what the positions route says about it
  const offMenu = !sel && route.h ? b.holdings.find((h) => h.key === route.h) ?? null : null
  const kind: 'simple' | 'loop' = sel ? sel.kind : offMenu ? offMenu.kind : route.k ?? 'simple'
  const all = inGroup.filter((s) => u === 'all' || s.asset === u)
  const picks = React.useMemo(() => markPicks(inGroup), [inGroup.length])
  // the 30-day line on every row, in ONE request: a rate on a list is a claim
  // about the future, and the line says whether it is what this has paid or a
  // spike. Asked for every row of this kind (and the held positions'), once the
  // catalogue has settled — the shared cache answers the ticket and the rest
  const ofKind = React.useMemo(() => all.filter((s) => s.kind === kind), [all, kind])
  const get = useRateHistory(ofKind, !b.isFetching)
  const [withRewards, setWithRewards] = useSparkRewards()
  // ranked on the STEADY rate: a row whose rate today is a spike against its own
  // month sorts by the month, so one hot night does not lead the list
  const steady = React.useMemo(() => new Map(ofKind.map((s) => [s.id, steadyRate(s, get, withRewards)])), [ofKind, get, withRewards])
  const list = [...ofKind].sort((x, y) => (Number(picks.has(y.id)) - Number(picks.has(x.id))) || (steady.get(y.id) ?? y.rate) - (steady.get(x.id) ?? x.rate))
  const nS = all.filter((s) => s.kind === 'simple').length, nL = all.filter((s) => s.kind === 'loop').length
  // the rows a floor is holding back, scoped exactly as the list is
  const heldBack = b.hidden.filter((s) => s.group === group.id && (u === 'all' || s.asset === u) && s.kind === kind)
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
    .map((h) => ({ h, s: inGroup.find((s) => matches(s, h)) ?? b.hidden.find((s) => s.group === group.id && matches(s, h)) ?? null }))
  // the held positions' strategies may be of the other kind than the list shows
  useRateHistory(React.useMemo(() => running.flatMap((r) => (r.s ? [r.s] : [])), [running.map((r) => r.s?.id).join(',')]), !b.isFetching)
  // what an off-menu row can still do: a loop can always be unwound; a deposit needs the earn uid to withdraw through
  const canManage = (h: Holding) => h.kind === 'loop' ? !!h.collateralUid && !!h.debtUid : !!h.earnUid
  const ticketOpen = !!sel || !!offMenu
  const close = () => go(group.id, { u, k: kind })
  return (
    <>
      <a className="crumb" href="#/earn">‹ Earn</a>
      <div className={`asset${ticketOpen ? '' : ' noticket'}`}>
        <div className="main">
          <div className="hdr">
            <div className="t">{u === 'all' ? <GroupIcon id={group.id} color={group.color} size={36} /> : <Tok sym={u} size={36} />}<div><h1>{group.name}{u !== 'all' && <span className="t50"> · {nameOf(u)}</span>}</h1><div className="sub">{u === 'all' ? group.desc : whatIs(u)}{allChains ? '' : ` · ${chainLabelFor()}`}</div></div></div>
            <AssetChips group={group} route={route} assets={assets} u={u} all={inGroup} />
          </div>
          {idle.length > 0 && (
            <div className="idle-strip">{idle.map((x) => { const best = bestSimpleFor(x.asset), bestAny = bestFor(x.asset); return (
              <button key={x.asset} className="idle-row" disabled={!best} onClick={() => best && go(group.id, { u: x.asset, s: best.id, k: 'simple' })}>
                <Tok sym={x.asset} /><span className="t"><b>{amt(x.asset, x.idle!.amount, x.idle!.usd)}</b> {group.id === 'USD' ? `${nameOf(x.asset)} ` : x.asset !== x.idle!.symbol ? `${nameOf(x.asset)} ` : ''}idle{bestAny ? <> <span className="t50">· <span className="hide-m">could earn </span>up to</span> <b className="ok">{pct(bestAny.rate)}</b></> : ''}</span><span className="sp" />{best && <span className="cta">Put to work ›</span>}
              </button>) })}</div>
          )}
          {b.account && running.length > 0 && (
            <section className="sec" style={{ marginTop: 14 }}><div className="sec-h"><h2>Your positions</h2><span className="sub">{usd(running.reduce((a, r) => a + r.h.valueUsd, 0))} at work in {group.name.toLowerCase()}{u !== 'all' ? ` · ${nameOf(u)}` : ''}.</span></div>
              <div className="card"><table className="tbl strat-t">
                <colgroup><col /><col style={{ width: 96 }} /><col className="c-earn" /><col className="hide-m hide-t" style={{ width: 70 }} /><col className="hide-m hide-t" style={{ width: 138 }} /><col style={{ width: 32 }} /></colgroup>
                <thead><tr><th>Position</th><th className="r">Value</th><th className="r">Earning</th><th className="r hide-m hide-t">Health</th><th className="r hide-m hide-t">Manage</th><th /></tr></thead>
                <tbody>{running.map(({ h, s }) => { const open = (m: 'add' | 'reduce' | 'manage') => s && go(group.id, { u, s: s.id, k: s.kind, m }); const can = !s && canManage(h); const openOff = () => go(group.id, { u, h: h.key, k: h.kind, m: h.kind === 'loop' ? 'manage' : 'reduce' }); const total = s && s.kind === 'simple' ? s.rate : h.apr; const rewards = s && s.kind === 'simple' ? s.rewards : 0; return (
                  <tr key={h.key} aria-selected={s ? sel?.id === s.id : offMenu?.key === h.key} onClick={() => (s ? open('add') : can ? openOff() : undefined)} style={s || can ? undefined : { cursor: 'default' }}>
                    <td><div className="nm">{s ? (s.kind === 'loop' ? <Toks a={s.holds} b={s.debt} logoA={s.logoLong} logoB={s.logoShort} /> : <StratMark sym={s.holds} logo={s.logo} venueKey={s.protocolKey} brand={s.brand} />) : <Tok sym={h.symbol} logo={h.logo} />}<span><b>{h.label.split(' · ')[0]}</b> <span className="t50">· {h.venue}</span></span><KindPill kind={h.kind} /><LegsPill others={h.others} /></div>
                      <small className="hide-m">{chainLabel(h.chainId)}{h.leverage && h.leverage > 1.05 ? ` · ${h.leverage.toFixed(1)}×` : ''}{h.kind === 'loop' && h.debtSymbol ? ` · owes ${amt(h.debtSymbol, h.debtAmount ?? 0)}` : ''}</small></td>
                    <td className="r"><span>{usd(h.valueUsd)}</span><small>{h.kind === 'loop' ? 'equity' : num(h.amount, h.amount >= 100 ? 0 : 3)}</small></td>
                    <td className="r">{(() => { const ser = s ? seriesFor(s, get, withRewards, h.kind === 'loop' && h.leverage && h.leverage > 1 ? h.leverage : undefined) : null; return <span className="rate-row">{ser && <RateTrend ser={ser} now={s!.rate} spike={isSpike(s!.rate, ser)} />}<span className={total != null && total >= 0 ? 'ok' : total != null ? 'bad' : ''}>{total != null ? pct(total) : '—'}</span></span> })()}{rewards > 0.05 ? <small className="hide-m">incl. {pct(rewards)} rewards</small> : null}<small>{usd(h.valueUsd * (total ?? 0) / 100)}/yr</small></td>
                    <td className="r hide-m hide-t">{h.health != null ? <span className={h.health < 1.1 ? 'bad' : h.health < 1.25 ? 'warn' : 'ok'}>{h.health.toFixed(2)}</span> : <span className="t40">—</span>}</td>
                    <td className="r hide-m hide-t" onClick={(e) => e.stopPropagation()}>{s ? <span className="acts"><button className="btn sm" onClick={() => open('add')}>Add</button><button className="btn sm" onClick={() => open(h.kind === 'loop' ? 'manage' : 'reduce')}>{h.kind === 'loop' ? 'Manage' : 'Withdraw'}</button></span> : can ? <span className="acts"><button className="btn sm" title="Not in the menu: this position can be reduced or closed here, not added to" onClick={openOff}>{h.kind === 'loop' ? 'Manage' : 'Withdraw'}</button></span> : <span className="t40" style={{ fontSize: 12 }}>not in the menu</span>}</td>
                    <td className="r t40" style={{ width: 20 }}>{s || can ? '›' : ''}</td>
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
                <colgroup><col /><col className="c-rate" /><col className="c-tail" /></colgroup>
                <thead><tr><th>{kind === 'simple' ? 'Deposit' : 'Loop'}</th><th className="r">{kind === 'simple' ? 'APY' : <>Net yield <Info label="Net yield">Net yield on your money at the Balanced tier: earn the collateral rate on the whole position, pay the borrow rate on the borrowed part. The ticket shows all three tiers.</Info></>}<button className="rw-toggle" aria-pressed={withRewards} title={withRewards ? 'The 30-day line includes reward streams — click to show the rate without them' : 'The 30-day line excludes reward streams — click to include them'} onClick={() => setWithRewards(!withRewards)}>{withRewards ? '+rewards' : 'no rewards'}</button></th><th /></tr></thead>
                <tbody>{list.map((s) => { const h = held(s); const pick = picks.has(s.id); return (
                  <tr key={s.id} aria-selected={sel?.id === s.id} onClick={() => go(group.id, { u, s: s.id, k: s.kind })}>
                    <td><div className="nm">{s.kind === 'loop' ? <Toks a={s.holds} b={s.debt} logoA={s.logoLong} logoB={s.logoShort} /> : <StratMark sym={s.holds} logo={s.logo} venueKey={s.protocolKey} brand={s.brand} />}<span><b>{s.holds}</b> <span className="t50">{s.kind === 'simple' ? `· ${s.via}` : `/ ${s.debt} · ${s.venue}${s.terms ? ' · fixed rate' : ''}`}</span></span>{pick && <><span className="pill pick">our pick</span><span className="pick-star" title="our pick">★</span></>}{h && <span className="pill run">running</span>}<WhyIn s={s} /></div>
                      {/* the qualifiers read as one sentence. Risk had a column of
                          its own where eight rows in nine said the same word; here it
                          sits second, so it is the part a narrow screen keeps rather
                          than the part it truncates. */}
                      <small>{u === 'all' ? `${nameOf(s.asset)} · ` : ''}{s.kind === 'loop' && s.instrument ? `via ${s.instrument} · ` : ''}{chainLabel(s.chainId)} · <RiskWord s={s} />{s.kind === 'simple' ? ` · ${exitTerms(s).short}` : ''}{s.kind === 'simple' && s.source ? ` · ${s.source}` : ''}{(s.tvlUsd > 0 || s.kind === 'loop') && <> · <Size s={s} /></>}</small></td>
                    {/* the rate, on its own: nothing else in this cell to read past */}
                    <td className="r">{(() => { const ser = seriesFor(s, get, withRewards); const spike = isSpike(s.rate, ser); return (<>
                      <span className="rate-row">{ser && <RateTrend ser={ser} now={s.rate} spike={spike} />}<span className={s.rate >= 3 ? 'ok' : s.rate < 0 ? 'bad' : ''}>{pct(s.rate)}</span></span>
                      {s.kind === 'simple' && s.rewards > 0.05 ? <small className="hide-m">incl. {pct(s.rewards)} rewards</small> : null}</>) })()}</td>
                    {/* a bubble on a row nobody has posted on is furniture, so it
                        only appears once there is something to open */}
                    <td className="r tail">
                      {commentsOn(s) > 0 && <Comments n={commentsOn(s)} onClick={() => { const u = uidOf(s); if (u) location.hash = marketHref(u) }} />}
                      <span className="t40">›</span>
                    </td>
                  </tr>) })}</tbody>
              </table>
            ) : <div className="empty">No {kind === 'simple' ? 'plain deposit' : 'loop'} for this filter{b.errors.length ? ` (${b.errors[0].message})` : ''}{heldBack.length ? ` — ${heldBack.length} held back by the floors below` : ''}.</div>}
          </div>
          <HiddenBar kind={kind} rows={heldBack} structural={b.structural} busy={b.isFetching} />
        </div>
        <aside className={ticketOpen ? '' : 'closed'} id="aside">
          {sel && <Ticket key={sel.id + (route.m ?? '')} s={sel} idle={b.idlePerChain} holding={held(sel) ?? null} mode={route.m} copy={route.copy} onClose={close} />}
          {offMenu && <HoldingTicket key={offMenu.key} h={offMenu} onClose={close} />}
        </aside>
      </div>
      {ticketOpen && <div className="scrim" onClick={close} />}
    </>
  )
}

/**
 * The asset filter.
 *
 * It was a horizontal scroller with its own scrollbar hidden, which meant that
 * with the ticket open eighteen chips lived in a 756px box and twelve of them
 * were simply gone — no fade, no arrow, nothing on screen admitting they
 * existed. It wraps now, ranked by how much each asset actually has to offer,
 * and the tail folds behind a count that says how many are folded.
 */
function AssetChips({ group, route, assets, u, all, max = 6 }: { group: Group; route: Route; assets: string[]; u: string; all: Strategy[]; max?: number }) {
  const [open, setOpen] = React.useState(false)
  const countOf = React.useCallback((a: string) => all.filter((s) => s.asset === a).length, [all])
  const ranked = React.useMemo(
    () => [...assets].sort((x, y) => countOf(y) - countOf(x) || x.localeCompare(y)),
    [assets, countOf],
  )
  const head = open ? ranked : ranked.slice(0, max)
  // the asset you are filtered by never hides behind the +N
  const shown = u === 'all' || head.includes(u) ? head : [...head, u]
  const hidden = ranked.length - shown.length
  return (
    <div className="chips" role="group" aria-label="Assets">
      <button className="chip" aria-pressed={u === 'all'} onClick={() => go(group.id, { s: route.s, k: route.k })}>
        All <span className="c">{all.length}</span>
      </button>
      {shown.map((a) => (
        <button key={a} className="chip" aria-pressed={u === a} onClick={() => go(group.id, { u: a, s: route.s, k: route.k })}>
          <Tok sym={a} size={16} />{nameOf(a)} <span className="c">{countOf(a)}</span>
        </button>
      ))}
      {hidden > 0 && <button className="chip more" onClick={() => setOpen(true)}>+{hidden}</button>}
      {open && ranked.length > max && <button className="chip more" onClick={() => setOpen(false)}>less</button>}
    </div>
  )
}

/**
 * How big the market is, at the end of the row's sentence — and, on hover,
 * how much of it can actually leave.
 *
 * Size belongs on the row because it is the second thing anyone asks after the
 * rate, and because a high rate on a small market is a different proposition
 * from the same rate on a deep one. A loop also says what is left to borrow:
 * that, not the collateral market, caps the position and sets how far the
 * borrow rate moves as you take it. Llamalend reports no collateral size (its
 * collateral sits in the market's AMM, not lent out), so there the borrow
 * figure is the whole answer.
 */
function Size({ s }: { s: Strategy }) {
  if (s.kind === 'loop') {
    const title = `${s.tvlUsd > 0 ? `${usdShort(s.tvlUsd)} deposited in the collateral market · ` : ''}${usdShort(s.borrowLiquidityUsd)} of ${s.debt} still available to borrow`
    return <span title={title}>{s.tvlUsd > 0 ? `${usdShort(s.tvlUsd)} · ` : ''}{usdShort(s.borrowLiquidityUsd)} to borrow</span>
  }
  const liq = s.liquidityUsd
  const title = `${usdShort(s.tvlUsd)} deposited${liq != null ? ` · ${usdShort(liq)} available to withdraw right now` : ' · how much can be withdrawn right now is not reported'}`
  // a market that is all but lent out is the one case worth a mark on the row
  const tight = s.utilization != null && s.utilization >= 0.95
  return <span className={tight ? 'warn' : undefined} title={title}>{usdShort(s.tvlUsd)}{tight ? ' · thin' : ''}</span>
}

/**
 * The floor this row would have failed with the defaults — so a widened list
 * never reads like a curated one. A $12k-liquidity loop and a $40m one are not
 * the same row, and the difference is the whole reason the switch exists.
 */
function WhyIn({ s }: { s: Strategy }) {
  const code = letIn(s)
  if (!code) return null
  const d = hideDetail(s, code)
  return <span className="pill why" title={`${HIDES[code].why}${d ? ` (${d})` : ''}`}>{HIDES[code].word}{d ? <span className="d"> {d}</span> : null}</span>
}

/** `medium risk`, in the row's own sentence rather than in a column of its own. */
function RiskWord({ s }: { s: Strategy }) {
  const word = (s.riskLabel || ['', 'Low', 'Medium', 'High'][s.risk] || '').toLowerCase()
  return <span className={`risk r${s.risk}`}><i />{word} risk</span>
}

export { KindPill }

