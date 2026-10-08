// Build src/data/rpcs.json: every public RPC chainlist.org lists for an offered EVM chain that a
// BROWSER can use for the receipt watcher (`src/wallet/evmRpc.ts` rotates over them).
//
// Usage: node scripts/rpcs.mjs        (pnpm rpcs)
//
// Chainlist is a directory, not a health check: most entries there fail from a page. Each one is
// asked what the app will ask, from an `Origin`, and kept only if it
//   - passes the CORS preflight for a JSON POST,
//   - answers a JSON-RPC BATCH (viem batches) of `eth_chainId` (the right chain), `eth_blockNumber`,
//     the latest block and the receipt of an unknown hash — which must be `null`, not an error:
//     that is every poll while a transaction is pending (publicnode on the L2s calls it an
//     "archive request" and wants a token),
//   - is not stale: its latest block at most STALE_S behind the freshest node on that chain
//     (a node behind the head answers "no receipt" for a transaction that has landed).
// Besides chainlist: viem's own default for each chain and EXTRA (endpoints chainlist does not
// list). A 429 during the sweep is the sweep's own burst: asked once more after a pause, and
// whatever failed is asked again in a slower second pass (drpc rate-limits the burst per IP).
// Output, fastest first: `{ checked, chains: { '<id>': [url, …] } }`.
import { readFileSync, writeFileSync } from 'node:fs'
import * as viemChains from 'viem/chains'

const STALE_S = 30
const TIMEOUT_MS = 10_000
const CONCURRENCY = 24
const ORIGIN = 'https://yieldcircle.app'
const UNKNOWN = '0x' + '11'.repeat(32)
const EXTRA = { 4217: ['https://rpc.tempo.xyz', 'https://tempo.drpc.org'] }

// the chains the app offers: `CHAINS` in src/sdk/queries.ts, read from there rather than repeated
const queriesSrc = readFileSync(new URL('../src/sdk/queries.ts', import.meta.url), 'utf8')
const chainsSrc = queriesSrc.slice(queriesSrc.indexOf('export const CHAINS'), queriesSrc.indexOf('\n]', queriesSrc.indexOf('export const CHAINS')))
const offered = [...chainsSrc.matchAll(/id:\s*'(\d+)'/g)].map((m) => Number(m[1]))

const list = await (await fetch('https://chainlist.org/rpcs.json')).json()
// a URL with a placeholder or a key parameter is somebody's account, not a public endpoint
const keyless = (u) => /^https:\/\//.test(u) && !/\$\{|<|>|api[_-]?key|YOUR|INFURA|ALCHEMY/i.test(u)
const candidates = offered.flatMap((id) => {
  const c = list.find((x) => x.chainId === id)
  if (!c) console.warn(`chain ${id}: not on chainlist`)
  const viem = Object.values(viemChains).find((x) => x?.id === id && !x.testnet)?.rpcUrls.default.http ?? []
  const all = [...(c?.rpc ?? []).map((r) => (typeof r === 'string' ? r : r.url)), ...viem, ...(EXTRA[id] ?? [])]
  const urls = [...new Set(all.filter(keyless).map((u) => u.replace(/\/+$/, '')))]
  return urls.map((url) => ({ id, url }))
})
console.log(`${candidates.length} candidates on ${offered.length} chains`)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function probe({ id, url }, again = true) {
  const t0 = Date.now()
  try {
    const pre = await fetch(url, { method: 'OPTIONS', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } })
    const allow = pre.headers.get('access-control-allow-origin'), hdrs = pre.headers.get('access-control-allow-headers') ?? ''
    if (pre.status === 429 && again) { await sleep(5_000); return probe({ id, url }, false) }
    if (pre.status >= 300 || !(allow === '*' || allow === ORIGIN) || !/content-type|\*/i.test(hdrs)) return { id, url, why: `preflight ${pre.status}` }
    const r = await fetch(url, {
      method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] },
        { jsonrpc: '2.0', id: 2, method: 'eth_blockNumber', params: [] },
        { jsonrpc: '2.0', id: 3, method: 'eth_getBlockByNumber', params: ['latest', false] },
        { jsonrpc: '2.0', id: 4, method: 'eth_getTransactionReceipt', params: [UNKNOWN] },
      ]),
    })
    if (r.status === 429 && again) { await sleep(5_000); return probe({ id, url }, false) }
    const j = await r.json().catch(() => null)
    const at = (n) => Array.isArray(j) ? j.find((x) => x?.id === n) : undefined
    if (!Array.isArray(j)) return { id, url, why: `no batch (${r.status})` }
    if (Number(at(1)?.result) !== id) return { id, url, why: 'wrong chain' }
    if (!at(2)?.result || !at(3)?.result?.timestamp) return { id, url, why: 'no head' }
    if (!at(4) || at(4).error || at(4).result !== null) return { id, url, why: 'unknown receipt is not null' }
    if (!(r.headers.get('access-control-allow-origin'))) return { id, url, why: 'no CORS on POST' }
    // how far behind the clock its head is: compared per chain, so the two passes compare too
    return { id, url, ok: true, ms: Date.now() - t0, lag: Date.now() / 1000 - Number(at(3).result.timestamp) }
  } catch (e) { return { id, url, why: e.name } }
}

async function sweep(items, n) {
  const out = []
  for (let i = 0; i < items.length; i += n) out.push(...await Promise.all(items.slice(i, i + n).map((c) => probe(c))))
  return out
}
const first = await sweep(candidates, CONCURRENCY)
await sleep(10_000)
const second = await sweep(first.filter((r) => !r.ok), 4)
const results = [...first.filter((r) => r.ok), ...second]

const chains = {}
for (const id of offered) {
  const ok = results.filter((r) => r.id === id && r.ok)
  const best = Math.min(...ok.map((r) => r.lag))
  const live = ok.filter((r) => r.lag - best <= STALE_S).sort((a, b) => a.ms - b.ms)
  chains[id] = live.map((r) => r.url)
  const stale = ok.length - live.length
  console.log(`${String(id).padStart(6)}  ${live.length} kept of ${results.filter((r) => r.id === id).length}${stale ? ` (${stale} stale)` : ''}`)
  if (!live.length) console.warn(`chain ${id}: NO public RPC passed — the watcher falls back to viem's default`)
}
if (process.env.DEBUG) for (const r of results.filter((r) => !r.ok)) console.log('  -', r.id, r.url, r.why)
const out = new URL('../src/data/rpcs.json', import.meta.url)
writeFileSync(out, JSON.stringify({ checked: new Date().toISOString().slice(0, 10), chains }, null, 1) + '\n')
console.log(`wrote ${out.pathname}`)
