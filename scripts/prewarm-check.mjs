// Print the listing requests a first visit makes at the defaults, in the form worker-api's cron
// pre-warms them (lending-sdks packages/worker-api/src/scheduled/prewarmListings.ts): the path under
// /v1/data with the query in its canonical order (keys sorted, CSV values as sent), and, for a
// pair book, the page cap. The cron warms page 1 and the pages its `total` calls for, so only
// page 1 is printed. The cache keys on the exact query: a request that drifts from the cron's list
// is a cold origin read on every visit (2026-10-15: the earn bundle had gained Solana, the cron's
// had not, and that one request took 12 s).
//
// Built with the app's own request code, with `fetch` stubbed — nothing leaves the machine.
// Usage: node scripts/prewarm-check.mjs [path/to/prewarmListings.ts]   (pnpm prewarm-check)
//   diffs against the cron's list (default: a lending-sdks checkout beside this repo, when there is
//   one) and exits 1 on a mismatch.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'vite'

const ROOT = join(import.meta.dirname, '..')
const seen = []
globalThis.fetch = async (url) => {
  seen.push(String(url))
  return new Response(JSON.stringify({ success: true, data: { items: [], total: 0, hasMore: false } }), { status: 200, headers: { 'content-type': 'application/json' } })
}
const canon = (u) => {
  const url = new URL(u)
  const pairs = [...url.searchParams].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
  return `${url.pathname.replace(/^\/v1\/data/, '')}?${pairs.map(([k, v]) => `${k}=${v}`).join('&')}`
}

const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const want = []
try {
  const load = (p) => vite.ssrLoadModule(p)
  const [{ fetchEarn, fetchOptimizerPairs }, { DEFAULTS }, { CHAINS, chainBuckets, prewarmBooks }, { EXPOSURE_ASSETS }, { FIXED_BOOK_PROTOCOLS }, { isEvmChain }] = await Promise.all([
    load('/src/sdk/api.ts'), load('/src/state/Settings.tsx'), load('/src/sdk/queries.ts'), load('/src/model/assets.ts'), load('/src/model/strategies.ts'), load('/src/model/address.ts'),
  ])
  const all = CHAINS.map((c) => c.id)
  const take = async (f) => { seen.length = 0; await f(); return canon(seen[0]) }
  for (const ids of chainBuckets(all)) want.push(await take(() => fetchEarn({ chainIds: ids, count: 1000, maxRiskScore: 5, minTvlUsd: DEFAULTS.minTvlUsd })))
  for (const e of EXPOSURE_ASSETS) want.push(await take(() => fetchEarn({ chainIds: [e.chainId], count: 1000, maxRiskScore: 5, minTvlUsd: DEFAULTS.minTvlUsd, assetSymbol: e.sym, passthrough: true })))
  // the Fixed rate shelf (`useFixedRateCatalog`): EVM chains, Midnight + Term
  want.push(await take(() => fetchEarn({ chainIds: all.filter(isEvmChain), count: 500, maxPages: 2, maxRiskScore: 5, minTvlUsd: 0, includeFixedTerm: true, protocols: FIXED_BOOK_PROTOCOLS })))
  for (const { q, pages } of prewarmBooks(all)) want.push(`${await take(() => fetchOptimizerPairs({ ...q, count: 100 }))}  pages=${pages}`)
} finally {
  await vite.close()
}
for (const w of want) console.log(w)

const SIBLING = join(ROOT, '../lending-sdks/packages/worker-api/src/scheduled/prewarmListings.ts')
const cronFile = process.argv[2] ?? (existsSync(SIBLING) ? SIBLING : null)
if (cronFile) {
  // the cron's list, evaluated from its source: the template constants and the paths
  const src = readFileSync(cronFile, 'utf8')
  const consts = Object.fromEntries([...src.matchAll(/^(?:export )?const (\w+) =\s*\n?\s*['`]([^'`]*)['`]/gm)].map((m) => [m[1], m[2]]))
  const fill = (t) => t.replace(/\$\{(\w+)\}/g, (_, k) => fill(consts[k] ?? `<${k}?>`))
  const buckets = [...src.matchAll(/EARN_BUCKETS[^=]*=\s*\[([\s\S]*?)\]/g)][0]?.[1].match(/'[^']*'|SMALL_CHAINS/g).map((x) => (x === 'SMALL_CHAINS' ? consts.SMALL_CHAINS : x.slice(1, -1))) ?? []
  const earnT = src.match(/`(\/earn\?chainIds=\$\{c\}[^`]*)`/)?.[1]
  const cron = [
    ...buckets.map((c) => earnT.replace('${c}', c)),
    ...[...src.matchAll(/`(\/earn\?chainIds=solana[^`]*)`/g)].map((m) => m[1]),
    ...[...src.matchAll(/`(\/earn\?chainIds=\$\{EVM_CHAINS\}[^`]*)`/g)].map((m) => fill(m[1])),
    ...[...src.matchAll(/path:\s*`([^`]*)`,\s*pages:\s*(\w+)/g)].map((m) => `${fill(m[1])}  pages=${m[2]}`),
  ].map((l) => { const [p, rest] = l.split('  '); return `${canon('https://x/v1/data' + p)}${rest ? '  ' + rest : ''}` })
  const missing = want.filter((w) => !cron.includes(w))
  const extra = cron.filter((c) => !want.includes(c))
  if (!missing.length && !extra.length) console.log(`\n✓ the cron warms exactly these ${want.length}`)
  else {
    if (missing.length) console.log(`\n✗ the app asks, the cron does not warm:\n  ${missing.join('\n  ')}`)
    if (extra.length) console.log(`\n✗ the cron warms, the app does not ask:\n  ${extra.join('\n  ')}`)
    process.exitCode = 1
  }
}
