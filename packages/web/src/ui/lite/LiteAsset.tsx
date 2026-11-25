import React from 'react'
import type { AssetFacts, Fact, IssuerCard, SimilarAsset, AboutPart } from '@yieldcircle/core/model/assetAbout'
import { liteHash } from '@yieldcircle/core/model/liteLinks'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { useAssetPage, useStrategyAbout } from '@yieldcircle/app/about'
import { proHref, tokenHref } from '../../state/AppState'
import { FoldSec } from '../Fold'
import { Sk, Tok, pct, usd, usdShort } from '../bits'
import { LiteRowView } from './LiteBits'

/**
 * An asset in Lite (docs/assets.md): what it is, who issues it (the company behind it, where a
 * profile is written: `data/issuers.json`), where Lite can put it to work, and what else earns
 * the same way. The index's figures are kept to three; every market, holder and day is Pro's page.
 */
export function LiteAsset({ group }: { group: string }) {
  const p = useAssetPage(group)
  const { d, facts: f } = p
  return (
    <div className="lite-page lite-asset">
      <header className="la-h">
        <Tok sym={p.sym} logo={p.logo} size={48} />
        <div className="la-n">
          <h1>{p.name}{p.name !== p.sym && <span className="t50"> · {p.sym}</span>}</h1>
          <div className="t70">{f.what ?? (p.loading ? <Sk w={220} /> : null)}</div>
        </div>
      </header>

      <div className="lite-prof-stats la-stats">
        <div><b>{d?.price ? usd(d.price.usd) : p.a.isLoading ? <Sk w={60} h={18} /> : '–'}</b><small>price{d?.price?.change24hPct != null ? ` · ${d.price.change24hPct >= 0 ? '+' : ''}${pct(d.price.change24hPct)} today` : ''}</small></div>
        <div><b className={d?.intrinsicApr ? 'ok' : undefined}>{d?.intrinsicApr != null ? pct(d.intrinsicApr) : '–'}</b><small>{d?.intrinsicApr != null ? 'a year, by holding it' : 'earns nothing by itself'}</small></div>
        {f.earns && <div><b>{f.earns.name}</b><small>how it earns</small></div>}
      </div>

      {(f.body || f.facts.length > 0 || f.earns) && (
        <FoldSec id="lite.asset.what" title="What it is" className="lite-sec">
          <AssetAboutCard f={f} />
        </FoldSec>
      )}

      {f.issuer && (
        <FoldSec id="lite.asset.issuer" title="Issuer" className="lite-sec">
          <IssuerCardView c={f.issuer} />
        </FoldSec>
      )}

      <FoldSec id="lite.asset.earn" title={`Earn with ${p.sym}`} className="lite-sec">
        {p.rows.length
          ? <div className="lrows">{p.rows.map((r) => <LiteRowView key={r.s.id} r={r} get={p.L.get} proof={p.L.proof(r.s)} />)}</div>
          : <div className="card pad t50">{p.L.b.isLoading ? <Sk w={200} /> : `Lite lists nothing that holds ${p.sym} today. Pro has every market that takes it.`}</div>}
      </FoldSec>

      {p.similar.length > 0 && (
        <FoldSec id="lite.asset.similar" title="Similar assets" className="lite-sec" head={<span className="sub">{p.similar[0].word.toLowerCase()}, like {p.sym}</span>}>
          <SimilarAssets list={p.similar} />
        </FoldSec>
      )}

      <p className="t50 lite-foot">Every market, holder and day of {p.sym} is on <a href={proHref(tokenHref(p.key))}>its Pro page</a>.</p>
    </div>
  )
}

// ---------------------------------------------------------------- parts, shared with the ticket

const ic = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
const ICONS: Record<Fact['icon'], React.ReactNode> = {
  entity: <svg {...ic}><path d="M2.5 14V3.5h6V14M8.5 7h5v7M1.5 14h13M4.5 6h2M4.5 8.5h2M4.5 11h2M10.5 9.5h1M10.5 12h1" /></svg>,
  structure: <svg {...ic}><path d="M2.5 14V3.5h6V14M8.5 7h5v7M1.5 14h13M4.5 6h2M4.5 8.5h2M4.5 11h2" /></svg>,
  regulator: <svg {...ic}><path d="M8 1.8 13 4v3.6c0 3-2.1 5.4-5 6.6-2.9-1.2-5-3.6-5-6.6V4z" /></svg>,
  country: <svg {...ic}><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c1.8 1.7 2.6 3.7 2.6 6S9.8 12.3 8 14M8 2C6.2 3.7 5.4 5.7 5.4 8s.8 4.3 2.6 6" /></svg>,
  platform: <svg {...ic}><rect x="2" y="3" width="12" height="8.5" rx="1.2" /><path d="M5.5 14h5M8 11.5V14" /></svg>,
  backing: <svg {...ic}><path d="M3 6.5 8 3l5 3.5M4 6.5v5.5M8 6.5v5.5M12 6.5v5.5M2.5 13.5h11" /></svg>,
  yield: <svg {...ic}><path d="M2 12l4-4 3 3 5-6M10.5 5H14v3.5" /></svg>,
  exit: <svg {...ic}><path d="M9.5 3H13v10H9.5M7 5l-3 3 3 3M4 8h7" /></svg>,
  kind: <svg {...ic}><circle cx="8" cy="5.5" r="2.5" /><path d="M3 14c.6-2.6 2.6-4 5-4s4.4 1.4 5 4" /></svg>,
}
const Arrow = () => <svg {...ic}><path d="M5 11 11 5M6 5h5v5" /></svg>

function Facts({ facts }: { facts: Fact[] }) {
  return <div className="la-facts">{facts.map((x) => <div key={x.k} className="la-fact"><span className="la-k">{ICONS[x.icon]}{x.k}</span><span className="la-v">{x.v}</span></div>)}</div>
}
function Links({ links }: { links: { label: string; url: string }[] }) {
  if (!links.length) return null
  return <div className="la-links">{links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.label}<Arrow /></a>)}</div>
}

/** The company behind an asset, as Kamino lays it out: name, entity · structure, the legal rows, the links. */
export function IssuerCardView({ c }: { c: IssuerCard }) {
  return (
    <div className="card la-card la-issuer">
      <div className="la-ih"><b>{c.name}</b>{c.sub && <small className="t50">{c.sub}</small>}</div>
      {c.about && <p className="t70">{c.about}</p>}
      {c.facts.length > 0 && <Facts facts={c.facts} />}
      <Links links={c.links} />
      {!c.profiled && <small className="t40">No company details written for {c.name} yet.</small>}
      {c.checked && <small className="t40">checked {c.checked}</small>}
    </div>
  )
}

/** What the asset is: the note's words and rows, how it earns, its own links. */
export function AssetAboutCard({ f }: { f: AssetFacts }) {
  return (
    <div className="card la-card">
      {(f.body ?? f.what) && <p>{f.body ?? f.what}</p>}
      {f.caveat && <p className="warn">Unverified: {f.caveat}</p>}
      {f.facts.length > 0 && <Facts facts={f.facts} />}
      {f.earns && <p className="t70"><b>{f.earns.name}.</b> {f.earns.how} <span className="t50">{f.earns.risk}</span></p>}
      <Links links={f.links} />
      {f.checked && <small className="t40">checked {f.checked}{f.confidence && f.confidence !== 'high' ? ` · ${f.confidence} confidence` : ''}</small>}
    </div>
  )
}

export function SimilarAssets({ list }: { list: SimilarAsset[] }) {
  return (
    <div className="la-similar">{list.map((x) => (
      <a key={x.group} className="card la-sim" href={liteHash({ to: 'asset', group: x.group })}>
        <span className="la-sim-h"><Tok sym={x.symbol} logo={x.logo} size={32} /><span><b>{x.symbol}</b>{x.issuer && <small className="t50">{x.issuer}</small>}</span></span>
        <span className="la-sim-f"><span><small className="t50">Largest market</small><b>{usdShort(x.largestUsd)}</b></span><span className="pill">{x.word}</span></span>
      </a>
    ))}</div>
  )
}

/**
 * The ticket's asset-strategy section: what it holds (with who issues it), what it borrows and
 * what that costs, how it earns — folded under one line, each asset opening its page.
 */
export function LiteAbout({ s }: { s: Strategy }) {
  const parts = useStrategyAbout(s)
  const [open, setOpen] = React.useState(false)
  if (!parts.length) return null
  const held = parts.find((x) => x.role === 'holds' || x.role === 'deposit')
  const who = held?.facts?.issuer?.name
  return (
    <div className="tsec la-about">
      <button type="button" className="lite-details" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span><b>What it is</b><small>{[held?.symbol && `${held.symbol}${who ? ` by ${who}` : ''}`, parts.some((x) => x.role === 'borrows') && 'what it borrows', 'how it earns'].filter(Boolean).join(' · ')}</small></span>
        <span aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open && parts.map((x) => <AboutPartView key={x.role} x={x} />)}
    </div>
  )
}
/** `Signum Ltd., Cayman Islands`: the entity and where it sits, where a profile says */
const byLine = (c: IssuerCard) => c.facts.filter((y) => y.icon === 'entity' || y.icon === 'country').map((y) => y.v).join(', ')
function AboutPartView({ x }: { x: AboutPart }) {
  const f = x.facts
  return (
    <section className="la-part">
      <h4>{x.logo || x.symbol ? <Tok sym={x.symbol ?? ''} logo={x.logo} size={16} /> : null}{x.title}</h4>
      {f?.what && <p>{f.what}</p>}
      {x.lines.map((l) => <p key={l} className="t70">{l}</p>)}
      {f && f.facts.length > 0 && <Facts facts={f.facts} />}
      {f?.issuer && <p className="t70 la-by">Issued by <b>{f.issuer.name}</b>{byLine(f.issuer) && ` · ${byLine(f.issuer)}`}</p>}
      {x.group && <a className="la-more" href={liteHash({ to: 'asset', group: x.group })}>About {x.symbol} ›</a>}
    </section>
  )
}
