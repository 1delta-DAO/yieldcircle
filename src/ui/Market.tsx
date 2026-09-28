/**
 * A market as a place: what it is, who is in it, what moved, and the thread.
 * The uid is the same string the catalogue, the index and the social service
 * all use, so this page is reachable from a strategy row, a feed card and a
 * position alike.
 */
import React from 'react'
import { useAccount } from 'wagmi'
import { go, marketHref, tokenHref } from '../state/AppState'
import { useCuratorsByAccount, useHolders, useMarket, useMarketFlow, useMarketTxs, useStress } from '../index/queries'
import type { FlowBucket, MarketTapeQuery } from '../index/api'
import { useProfiles } from '../social/queries'
import { useMenu } from './useMenu'
import { parseUid, protocolKeyOf } from '../model/uid'
import { prettyProtocol } from './ProtocolFilter'
import { DeskChips } from './IssuerFilter'
import { CuratorMark } from './CuratorFilter'
import { Rate } from './Rate'
import { Ago, FollowButton, Impaired, Money, Who, describeBundle } from './social-bits'
import { Sk, Tok, TxLink, pct, usd, usdShort } from './bits'
import { Thread } from './Thread'
import { chainLabel } from '../sdk/queries'
import { indexChainLabel, subjectOf } from '../index/types'
import type { MarketExposure, TxBundle } from '../index/types'
import { Flows, primaryLeg } from './Feed'
import { TokLink } from './TokenPage'

export function Market({ uid }: { uid: string }) {
  const m = useMarket(uid)
  const holders = useHolders(uid, undefined, 15)
  const { address } = useAccount()
  const [tf, setTf] = React.useState<TapeFilter>(NO_FILTER)
  const txs = useMarketTxs(uid, 40, tapeQuery(tf, address))
  const filtered = tf.size > 0 || tf.kind !== 'all' || (tf.following && !!address)
  /** which transaction in the tape is showing its legs */
  const [legsOpen, setLegsOpen] = React.useState<string | null>(null)
  const flow = useMarketFlow(uid, 24 * 30)
  const menu = useMenu()
  const s = menu.forUid(uid)
  const parts = parseUid(uid)
  const { profile } = useProfiles((holders.data?.holders ?? []).map((h) => h.account))
  /** the ledger's own witness for this market — a fact, kept apart from the claims */
  const stress = useStress([uid])
  const st = stress.stressOf(uid)
  /**
   * A curated vault's biggest holder is very often another vault: the desk
   * that allocates into it. Naming those is the difference between "a whale
   * entered" and "Steakhouse reallocated".
   */
  const desks = useCuratorsByAccount((holders.data?.holders ?? []).map((h) => h.account))

  /**
   * Name the market from whatever knows it.
   *
   * `idx.markets` is the best answer but not the only one: a market the book
   * has not caught up with still has LEDGER rows, and every one of those
   * carries the name and the lender from the read-time join. Falling straight
   * through to the raw ref showed `0x833589fc` for a market whose own tape,
   * three lines below, said "Morpho cbBTC-USDC 86".
   */
  const fromTape = (txs.data?.txs ?? [])
    .flatMap((t) => t.legs)
    .find((l) => l.marketUid === uid && (l.marketName || l.symbol))
  const fromHolder = (holders.data?.holders ?? []).find((h) => h.symbol)
  const leg =
    (m.data?.marketName as string | undefined) ??
    fromTape?.marketName ??
    s?.holds ??
    fromTape?.symbol ??
    fromHolder?.symbol
  const venue =
    (m.data?.lenderName as string | undefined) ??
    fromTape?.lenderName ??
    s?.venue ??
    prettyProtocol(protocolKeyOf(parts?.lender ?? ''))
  /**
   * Which of the two leads.
   *
   * On a pool lender the market name is the specific one ("Aave V3 USDT") and
   * the lender is the protocol ("Aave V3"). On a Morpho-type lender the market
   * IS the lender key, so the names swap round: the lender field carries
   * "Morpho cbBTC-USDC 86" and the market field carries the leg, "Loan USDC".
   * A feed card can show both and let the reader sort it out; a page whose
   * whole subject is this market should lead with the specific one.
   */
  const generic = /^(loan|collateral|debt|supply|borrow)\b/i.test(leg ?? '')
  const name = (generic ? venue : leg) ?? leg ?? venue ?? shortRef(parts?.ref) ?? uid
  const lender = (generic ? leg : venue) ?? ''
  const logo = (m.data?.assetLogo as string | undefined) ?? fromTape?.assetLogo ?? s?.logo
  const symbol = (m.data?.assetSymbol as string) ?? fromTape?.symbol ?? s?.holds ?? '?'
  const chainId = (m.data?.chainId as string | undefined) ?? fromTape?.chainId ?? s?.chainId ?? parts?.chainId

  return (
    <>
      <a className="crumb" href="#/feed">‹ Feed</a>
      <header className="mhdr">
        {/* the asset opens its own page — only by the index's GROUP key: a ticker is not an identity (two reUSDs) */}
        <TokLink group={m.data?.assetGroup ?? fromTape?.assetGroup} sym={symbol} logo={logo ?? undefined} size={40} />
        <div>
          <h1>{name}</h1>
          <div className="sub">
            {lender}{chainId ? ` · ${indexChainLabel(chainId, chainLabel)}` : ''}{s ? ` · in the menu at ${pct(s.rate)}` : ''}
            {m.data?.collateralSymbol && (
              <span className="mk-coll">
                {' · against '}
                <TokLink group={m.data.collateralGroup} sym={m.data.collateralSymbol} logo={m.data.collateralLogo ?? undefined} size={16} />
                {m.data.collateralGroup
                  ? <a href={tokenHref(m.data.collateralGroup)}>{m.data.collateralSymbol}</a>
                  : m.data.collateralSymbol}
              </span>
            )}
          </div>
        </div>
        <span className="sp" />
        <div className="mhdr-a">
          <FollowButton kind="market" target={uid} quiet />
          {s && <button className="btn sm pri" onClick={() => go(s.group, { u: s.asset, s: s.id, k: s.kind })}>Open ›</button>}
        </div>
      </header>
      {/* the market's published size (yield-tracer, newest hour) — what the whole market holds, not what the index has read */}
      {m.data?.totals && (
        <div className="cstats mk-totals">
          <div className="cstat"><span className="k">Deposits</span><span className="v">{usdShort(num(m.data.totals.depositsUsd))}</span><span className="n">as of <Ago ts={m.data.totals.ts} /></span></div>
          <div className="cstat"><span className="k">Borrowed</span><span className="v">{usdShort(num(m.data.totals.debtUsd))}</span><span className="n">{utilOf(m.data.totals)}</span></div>
          <div className="cstat"><span className="k">Available</span><span className="v">{usdShort(num(m.data.totals.liquidityUsd))}</span><span className="n">what can still be borrowed or withdrawn</span></div>
        </div>
      )}
      {!s && <div className="note">This app has no row for this market — it is outside the curated menu (too small, too risky, a chain this build does not offer, or a venue whose ticket is not written). You can still read it here.</div>}
      {m.isError && !fromTape && !holders.data?.holders.length && (
        <div className="note">
          The market book has no row for this uid yet, and the ledger has no
          event for it either — the index may never have seen a log from it.
        </div>
      )}

      {/*
        What the LEDGER sees. Computed for every market whoever said what, so
        it is a fact and is presented as one — separately from the claims
        below, which are opinions with weights.
      */}
      {st && st.flags.length > 0 && (
        <div className="stress">
          <span className="s-k">the index sees</span>
          {st.flags.map((f) => (
            <span key={f} className="s-f">
              {f === 'outflow-spike'
                ? `${usdShort(st.outflow6hUsd)} withdrawn in 6 h — ${st.outflowRatio ? `${st.outflowRatio.toFixed(1)}×` : 'well above'} this market's own normal`
                : f === 'index-drop'
                  ? `its share price fell ${st.indexDropBps} bps — a loss carried by depositors`
                  : f === 'liquidation-spike'
                    ? `${st.liquidations24h} liquidations in 24 h`
                    : `the asset is ${st.depegBps} bps below its peg`}
            </span>
          ))}
        </div>
      )}

      <section className="sec" style={{ marginTop: 20 }}>
        <div className="sec-h">
          <h2>What holders say</h2>
          <span className="sub">claims, weighted by what the claimant holds here — never a score</span>
        </div>
        <div className="card pad rate-card"><Rate kind="market" subject={uid} /></div>
      </section>

      <Exposure e={m.data?.exposure} />

      <div className="mgrid">
        <section className="sec" style={{ marginTop: 0 }}>
          <div className="sec-h"><h2>Who is in it</h2><span className="sub">biggest first, from the index</span></div>
          <div className="card">
            {holders.isLoading && <div className="empty"><Sk w={200} /></div>}
            {!holders.isLoading && !holders.data?.holders.length && <div className="empty">No holder the index can name yet.</div>}
            <div className="list">{(holders.data?.holders ?? []).map((h, i) => (
              <a key={h.account + i} className="row wrow" href={`#/w/${h.account}`}>
                <span className="rank">{i + 1}</span>
                <Who account={h.account} profile={profile(h.account)} idx={h} sub={h.side === 'borrow' ? 'debt' : undefined} plain />
                <span className="sp" />
                <span className="v">{h.valueStatus === 'impaired' ? <Impaired x={h} short /> : <Money usd={h.amountUsd} amount={h.amount} symbol={h.symbol} short />}<DeskChips x={h} max={1} /><CuratorMark c={desks.curatorOf(h.account)} /></span>
              </a>
            ))}</div>
          </div>
          {flow.data?.flow?.length ? <Flow rows={flow.data.flow} /> : null}
        </section>

        <section className="sec" style={{ marginTop: 0 }}>
          <div className="sec-h"><h2>Tape</h2><span className="sub">{filtered ? 'filtered, last 30 days' : 'folded per transaction'}</span></div>
          <TapeFilters f={tf} set={setTf} connected={!!address} />
          <div className={`card${txs.isPlaceholderData ? ' stale' : ''}`}>
            {txs.isLoading && <div className="empty"><Sk w={180} /></div>}
            {txs.isError && <div className="empty">The index did not answer for this tape.</div>}
            {!txs.isLoading && !txs.isError && !txs.data?.txs.length && (
              filtered
                ? <div className="empty">{tf.following ? 'None of the wallets you follow' : 'Nothing'} matching in the last 30 days. <button className="lnk" onClick={() => setTf(NO_FILTER)}>Clear filters</button></div>
                : <div className="empty">Nothing yet.</div>
            )}
            <div className="tape">{(txs.data?.txs ?? []).filter((t) => passes(t, tf)).map((t) => {
              const l = primaryLeg(t), d = describeBundle(t)
              const id = `${t.chainId}:${t.txHash}`
              return (
                /* "folded per transaction" had no way to unfold: a four-leg
                   rebalance read as one line and one number */
                <div key={id} className="tape-fold">
                  <div className="tape-item">
                    <a className="tape-row" href={`#/w/${subjectOf(t).account || l?.account}`}>
                      <span className={`verb ${d.cls}`}>{d.verb}</span>
                      <span className="tr-m"><Who account={subjectOf(t).account || l?.account || ''} idx={subjectOf(t)} size={20} plain /></span>
                      <span className="tr-v"><Money usd={t.volumeUsd ?? l?.amountUsd} status={l?.usdStatus} amount={l?.amount} symbol={l?.symbol} short /></span>
                      <span className="tr-t"><Ago ts={t.blockTs} /></span>
                    </a>
                    {t.legs.length > 1 && (
                      <button className="tape-legs" aria-expanded={legsOpen === id}
                        title="what moved, leg by leg"
                        onClick={() => setLegsOpen(legsOpen === id ? null : id)}>
                        {t.legs.length} legs
                      </button>
                    )}
                    <TxLink chainId={t.chainId} hash={t.txHash} />
                  </div>
                  {legsOpen === id && <div className="tape-flows"><Flows tx={t} /></div>}
                </div>
              )
            })}</div>
          </div>
        </section>
      </div>

      <section className="sec">
        <div className="sec-h"><h2>Thread</h2><span className="sub">a comment from someone who holds it carries their size</span></div>
        <div className="card pad"><Thread kind="market" subjectKey={uid} placeholder="What do you make of this market?" /></div>
      </section>
    </>
  )
}

/**
 * The tape's filters. They run in the index, not over the 40 rows already
 * loaded: on a busy market those 40 are twenty minutes, and "≥ $1m" over
 * twenty minutes is an empty list that reads as "no big money moved".
 */
interface TapeFilter { size: number; kind: keyof typeof KINDS; following: boolean }
const NO_FILTER: TapeFilter = { size: 0, kind: 'all', following: false }
const SIZES: [number, string][] = [[0, 'Any size'], [10_000, '≥ $10k'], [100_000, '≥ $100k'], [1_000_000, '≥ $1m']]
const KINDS = {
  all: { label: 'Everything', kinds: '' },
  deposit: { label: 'Deposits', kinds: 'deposit' },
  withdraw: { label: 'Withdrawals', kinds: 'withdraw' },
  borrow: { label: 'Borrows', kinds: 'borrow' },
  repay: { label: 'Repays', kinds: 'repay' },
  liquidated: { label: 'Liquidations', kinds: 'liquidated' },
}
function tapeQuery(f: TapeFilter, me: string | undefined): MarketTapeQuery {
  return {
    minUsd: f.size || undefined,
    kinds: KINDS[f.kind].kinds || undefined,
    follower: f.following && me ? me.toLowerCase() : undefined,
  }
}

/**
 * The same size and kind test, re-applied to what came back. The index does
 * the real filtering; this only keeps an index that predates the filters
 * (and ignores the params) from passing an unfiltered tape off as a filtered one.
 */
function passes(t: TxBundle, f: TapeFilter): boolean {
  if (f.size && !t.legs.some((l) => (l.amountUsd ?? 0) >= f.size)) return false
  const want = KINDS[f.kind].kinds
  if (want && !Object.keys(t.kinds).some((k) => k.slice(k.indexOf('/') + 1) === want)) return false
  return true
}

function TapeFilters({ f, set, connected }: { f: TapeFilter; set: (f: TapeFilter) => void; connected: boolean }) {
  return (
    <div className="tape-f">
      {connected && (
        <div className="seg sm" role="group" aria-label="Whose moves">
          <button aria-pressed={!f.following} onClick={() => set({ ...f, following: false })}>Everyone</button>
          <button aria-pressed={f.following} onClick={() => set({ ...f, following: true })}>Following</button>
        </div>
      )}
      <div className="seg sm" role="group" aria-label="Size">
        {SIZES.map(([v, l]) => <button key={v} aria-pressed={f.size === v} onClick={() => set({ ...f, size: v })}>{l}</button>)}
      </div>
      <select className="tape-k" aria-label="Kind of move" value={f.kind} onChange={(e) => set({ ...f, kind: e.target.value as TapeFilter['kind'] })}>
        {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
    </div>
  )
}

/**
 * Thirty days of the SUPPLY side: money in above the line, out below. The
 * rollup answers one row per (side, day), so the debt side is dropped rather
 * than added — a market's borrow flow is a different story and mixing the two
 * makes a chart that means nothing.
 *
 * The window is drawn as a calendar, not as a list of the days that happen to
 * have rows: a market with two busy days out of thirty was rendering as two
 * half-width blocks, which reads as "half in, half out" when it means "quiet
 * for four weeks, then this". Empty days stay empty and say so.
 *
 * Both halves are measured off the same zero line at the middle, so the line
 * is a real axis rather than wherever each column's pair happened to centre.
 */
const DAY = 86_400_000
const dayKey = (t: number | string) => new Date(t).toISOString().slice(0, 10)

function Flow({ rows }: { rows: FlowBucket[] }) {
  const byDay = new Map<string, { inUsd: number; outUsd: number }>()
  for (const r of rows) {
    if (r.side === 'borrow') continue
    const k = dayKey(r.ts)
    const cur = byDay.get(k) ?? { inUsd: 0, outUsd: 0 }
    cur.inUsd += r.inflow_usd ?? 0
    cur.outUsd += r.outflow_usd ?? 0
    byDay.set(k, cur)
  }
  const end = Date.now()
  const days = Array.from({ length: 30 }, (_, i) => {
    const t = end - (29 - i) * DAY
    const k = dayKey(t)
    return { k, t, ...(byDay.get(k) ?? { inUsd: 0, outUsd: 0 }) }
  })
  const max = Math.max(0, ...days.map((d) => Math.max(d.inUsd, d.outUsd)))
  if (max === 0) return null   // a chart of nothing says less than no chart
  const totIn = days.reduce((a, d) => a + d.inUsd, 0)
  const totOut = days.reduce((a, d) => a + d.outUsd, 0)
  const net = totIn - totOut
  const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return (
    <div className="card flowcard">
      <div className="ch">
        <span className="t">Deposits · 30 days</span>
        <span className="sp" />
        <span className={`m ${net >= 0 ? 'ok' : 'bad'}`}>{net >= 0 ? '+' : '−'}{usdShort(Math.abs(net))} net</span>
      </div>
      {/* the two words are the legend: without them a red block below a green
          one is just a colour, and the reader has to guess which way is out */}
      <div className="flow-body">
        <div className="flow-side">
          <span className="in">in</span>
          <span className="out">out</span>
        </div>
        <div className="flow" role="img"
          aria-label={`${usd(totIn)} deposited and ${usd(totOut)} withdrawn over 30 days, ${usd(net)} net`}>
          {days.map((d) => (
            <span key={d.k} className="fbar"
              title={d.inUsd || d.outUsd
                ? `${day(d.t)} · in ${usdShort(d.inUsd)} · out ${usdShort(d.outUsd)}`
                : `${day(d.t)} · nothing moved`}>
              <i className="half up"><i style={{ height: `${(d.inUsd / max) * 100}%` }} /></i>
              <i className="half dn"><i style={{ height: `${(d.outUsd / max) * 100}%` }} /></i>
            </span>
          ))}
          <i className="zero" aria-hidden="true" />
        </div>
      </div>
      {/* the scale, said in figures: a bar is only readable against the day
          that set the height of every other one */}
      <div className="flow-f">
        <span>{day(days[0].t)}</span>
        <span className="sp" />
        <span className="pk">tallest day {usdShort(max)}</span>
        <span className="sp" />
        <span>today</span>
      </div>
    </div>
  )
}
/** a USD figure may arrive as a numeric string off a Postgres numeric column */
const num = (x: number | string | null | undefined) => (x == null || x === '' ? null : Number(x))
const utilOf = (t: { depositsUsd: number | string | null; debtUsd: number | string | null }) => {
  const d = num(t.depositsUsd), b = num(t.debtUsd)
  return d && b != null ? `${pct((b / d) * 100, 1)} utilized` : 'borrowed from it'
}
/** `0x833589fcd6…2913` — enough of a ref to recognise, when nothing named it. */
const shortRef = (ref: string | undefined) =>
  ref && ref.startsWith('0x') && ref.length > 14 ? `${ref.slice(0, 8)}…${ref.slice(-4)}` : ref

export { marketHref }

/**
 * Whose credit the money in this market sits behind (pos-indexer
 * tickets/0011).
 *
 * `status` is read BEFORE the legs, on purpose. `unavailable` means the
 * allocation could not be read at all — a curated vault that publishes none
 * and that this index has no positions for — and it is rendered as words.
 * Showing an empty list there would tell a depositor the vault is exposed to
 * nothing, which is the most dangerous sentence this object can produce.
 *
 * `unattributedPct` sits next to the legs for the same reason: without it
 * the weights read as the whole picture and overstate every one.
 */
function Exposure({ e }: { e?: MarketExposure | null }) {
  if (!e) return null
  const weighted = (e.legs ?? []).some((l) => l.weightPct != null)
  return (
    <section className="sec">
      <div className="sec-h">
        <h2>Whose credit</h2>
        <span className="sub">what this market&rsquo;s money sits behind</span>
      </div>
      <div className="card" style={{ padding: 12 }}>
        <div className="expo">
          {e.status === 'unavailable' && (
            <div className="none">
              <b>Not readable.</b> This provider publishes no allocation, and the
              index has no positions for it yet — so nothing here is known.
              That is not the same as &ldquo;exposed to nothing&rdquo;.
            </div>
          )}
          {e.status === 'none' && (
            <div className="none">Read, and nothing in it names a desk this index knows.</div>
          )}
          {e.status === 'resolved' && !!e.legs?.length && (
            <>
              <div className="legs">
                {e.legs.map((l) => (
                  <span key={l.id} className={`desk-chip lg${l.via ? ' via' : ''}`}
                    title={l.via ? `reached through the token\u2019s own exposure` : l.name}>
                    {l.name}{l.weightPct != null && <b style={{ marginLeft: 5, opacity: .7 }}>{l.weightPct.toFixed(1)}%</b>}
                  </span>
                ))}
              </div>
              <div className="meta">
                <span title={`source: ${e.source}`}>
                  {e.source === 'ledger-allocation'
                    ? 'from the vault\u2019s own positions in this index'
                    : e.source === 'market-collateral'
                      ? 'what can be posted against this market'
                      : e.source}
                </span>
                {e.unattributedPct != null && e.unattributedPct > 0 && (
                  <span title="the share whose collateral names no desk — without it the weights above read as the whole picture">
                    unattributed {e.unattributedPct.toFixed(1)}%
                  </span>
                )}
                {!weighted && (
                  <span title="nothing says how much of a deposit backs which collateral, and an equal split would be a number nobody can act on">
                    unweighted
                  </span>
                )}
                {e.asOf && <span title="the oldest position read the weights came from">as of <Ago ts={e.asOf} /></span>}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
