// Build packages/core/src/data/fluid-smart.json: Fluid's smart-collateral vaults (T2) and the two
// legs of their collateral LP.
//
// Usage: node scripts/fluid-smart.mjs   (pnpm fluid-smart)
//
// A pairs row names a smart-collateral vault only by `isBasketLong`: it carries ONE leg of the LP
// (the token the loop deposits) and no vault type, so it cannot say whether the debt is an LP too
// (T4) or which token the other leg is. `/v1/data/lending/pools` can (`fluid.vaultType`,
// `fluid.collateralPair`), but it is 2.3 MB on Ethereum alone, too heavy for the browser, so this
// snapshot is built here and shipped. A vault missing from it stays hidden (`basket`) until the next
// run: never guessed from its name. A failed or thin run refuses to overwrite a good file.
//
// Keyed `chainId:LENDER_KEY` → the collateral LP's legs in the vault's token0/token1 order. Only T2
// (LP collateral, one-token debt) is listed: a T3/T4 borrows an LP, which the app does not offer, and
// leaving it out is what keeps it hidden.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const BASE = process.env.BACKEND_BASE_URL ?? 'https://allocator.api.1delta.io'
const OUT = new URL('../packages/core/src/data/fluid-smart.json', import.meta.url)
const QUERIES = new URL('../packages/app/src/sdk/queries.ts', import.meta.url)

// the app's EVM chains, read from its own list rather than copied here
const chains = [...readFileSync(QUERIES, 'utf8').matchAll(/\{ id: '(\d+)', label:/g)].map((m) => m[1])

async function pools(chainId) {
  const items = []
  for (let start = 0; ; start += 500) {
    const r = await fetch(`${BASE}/v1/data/lending/pools?chainId=${chainId}&lender=FLUID&includeAMM=true&count=500&start=${start}`)
    if (!r.ok) throw new Error(`${r.status} pools ${chainId}`)
    const page = (await r.json()).data?.items ?? []
    items.push(...page)
    if (page.length < 500) return items
  }
}

const vaults = {}
let failed = 0
for (const chainId of chains) {
  let rows
  try {
    rows = await pools(chainId)
  } catch (e) {
    failed++
    console.warn(`skip ${chainId}: ${e.message}`)
    continue
  }
  const token = new Map(rows.map((r) => [r.underlyingInfo?.asset?.address?.toLowerCase(), r.underlyingInfo?.asset]))
  for (const r of rows) {
    const f = r.fluid
    if (f?.vaultType !== 20000 || !f.isSmartCol || f.isSmartDebt || f.collateralPair?.length !== 2) continue
    const key = `${chainId}:${r.lenderKey}`
    if (vaults[key]) continue
    const legs = f.collateralPair.map((a) => ({ a: a.toLowerCase(), t: token.get(a.toLowerCase()) }))
    // a leg no row names (no symbol) cannot be shown or checked for its money: left out
    if (legs.some((l) => !l.t?.symbol)) continue
    vaults[key] = legs.map(({ a, t }) => ({ address: a, symbol: t.symbol, ...(t.logoURI ? { logo: t.logoURI } : {}) }))
  }
}

const n = Object.keys(vaults).length
const prev = existsSync(OUT) ? Object.keys(JSON.parse(readFileSync(OUT, 'utf8'))).length : 0
if (failed || n < prev * 0.8) {
  console.error(`refusing to write: ${n} vaults (had ${prev}), ${failed} chain(s) failed`)
  process.exit(1)
}
const sorted = Object.fromEntries(Object.entries(vaults).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })))
writeFileSync(OUT, `{\n${Object.entries(sorted).map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')}\n}\n`)
console.log(`wrote ${n} smart-collateral vaults over ${chains.length} chains`)
