/* scratch: how the current asset breakdown lands, straight off the live API and the app's own model */
import { loopFromRow, simpleFromEarn, dedupe, capPerAsset } from './src/model/strategies'
import { baseOfCollateral, baseOfSymbol, groupOf } from './src/model/assets'

const API = 'https://allocator.api.1delta.io'
const CHAINS = ['1', '8453', '42161', '56', '43114']
const ARCH = [
  { collateralTags: ['lst', 'lrt'], debtTags: ['wnative'] },
  { collateralTags: ['stablecoin', 'savings', 'pendle'], debtTags: ['stablecoin'], includeExpired: false },
  { collateralTags: ['btc'], debtTags: ['btc'] },
]
const q = (o: Record<string, unknown>) => Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')

const loops: any[] = [], earns: any[] = [], rawLoops: any[] = [], rawEarn: any[] = []
for (const chainId of CHAINS) {
  const e = await (await fetch(`${API}/v1/data/earn?${q({ chainId, count: 800, sort: 'tvl', maxRiskScore: 4, minTvlUsd: 1_000_000, terms: 'none' })}`)).json()
  for (const m of (e.data ?? e).items ?? []) { rawEarn.push(m); const s = simpleFromEarn(m); if (s) earns.push(s) }
  for (const a of ARCH) {
    const r = await (await fetch(`${API}/v1/data/lending/pairs/optimize?${q({ chainId, collateralTags: a.collateralTags.join(','), debtTags: a.debtTags.join(','), includeExpired: a.includeExpired, sortBy: 'aprTotal', sortDir: 'DESC', count: 100 })}`)).json()
    for (const row of (r.data ?? r).items ?? []) { rawLoops.push(row); const l = loopFromRow(row); if (l) loops.push(l) }
  }
}
console.log(`earn rows ${rawEarn.length} → ${earns.length} simple | optimizer rows ${rawLoops.length} → ${loops.length} loops`)

const all = [...capPerAsset(dedupe(earns)), ...capPerAsset(dedupe(loops))]
// what the USD tabs look like today
const usd = all.filter((s) => s.group === 'USD')
const byAsset = new Map<string, any[]>()
for (const s of usd) { const l = byAsset.get(s.asset) ?? []; l.push(s); byAsset.set(s.asset, l) }
console.log('\n=== USD tabs today (asset → rows) ===')
for (const [a, rows] of [...byAsset].sort((x, y) => y[1].length - x[1].length))
  console.log(` ${a.padEnd(8)} ${String(rows.length).padStart(3)}  loops ${rows.filter((r) => r.kind === 'loop').length}  deposits ${rows.filter((r) => r.kind === 'simple').length}`)

// the overlap the screenshot shows: the same collateral under more than one tab
const byHolds = new Map<string, Set<string>>()
for (const s of usd.filter((x) => x.kind === 'loop')) {
  const set = byHolds.get(s.holds) ?? new Set(); set.add(s.asset); byHolds.set(s.holds, set)
}
const shared = [...byHolds].filter(([, tabs]) => tabs.size > 1)
console.log(`\n=== collateral that appears under MORE THAN ONE USD tab: ${shared.length} of ${byHolds.size} ===`)
for (const [h, tabs] of shared.slice(0, 25)) console.log(` ${h.padEnd(26)} → ${[...tabs].join(', ')}`)

// what actually drives `asset` on a loop
console.log('\n=== what the loop tab is derived from ===')
const why = new Map<string, number>()
for (const r of rawLoops) {
  const L = r.underlyingInfoLong?.asset, S = r.underlyingInfoShort?.asset
  if (!L || !S) continue
  const a = baseOfCollateral(L, S.symbol)
  if (!a) continue
  const p = L.props ?? {}
  const src = p.savings?.underlying && baseOfSymbol(p.savings.underlying) === a ? 'savings.underlying'
    : p.lst?.asset && baseOfSymbol(p.lst.asset) === a ? 'lst.asset'
    : (p.pendle || p.spectra) && baseOfSymbol((/\(([A-Za-z0-9]+)\)/.exec(L.assetGroup ?? L.name ?? '') ?? [])[1]) === a ? 'pendle/spectra name'
    : baseOfSymbol(L.symbol) === a ? 'collateral symbol itself'
    : 'FELL BACK TO THE DEBT'
  why.set(src, (why.get(src) ?? 0) + 1)
}
for (const [k, v] of [...why].sort((a, b) => b[1] - a[1])) console.log(` ${String(v).padStart(4)}  ${k}`)

// the collateral vocabulary that exists but is thrown away
console.log('\n=== collateral assetGroups seen on USD loops (the exposure we drop) ===')
const groups = new Map<string, { n: number; syms: Set<string>; tab: Set<string> }>()
for (const r of rawLoops) {
  const L = r.underlyingInfoLong?.asset, S = r.underlyingInfoShort?.asset
  if (!L || !S) continue
  const a = baseOfCollateral(L, S.symbol); if (!a || groupOf(a) !== 'USD') continue
  const g = L.assetGroup ?? '(none)'
  const e = groups.get(g) ?? { n: 0, syms: new Set(), tab: new Set() }
  e.n++; e.syms.add(L.symbol); e.tab.add(a); groups.set(g, e)
}
console.log(` ${groups.size} distinct collateral asset groups behind ${[...byAsset.keys()].length} tabs`)
for (const [g, e] of [...groups].sort((x, y) => y[1].n - x[1].n).slice(0, 30))
  console.log(`  ${String(e.n).padStart(3)}  ${g.padEnd(34)} tabs: ${[...e.tab].join('/')}`)
