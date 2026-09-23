/**
 * Hot right now — where people are actually putting money, as opposed to
 * where the biggest number on a card is.
 *
 * The index ranks on two dimensions at once and the card shows both, because
 * either alone lies: volume alone crowns whichever market one whale passed
 * through this morning, frequency alone crowns a spray of dust. The score is
 * the geometric mean of a market's percentile on each, so it is scale-free —
 * and the evidence sits next to it (`426 moves · 57 wallets · $2.2m`) rather
 * than a number nobody can check.
 *
 * A row is only useful if it can be acted on, so each one is matched to the
 * catalogue: matched rows open the ticket, unmatched ones say so and link the
 * market instead.
 */
import React from 'react'
import { go, marketHref } from '../state/AppState'
import { useApp } from '../state/AppState'
import { useHot } from '../index/queries'
import type { HotMarket } from '../index/api'
import { useCounts } from '../social/queries'
import { useMenu } from './useMenu'
import { Comments } from './social-bits'
import { ProtocolChips, useProtocolFilter } from './ProtocolFilter'
import { IssuerChips, useIssuerFilter } from './IssuerFilter'
import { ChainCorner } from './ChainMark'
import { Sk, StratMark, Tok, Toks, pct, usdShort } from './bits'
import { chainLabel } from '../sdk/queries'
import { indexChainLabel } from '../index/types'
import type { Strategy } from '../model/strategies'

type Win = '1h' | '6h' | '24h' | '7d'
const WINDOWS: Win[] = ['1h', '6h', '24h', '7d']

export function Hot({ limit = 8, showAll }: { limit?: number; showAll?: boolean }) {
  const { chainIds, allChains, chainLabelFor } = useApp()
  const [win, setWin] = React.useState<Win>('24h')
  const menu = useMenu()
  const pf = useProtocolFilter(win)
  const inf = useIssuerFilter(win)
  const q = useHot(win, allChains ? undefined : chainIds.join(','), showAll ? 40 : 24, pf.param, inf.param, inf.matchParam)
  const rows = q.data?.markets ?? []

  // a market nobody here can open is a log line, not an option — the menu
  // rows come first, and the rest stay reachable below them
  const paired = React.useMemo(
    () => rows.map((m) => ({ m, s: menu.forUid(m.marketUid) })),
    [rows, menu.byUid],
  )
  const inMenu = paired.filter((x) => x.s)
  const shown = (showAll ? [...inMenu, ...paired.filter((x) => !x.s)] : inMenu).slice(0, limit)
  /** an empty window is usually a short one — offer the next size up rather than a dead end */
  const next = WINDOWS[WINDOWS.indexOf(win) + 1]

  const counts = useCounts(
    React.useMemo(() => shown.map((x) => ({ kind: 'market' as const, key: x.m.marketUid })), [shown]),
  )

  return (
    <section className="sec hot-sec">
      <div className="sec-h">
        <h2>Hot right now</h2>
        <span className="sub">where people are moving money — how often, and how much</span>
        <span className="sp" />
        <div className="seg sm">
          {WINDOWS.map((w) => (
            <button key={w} aria-pressed={win === w} onClick={() => setWin(w)}>{w}</button>
          ))}
        </div>
      </div>
      <ProtocolChips f={pf} max={7} />
      <IssuerChips f={inf} max={6} />
      {q.isLoading && !rows.length && (
        <div className="hot-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="hotcard"><Sk w="70%" /><Sk w="40%" /></div>)}</div>
      )}
      {!q.isLoading && !shown.length && (
        <div className="note hot-empty">
          <b>Quiet on {chainLabelFor()}</b> in the last {win}
          {rows.length > 0 && !inMenu.length ? ' — the markets that moved are ones this app has no row for' : ''}.
          The index ranks only what it has <b>valued</b>, so an unpriced market stays out rather than
          appearing cold.
          {next && <button className="lnk" onClick={() => setWin(next)}> Try the last {next} ›</button>}
        </div>
      )}
      <div className="hot-grid">
        {shown.map(({ m, s }) => (
          <HotCard key={m.marketUid} m={m} s={s} comments={counts.count('market', m.marketUid)} />
        ))}
      </div>
    </section>
  )
}

function HotCard({ m, s, comments }: { m: HotMarket; s: Strategy | null; comments: number }) {
  const parts = m.marketUid.split(':')
  const chainId = parts[1]
  const open = () => (s ? go(s.group, { u: s.asset, s: s.id, k: s.kind }) : (location.hash = marketHref(m.marketUid)))
  return (
    <article className="hotcard" onClick={open} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') open() }}>
      <div className="hc-h">
        {s ? (
          s.kind === 'loop'
            ? <Toks a={s.holds} b={s.debt} logoA={s.logoLong} logoB={s.logoShort} />
            : <StratMark sym={s.holds} logo={s.logo} venueKey={s.protocolKey} brand={s.brand} size={26} />
        ) : <Tok sym={parts[0]?.split('_')[0] ?? '?'} size={26} />}
        <div className="hc-n">
          <b>{s ? (s.kind === 'loop' ? `${s.holds} / ${s.debt}` : s.holds) : shortUid(m.marketUid)}</b>
          <small>{s ? (s.kind === 'loop' ? s.venue : s.via) : 'not in the menu'}</small>
        </div>
        {s && <span className="hc-rate">{pct(s.rate)}</span>}
        <ChainCorner chainId={chainId} />
      </div>

      <Heat m={m} />

      <div className="hc-f">
        <span className="hc-ev">
          <b>{m.nEvents}</b> move{m.nEvents === 1 ? '' : 's'}
          <span className="t40"> · </span>
          <b>{m.nWallets}</b> wallet{m.nWallets === 1 ? '' : 's'}
          <span className="t40"> · </span>
          <b>{usdShort(m.volumeUsd)}</b>
          {m.nNewWallets > 0 && <span className="fresh" title={`${m.nNewWallets} of them had never been in this market`}>+{m.nNewWallets} new</span>}
          {m.nLiquidations > 0 && <span className="liqs" title="liquidations in this window">{m.nLiquidations} liq</span>}
        </span>
        <span className="sp" />
        <Comments n={comments} onClick={() => { location.hash = marketHref(m.marketUid) }} />
      </div>
    </article>
  )
}

/**
 * The score, drawn as what it is: two percentiles side by side. A bar that is
 * long on the left and short on the right says "busy but small" — which is the
 * thing a single number would have hidden.
 */
function Heat({ m }: { m: HotMarket }) {
  return (
    <div className="heat" title={`busier than ${Math.round(m.pEvents * 100)}% of the markets the index has valued, and bigger than ${Math.round(m.pVolume * 100)}% of them`}>
      <span className="hb">
        <i className="k">busy</i>
        <i className="bar"><i style={{ width: `${Math.max(2, m.pEvents * 100)}%` }} /></i>
        <i className="p">{Math.round(m.pEvents * 100)}</i>
      </span>
      <span className="hb">
        <i className="k">big</i>
        <i className="bar big"><i style={{ width: `${Math.max(2, m.pVolume * 100)}%` }} /></i>
        <i className="p">{Math.round(m.pVolume * 100)}</i>
      </span>
    </div>
  )
}

/** `MORPHO_BLUE_91O3…` → something a person can read when the menu has no name. */
const shortUid = (uid: string) => {
  const lender = uid.split(':')[0] ?? uid
  return lender.replace(/_[0-9A-F]{8,}$/i, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}
