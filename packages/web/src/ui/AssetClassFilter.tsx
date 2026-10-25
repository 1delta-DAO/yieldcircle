/**
 * The asset-class filter — what KIND of thing, not where and not whose.
 *
 * `ProtocolFilter` says where a dollar sits, `IssuerFilter` whose contract and
 * credit it is; neither can answer "show me the tokenized stocks". TSLAx is
 * Backed's contract and is in a Morpho market, and until this filter the only
 * way to find every Tesla on chain was to know every issuer's ticker for it.
 *
 * The words are pos-indexer's (`model/assetClass.ts`, a verbatim copy):
 * classes `stock · etf · pre-ipo · fund · credit · commodity`, read off
 * token-lists `props.rwa` and never off a symbol. The LEAD chip is the alias
 * `stocks` (stock + ETF + pre-IPO: an ETF over SPY is a stock to the person
 * filtering); the rest are the facet's other classes.
 *
 * The match control is the issuer filter's, with the class's words: **held**
 * (`direct`) = the row's own token is of the class; **lent against**
 * (`exposure`) = the row sits in a market that lends against it — the USDC
 * supplier in a USDC / TSLAx market; **any** (the default) = the union.
 *
 * Like the other chips it offers only classes with rows in the window, and it
 * HIDES when neither index answers `/asset-classes` (a deploy that predates
 * it) — an index that cannot honour the filter would answer its whole tape
 * under it.
 */
import React from 'react'
import { useApp } from '../state/AppState'
import { useAssetClasses } from '@yieldcircle/app/index/queries'
import type { AssetClassFacet } from '@yieldcircle/core/index/api'
import { ASSET_CLASS_ALIASES, ASSET_CLASSES, type AssetClass, type AssetClassMatch } from '@yieldcircle/core/model/assetClass'
import { useSticky } from '../state/sticky'

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

/** the lead chip's alias and what it stands for */
const LEAD = 'stocks'
const EQUITY: readonly AssetClass[] = ASSET_CLASS_ALIASES[LEAD]

/** a class in the row's quiet chip: short, lower-case where it is a word */
export const CLASS_WORD: Record<AssetClass, string> = {
  stock: 'stock', etf: 'ETF', 'pre-ipo': 'pre-IPO', fund: 'fund', credit: 'credit', commodity: 'commodity',
}
/** the same, said in full — for a hover */
const CLASS_LONG: Record<AssetClass, string> = {
  stock: 'a tokenized stock',
  etf: 'a tokenized ETF',
  'pre-ipo': 'a tokenized pre-IPO share',
  fund: 'a tokenized fund (treasuries, money market, private credit)',
  credit: 'tokenized credit',
  commodity: 'a tokenized commodity',
}
const isClass = (x: string): x is AssetClass => (ASSET_CLASSES as readonly string[]).includes(x)

export function useAssetClassFilter(
  window: '1h' | '6h' | '24h' | '7d' = '7d',
  scope = 'page',
  seed?: { classes: string[]; match: AssetClassMatch },
) {
  const { chainIds, allChains } = useApp()
  const q = useAssetClasses(window, allChains ? undefined : chainIds.join(','))
  const [picked, setPicked] = useSticky<string[]>(`${scope}:assetClasses`, [], seed && { value: seed.classes })
  const [match, setMatch] = useSticky<AssetClassMatch>(`${scope}:assetClassMatch`, 'any', seed && { value: seed.match })
  const classes = q.data?.supported ? q.data.assetClasses : []
  const available = React.useMemo(() => {
    const s = new Set(classes.filter((c) => c.rows > 0).map((c) => c.assetClass as string))
    if (EQUITY.some((c) => s.has(c))) s.add(LEAD)
    return s
  }, [classes])
  React.useEffect(() => {
    // a placeholder (last visit, or the previous window) is not the truth about what is available yet;
    // an index with no facet drops the pick too — it could not honour it
    if (!q.data || q.isPlaceholderData) return
    setPicked((cur) => (cur.every((c) => available.has(c)) ? cur : cur.filter((c) => available.has(c))))
  }, [available, q.data])
  const sorted = [...picked].sort()
  return {
    classes,
    /** false until an index answers the facet: the chips stay hidden */
    supported: !!q.data?.supported,
    isLoading: q.isLoading,
    picked,
    setPicked,
    match,
    setMatch,
    /** what to send the index; undefined = no filter */
    param: sorted.length ? sorted.join(',') : undefined,
    /** only meaningful with `param`; the index defaults to `any` anyway */
    matchParam: picked.length && match !== 'any' ? match : undefined,
  }
}
export type AssetClassFilterState = ReturnType<typeof useAssetClassFilter>

const MATCHES: { k: AssetClassMatch; label: string; title: string }[] = [
  { k: 'any', label: 'any', title: 'the token itself OR the market it sits in lends against the class — a union, so the three modes do not add up' },
  { k: 'direct', label: 'held', title: 'only rows whose own token IS of this class — a tokenized TSLA itself' },
  { k: 'exposure', label: 'lent against', title: 'only rows in a market that lends against collateral of this class — the USDC supplier in a USDC / TSLAx market' },
]

export function AssetClassChips({ f, max = 6 }: { f: AssetClassFilterState; max?: number }) {
  const [showAll, setShowAll] = React.useState(false)
  // no skeleton: on a deploy without the facet this row never appears, and a placeholder that vanishes is a jump
  if (!f.supported || !f.classes.length) return null
  const by = new Map(f.classes.map((c) => [c.assetClass as string, c]))
  const equity = EQUITY.map((c) => by.get(c)).filter((c): c is AssetClassFacet => !!c && c.rows > 0)
  const leadRows = equity.reduce((n, c) => n + c.rows, 0)
  // the lead stands for the equity classes; one of them still gets its own chip once a link picked it alone
  const rest = f.classes.filter((c) => c.rows > 0 && (!EQUITY.includes(c.assetClass) || f.picked.includes(c.assetClass)))
  const shown = showAll ? rest : rest.slice(0, max)
  const hidden = rest.length - shown.length
  const toggle = (k: string) =>
    f.setPicked(f.picked.includes(k) ? f.picked.filter((x) => x !== k) : [...f.picked, k])
  const title = (c: AssetClassFacet) =>
    `${c.name} — ${c.rows} rows, ${c.wallets} wallets, ${c.markets} markets` +
    (c.via ? `; ${c.via} of them only lend against it` : '') +
    ' · alt-click for only this one'
  return (
    <div className="ichips" role="group" aria-label="Asset classes">
      <button className="pchip all" aria-pressed={f.picked.length === 0} onClick={() => f.setPicked([])}>Any asset</button>
      {(leadRows > 0 || f.picked.includes(LEAD)) && (
        <button className="pchip" aria-pressed={f.picked.includes(LEAD)}
          onClick={(e) => (e.altKey ? f.setPicked([LEAD]) : toggle(LEAD))}
          title={`Tokenized equity — ${equity.map((c) => `${c.name} ${c.rows}`).join(' · ') || 'stocks, ETFs and pre-IPO shares'} · alt-click for only this one`}>
          <span className="pn">Stocks</span>
          {leadRows > 0 && <span className="pc">{compact(leadRows)}</span>}
        </button>
      )}
      {shown.map((c) => (
        <button key={c.assetClass} className="pchip" aria-pressed={f.picked.includes(c.assetClass)}
          onClick={(e) => (e.altKey ? f.setPicked([c.assetClass]) : toggle(c.assetClass))}
          title={title(c)}>
          <span className="pn">{c.name || CLASS_WORD[c.assetClass] || c.assetClass}</span>
          <span className="pc">{compact(c.rows)}</span>
          {c.via === c.rows && <span className="pv" title="every row here only lends against this class">via</span>}
        </button>
      ))}
      {hidden > 0 && <button className="pchip more" onClick={() => setShowAll(true)}>+{hidden}</button>}
      {showAll && rest.length > max && <button className="pchip more" onClick={() => setShowAll(false)}>less</button>}
      {/* the mode only means anything once a class is picked, so it appears with one */}
      {f.picked.length > 0 && (
        <span className="seg sm imatch">
          {MATCHES.map((m) => (
            <button key={m.k} aria-pressed={f.match === m.k} title={m.title} onClick={() => f.setMatch(m.k)}>{m.label}</button>
          ))}
        </span>
      )}
    </div>
  )
}

/**
 * The class on a row: a quiet chip (`stock`, `ETF`) beside the asset, the
 * real-world ticker it tracks in the hover. Nothing for a row with no class —
 * the common case, where a "crypto" chip would be noise.
 */
export function ClassChip({ x }: { x?: { assetClass?: string | null; underlyingTicker?: string | null } | null }) {
  const c = x?.assetClass
  if (!c) return null
  const word = isClass(c) ? CLASS_WORD[c] : c
  const long = isClass(c) ? CLASS_LONG[c] : `asset class ${c}`
  const t = x?.underlyingTicker
  return (
    <span className="desk-chip" title={`${long}${t ? ` — tracks ${t}` : ''}`}>
      {word}
    </span>
  )
}

/** Said when an index ignored a class filter: its rows were left out, not shown as if filtered. */
export function ClassStaleNote({ on }: { on?: boolean }) {
  if (!on) return null
  return (
    <div className="note sm">
      This deploy of the index cannot filter by asset class yet — its rows are left out rather than shown unfiltered.
    </div>
  )
}
