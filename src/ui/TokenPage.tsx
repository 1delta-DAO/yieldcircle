/**
 * An asset as a place (pos-indexer tickets/0026): where the money in one token
 * sits, who lends it, who borrows it, what it earns on its own, and who is
 * talking about it.
 *
 * Keyed by the asset GROUP — yield-tracer's cross-chain price key — so USDC on
 * Base and USDC on Ethereum are one page, and the per-chain split is a table
 * on it rather than two pages that each look like the whole story. The name
 * `AssetPage` was taken by the strategy list for a group of assets (`#/USD`),
 * which is a different question: this page is about one token.
 *
 * Every number is the index's, beside what it covers: curated-vault TVL is
 * money ALREADY inside the markets above and is never added to them; a supply
 * total is only shown where no bridged member would count it twice; and
 * "wallets we index" is exactly that, never "every holder".
 */
import React from 'react'
import { useApp, marketHref, tokenHref, walletHref } from '../state/AppState'
import { useAsset, useAssetBook, useAssetHistory, useAssetHolders, useFeedPage } from '../index/queries'
import type { AssetBookRow, AssetHistory, AssetMarket, AssetSlice } from '../index/types'
import { indexChainLabel, subjectOf } from '../index/types'
import { chainLabel, useCatalog } from '../sdk/queries'
import { canonGroup, isSolGroup, spellingsOf } from '../model/assetGroup'
import type { Strategy } from '../model/strategies'
import { normAddr } from '../model/address'
import { useCounts, useProfiles } from '../social/queries'
import { ChainMark } from './ChainMark'
import { Slices } from './Curator'
import { curatorHref } from './CuratorFilter'
import { DeskChips } from './IssuerFilter'
import { prettyProtocol } from './ProtocolFilter'
import { Rate } from './Rate'
import { Thread } from './Thread'
import { Flows, primaryLeg } from './Feed'
import { Ago, Comments, ImpairedNote, Money, Who, describeBundle } from './social-bits'
import { KindPill, ProtocolLogo, Sk, StratMark, Tok, Toks, TxLink, pct, protocolIconUrls, usd, usdShort } from './bits'

const chainName = (id: string) => indexChainLabel(id, chainLabel)
/** utilization arrives as 0..1; a figure already in percent is passed through rather than shown ×100 */
const utilPct = (u: number | null | undefined) => (u == null ? '—' : pct(u <= 1.5 ? u * 100 : u, 1))
const signed = (x: number | null | undefined, d = 2) =>
  x == null || !Number.isFinite(x) ? null : `${x > 0 ? '+' : ''}${pct(x, d)}`
function Change({ x, suffix }: { x: number | null | undefined; suffix?: string }) {
  const s = signed(x)
  if (!s) return <span className="t40">no 24 h change yet</span>
  return <span className={x! >= 0 ? 'ok' : 'bad'}>{s}{suffix ?? ' · 24 h'}</span>
}
/** A token amount as a decimal string, compact — the supply of a stablecoin is ten digits before the point. */
/** a chain's gas coin as a group member (the zero address or the 0xeeee alias) */
const isNative = (a: string) => /^0x(0{40}|e{40})$/i.test(a)

function compactAmount(a: string): string {
  const n = Number(a)
  if (!Number.isFinite(n)) return a
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

/**
 * A token's mark that opens its asset page. `group` should be the index's
 * group key; a bare symbol also works (the server resolves it to the canonical
 * group and the page then corrects its own hash). Rows around it are often
 * clickable themselves, so the click stops here.
 */
export function TokLink({ group, sym, logo, size }: { group: string | null | undefined; sym: string; logo?: string; size?: number }) {
  if (!group || group === '?') return <Tok sym={sym} logo={logo} size={size} />
  return (
    <a className="toklink" href={tokenHref(group)} title={`${sym} — the asset page`} onClick={(e) => e.stopPropagation()}>
      <Tok sym={sym} logo={logo} size={size} />
    </a>
  )
}

/**
 * The way into an asset page that reads as one: the token's name and an arrow,
 * where most people look, rather than a hover ring on its icon. For the
 * surfaces that are about doing something with the token (the ticket, an
 * Earn shelf filtered to it).
 */
export function AssetLink({ group, sym, logo }: { group: string | null | undefined; sym: string; logo?: string }) {
  if (!group || group === '?') return null
  return (
    <a className="assetlink" href={tokenHref(group)} title={`${sym}: where it sits, who lends and borrows it, who holds it`} onClick={(e) => e.stopPropagation()}>
      <Tok sym={sym} logo={logo} size={14} />{sym}<span className="t50"> asset page ›</span>
    </a>
  )
}

// ---------------------------------------------------------------- the page

/** a strategy's ticket on its Earn shelf (the `go()` url, as a link) */
function strategyHref(s: Strategy) {
  const q = new URLSearchParams({ u: s.asset, s: s.id })
  if (s.kind === 'loop') q.set('k', 'loop')
  return `#/${s.group}?${q}`
}

/**
 * Where the menu puts this token to work: the page's way into Earn, from the
 * catalogue rather than the index, so it holds on chains the index cannot
 * answer for yet (Solana). A loop counts when the token is its collateral.
 */
function EarnWith({ group, sym, max = 6 }: { group: string; sym: string; max?: number }) {
  const { chainIds } = useApp()
  const cat = useCatalog(chainIds)
  const key = canonGroup(group)
  // rows a floor holds back still open from here (the shelf resolves `s=` against them too), after the ones it shows
  const rows = [...[...cat.simple, ...cat.loops].sort((x, y) => y.rate - x.rate), ...[...cat.hidden, ...cat.overflow].sort((x, y) => y.rate - x.rate)]
    .filter((s, i, all) => s.assetGroup === key && all.findIndex((o) => o.id === s.id) === i)
  // the index's totals above do not count Solana yet; the menu does
  const solUncounted = !isSolGroup(group) && rows.some((s) => s.chainId === 'solana')
  if (!rows.length)
    return (
      <section className="sec">
        <div className="sec-h"><h2>Earn with {sym}</h2></div>
        <div className="card pad">{cat.isLoading ? <Sk w={220} /> : <span className="t50">Nothing in the menu holds {sym} on the chains in scope.</span>}</div>
      </section>
    )
  const shelf = rows[0]
  return (
    <section className="sec">
      <div className="sec-h">
        <h2>Earn with {sym}</h2>
        <span className="sub">{rows.length} in the menu{solUncounted ? ' · the Solana ones are not in the totals above yet' : ''}</span>
        <span className="sp" />
        <a className="btn sm" href={`#/${shelf.group}?${new URLSearchParams({ u: shelf.asset })}`}>All on Earn ›</a>
      </div>
      <div className="card"><table className="tbl">
        <tbody>{rows.slice(0, max).map((s) => (
          <tr key={s.id} onClick={() => { location.hash = strategyHref(s) }}>
            <td><div className="nm">{s.kind === 'loop' ? <Toks a={s.holds} b={s.debt} logoA={s.logoLong} logoB={s.logoShort} /> : <StratMark sym={s.holds} logo={s.logo} venueKey={s.protocolKey} brand={s.brand} />}
              <a href={strategyHref(s)} onClick={(e) => e.stopPropagation()}><b>{s.kind === 'loop' ? `${s.holds} / ${s.debt} loop` : s.holds}</b></a>
              <span className="t50 hide-m"> · {s.kind === 'loop' ? s.venue : s.via}</span><KindPill kind={s.kind} source={s.kind === 'simple' ? s.source : undefined} /></div>
              <small>{chainLabel(s.chainId)}</small></td>
            <td className="r"><span className={s.rate >= 0 ? 'ok' : 'bad'}>{pct(s.rate)}</span><small>APR{s.kind === 'loop' ? ' · levered' : ''}</small></td>
            <td className="r t40" style={{ width: 20 }}>›</td>
          </tr>
        ))}</tbody>
      </table></div>
    </section>
  )
}

type SliceMode = 'protocol' | 'chain' | 'borrowed' | 'collateral'
const SLICE_MODES: { id: SliceMode; label: string; note: string }[] = [
  { id: 'protocol', label: 'protocol', note: 'lending deposits by protocol' },
  { id: 'chain', label: 'chain', note: 'lending deposits by chain' },
  { id: 'borrowed', label: 'borrowed', note: 'borrows by protocol' },
  { id: 'collateral', label: 'collateral', note: 'posted as collateral, by protocol' },
]

export function TokenPage({ group }: { group: string }) {
  const { chainIds, allChains, chainLabelFor } = useApp()
  const chainsParam = allChains ? undefined : chainIds.join(',')
  const a = useAsset(group, chainsParam)
  const hist = useAssetHistory(group, 90, chainsParam)
  const holders = useAssetHolders(group, 20, chainsParam)
  // the tape files a Solana token under its chain-local key, the page under the cross-chain one: ask for both
  const feed = useFeedPage({ assetGroups: spellingsOf(group).join(','), chainIds: chainsParam }, 30)
  const { profile } = useProfiles((holders.data?.holders ?? []).map((h) => h.account))
  const counts = useCounts([{ kind: 'asset', key: group }])
  const [mode, setMode] = React.useState<SliceMode>('protocol')
  const [allMarkets, setAllMarkets] = React.useState(false)
  const [allVaults, setAllVaults] = React.useState(false)
  const [allWrappers, setAllWrappers] = React.useState(false)
  const [legsOpen, setLegsOpen] = React.useState<string | null>(null)
  const threadRef = React.useRef<HTMLElement>(null)
  const d = a.data

  // the server resolves a symbol or a lower-case key; the page's own url should say the canonical one
  React.useEffect(() => {
    if (canonGroup(group) !== group) location.replace(tokenHref(group))
    else if (d?.group && d.group !== group) location.replace(tokenHref(d.group))
  }, [d?.group, group])

  if (a.isError)
    return (
      <>
        <a className="crumb" href="#/t">‹ Assets</a>
        <header className="mhdr">
          <Tok sym={group.split('::')[1] || group} size={40} />
          <div><h1>{group.split('::')[0] || group}</h1><div className="sub">asset{isSolGroup(group) ? ' · Solana' : ''}</div></div>
        </header>
        {isSolGroup(group) ? (
          <div className="note">
            A Solana-only token: the Solana index does not serve asset pages yet, so there are no totals, holders or
            history for it here yet.
          </div>
        ) : (
          <div className="note">
            The index could not answer for this asset — <b>{(a.error as Error).message}</b>. Either no market lends
            it, the group key is spelled differently (they are case-significant), or this deploy of the index has no
            asset pages yet.
          </div>
        )}
        <EarnWith group={group} sym={group.split('::')[1] || group.split('::')[0]} />
      </>
    )

  const sym = d?.symbol ?? group
  const t = d?.totals
  const slices: AssetSlice[] =
    !d ? [] :
    mode === 'protocol' ? d.byProtocol :
    mode === 'chain' ? d.byChain.map((s) => ({ ...s, name: chainName(s.key) })) :
    mode === 'borrowed' ? d.borrowsByProtocol :
    d.collateralByProtocol
  const markets = d?.markets ?? []
  const shownMarkets = allMarkets ? markets : markets.slice(0, 50)
  const desk = d && (d.issuer || d.issuerExposures?.length)
    ? {
        issuer: d.issuer ? { id: d.issuer, name: d.issuerName ?? d.issuer } : null,
        issuerExposures: (d.issuerExposures ?? []).map((e) => ({ id: e.id, name: e.name ?? e.id, hops: e.via ? 2 : 1 })),
      }
    : null
  const nComments = counts.count('asset', group)

  return (
    <>
      <a className="crumb" href="#/t">‹ Assets</a>
      <header className="mhdr">
        <Tok sym={sym} logo={d?.logoUri ?? undefined} size={40} />
        <div>
          <h1>{d?.name ?? (a.isLoading ? sym : group)}{d?.name && d.symbol && d.name !== d.symbol ? <span className="t50" style={{ fontWeight: 400 }}> · {d.symbol}</span> : null}</h1>
          <div className="sub">
            {d ? marketsLine(d.marketCount ?? markets.length, d.chainCount ?? new Set(markets.map((m) => m.chainId)).size) : a.isLoading ? <Sk w={160} /> : null}
            {!allChains && ` · ${chainLabelFor()}`}
            {desk && <> · <DeskChips x={desk} max={3} /></>}
          </div>
        </div>
        <span className="sp" />
        <div className="mhdr-a">
          <Comments n={nComments} onClick={() => threadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        </div>
      </header>

      <div className="cstats">
        <div className="cstat">
          <span className="k">Price</span>
          <span className="v">{d?.price ? usd(d.price.usd) : a.isLoading ? <Sk w={70} h={18} /> : '—'}</span>
          <span className="n">{d?.price ? <Change x={d.price.change24hPct} /> : 'no price in the index yet'}</span>
        </div>
        <div className="cstat">
          <span className="k">Market cap · DefiLlama</span>
          <span className="v">{d?.marketCap ? usdShort(d.marketCap.usd) : '—'}</span>
          <span className="n">{d?.marketCap ? `${isNative(d.marketCap.address) ? `${sym}, the coin` : `${chainName(d.marketCap.chainId)} token`} · as of ${d.marketCap.asOf.slice(0, 10)}` : 'not published for this token'}</span>
        </div>
        <div className="cstat">
          <span className="k">Deposited in lending</span>
          <span className="v">{t ? usdShort(t.depositsUsd) : a.isLoading ? <Sk w={70} h={18} /> : '—'}</span>
          <span className="n">{t ? <Change x={t.depositsChange24hPct} /> : ' '}</span>
        </div>
        <div className="cstat">
          <span className="k">Borrowed</span>
          <span className="v">{t ? usdShort(t.borrowsUsd) : '—'}</span>
          <span className="n">{t ? `${usdShort(t.liquidityUsd)} still available to borrow` : ' '}</span>
        </div>
        <div className="cstat">
          <span className="k">Utilization</span>
          <span className="v">{utilPct(t?.utilization)}</span>
          <span className="n">borrowed ÷ deposited</span>
        </div>
        <div className="cstat">
          <span className="k">Posted as collateral</span>
          <span className="v">{t ? usdShort(t.collateralUsd) : '—'}</span>
          <span className="n">collateral legs (Morpho-, Comet-style), not lent out</span>
        </div>
        <div className="cstat">
          <span className="k">Own yield</span>
          <span className="v">{d?.intrinsicApr != null ? <span className="ok">{pct(d.intrinsicApr)}</span> : '—'}</span>
          <span className="n">{d?.intrinsicApr != null ? 'what the token earns by itself, before any market' : 'nobody publishes a yield for this token'}</span>
        </div>
        <div className="cstat">
          <span className="k">Curated-vault TVL</span>
          <span className="v">{t ? usdShort(t.vaultTvlUsd) : '—'}</span>
          <span className="n">in curated vaults (inside the markets above, not added)</span>
        </div>
        {!!t?.wrappedUsd && t.wrappedUsd > 0 && (
          <div className="cstat">
            <span className="k">Wrapped</span>
            <span className="v">{usdShort(t.wrappedUsd)}</span>
            <span className="n">wrapped (own assets, not lent) — inside tokens built on {sym}</span>
          </div>
        )}
      </div>

      <EarnWith group={group} sym={sym} />

      {d?.headline && (
        <section className="sec">
          <div className="sec-h"><h2>What holders say</h2><span className="sub">claims about {chainName(d.headline.chainId)} {sym}, weighted by what the claimant holds — never a score</span></div>
          <div className="card pad rate-card"><Rate kind="asset" subject={`${d.headline.chainId}:${normAddr(d.headline.address)}`} /></div>
        </section>
      )}

      <section className="sec">
        <div className="sec-h">
          <h2>Where it sits</h2>
          <span className="sub">{SLICE_MODES.find((m) => m.id === mode)!.note}</span>
          <span className="sp" />
          <div className="seg" role="group" aria-label="split by">
            {SLICE_MODES.map((m) => (
              <button key={m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>{m.label}</button>
            ))}
          </div>
        </div>
        <div className="card pad">
          {a.isLoading ? <div className="empty"><Sk w={220} /></div> : (
            <Slices
              title={mode === 'chain' ? 'By chain' : mode === 'borrowed' ? 'Borrowed' : mode === 'collateral' ? 'Collateral' : 'By protocol'}
              note={`${slices.length} ${mode === 'chain' ? 'chain' : 'protocol'}${slices.length === 1 ? '' : 's'}`}
              rows={slices}
              pretty={mode === 'chain' ? chainName : undefined}
            />
          )}
          <StackChart h={hist.data} loading={hist.isLoading} failed={hist.isError} />
          {!!d?.notes.length && (
            <div className="tk-notes">{d.notes.map((n, i) => <div key={i}>{n}</div>)}</div>
          )}
        </div>
      </section>

      <section className="sec">
        <div className="sec-h">
          <h2>Supply per chain</h2>
          <span className="sub">
            {!d ? 'the token’s own totalSupply(), read on chain' :
              d.supply.coin ? `${compactAmount(String(d.supply.coin.amount))} ${sym} in circulation (${usdShort(d.supply.coin.usd)}, DefiLlama)${d.supply.coin.lentPct != null ? ` · ${pct(d.supply.coin.lentPct, 1)} lent` : ''} — rows below are its wrapped / bridged tokens, already inside that figure` :
              d.supply.totalUsd != null ? `${usdShort(d.supply.totalUsd)} in total` :
              d.supply.totalNote ?? 'no total'}
          </span>
        </div>
        <div className="card tk-scroll">
          {a.isLoading && <div className="empty"><Sk w={200} /></div>}
          {d && !d.supply.perChain.length && <div className="empty">No on-chain supply read for this asset yet.</div>}
          {d && d.supply.perChain.length > 0 && (
            <table className="tbl">
              <thead><tr><th>Chain</th><th className="r">Supply</th><th className="r">USD</th><th className="r" title="this chain's lending deposits ÷ its supply">Lent out</th></tr></thead>
              <tbody>
                {d.supply.perChain.map((c) => (
                  <tr key={c.chainId} style={{ cursor: 'default' }}>
                    <td><div className="nm"><ChainMark chainId={c.chainId} size={18} />{chainName(c.chainId)}</div></td>
                    <td className="r">{compactAmount(c.amount)} <span className="t50">{c.symbols?.join(' + ') || sym}</span></td>
                    <td className="r">{usdShort(c.usd)}</td>
                    <td className="r">{c.lentPct == null ? '—' : pct(c.lentPct, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="sec">
        <div className="sec-h">
          <h2>Markets</h2>
          <span className="sub">where it is lent, and where it is posted — largest first</span>
        </div>
        <div className="card tk-scroll">
          {a.isLoading && <div className="empty"><Sk w={220} /></div>}
          {d && !markets.length && <div className="empty">No market in the index lends or accepts this asset{allChains ? '' : ' on these chains'}.</div>}
          {markets.length > 0 && (
            <table className="tbl tk-markets">
              <thead><tr>
                <th>Protocol</th><th>Chain</th><th>Market</th><th>Role</th>
                <th className="r">Deposits</th><th className="r">Borrows</th><th className="r">Util.</th>
                <th className="r">Supply APR</th><th className="r">Borrow APR</th>
              </tr></thead>
              <tbody>{shownMarkets.map((m) => <MarketRowView key={m.marketUid} m={m} />)}</tbody>
            </table>
          )}
          {markets.length > 50 && (
            <button className="btn sm tk-more" onClick={() => setAllMarkets((x) => !x)}>
              {allMarkets ? 'Show the top 50' : `Show all ${markets.length}`}
            </button>
          )}
        </div>
      </section>

      <section className="sec">
        <div className="sec-h"><h2>Curated vaults</h2><span className="sub">lending vaults whose deposits are this asset — their money is already counted in the markets</span></div>
        <div className="card">
          {a.isLoading && <div className="empty"><Sk w={180} /></div>}
          {d && !d.vaults.length && <div className="empty">No curated vault over this asset in the index.</div>}
          <div className="list">
            {(d?.vaults ?? []).slice(0, allVaults ? undefined : 10).map((v) => (
              <div key={v.marketUid} className="row wrow">
                <a className="nm" href={marketHref(v.marketUid)} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.name ?? v.symbol ?? v.address.slice(0, 10)}
                </a>
                <span className="pill">{v.provider}</span>
                <span className="sp" />
                <span className="sub hide-m">
                  {v.curatorId ? <a href={curatorHref(v.curatorId)}>{v.curatorName ?? v.curatorId}</a> : v.curatorName ?? <span className="t40">no curator named</span>}
                  {' · '}{chainName(v.chainId)}
                </span>
                <span className="v"><Money usd={v.tvlUsd} short /><small>TVL</small></span>
                <span className="v">{v.supplyApr != null ? <span className="ok">{pct(v.supplyApr)}</span> : <span className="t40">—</span>}<small>APR</small></span>
              </div>
            ))}
          </div>
          {(d?.vaults.length ?? 0) > 10 && (
            <button className="btn sm tk-more" onClick={() => setAllVaults((x) => !x)}>
              {allVaults ? 'Show the top 10' : `Show all ${d!.vaults.length}`}
            </button>
          )}
        </div>
      </section>

      {!!d?.wrappers?.length && (
        <section className="sec">
          <div className="sec-h"><h2>Wrapped into</h2><span className="sub">tokens built on {sym} (staking, savings) — their own assets, not lending, and not in the totals above</span></div>
          <div className="card">
            <div className="list">
              {d.wrappers.slice(0, allWrappers ? undefined : 10).map((v) => (
                <div key={v.marketUid} className="row wrow">
                  <a className="nm" href={marketHref(v.marketUid)} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v.name ?? v.symbol ?? v.address.slice(0, 10)}
                  </a>
                  <span className="pill">{v.provider}</span>
                  <span className="sp" />
                  <span className="sub hide-m">{chainName(v.chainId)}</span>
                  <span className="v"><Money usd={v.tvlUsd} short /><small>TVL</small></span>
                  <span className="v">{v.supplyApr != null ? <span className="ok">{pct(v.supplyApr)}</span> : <span className="t40">—</span>}<small>APR</small></span>
                </div>
              ))}
            </div>
            {d.wrappers.length > 10 && (
              <button className="btn sm tk-more" onClick={() => setAllWrappers((x) => !x)}>
                {allWrappers ? 'Show the top 10' : `Show all ${d.wrappers.length}`}
              </button>
            )}
          </div>
        </section>
      )}

      <div className="mgrid">
        <section className="sec" style={{ marginTop: 0 }}>
          <div className="sec-h"><h2>Activity</h2><span className="sub">folded per transaction</span></div>
          <div className="card">
            {feed.isLoading && <div className="empty"><Sk w={180} /></div>}
            {feed.isError && <div className="empty">The index did not answer for this asset’s activity.</div>}
            {!feed.isLoading && !feed.isError && !feed.data?.txs.length && <div className="empty">No move in this asset in the indexed window.</div>}
            <div className="tape">{(feed.data?.txs ?? []).map((tx) => {
              const l = primaryLeg(tx), dd = describeBundle(tx)
              const id = `${tx.chainId}:${tx.txHash}`
              const who = subjectOf(tx).account || l?.account || ''
              return (
                <div key={id} className="tape-fold">
                  <div className="tape-item">
                    <a className="tape-row" href={who ? walletHref(who) : undefined}>
                      <span className={`verb ${dd.cls}`}>{dd.verb}</span>
                      <span className="tr-m"><Who account={who} idx={subjectOf(tx)} size={20} plain /></span>
                      <span className="tr-v"><Money usd={tx.volumeUsd ?? l?.amountUsd} status={l?.usdStatus} amount={l?.amount} symbol={l?.symbol} short /></span>
                      <span className="tr-t"><Ago ts={tx.blockTs} /></span>
                    </a>
                    {tx.legs.length > 1 && (
                      <button className="tape-legs" aria-expanded={legsOpen === id} title="what moved, leg by leg"
                        onClick={() => setLegsOpen(legsOpen === id ? null : id)}>
                        {tx.legs.length} legs
                      </button>
                    )}
                    <TxLink chainId={tx.chainId} hash={tx.txHash} />
                  </div>
                  {legsOpen === id && <div className="tape-flows"><Flows tx={tx} /></div>}
                </div>
              )
            })}</div>
          </div>
        </section>

        <section className="sec" style={{ marginTop: 0 }}>
          <div className="sec-h">
            <h2>Wallets we index</h2>
            <span className="sub">{holders.data?.note ?? 'wallets this index has read — not every holder of the token'}</span>
            <ImpairedNote n={holders.data?.impaired} />
          </div>
          <div className="card">
            {holders.isLoading && <div className="empty"><Sk w={160} /></div>}
            {holders.isError && <div className="empty">The index did not answer for this asset’s holders.</div>}
            {!holders.isLoading && !holders.isError && !holders.data?.holders.length && <div className="empty">No wallet the index has read holds this asset.</div>}
            <div className="list">
              {(holders.data?.holders ?? []).map((h, i) => (
                <a key={h.account + i} className="row wrow" href={walletHref(h.account)}>
                  <span className="rank">{i + 1}</span>
                  <Who account={h.account} profile={profile(h.account)} size={22} idx={{ accountKind: h.accountKind as never, accountLabel: h.accountLabel }} />
                  <span className="sp" />
                  <span className="v"><Money usd={h.amountUsd} short /><small>{h.positions} position{h.positions === 1 ? '' : 's'} · {h.chains.length} chain{h.chains.length === 1 ? '' : 's'}</small></span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="sec" ref={threadRef}>
        <div className="sec-h"><h2>Thread</h2><span className="sub">about {sym} on every chain — a comment from a holder carries their size</span></div>
        <div className="card pad"><Thread kind="asset" subjectKey={d?.group ?? group} placeholder={`What do you make of ${sym}?`} /></div>
      </section>
    </>
  )
}

function MarketRowView({ m }: { m: AssetMarket }) {
  const pname = m.protocolName ?? prettyProtocol(m.protocol)
  const urls = React.useMemo(() => protocolIconUrls(m.protocol, m.protocolLogo), [m.protocol, m.protocolLogo])
  return (
    <tr onClick={() => { location.hash = marketHref(m.marketUid) }}>
      <td><div className="nm"><ProtocolLogo urls={urls} name={pname} /><a href={marketHref(m.marketUid)} onClick={(e) => e.stopPropagation()}>{pname}</a></div></td>
      <td><span className="tk-chain"><ChainMark chainId={m.chainId} size={15} /><span className="hide-m">{chainName(m.chainId)}</span></span></td>
      <td className="tk-name" title={m.name ?? m.marketUid}>{m.name ?? <span className="t40">{m.marketUid.slice(0, 24)}…</span>}</td>
      <td>{m.role === 'collateral' ? <span className="pill pt">collateral</span> : <span className="pill dep">lending</span>}</td>
      <td className="r">{usdShort(m.depositsUsd)}</td>
      <td className="r">{m.role === 'collateral' ? <span className="t40">—</span> : usdShort(m.borrowsUsd)}</td>
      <td className="r">{m.role === 'collateral' ? <span className="t40">—</span> : utilPct(m.utilization)}</td>
      <td className="r">
        {m.supplyApr != null ? <span className="ok">{pct(m.supplyApr)}</span> : <span className="t40">—</span>}
        {m.intrinsicApr != null && <small title="what the token earns by itself, on top">+{pct(m.intrinsicApr)} own</small>}
      </td>
      <td className="r">{m.borrowApr != null ? <span className="warn">{pct(m.borrowApr)}</span> : <span className="t40">—</span>}</td>
    </tr>
  )
}

// ---------------------------------------------------------------- the history chart

/**
 * Deposits by protocol, one stacked column per day. Stacked BARS rather than
 * an area: the series has gaps (a day the rates job did not run), and an area
 * would draw a slope across a day nobody measured. The protocol list is the
 * server's own top 8 plus `other`, in its order, so the legend and the stack
 * agree by construction.
 */
const STACK_COLORS = ['#2fd3e8', '#c084fc', '#3fbf7f', '#e2a33a', '#4fb3d9', '#e5534b', '#f472b6', '#a3e635', '#6b7280']
function StackChart({ h, loading, failed }: { h: AssetHistory | undefined; loading: boolean; failed: boolean }) {
  if (loading) return <div className="empty"><Sk w={260} h={60} /></div>
  if (failed) return <div className="empty">No deposit history from the index yet.</div>
  if (!h || !h.points.length) return <div className="empty">No deposit history for this asset yet.</div>
  const keys = [...h.protocols.map((p) => p.key)]
  if (!keys.includes('other') && h.points.some((p) => (p.byProtocol.other ?? 0) > 0)) keys.push('other')
  const nameOf = (k: string) => (k === 'other' ? 'other' : h.protocols.find((p) => p.key === k)?.name ?? k)
  const colorOf = (k: string) => (k === 'other' ? STACK_COLORS[8] : STACK_COLORS[keys.indexOf(k) % 8])
  const pts = [...h.points].sort((a, b) => a.day.localeCompare(b.day))
  const totalOf = (p: AssetHistory['points'][number]) => keys.reduce((s, k) => s + Math.max(0, p.byProtocol[k] ?? 0), 0)
  const max = Math.max(0, ...pts.map(totalOf))
  if (max === 0) return <div className="empty">No deposit history for this asset yet.</div>
  const W = 720, H = 160, gap = pts.length > 60 ? 1 : 2
  const bw = Math.max(1, W / pts.length - gap)
  const last = pts[pts.length - 1], first = pts[0]
  return (
    <div className="tk-chart">
      <div className="ch">
        <span className="t">Deposits by protocol · {pts.length} day{pts.length === 1 ? '' : 's'}</span>
        <span className="sp" />
        <span className="m">{usdShort(totalOf(first))} → {usdShort(totalOf(last))}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`Deposits by protocol from ${first.day} to ${last.day}, ${usd(totalOf(last))} on the last day`}>
        {pts.map((p, i) => {
          let y = H
          const x = i * (W / pts.length)
          return (
            <g key={p.day}>
              <title>{`${p.day} · ${usdShort(totalOf(p))}\n` + keys.filter((k) => (p.byProtocol[k] ?? 0) > 0).map((k) => `${nameOf(k)} ${usdShort(p.byProtocol[k])}`).join('\n')}</title>
              {keys.map((k) => {
                const v = Math.max(0, p.byProtocol[k] ?? 0)
                if (!v) return null
                const hh = (v / max) * (H - 4)
                y -= hh
                return <rect key={k} x={x} y={y} width={bw} height={hh} fill={colorOf(k)} opacity={0.85} />
              })}
            </g>
          )
        })}
      </svg>
      <div className="tk-axis">
        <span>{first.day}</span><span className="sp" /><span className="pk">tallest day {usdShort(max)}</span><span className="sp" /><span>{last.day}</span>
      </div>
      <div className="tk-legend">
        {keys.map((k) => (
          <span key={k}><i style={{ background: colorOf(k) }} />{nameOf(k)}</span>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the asset book (#/t)

type BookSort = 'deposits' | 'borrows' | 'collateral' | 'change'
export function TokenBook() {
  const { chainIds, allChains, chainLabelFor } = useApp()
  const chainsParam = allChains ? undefined : chainIds.join(',')
  const [q, setQ] = React.useState('')
  const dq = React.useDeferredValue(q.trim())
  const book = useAssetBook(chainsParam, dq)
  const [sort, setSort] = React.useState<BookSort>('deposits')
  const [desc, setDesc] = React.useState(true)
  const val = (r: AssetBookRow) =>
    sort === 'deposits' ? r.depositsUsd : sort === 'borrows' ? r.borrowsUsd : sort === 'collateral' ? r.collateralUsd : (r.depositsChange24hPct ?? -Infinity)
  const needle = q.trim().toLowerCase()
  const rows = (book.data?.assets ?? [])
    // the server filters by `q`; this keeps the list honest while the next answer is on its way
    .filter((r) => !needle || [r.group, r.symbol, r.name].some((s) => s?.toLowerCase().includes(needle)))
    .slice()
    .sort((a, b) => (desc ? val(b) - val(a) : val(a) - val(b)))
  const head = (id: BookSort, label: string) => (
    <th className="r tk-sort" aria-sort={sort === id ? (desc ? 'descending' : 'ascending') : undefined}
      onClick={() => { if (sort === id) setDesc(!desc); else { setSort(id); setDesc(true) } }}>
      {label}{sort === id ? (desc ? ' ↓' : ' ↑') : ''}
    </th>
  )
  return (
    <>
      <a className="crumb" href="#/earn">‹ Earn</a>
      <header className="mhdr">
        <div>
          <h1>Assets</h1>
          <div className="sub">every token the index sees lent or posted{allChains ? '' : ` · ${chainLabelFor()}`}{book.data?.asOf ? <> · as of <Ago ts={book.data.asOf} /></> : null}</div>
        </div>
        <span className="sp" />
        <input className="tk-search" type="search" placeholder="Search a token…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search assets" />
      </header>
      <div className="card tk-scroll">
        {book.isLoading && <div className="empty"><Sk w={220} /></div>}
        {book.isError && <div className="empty">The index did not answer — this deploy may have no asset book yet. <span className="t40">{(book.error as Error).message}</span></div>}
        {!book.isLoading && !book.isError && !rows.length && <div className="empty">{needle ? `No asset matches “${q.trim()}”.` : 'No asset in the index yet.'}</div>}
        {rows.length > 0 && (
          <table className="tbl tk-book">
            <thead><tr>
              <th>Asset</th><th className="r">Price</th>
              {head('deposits', 'Deposited')}{head('change', '24 h')}{head('borrows', 'Borrowed')}
              <th className="r hide-m">Util.</th>{head('collateral', 'Collateral')}<th className="r hide-m" title="held inside tokens built on it — their own assets, not lent">Wrapped</th>
              <th className="r hide-m">Own yield</th><th className="r hide-m">Markets</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.group} onClick={() => { location.hash = tokenHref(r.group) }}>
                  <td>
                    <div className="nm">
                      <Tok sym={r.symbol ?? r.group} logo={r.logoUri ?? undefined} />
                      <a href={tokenHref(r.group)} onClick={(e) => e.stopPropagation()}>{r.symbol ?? r.group}</a>
                      {r.issuerName && <span className="desk-chip hide-m" title={`issued by ${r.issuerName}`}>{r.issuerName}</span>}
                    </div>
                    {r.name && r.name !== r.symbol && <small className="hide-m">{r.name}</small>}
                  </td>
                  <td className="r">{r.priceUsd == null ? '—' : usd(r.priceUsd)}{r.priceChange24hPct != null && <small className={r.priceChange24hPct >= 0 ? 'ok' : 'bad'}>{signed(r.priceChange24hPct)}</small>}</td>
                  <td className="r">{usdShort(r.depositsUsd)}</td>
                  <td className="r">{r.depositsChange24hPct == null ? <span className="t40">—</span> : <span className={r.depositsChange24hPct >= 0 ? 'ok' : 'bad'}>{signed(r.depositsChange24hPct, 1)}</span>}</td>
                  <td className="r">{usdShort(r.borrowsUsd)}</td>
                  <td className="r hide-m">{utilPct(r.utilization)}</td>
                  <td className="r">{usdShort(r.collateralUsd)}</td>
                  <td className="r hide-m">{r.wrappedUsd ? usdShort(r.wrappedUsd) : <span className="t40">—</span>}</td>
                  <td className="r hide-m">{r.intrinsicApr == null ? <span className="t40">—</span> : <span className="ok">{pct(r.intrinsicApr)}</span>}</td>
                  <td className="r hide-m">{r.markets}<small>{r.chains.length} chain{r.chains.length === 1 ? '' : 's'} · {r.protocols} prot.</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

/** the header's count: the API caps the list at 300, `marketCount` is the whole set */
const marketsLine = (n: number, chains: number) =>
  `${n} market${n === 1 ? '' : 's'} on ${chains} chain${chains === 1 ? '' : 's'}`
