/**
 * A market as a place: what it is, who is in it, what moved, and the thread.
 * The uid is the same string the catalogue, the index and the social service
 * all use, so this page is reachable from a strategy row, a feed card and a
 * position alike.
 */
import React from 'react'
import { go, marketHref } from '../state/AppState'
import { useHolders, useMarket, useMarketFlow, useMarketTxs } from '../index/queries'
import type { FlowBucket } from '../index/api'
import { useProfiles } from '../social/queries'
import { useMenu } from './useMenu'
import { parseUid, protocolKeyOf } from '../model/uid'
import { prettyProtocol } from './ProtocolFilter'
import { DeskChips } from './IssuerFilter'
import { Ago, FollowButton, Money, Who, describeTx } from './social-bits'
import { Sk, Tok, TxLink, pct, usd, usdShort } from './bits'
import { Thread } from './Thread'
import { chainLabel } from '../sdk/queries'
import { indexChainLabel } from '../index/types'
import type { MarketExposure } from '../index/types'
import { primaryLeg } from './Feed'

export function Market({ uid }: { uid: string }) {
  const m = useMarket(uid)
  const holders = useHolders(uid, undefined, 15)
  const txs = useMarketTxs(uid, 40)
  const flow = useMarketFlow(uid, 24 * 30)
  const menu = useMenu()
  const s = menu.forUid(uid)
  const parts = parseUid(uid)
  const { profile } = useProfiles((holders.data?.holders ?? []).map((h) => h.account))

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
        <Tok sym={symbol} logo={logo ?? undefined} size={40} />
        <div>
          <h1>{name}</h1>
          <div className="sub">{lender}{chainId ? ` · ${indexChainLabel(chainId, chainLabel)}` : ''}{s ? ` · in the menu at ${pct(s.rate)}` : ''}</div>
        </div>
        <span className="sp" />
        <div className="mhdr-a">
          <FollowButton kind="market" target={uid} quiet />
          {s && <button className="btn sm pri" onClick={() => go(s.group, { u: s.asset, s: s.id, k: s.kind })}>Open ›</button>}
        </div>
      </header>
      {!s && <div className="note">This app has no row for this market — it is outside the curated menu (too small, too risky, a chain this build does not offer, or a venue whose ticket is not written). You can still read it here.</div>}
      {m.isError && !fromTape && !holders.data?.holders.length && (
        <div className="note">
          The market book has no row for this uid yet, and the ledger has no
          event for it either — the index may never have seen a log from it.
        </div>
      )}

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
                <span className="v"><Money usd={h.amountUsd} amount={h.amount} symbol={h.symbol} short /><DeskChips x={h} max={1} /></span>
              </a>
            ))}</div>
          </div>
          {flow.data?.flow?.length ? <Flow rows={flow.data.flow} /> : null}
        </section>

        <section className="sec" style={{ marginTop: 0 }}>
          <div className="sec-h"><h2>Tape</h2><span className="sub">folded per transaction</span></div>
          <div className="card">
            {txs.isLoading && <div className="empty"><Sk w={180} /></div>}
            {!txs.isLoading && !txs.data?.txs.length && <div className="empty">Nothing yet.</div>}
            <div className="tape">{(txs.data?.txs ?? []).map((t) => {
              const l = primaryLeg(t), d = describeTx(t.kinds)
              return (
                <div key={`${t.chainId}:${t.txHash}`} className="tape-item">
                  <a className="tape-row" href={`#/w/${t.accounts[0] ?? l?.account}`}>
                    <span className={`verb ${d.cls}`}>{d.verb}</span>
                    <span className="tr-m"><Who account={t.accounts[0] ?? l?.account ?? ''} size={20} plain /></span>
                    <span className="tr-v"><Money usd={t.volumeUsd ?? l?.amountUsd} status={l?.usdStatus} amount={l?.amount} symbol={l?.symbol} short /></span>
                    <span className="tr-t"><Ago ts={t.blockTs} /></span>
                  </a>
                  <TxLink chainId={t.chainId} hash={t.txHash} />
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
 * Thirty days of the SUPPLY side as bars — money in above the line, out below.
 * The rollup answers one row per (side, day), so the debt side is dropped
 * rather than added: a market's borrow flow is a different story and mixing
 * the two makes a chart that means nothing.
 */
function Flow({ rows }: { rows: FlowBucket[] }) {
  const byDay = new Map<string, { inUsd: number; outUsd: number }>()
  for (const r of rows) {
    if (r.side === 'borrow') continue
    const cur = byDay.get(r.ts) ?? { inUsd: 0, outUsd: 0 }
    cur.inUsd += r.inflow_usd ?? 0
    cur.outUsd += r.outflow_usd ?? 0
    byDay.set(r.ts, cur)
  }
  const last = [...byDay.entries()].sort((a, b) => Date.parse(a[0]) - Date.parse(b[0])).slice(-30)
  if (!last.length) return null
  const peak = Math.max(0, ...last.map(([, v]) => Math.max(v.inUsd, v.outUsd)))
  if (peak === 0) return null   // a chart of nothing says less than no chart
  const max = peak
  const net = last.reduce((a, [, v]) => a + v.inUsd - v.outUsd, 0)
  return (
    <div className="card flowcard">
      <div className="ch"><span className="t">Deposits · 30 days</span><span className="sp" /><span className={`m ${net >= 0 ? 'ok' : 'bad'}`}>{net >= 0 ? '+' : '−'}{usdShort(Math.abs(net))} net</span></div>
      <div className="flow" role="img" aria-label={`net ${usd(net)} over 30 days`}>
        {last.map(([ts, v]) => (
          <span key={ts} className="fbar" title={`${new Date(ts).toLocaleDateString()} · in ${usdShort(v.inUsd)} · out ${usdShort(v.outUsd)}`}>
            <i className="up" style={{ height: `${(v.inUsd / max) * 100}%` }} />
            <i className="dn" style={{ height: `${(v.outUsd / max) * 100}%` }} />
          </span>
        ))}
      </div>
    </div>
  )
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
