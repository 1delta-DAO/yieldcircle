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
import { parseUid } from '../model/uid'
import { Ago, FollowButton, Money, Who, describeTx } from './social-bits'
import { Sk, Tok, TxLink, pct, usd, usdShort } from './bits'
import { Thread } from './Thread'
import { chainLabel } from '../sdk/queries'
import { indexChainLabel } from '../index/types'
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
  const name = (m.data?.marketName as string | undefined) ?? s?.holds ?? parts?.ref?.slice(0, 10) ?? uid
  const lender = (m.data?.lenderName as string | undefined) ?? s?.venue ?? parts?.lender ?? ''
  const chainId = (m.data?.chainId as string | undefined) ?? s?.chainId ?? parts?.chainId

  return (
    <>
      <a className="crumb" href="#/feed">‹ Feed</a>
      <header className="mhdr">
        <Tok sym={(m.data?.assetSymbol as string) ?? s?.holds ?? '?'} logo={(m.data?.assetLogo as string) ?? s?.logo} size={40} />
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
      {m.isError && <div className="note">The index does not know this uid yet. It may be a market it has never seen a log for.</div>}

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
                <span className="v"><Money usd={h.amountUsd} amount={h.amount} symbol={h.symbol} short /></span>
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
export { marketHref }
