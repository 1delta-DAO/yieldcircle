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
 * market instead. They are never DROPPED for being unmatched. This board
 * answers "what are people doing", and the catalogue answers "what can I do
 * here" — hiding the second question's misses from the first one turns a fact
 * into an advertisement. Measured on 2026-09-24: HyperLend moved $117m across
 * eleven HyperEVM markets in 7d and the home board read "Quiet on HyperEVM",
 * because the catalogue asks for `maxRiskScore: 4` and every HyperLend market
 * scores 5 ("high") — the WHYPE market, $211m of TVL, among them. The only
 * HyperLend row the menu held was a PT market paying 0 %.
 */
import React from 'react'
import { go, marketHref } from '../state/AppState'
import { useApp } from '../state/AppState'
import { useHot } from '../index/queries'
import type { HotMarket } from '../index/api'
import { useCounts, useRatingCounts } from '../social/queries'
import { useMenu } from './useMenu'
import { Comments } from './social-bits'
import { ProtocolChips, useProtocolFilter } from './ProtocolFilter'
import { IssuerChips, useIssuerFilter } from './IssuerFilter'
import { CuratorChips, useCuratorFilter } from './CuratorFilter'
import { RateMark } from './Rate'
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
  const cf = useCuratorFilter()
  const q = useHot(win, allChains ? undefined : chainIds.join(','), showAll ? 40 : 24, pf.param, inf.param, inf.matchParam, cf.param)
  const rows = q.data?.markets ?? []

  // a market nobody here can open is a log line, not an option — the menu
  // rows come first, and the rest stay reachable below them
  const paired = React.useMemo(
    () => rows.map((m) => ({ m, s: menu.forUid(m.marketUid) })),
    [rows, menu.byUid],
  )
  const inMenu = paired.filter((x) => x.s)
  // menu rows first — they can be opened — then the rest of the ranking
  const shown = [...inMenu, ...paired.filter((x) => !x.s)].slice(0, limit)
  /** an empty window is usually a short one — offer the next size up rather than a dead end */
  const next = WINDOWS[WINDOWS.indexOf(win) + 1]

  const counts = useCounts(
    React.useMemo(() => shown.map((x) => ({ kind: 'market' as const, key: x.m.marketUid })), [shown]),
  )
  /** what wallets have SAID about these markets — one request for the grid */
  const rated = useRatingCounts(
    React.useMemo(() => shown.map((x) => ({ kind: 'market' as const, key: x.m.marketUid })), [shown]),
  )

  /**
   * Every card here is in the top few percent of everything the index tracks,
   * so a percentile bar pins them all at 99% and tells the reader nothing. The
   * bars are scaled to the busiest and biggest card *on screen* instead, which
   * is the comparison someone reading a ranked list is actually making.
   */
  const peak = React.useMemo(() => ({
    ev: Math.max(1, ...shown.map((x) => x.m.nEvents)),
    vol: Math.max(1, ...shown.map((x) => x.m.volumeUsd)),
  }), [shown])

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
      {showAll && <CuratorChips f={cf} max={6} />}
      {q.isLoading && !rows.length && (
        <div className="hot-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="hotcard"><Sk w="70%" /><Sk w="40%" /></div>)}</div>
      )}
      {!q.isLoading && !shown.length && (
        <div className="note hot-empty">
          <b>Quiet on {chainLabelFor()}</b> in the last {win}. The index ranks only what it has
          <b> valued</b>, so an unpriced market stays out rather than appearing cold.
          {next && <button className="lnk" onClick={() => setWin(next)}> Try the last {next} ›</button>}
        </div>
      )}
      <div className="hot-grid">
        {shown.map(({ m, s }) => (
          <HotCard key={m.marketUid} m={m} s={s} peak={peak} comments={counts.count('market', m.marketUid)}
            rating={rated.ratingOf('market', m.marketUid)} />
        ))}
      </div>
    </section>
  )
}

function HotCard({ m, s, peak, comments, rating }: {
  m: HotMarket
  s: Strategy | null
  peak: Peak
  comments: number
  /** what wallets said about it — counts only; the verdict lives on the market page */
  rating?: ReturnType<ReturnType<typeof useRatingCounts>['ratingOf']>
}) {
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
        ) : m.collateralSymbol && m.symbol ? (
          <Toks a={m.collateralSymbol} b={m.symbol} logoA={m.collateralLogo ?? undefined} logoB={m.assetLogo ?? undefined} />
        ) : (
          <Tok sym={m.symbol ?? parts[0]?.split('_')[0] ?? '?'} logo={m.assetLogo ?? undefined} size={26} />
        )}
        <div className="hc-n">
          {/* an unmatched row is still a real market: the index knows its asset
              and its lender, so the card says WHYPE on HyperLend, not a uid */}
          <b>{s
            ? (s.kind === 'loop' ? `${s.holds} / ${s.debt}` : s.holds)
            : (m.collateralSymbol && m.symbol ? `${m.collateralSymbol} / ${m.symbol}` : m.symbol ?? shortUid(m.marketUid))}</b>
          <small>{s
            ? (s.kind === 'loop' ? s.venue : s.via)
            : m.lenderName
              ? `${m.lenderName} · not in the menu`
              : 'not in the menu'}</small>
        </div>
        {s && <span className="hc-rate">{pct(s.rate)}</span>}
        <ChainCorner chainId={chainId} />
      </div>

      <Heat m={m} peak={peak} />

      <div className="hc-f">
        <span className="hc-ev">
          <b>{m.nWallets}</b> wallet{m.nWallets === 1 ? '' : 's'}
          {m.nNewWallets > 0 && <span className="fresh" title={`${m.nNewWallets} of them had never been in this market`}>+{m.nNewWallets} new</span>}
          {m.nLiquidations > 0 && <span className="liqs" title="liquidations in this window">{m.nLiquidations} liq</span>}
        </span>
        <span className="sp" />
        <RateMark c={rating} />
        <Comments n={comments} onClick={() => { location.hash = marketHref(m.marketUid) }} />
      </div>
    </article>
  )
}

type Peak = { ev: number; vol: number }

/**
 * The two dimensions the ranking is made of, drawn as what they are: how many
 * moves, and how much money. Either alone lies — a long bar on the left and a
 * short one on the right says "busy but small", which is the thing a single
 * score would have hidden.
 *
 * The figure at the end of each bar is the real count, so the bar never has to
 * be believed on its own; the percentile against the whole index lives in the
 * tooltip, where it is context rather than the headline it cannot support.
 */
function Heat({ m, peak }: { m: HotMarket; peak: Peak }) {
  return (
    <div className="heat">
      <HeatBar
        k="moves" v={m.nEvents} max={peak.ev} fig={String(m.nEvents)}
        title={`${m.nEvents} moves in this window — busier than ${Math.round(m.pEvents * 100)}% of every market the index has valued`}
      />
      <HeatBar
        k="volume" v={m.volumeUsd} max={peak.vol} fig={usdShort(m.volumeUsd)} tone="big"
        title={`${usdShort(m.volumeUsd)} moved in this window — bigger than ${Math.round(m.pVolume * 100)}% of every market the index has valued`}
      />
    </div>
  )
}

function HeatBar({ k, v, max, fig, tone, title }: { k: string; v: number; max: number; fig: string; tone?: 'big'; title: string }) {
  // a market with a real number in it never shows an empty track
  const w = Math.max(2, Math.min(100, (v / (max || 1)) * 100))
  return (
    <div className="hrow" title={title}>
      <span className="k">{k}</span>
      <span className={tone === 'big' ? 'bar big' : 'bar'} role="img" aria-label={title}>
        <span style={{ width: `${w}%` }} />
      </span>
      <span className="p">{fig}</span>
    </div>
  )
}

/** `MORPHO_BLUE_91O3…` → something a person can read when the menu has no name. */
const shortUid = (uid: string) => {
  const lender = uid.split(':')[0] ?? uid
  return lender.replace(/_[0-9A-F]{8,}$/i, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}
