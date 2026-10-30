/**
 * What a wallet has MADE (pos-indexer tickets/0084, the wallet book): the
 * lifetime PnL of its open positions summed, and the line it drew getting there
 * (per strategy on the chart's toggle) — the number the board ranks a wallet by, shown
 * where the wallet is. Total PnL counts every price move; Yield takes out each
 * position's money moving against the dollar (ETH going up is not farming).
 *
 * Every figure comes off the index's stored records, so it is approximate and
 * says so: the coverage line names how many positions it is over, and a
 * position the index has not drawn yet is counted as missing, never as zero.
 */
import React from 'react'
import { pnlWaiting, unsupportedLine, useAccountPnlBook, strategyLabel, type AccountPnlBook, type PnlBookFigure, type PnlBookPoint, type PnlBookStrategy } from '@yieldcircle/app/index/pnl'
import { indexChainLabel } from '@yieldcircle/core/index/types'
import { chainLabel } from '@yieldcircle/app/sdk/queries'
import { usePositionSeries } from '@yieldcircle/app/index/queries'
import { go } from '../state/AppState'
import { ProtocolLogo, Sk, pct, protocolIconUrls, usd, usdShort } from './bits'
import { prettyProtocol } from './ProtocolFilter'

/** one hue per charted strategy, in the breakdown's order */
const HUES = ['#60a5fa', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#22d3ee', '#facc15', '#fb7185']
const signed = (v: number | null | undefined) => (v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + usd(Math.abs(v)).replace(/^-/, ''))
const signedShort = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + usdShort(Math.abs(v))
const day = (t: string) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })

/**
 * Opens a position's PnL drawer over its wallet's page (Wallet.tsx `openPnl`'s twin). The wallet
 * is the position key's own (`chain|account|posId|risk`): You's book is merged over the owner's
 * EVM and Solana wallets (tickets/0018), so the page's address is not always the position's.
 */
function openPnl(posKey: string) {
  const who = posKey.split('|')[1]
  if (!who) return
  go(`w/${who}`, { pos: posKey })
  history.replaceState({ ...(history.state ?? {}), pnl: true }, '')
}

/** The charted strategies' hues by strategy key, in the breakdown's order: the chart's lines and the cards' swatches. */
export function strategyHues(b: AccountPnlBook): Map<string, string> {
  return new Map(chartedOf(b).map((s, i) => [s.key, HUES[i % HUES.length]]))
}
/** The strategies the By-strategy chart draws: the biggest with a line, one per hue (a merged book keeps every line). */
const chartedOf = (b: AccountPnlBook) => b.strategies.filter((s) => s.series && s.series.length > 1).slice(0, HUES.length)
export type PnlBy = 'total' | 'strategy'
/**
 * `own`: the connected wallet's own page — its records are asked for and the book re-read while they are drawn (tickets/0093).
 * `cards`: the page lists the positions as cards carrying their own figures (Wallet.tsx,
 * tickets/0017), so there is no strategy table here, and the Total / By strategy choice is the
 * page's, so the cards can wear the hues. Without cards (Lite's "Every number" drawer) the
 * strategy table stays: nothing beside it names each strategy's figure.
 */
export function WalletPnl({ addr, own = false, cards, book, scope }: {
  addr: string; own?: boolean; cards?: { by: PnlBy; onBy: (by: PnlBy) => void }
  /** a book read by the caller — You's, merged over the owner's EVM and Solana wallets (tickets/0018) — instead of `addr`'s own */
  book?: { data: AccountPnlBook | null | undefined; isLoading: boolean }
  /** the wallet is one of a curated group (tickets/0021 step 4): the choice between its own book and the group's, which the caller reads into `book` */
  scope?: { name: string; n: number; all: boolean; onAll: (all: boolean) => void }
}) {
  const own1 = useAccountPnlBook(book ? undefined : addr, { own })
  const q = book ?? own1
  const b = q.data
  const seg = scope && (
    <div className="seg sm wpnl-scope" role="group" aria-label="Whose figures">
      <button aria-pressed={!scope.all} onClick={() => scope.onAll(false)}>This wallet</button>
      <button aria-pressed={scope.all} onClick={() => scope.onAll(true)} title={`${scope.name}: every wallet in the group, as one book`}>All {scope.n} wallets</button>
    </div>
  )
  if (q.isLoading) return <section className="sec"><div className="sec-h"><h2>What it made</h2>{seg}</div><div className="card"><div className="empty"><Sk w={260} /></div></div></section>
  // an older index (no route), an error, or a wallet with nothing on the board: say nothing here
  // — unless the group switch is up, which must stay reachable to switch back
  if (!b || !b.coverage.positions) return scope ? (
    <section className="sec">
      <div className="sec-h"><h2>What it made</h2><span className="sub">{scope.all ? `nothing on the board across the ${scope.n} wallets` : 'nothing on the board for this wallet'}</span>{seg}</div>
    </section>
  ) : null
  return (
    <section className="sec">
      <div className="sec-h">
        <h2>What it made</h2>
        <span className="sub">{scope?.all && <><b>{scope.name}</b>, {scope.n} wallets as one · </>}<Coverage b={b} /></span>
        {seg}
      </div>
      {b.coverage.withPnl === 0 ? (
        <div className="card"><div className="empty">
          No lifetime record yet. The index draws one per position in the background
          {waitingWords(b)}; each position’s own history opens from its card below.
          {unsupportedLine(b) ? ` ${unsupportedLine(b)}.` : ''}
        </div></div>
      ) : <Book b={b} addr={addr} cards={cards} />}
    </section>
  )
}

/** " — 2 drawing now, 1 waiting", or the older index's plain count */
function waitingWords(b: AccountPnlBook): string {
  const w = pnlWaiting(b)
  const bits = [w.drawing ? `${w.drawing} drawing now` : '', w.waiting ? `${w.waiting} waiting` : ''].filter(Boolean)
  return bits.length ? ` — ${bits.join(', ')}` : ''
}

function Coverage({ b }: { b: AccountPnlBook }) {
  const c = b.coverage
  const off = Object.entries(c.unranked).reduce((s, [, n]) => s + n, 0)
  const why = [
    c.pending ? `${c.pending} not drawn yet` : '',
    unsupportedLine(b),
    off ? `${off} without a reliable record (${Object.entries(c.unranked).map(([k, n]) => `${n} ${k}`).join(', ')})` : '',
  ].filter(Boolean).join(' · ')
  return (
    <span title={why || undefined}>
      lifetime, open positions · on {c.withPnl} of {c.positions} position{c.positions === 1 ? '' : 's'}
      {c.equityShare != null && c.withPnl < c.positions ? ` (${Math.round(c.equityShare * 100)} % of the value)` : ''}
      {' · approximate, from the index’s records'}
    </span>
  )
}

function Book({ b, addr, cards }: { b: AccountPnlBook; addr: string; cards?: { by: PnlBy; onBy: (by: PnlBy) => void } }) {
  const [own, setOwn] = React.useState<PnlBy>('total')
  const by = cards?.by ?? own, setBy = cards?.onBy ?? setOwn
  // one strategy opened from the table: the same figures and chart, for it alone, in this card
  const [focus, setFocus] = React.useState<string | null>(null)
  const card = React.useRef<HTMLDivElement>(null)
  const moved = React.useRef(false)
  React.useEffect(() => {
    if (moved.current) card.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    moved.current = true
  }, [focus])
  const charted = chartedOf(b)
  const fs = focus ? b.strategies.find((s) => s.key === focus) : undefined
  if (fs) return <div ref={card} className="card wpnl"><StrategyView b={b} s={fs} onBack={() => setFocus(null)} /></div>
  const t = b.total
  return (
    <div ref={card} className="card wpnl">
      <Figures f={t} span={spanDays(b)} many />
      {b.series.length < 2 && <div className="t50 wpnl-wait">The day-by-day line is still being drawn — the index redraws each position’s record in the background, biggest first.</div>}
      {b.series.length > 1 && b.coverage.withLine != null && b.coverage.withLine < b.coverage.withPnl && (
        <div className="t50 wpnl-wait">The chart covers {b.coverage.withLine} of {b.coverage.withPnl} positions: the index is still redrawing the other {b.coverage.withPnl - b.coverage.withLine} with a day-by-day line, and they count in the figures above only.</div>
      )}
      {b.series.length > 1 && (
        <>
          <div className="wpnl-seg">
            <div className="seg sm">
              <button aria-pressed={by === 'total'} onClick={() => setBy('total')}>Total</button>
              <button aria-pressed={by === 'strategy'} disabled={!charted.length} onClick={() => setBy('strategy')}>By strategy</button>
            </div>
          </div>
          <Chart lines={by === 'total'
            ? [{ id: 'pnl', name: 'Total PnL', pts: b.series, v: (p) => p.pnl, main: true }, { id: 'yield', name: 'Yield', pts: b.series, v: (p) => p.yield, dashed: true }]
            : charted.map((s, i) => ({ id: s.key, name: strategyLabel(s), pts: s.series!, v: (p: PnlBookPoint) => p.pnl, hue: HUES[i % HUES.length] }))} />
        </>
      )}
      {!cards && <Strategies b={b} hues={by === 'strategy' ? strategyHues(b) : null} onOpen={setFocus} />}
    </div>
  )
}

/** The four figures over a book or one strategy: what it made, how much was farming, the price part, the capital. */
function Figures({ f, span, many }: { f: PnlBookFigure; span: number | null; /** over several positions: the capital is averaged over the longest one's span */ many?: boolean }) {
  return (
    <div className="wpnl-top">
      <Fig k="Total PnL" v={signed(f.pnlUsd)} c={f.pnlUsd < 0 ? 'bad' : 'ok'} s={`${pct(f.pnlAprPct)} lifetime APR`} tip="every gain and loss since each position opened, price moves included" />
      <Fig k="Yield" v={signed(f.yieldUsd)} c={f.yieldUsd < 0 ? 'bad' : 'ok'} s={`${pct(f.yieldAprPct)} APR`} tip="the PnL without each position’s money moving against the dollar: what farming made, not what holding ETH or BTC made" />
      <Fig k="Price move" v={signed(f.directionalUsd)} c="" s="the money vs the dollar" tip="Total PnL − Yield: the part that came from the held money’s own price" />
      {span == null
        ? <Fig k="Capital" v="—" c="" s="span not known yet" tip="the average capital the APR is over needs the positions’ open span, which this index does not state yet" />
        : <Fig k="Capital" v={usdShort(f.capitalDays / span)} c="" s={`avg over ${Math.round(span)} day${Math.round(span) === 1 ? '' : 's'}`} tip={`the average capital the APR is over: Σ capital-days ÷ ${many ? 'the longest position’s span' : 'its span'}`} />}
    </div>
  )
}

/** The biggest drawn position of a strategy: what its row opens. */
const topPosition = (b: AccountPnlBook, s: PnlBookStrategy) =>
  b.positions.filter((p) => p.strategyKey === s.key && p.status === 'ok').sort((x, y) => (y.equityUsd ?? 0) - (x.equityUsd ?? 0))[0]?.key

/** What a strategy is, in one line: kind, market, venue, chains, how many positions, what is in it now. */
function strategySub(s: PnlBookStrategy): string {
  return [
    s.kind === 'loop' ? 'loop' : s.kind === 'deposit' ? 'deposit' : 'position',
    s.market && s.market !== strategyLabel(s) ? s.market : s.protocol?.startsWith('vault.') ? s.held.join(' + ') : '',
    s.protocol ? prettyProtocol(s.protocol) : '',
    s.chains.map((c) => indexChainLabel(c, chainLabel)).join(', '),
    s.positions > 1 ? `${s.positions} positions` : '',
    `${usdShort(s.equityUsd)} now`,
  ].filter(Boolean).join(' · ')
}

/** One strategy, opened from the table: its header, the book's figures and chart for it alone, and back. */
function StrategyView({ b, s, onBack }: { b: AccountPnlBook; s: PnlBookStrategy; onBack: () => void }) {
  const k = topPosition(b, s)
  // its own line, else — one position, which the index draws a line for whatever its rank — that
  // position's (PnL only: a position's points carry no yield split)
  const own = s.series && s.series.length > 1 ? s.series : null
  const one = !own && s.positions === 1 && k ? k : undefined
  const ps = usePositionSeries(one?.split('|')[1], one)
  const posPts = React.useMemo(() => (ps.data?.points ?? []).map((p) => ({ t: p.t, pnl: p.pnl, yield: p.pnl, nav: p.nav ?? 0 })), [ps.data])
  const pts = own ?? (posPts.length > 1 ? posPts : null)
  // its span: the index's own, else since it opened, else its drawn line's
  const from = s.since ?? pts?.[0].t ?? null
  const span = s.openDays != null && s.openDays > 0 ? Math.max(1, s.openDays) : from ? Math.max(1, (Date.now() - Date.parse(from)) / 86_400_000) : null
  return (
    <>
      <div className="wpnl-head">
        <button type="button" className="wpnl-back" onClick={onBack} aria-label="All strategies" title="All strategies">‹</button>
        {s.protocol && <ProtocolLogo urls={protocolIconUrls(s.protocol)} name={prettyProtocol(s.protocol)} />}
        <span className="wpnl-hname">
          <b className="wpnl-one">{strategyLabel(s)}</b>
          <small className="t50 wpnl-one">{strategySub(s)}{s.since ? ` · since ${day(s.since)}` : ''}</small>
        </span>
      </div>
      <Figures f={s} span={span} many={s.positions > 1} />
      {pts
        ? <Chart lines={[{ id: 'pnl', name: 'Total PnL', pts, v: (p) => p.pnl, main: true }, ...(own ? [{ id: 'yield', name: 'Yield', pts, v: (p: PnlBookPoint) => p.yield, dashed: true }] : [])]} />
        : one && ps.isLoading ? <Sk w={260} h={120} />
        : <div className="t50 wpnl-wait">{s.positions > 1 ? `The index draws a day-by-day line for the biggest strategies only, and this one’s ${s.positions} positions are not summed into one here; its figures are above, each position’s line one tap away.` : 'No day-by-day line for it yet: the index is still drawing its record. Its figures are above.'}</div>}
      <div className="wpnl-foot">
        <button type="button" className="linklike" onClick={onBack}>‹ All strategies</button>
        {k && <button type="button" className="linklike" onClick={() => openPnl(k)}>{s.positions > 1 ? 'Its biggest position’s history ›' : 'The position’s history ›'}</button>}
      </div>
    </>
  )
}

/** The longest open span (days): the index's own figure, else the drawn line's; null when neither exists. */
const spanDays = (b: AccountPnlBook): number | null => {
  if (b.total.openDays != null && b.total.openDays > 0) return Math.max(1, b.total.openDays)
  const first = b.series.length > 1 ? b.series[0].t : null
  return first ? Math.max(1, (Date.now() - Date.parse(first)) / 86_400_000) : null
}

function Fig({ k, v, s, c, tip }: { k: string; v: string; s: string; c: string; tip: string }) {
  return <div className="wpnl-fig" title={tip}><span className="t50">{k}</span><b className={c}>{v}</b><small className="t50">{s}</small></div>
}

interface Line { id: string; name: string; pts: PnlBookPoint[]; v: (p: PnlBookPoint) => number; main?: boolean; dashed?: boolean; hue?: string }

/** The running PnL: one calendar for every line, a zero line, a readout under the cursor. */
function Chart({ lines }: { lines: Line[] }) {
  const W = 640, H = 180, padL = 8, padR = 8
  const [hover, setHover] = React.useState<number | null>(null)
  const gid = React.useId().replace(/:/g, '')
  const all = lines.flatMap((l) => l.pts.map((p) => Date.parse(p.t)))
  const t0 = Math.min(...all), t1 = Math.max(...all)
  const x = (t: number) => padL + ((t - t0) / Math.max(1, t1 - t0)) * (W - padL - padR)
  const vs = lines.flatMap((l) => l.pts.map(l.v))
  let lo = Math.min(0, ...vs), hi = Math.max(0, ...vs)
  if (hi - lo < 1e-9) hi = lo + 1
  const y = (v: number) => 10 + ((hi - v) / (hi - lo)) * (H - 20)
  const d = (l: Line) => l.pts.map((p, i) => `${i ? 'L' : 'M'}${x(Date.parse(p.t)).toFixed(1)},${y(l.v(p)).toFixed(1)}`).join('')
  const main = lines.find((l) => l.main)
  const dir = main ? ((main.v(main.pts[main.pts.length - 1]) ?? 0) >= 0 ? 'up' : 'down') : 'up'
  // the hovered time, and each line's value at it (the line's last point at or before it)
  const tx = hover ?? t1
  const at = (l: Line) => {
    let best: PnlBookPoint | null = null
    for (const p of l.pts) if (Date.parse(p.t) <= tx) best = p
    return best ? l.v(best) : null
  }
  const onMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect()
    setHover(Math.max(t0, Math.min(t1, t0 + (((ev.clientX - r.left) / r.width) * W - padL) / (W - padL - padR) * (t1 - t0))))
  }
  const ax = [hi, lo, 0].filter((v, i, a) => a.indexOf(v) === i)
  return (
    <div className="pnl-chart wpnl-chart">
      <div className="wpnl-read">
        <span className="mono">{day(new Date(tx).toISOString())}</span>
        {lines.slice(0, 8).map((l) => {
          const v = at(l)
          return <span key={l.id} className="wpnl-rv"><i className="wpnl-sw" style={{ background: l.hue ?? (l.dashed ? 'var(--tx50)' : dir === 'up' ? 'var(--success)' : 'var(--error)') }} />{l.name} <b className={v != null && v < 0 ? 'bad' : ''}>{v == null ? '—' : signed(v)}</b></span>
        })}
      </div>
      <div className="pnl-rwrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="pnl-svg wpnl-svg" onPointerMove={onMove} onPointerLeave={() => setHover(null)} preserveAspectRatio="none">
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" className={`pnl-gs0 ${dir}`} />
              <stop offset="1" className={`pnl-gs1 ${dir}`} />
            </linearGradient>
          </defs>
          {main && <path className="pnl-area" fill={`url(#${gid})`} d={`${d(main)}L${x(Date.parse(main.pts[main.pts.length - 1].t)).toFixed(1)},${y(0).toFixed(1)}L${x(Date.parse(main.pts[0].t)).toFixed(1)},${y(0).toFixed(1)}Z`} />}
          <line className="pnl-zero" x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} />
          {lines.map((l) => l.main
            ? <path key={l.id} className={`pnl-line ${dir}`} d={d(l)} />
            : <path key={l.id} className={l.dashed ? 'pnl-con wpnl-yield' : 'wpnl-sline'} style={l.hue ? { stroke: l.hue } : undefined} d={d(l)} />)}
          {hover != null && <line className="pnl-hover" x1={x(hover)} x2={x(hover)} y1={4} y2={H - 4} />}
        </svg>
        {ax.map((v, i) => <span key={i} className="pnl-ax t40" style={{ top: `${(y(v) / H) * 100}%` }}>{v === 0 ? '$0' : signedShort(v)}</span>)}
      </div>
      <div className="pnl-legend t50">
        <span className="sp" />
        <span className="mono">{day(new Date(t0).toISOString())} → now</span>
      </div>
    </div>
  )
}

/** Each strategy's lifetime PnL as a bar from zero, its yield and APR; a click opens the strategy in the card (`StrategyView`). */
function Strategies({ b, hues, onOpen }: { b: AccountPnlBook; hues: Map<string, string> | null; onOpen: (key: string) => void }) {
  const max = Math.max(1e-9, ...b.strategies.map((s) => Math.abs(s.pnlUsd)))
  const [all, setAll] = React.useState(false)
  const shown = all ? b.strategies : b.strategies.slice(0, 8)
  if (!b.strategies.length) return null
  return (
    <div className="wpnl-strats">
      <div className="wpnl-sh t50"><span>Strategy</span><span /><span className="num">PnL</span><span className="num">Yield</span><span className="num">APR</span></div>
      {shown.map((s) => {
        const w = (Math.abs(s.pnlUsd) / max) * 50
        return (
          <button key={s.key} className="wpnl-srow" onClick={() => onOpen(s.key)}
            title={`${strategyLabel(s)} — ${s.positions} position${s.positions === 1 ? '' : 's'}${s.since ? ` since ${day(s.since)}` : ''}; open its figures and line`}>
            <span className="wpnl-sname">
              {hues?.get(s.key) && <i className="wpnl-sw" style={{ background: hues.get(s.key) }} />}
              {s.protocol && <ProtocolLogo urls={protocolIconUrls(s.protocol)} name={prettyProtocol(s.protocol)} />}
              <b className="wpnl-one">{strategyLabel(s)}</b>
              <small className="t50 wpnl-one">{strategySub(s)}</small>
            </span>
            <span className="wpnl-bar" aria-hidden>
              <i className={s.pnlUsd < 0 ? 'neg' : 'pos'} style={s.pnlUsd < 0 ? { right: '50%', width: `${w}%` } : { left: '50%', width: `${w}%` }} />
            </span>
            <b className={`num ${s.pnlUsd < 0 ? 'bad' : 'ok'}`}>{signedShort(s.pnlUsd)}</b>
            <span className={`num ${s.yieldUsd < 0 ? 'bad' : ''}`}>{signedShort(s.yieldUsd)}</span>
            <span className="num" title={`yield ${pct(s.yieldAprPct)} APR`}>{pct(s.pnlAprPct)}</span>
          </button>
        )
      })}
      {b.strategies.length > 8 && <button className="linklike wpnl-more" onClick={() => setAll(!all)}>{all ? 'fewer' : `all ${b.strategies.length} strategies`}</button>}
    </div>
  )
}
