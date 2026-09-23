/**
 * A desk.
 *
 * For a managed vault the depositor does not pick the market — this entity
 * does, daily, sometimes across four lenders. That makes it the most
 * important fact about the position and, until the index grew this axis, it
 * was a truncated string nothing could group by.
 *
 * Everything here is a COMPONENT with its inputs beside it: AUM from the
 * holder rows, the return from two share-index points, the concentration from
 * the allocation table below it. There is no grade and no forecast — the page
 * that says "A−" is a page we would have to defend; this one the chain
 * defends.
 *
 * And the sentence this page must never say: **"unverified" is not a
 * warning.** `verified` means exactly "listed in a curator registry we read",
 * and most desks are not. That is a fact about the registry.
 */
import React from 'react'
import { useCurator, useCuratorAllocation, useCuratorHolders, useCuratorTxs } from '../index/queries'
import { useProfiles } from '../social/queries'
import type { AllocationSlice } from '../index/api'
import { indexChainLabel } from '../index/types'
import { chainLabel } from '../sdk/queries'
import { curatorLabel } from './CuratorFilter'
import { prettyProtocol } from './ProtocolFilter'
import { Rate } from './Rate'
import { Thread } from './Thread'
import { Ago, FollowButton, Money, Who, describeTx } from './social-bits'
import { Sk, TxLink, pct, usd, usdShort } from './bits'

function Slices({ title, note, rows, pretty }: {
  title: string
  note: string
  rows: AllocationSlice[]
  /** the index's own key vocabulary is not a display vocabulary */
  pretty?: (k: string) => string
}) {
  const total = rows.reduce((a, r) => a + r.usd, 0)
  return (
    <div className="alloc">
      <div className="alloc-h">{title}<span className="sub">{note}</span></div>
      {!rows.length && <div className="empty">Nothing read yet.</div>}
      {rows.slice(0, 8).map((r) => (
        <div key={r.key} className="alloc-row" title={`${r.name ?? r.key} — ${usd(r.usd)}`}>
          <span className="a-n">{r.name ?? (pretty ? pretty(r.key) : r.key)}</span>
          <span className="a-bar"><i style={{ width: `${Math.max(2, total ? (r.usd / total) * 100 : 0)}%` }} /></span>
          <span className="a-p">{r.pct == null ? '—' : `${r.pct.toFixed(1)}%`}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * A desk's mark is not always square. Several are lockups — two logos with an
 * "x" between them — and a 40px circle with `object-fit:cover` crops one of
 * those to its middle, which is the right half of the first mark beside the
 * left half of the second. The artwork says which it is, so we ask it: wider
 * than it is tall, and we keep it whole in a rounded box rather than cutting a
 * circle out of the join.
 */
function CuratorLogo({ src }: { src?: string | null }) {
  const [shape, setShape] = React.useState<'square' | 'wide' | 'none'>('square')
  React.useEffect(() => setShape('square'), [src])
  if (!src || shape === 'none') return <i className="chdr-logo plogo">c</i>
  return (
    <img
      className={`chdr-logo${shape === 'wide' ? ' wide' : ''}`}
      src={src}
      alt=""
      onLoad={(e) => {
        const im = e.currentTarget
        if (im.naturalWidth > im.naturalHeight * 1.3) setShape('wide')
      }}
      // a logo that will not load should leave the letter, not a broken picture
      onError={() => setShape('none')}
    />
  )
}

export function Curator({ id }: { id: string }) {
  const c = useCurator(id)
  const alloc = useCuratorAllocation(id)
  const txs = useCuratorTxs(id, 30)
  const holders = useCuratorHolders(id, 10)
  const { profile } = useProfiles((holders.data?.holders ?? []).map((h) => h.account))
  const d = c.data
  const s = d?.stats['30d']

  if (c.isError)
    return (
      <>
        <a className="crumb" href="#/explore">‹ Explore</a>
        <div className="note">The index has no desk with this id. It may have been renamed, or its vaults may have moved to another controller.</div>
      </>
    )

  return (
    <>
      <a className="crumb" href="#/feed">‹ Feed</a>
      <header className="mhdr">
        <CuratorLogo src={d?.logoUri} />
        <div>
          <h1>{d ? curatorLabel(d) : c.isLoading ? '…' : id}</h1>
          <div className="sub">
            {/* one sentence, in words — never a badge that reads as an accusation */}
            {d?.verified
              ? 'Listed in Morpho’s curator registry'
              : 'Not in any curator registry we read'}
            {d?.candidate ? ' · identified by the address that controls its vaults' : ''}
            {s ? ` · ${s.nVaults} vaults on ${s.nChains} chain${s.nChains === 1 ? '' : 's'}` : ''}
          </div>
        </div>
        <span className="sp" />
        <div className="mhdr-a">
          <FollowButton kind="curator" target={id} quiet />
        </div>
      </header>

      {d?.description && <div className="note">{d.description}</div>}

      <div className="cstats">
        <div className="cstat">
          <span className="k">Under management</span>
          <span className="v">{usdShort(s?.aumUsd ?? null)}</span>
          <span className="n">{s?.nHolders ?? 0} depositors the index has read</span>
        </div>
        <div className="cstat">
          <span className="k">Depositor return · 30 d</span>
          <span className="v">
            {s?.depositorReturnPct == null ? '—' : `${s.returnExact ? '' : '≈'}${pct(s.depositorReturnPct)}`}
          </span>
          {/* the honest footnote: what the number covers, not what it claims */}
          <span className="n">
            {s?.depositorReturnPct == null
              ? 'no share-index series yet'
              : s.returnExact
                ? 'share price, net of fees, AUM-weighted'
                : `covers ${s.nVaultsReturned ?? 0} of ${s.nVaults} vaults — the rest had no index at the window’s start`}
          </span>
        </div>
        <div className="cstat">
          <span className="k">Worst drawdown</span>
          <span className="v">{s?.worstDrawdownBps ? `${s.worstDrawdownBps} bps` : '0 bps'}</span>
          <span className="n">the largest fall of any of its vaults’ share prices</span>
        </div>
        <div className="cstat">
          <span className="k">Concentration</span>
          <span className="v">{s?.hhi == null ? '—' : s.hhi.toFixed(2)}</span>
          <span className="n">1.0 = one market holds everything · {s?.nMarketsTouched ?? 0} touched</span>
        </div>
        <div className="cstat">
          <span className="k">Moves · 30 d</span>
          <span className="v">{s?.nMoves ?? 0}</span>
          <span className="n">
            rebalance transactions
            {s?.windowCoveredFrom ? ` · indexed from ${new Date(s.windowCoveredFrom).toISOString().slice(0, 10)}` : ''}
          </span>
        </div>
      </div>

      <section className="sec">
        <div className="sec-h"><h2>What depositors say</h2><span className="sub">weighted by what the sayer has given this desk to manage</span></div>
        <div className="card pad rate-card"><Rate kind="curator" subject={id} /></div>
      </section>

      <section className="sec">
        <div className="sec-h">
          <h2>Where the money went</h2>
          <span className="sub">
            {alloc.data
              ? /*
                 * This is what its VAULTS hold, which is not the same number
                 * as what depositors have put in above: that one counts only
                 * the holders the reader has been through so far, and it
                 * catches up as it goes. Saying so beats letting the two
                 * numbers argue silently on the same page.
                 */
                `${usdShort(alloc.data.totalUsd)} across ${alloc.data.markets.length} markets — what its vaults hold, read position by position`
              : 'its own positions'}
          </span>
        </div>
        <div className="card pad cgrid">
          <Slices title="Where" note="by protocol" rows={alloc.data?.byProtocol ?? []} pretty={prettyProtocol} />
          <Slices title="What" note="by asset" rows={alloc.data?.byAssetGroup ?? []} />
          <Slices
            title="Whose credit"
            note={
              alloc.data?.unattributedPct
                ? `by desk · ${alloc.data.unattributedPct.toFixed(0)}% unattributed`
                : 'by desk behind the collateral'
            }
            rows={alloc.data?.byIssuer ?? []}
          />
        </div>
      </section>

      <div className="mgrid">
        <section className="sec" style={{ marginTop: 0 }}>
          <div className="sec-h"><h2>Vaults</h2><span className="sub">and how each mapping was established</span></div>
          <div className="card">
            {c.isLoading && <div className="empty"><Sk w={180} /></div>}
            {!c.isLoading && !d?.vaults.length && <div className="empty">No vault mapped to this desk.</div>}
            <div className="list">
              {(d?.vaults ?? []).map((v) => (
                <a key={v.marketUid} className="row wrow" href={`#/m/${encodeURIComponent(v.marketUid)}`}>
                  <span className="nm">{v.name ?? v.symbol ?? v.marketUid.slice(0, 28)}</span>
                  <span className="sp" />
                  <span className="sub">{indexChainLabel(v.chainId, chainLabel)}</span>
                  <span className="v"><Money usd={v.aumUsd} short /></span>
                  <span className="arm" title={`confidence: ${v.confidence}`}>{v.arm}</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="sec" style={{ marginTop: 0 }}>
          <div className="sec-h"><h2>Who is in it</h2><span className="sub">biggest depositors the index has read</span></div>
          <div className="card">
            {holders.isLoading && <div className="empty"><Sk w={160} /></div>}
            {!holders.isLoading && !holders.data?.holders.length && <div className="empty">No depositor the index can name yet.</div>}
            <div className="list">
              {(holders.data?.holders ?? []).map((h, i) => (
                <a key={h.account + i} className="row wrow" href={`#/w/${h.account}`}>
                  <span className="rank">{i + 1}</span>
                  <Who account={h.account} profile={profile(h.account)} size={22} idx={h as never} />
                  <span className="sp" />
                  <span className="v"><Money usd={h.amountUsd} short /></span>
                  <span className="sub">{h.vaults} vault{h.vaults === 1 ? '' : 's'}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="sec">
        <div className="sec-h">
          <h2>What it did</h2>
          <span className="sub">one row per transaction — a reallocation is one move, not two</span>
        </div>
        <div className="card">
          {txs.isLoading && <div className="empty"><Sk w={180} /></div>}
          {!txs.isLoading && !txs.data?.txs.length && <div className="empty">No move in the indexed window.</div>}
          <div className="tape">
            {(txs.data?.txs ?? []).map((t) => (
              <div key={`${t.chainId}:${t.txHash}`} className="tape-item">
                <div className="tape-row">
                  <span className={`tr-k ${describeTx(t.kinds).cls}`}>{describeTx(t.kinds).verb}</span>
                  <span className="sp" />
                  <span className="tr-v"><Money usd={t.volumeUsd} short /></span>
                  <span className="tr-t"><Ago ts={t.blockTs} /></span>
                  <TxLink chainId={t.chainId} hash={t.txHash} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="sec-h"><h2>Thread</h2><span className="sub">a comment from a depositor carries their size</span></div>
        <div className="card pad"><Thread kind="curator" subjectKey={id} placeholder="What do you make of this desk?" /></div>
      </section>
    </>
  )
}
