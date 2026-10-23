// Build src/data/lagoon.json: what each Lagoon vault's manager says it does.
//
// Usage: node scripts/lagoon.mjs
//
// The 1delta API carries a Lagoon vault as a share token and a rate, and Lagoon publishes no
// allocation, so the market page had nothing to say about the strategy. Lagoon's own web app
// does: `app.lagoon.finance/api/vaults` (the listing: curator, strategy category) and
// `/api/vault?chainId=&address=` (the detail: the vault's description, a transparency link,
// insurance cover). Both are UNDOCUMENTED internal Next.js routes — they can change without
// notice, and they send no CORS header, so the browser cannot call them: this snapshot is built
// here and shipped. A failed or thin run refuses to overwrite a good file.
//
// Everything in it is the manager's own words, not a reading of where the money is: the page
// labels it so, and "Whose credit" stays "Not readable" for a vault that publishes nothing.
// Keyed `chainId:address` (lower-case), the tail of the index uid `vault.lagoon:<chain>:<addr>`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const BASE = 'https://app.lagoon.finance/api'
const OUT = new URL('../src/data/lagoon.json', import.meta.url)
const SEED = new URL('../src/data/menu-seed.json', import.meta.url)
const UA = { 'User-Agent': 'Mozilla/5.0 (yieldcircle lagoon snapshot)' }

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers: UA })
  if (!r.ok) throw new Error(`${r.status} ${path}`)
  return r.json()
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** collapse runs of blank lines and trailing spaces; keep the paragraphs */
const tidy = (s) => (typeof s === 'string' && s.trim() ? s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : undefined)
const https = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u : undefined)

// the listing pages by `pageSize` (other paging params are ignored: 10 rows, page 0, every time)
const list = await get('/vaults?pageSize=500')
const targets = new Map(list.vaults.map((v) => [`${v.chain.id}:${v.address.toLowerCase()}`, v]))
if (list.hasNextPage) console.warn(`listing says more than ${list.vaults.length} — raise pageSize`)
// a Lagoon vault the menu offers but the listing hides is still worth a detail read
if (existsSync(SEED)) {
  const seed = JSON.parse(readFileSync(SEED, 'utf8'))
  for (const uid of seed.uids ?? []) {
    const m = /^vault\.lagoon:(\d+):(0x[0-9a-f]{40})$/i.exec(uid)
    if (m && !targets.has(`${m[1]}:${m[2].toLowerCase()}`)) targets.set(`${m[1]}:${m[2].toLowerCase()}`, null)
  }
}

const vaults = {}
let failed = 0
for (const [key, row] of targets) {
  const [chainId, address] = key.split(':')
  let d
  try {
    d = await get(`/vault?chainId=${chainId}&address=${address}`)
    d = d.vault ?? d
  } catch (e) {
    failed++
    console.warn(`skip ${key}: ${e.message}`)
    continue
  }
  const v = { ...(row ?? {}), ...d }
  const insurance = (v.defiIntegrations ?? [])
    .filter((x) => x.type === 'INSURANCE' && https(x.link))
    .map((x) => ({ name: x.name, link: x.link, note: x.description }))
  vaults[key] = {
    name: v.name,
    category: v.strategyCategory?.key ?? null,
    categoryLabel: v.strategyCategory?.label ?? null,
    curators: (v.curators ?? []).map((c) => ({ name: c.name, url: https(c.url) ?? null })),
    short: tidy(v.shortDescription) ?? null,
    description: tidy(v.description) ?? null,
    transparencyUrl: https(v.transparencyUrl) ?? null,
    inception: typeof v.inception === 'number' ? v.inception : null,
    ...(insurance.length ? { insurance } : {}),
  }
  await sleep(150)
}

const n = Object.keys(vaults).length
if (n < 30 || failed > n / 4) {
  console.error(`only ${n} vaults read (${failed} failed) — refusing to write`)
  process.exit(1)
}
const sorted = Object.fromEntries(Object.keys(vaults).sort().map((k) => [k, vaults[k]]))
writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString().slice(0, 10), vaults: sorted }, null, 1) + '\n')
const described = Object.values(vaults).filter((v) => v.short || v.description).length
console.log(`${n} Lagoon vaults written (${described} described, ${failed} failed)`)
