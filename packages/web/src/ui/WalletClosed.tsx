/**
 * What a wallet made on the positions it has CLOSED (pos-indexer
 * `GET /accounts/:account/closed` + the PnL drawer's own series, its
 * docs/pnl-series.md "Closed positions"). "What it made" above is the open
 * book only; a looper who exited months ago had nothing on the page.
 *
 * Each record is drawn from the ledger alone, so the index draws one only
 * when it can prove every leg went back to zero inside its history: a
 * position opened before that history starts has no record, and the section
 * says how many, never shows them as zero.
 */
import React from 'react'
import { useQueries } from '@tanstack/react-query'
import * as api from '@yieldcircle/core/index/api'
import { useClosedPositions } from '@yieldcircle/app/index/queries'
import { indexChainLabel } from '@yieldcircle/core/index/types'
import { chainLabel } from '@yieldcircle/app/sdk/queries'
import { go } from '../state/AppState'
import { ProtocolLogo, Sk, pct, protocolIconUrls, usd, usdShort } from './bits'
import { prettyProtocol } from './ProtocolFilter'

const PAGE = 10
const signed = (v: number | null | undefined) => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + usd(Math.abs(v)).replace(/^-/, ''))
const signedShort = (v: number | null | undefined) => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + usdShort(Math.abs(v)))
const day = (t: string) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })
const is404 = (e: unknown) => /→ 404$/.test((e as Error)?.message ?? '') || /no anchored position/.test((e as Error)?.message ?? '')

/** Opens a position's PnL drawer over the wallet page (Wallet.tsx `openPnl`'s twin). */
function openPnl(who: string, posKey: string) {
  go(`w/${who}`, { pos: posKey })
  history.replaceState({ ...(history.state ?? {}), pnl: true }, '')
}

/** "sUSDS ↺ USDT": what the position held, and what it borrowed against it. */
function label(s: api.PositionSeries): string {
  const syms = (debt: boolean) => [...new Set(s.legs.filter((l) => (l.side === 'borrow') === debt).map((l) => l.symbol ?? '?'))]
  const held = syms(false), debt = syms(true)
  return (held.join(' + ') || '—') + (debt.length ? ` ↺ ${debt.join(' + ')}` : '')
}

export function WalletClosed({ addr }: { addr: string }) {
  const q = useClosedPositions(addr)
  const [n, setN] = React.useState(PAGE)
  const keys = q.data ?? []
  const shown = keys.slice(0, n)
  const series = useQueries({
    queries: shown.map((k) => ({
      // the drawer's own query: opening a row reads the record from cache
      queryKey: ['pos-series', addr, k.key, 'USD'],
      queryFn: () => api.positionSeries(addr, k.key, 'USD'),
      staleTime: 5 * 60_000,
      retry: (c: number, e: unknown) => c < 1 && !is404(e),
    })),
  })
  // an older index (no route), an error, or nothing closed: say nothing here
  if (!q.data?.length) return null
  const rows = shown.map((k, i) => ({ k, r: series[i] }))
  // a record with nothing ever at work (a transfer in and straight out) is no position
  const idle = (s: api.PositionSeries | undefined) => !!s && !(s.summary.capitalDays > 0)
  const drawn = rows.filter((x) => x.r.data && !idle(x.r.data))
  const refused = rows.filter((x) => x.r.error && is404(x.r.error)).length
  const loading = rows.some((x) => x.r.isLoading)
  const total = drawn.reduce((s, x) => s + x.r.data!.summary.pnl, 0)
  const totalYield = drawn.every((x) => x.r.data!.summary.yield != null) ? drawn.reduce((s, x) => s + (x.r.data!.summary.yield ?? 0), 0) : null
  if (!loading && !drawn.length && keys.length <= n) return null
  return (
    <section className="sec">
      <div className="sec-h">
        <h2>Closed positions</h2>
        <span className="sub" title="drawn from the ledger alone: a position whose history starts before the index’s has no record here">
          {drawn.length ? <>{signed(total)} on {drawn.length} closed position{drawn.length === 1 ? '' : 's'}{totalYield != null ? ` · yield ${signed(totalYield)}` : ''}</> : 'drawing the records…'}
          {refused ? ` · ${refused} opened before the index’s history, no record` : ''}
        </span>
      </div>
      <div className="card wpnl">
        <div className="wpnl-strats">
          <div className="wpnl-sh t50"><span>Position</span><span>Held</span><span className="num">PnL</span><span className="num">Yield</span><span className="num">APR</span></div>
          {rows.map(({ k, r }) => {
            if (r.error || idle(r.data)) return null
            const s = r.data
            if (!s) return (
              <div key={k.key} className="wpnl-srow"><span><Sk w={160} /></span><span /><span /><span /><span /></div>
            )
            const m = s.summary
            return (
              <button key={k.key} className="wpnl-srow" onClick={() => openPnl(addr, k.key)}
                title={`${label(s)} — ${s.eventsTotal ?? s.events.length} moves; open its PnL history`}>
                <span className="wpnl-sname">
                  <ProtocolLogo urls={protocolIconUrls(k.lenderKey)} name={prettyProtocol(k.lenderKey)} />
                  <b className="wpnl-one">{label(s)}</b>
                  <small className="t50 wpnl-one">
                    {prettyProtocol(k.lenderKey)} · {indexChainLabel(k.chainId, chainLabel)}
                    {m.avgCapital ? ` · ${usdShort(m.avgCapital)} avg at work` : ''}
                  </small>
                </span>
                <span className="t50 wpnl-one">{day(k.firstAt)} → {day(k.lastAt)}{m.openDays >= 1 ? ` · ${Math.round(m.openDays)} d` : ''}</span>
                <b className={`num ${m.pnl < 0 ? 'bad' : 'ok'}`}>{signedShort(m.pnl)}</b>
                <span className={`num ${(m.yield ?? 0) < 0 ? 'bad' : ''}`}>{signedShort(m.yield)}</span>
                <span className="num" title={`yield ${pct(m.yieldAprPct ?? null)} APR`}>{pct(m.aprPct)}</span>
              </button>
            )
          })}
          {keys.length > n && <button className="linklike wpnl-more" onClick={() => setN(n + PAGE)}>more ({keys.length - n} older)</button>}
        </div>
      </div>
    </section>
  )
}
