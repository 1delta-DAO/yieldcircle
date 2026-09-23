/* scratch: what vocabulary the API actually ships on a collateral asset */
const API = 'https://allocator.api.1delta.io'
const q = (o: Record<string, unknown>) => Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
const r = await (await fetch(`${API}/v1/data/lending/pairs/optimize?${q({ chainId: '1', collateralTags: 'stablecoin,savings,pendle', debtTags: 'stablecoin', includeExpired: false, sortBy: 'aprTotal', sortDir: 'DESC', count: 120 })}`)).json()
const rows = (r.data ?? r).items ?? []
const keys = new Map<string, number>()
const samples: Record<string, any> = {}
for (const row of rows) {
  const L = row.underlyingInfoLong?.asset; if (!L) continue
  for (const k of Object.keys(L)) keys.set('asset.' + k, (keys.get('asset.' + k) ?? 0) + 1)
  for (const k of Object.keys(L.props ?? {})) keys.set('props.' + k, (keys.get('props.' + k) ?? 0) + 1)
  if (!samples[L.symbol] && /PT-|^s|^w|reUSD|USD3|USDai/i.test(L.symbol)) samples[L.symbol] = L
}
console.log('=== field frequency on collateral assets (', rows.length, 'rows ) ===')
for (const [k, v] of [...keys].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(4), k)
console.log('\n=== samples ===')
for (const s of Object.keys(samples).slice(0, 6)) {
  const a = samples[s]
  console.log('\n---', a.symbol, '|', a.name, '| assetGroup:', a.assetGroup, '| tags:', JSON.stringify(a.tags))
  console.log('   props:', JSON.stringify(a.props, null, 1).slice(0, 1400))
}
