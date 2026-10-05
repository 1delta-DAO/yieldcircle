// Build src/data/logos.json from the token-lists repo's generated logo index.
//
// This file used to carry its own WANT array plus per-chain fallbacks for BNB and Avalanche,
// which is the same curation token-lists already does — badly, because it only saw chain 1 and
// re-picked an icon per symbol by hand. The pipeline now publishes that map itself
// (`scripts/logos/groupLogos.ts` → `logos-by-symbol.json`, one ranked winner per ticker over
// every asset group), so all that is left here is the SUBSET: the symbols this app presents,
// read straight out of BASE + DESK + WRAPPER in src/model/assets.ts. Add an asset there and it gets an
// icon on the next run; nothing to curate twice.
//
// Usage: node scripts/logos.mjs [/path/to/token-lists]   (or TOKEN_LISTS_DIR=…)
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const arg = process.argv[2] ?? process.env.TOKEN_LISTS_DIR ?? '/home/axtar/token-lists'
// back-compat: this used to take the path to 1.json
const root = arg.endsWith('.json') ? arg.slice(0, arg.lastIndexOf('/')) : arg

const INDEX = join(root, 'logos-by-symbol.json')
let index
try {
  index = JSON.parse(readFileSync(INDEX, 'utf8'))
} catch {
  console.error(`no ${INDEX} — run \`npm run logos:groups\` in the token-lists repo (scripts/) first`)
  process.exit(1)
}

/**
 * The object literal `decl` declares, as source text — the app's own whitelist, without
 * duplicating it here. The opening brace is taken after the `=`, not after the declaration:
 * `const BASE: Record<string, { sym: string; … }>` opens a brace in its TYPE first, and
 * brace-matching that one yields the type's fields instead of the assets.
 */
function literalBody(src, decl) {
  const start = src.indexOf(decl)
  if (start < 0) throw new Error(`${decl} not found in src/model/assets.ts`)
  const open = src.indexOf('{', src.indexOf('= {', start))
  let depth = 0
  let end = open
  for (; end < src.length; end++) {
    if (src[end] === '{') depth++
    else if (src[end] === '}' && --depth === 0) break
  }
  // Comments go first — assets.ts has a `'BTC.b' → 'BTC.B'` note inside BASE.
  return src
    .slice(open + 1, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

/** Top-level keys of such a literal: nested values collapse innermost-first, so `USDC: { … },` leaves `USDC:`. */
function recordKeys(body) {
  let flat = body
  while (/\{[^{}]*\}/.test(flat)) flat = flat.replace(/\{[^{}]*\}/g, '')
  return [...flat.matchAll(/(?:^|,)\s*(?:'([^']+)'|([A-Za-z0-9._$]+))\s*:/gm)].map((m) => (m[1] ?? m[2]).toUpperCase())
}

const assets = readFileSync(new URL('../src/model/assets.ts', import.meta.url), 'utf8')
const bases = recordKeys(literalBody(assets, 'const BASE:'))
// the dollar desks' row keys draw as their flagship ticker (`syrupUSDC` for Maple, `USDe` for Ethena)
const deskEntries = [...literalBody(assets, 'const DESK:').matchAll(/(?:'([^']+)'|([A-Za-z0-9_$-]+))\s*:\s*\{\s*sym:\s*'([^']+)'/g)].map((m) => [m[1] ?? m[2], m[3].toUpperCase()])
const deskSyms = deskEntries.map(([, sym]) => sym)
/**
 * A desk's icon is its OWN token's, not the ticker's winner: `USD3` ranks Reserve's coin first,
 * and the 3Jane row is not Reserve. Taken from the first offered chain list holding a token of
 * that ticker issued by that desk; the ticker index stays the fallback.
 */
const deskIcon = {}
for (const chain of ['1', '8453', '42161', '56', '43114', '999', '9745']) {
  let list
  try { list = Object.values(JSON.parse(readFileSync(join(root, `${chain}.json`), 'utf8')).list) } catch { continue }
  for (const [id, sym] of deskEntries) {
    if (deskIcon[sym]) continue
    const t = list.find((x) => x.symbol?.toUpperCase() === sym && x.props?.issuer?.id === id && x.logoURI)
    if (t) deskIcon[sym] = t.logoURI
  }
}
// WRAPPER maps a wrapper's symbol to the base asset it stands for; both halves are used, the
// value as the fallback icon for a wrapper the index has never heard of.
const wrapped = Object.fromEntries(
  [...literalBody(assets, 'const WRAPPER:').matchAll(/(?:'([^']+)'|([A-Za-z0-9._$]+))\s*:\s*'([^']+)'/g)].map(
    (m) => [(m[1] ?? m[2]).toUpperCase(), m[3].toUpperCase()],
  ),
)

/**
 * A gas coin is identified by its CHAIN, not by its ticker.
 *
 * `logos-by-symbol.json` ranks one winner per ticker over every asset group, which is the right
 * shape for a balance row and the wrong one for a coin whose ticker three unrelated tokens also
 * ship: MON went to a 2024 CoinGecko upload, HYPE to a green blob, PLUME to another Plume. The
 * chain's own list has no such ambiguity — the row at the zero address IS that chain's gas coin —
 * so its ASSET GROUP is looked up in the group-keyed `logos.json` instead. Nothing is curated
 * here either: the override only fires when the ticker's winner and the group's winner disagree,
 * which on 2026-09-24 was HYPE, MON and PLUME and no one else (ETH, BNB, AVAX, POL, XPL, USDC on
 * Arc, USDT0 on Stable and pathUSD on Tempo all already agreed).
 *
 * Which chains have which coin is `NATIVE` in src/model/positions.ts — read from there, so the
 * app keeps one answer to "what is chain N's gas" rather than two.
 */
const positions = readFileSync(new URL('../src/model/positions.ts', import.meta.url), 'utf8')
const natives = [...literalBody(positions, 'const NATIVE:').matchAll(/(?:'([^']+)'|([A-Za-z0-9._$]+))\s*:\s*'([^']+)'/g)]
  .map((m) => [m[1] ?? m[2], m[3].toUpperCase()])
let byGroup = {}
try { byGroup = JSON.parse(readFileSync(join(root, 'logos.json'), 'utf8')) } catch { /* group index optional */ }
// where each chain keeps its gas row: the zero address on EVM, `111…1` on Solana
let nativeCurrencies = {}
try { nativeCurrencies = JSON.parse(readFileSync(join(root, 'native-currencies.json'), 'utf8')) } catch { /* zero address only */ }
const nativeIcon = {}
/**
 * A gas coin's wrappers and staking tokens (WRAPPER values naming it) live on its chain, so that
 * chain's list is asked first: the ticker index answered JupSOL, bSOL, dfdvSOL and raSOL with
 * the Wormhole-bridged SOL mark, the same picture as SOL itself. Only for a chain whose gas row
 * is not at the zero address (Solana): the ticker index is built from the EVM lists and already
 * agrees with them there, so WHYPE or WMON are left to it.
 */
const homeIcon = {}
for (const [chainId, sym] of natives) {
  let list
  try { list = JSON.parse(readFileSync(join(root, `${chainId}.json`), 'utf8')).list } catch { continue }
  const nc = nativeCurrencies[chainId]
  const at = (addr) => Object.entries(list).find(([a]) => a.toLowerCase() === addr.toLowerCase())?.[1]
  const row = nc?.address ? at(nc.address) : Object.entries(list).find(([a]) => /^0x0+$/i.test(a))?.[1]
  // Solana's group (`Wrapped SOL::SOL::solana`) has no entry in the group index: the row's own icon is the coin's
  const uri = (row?.assetGroup ? byGroup[row.assetGroup] : undefined) ?? row?.logoURI
  if (uri && uri !== index[sym]) nativeIcon[sym] = uri
  const wrappedRow = nc?.wrapped ? at(nc.wrapped) : undefined
  for (const [w, base] of Object.entries(wrapped)) {
    if (base !== sym || !nc?.address) continue
    // the wrapped gas coin draws as the coin, as WETH does as ETH
    if (wrappedRow?.symbol?.toUpperCase() === w && uri) { homeIcon[w] = uri; continue }
    const t = Object.values(list).find((x) => x.symbol?.toUpperCase() === w && x.logoURI)
    if (t) homeIcon[w] = t.logoURI
  }
}
if (Object.keys(nativeIcon).length) console.log(`gas coin icon taken from its own chain: ${Object.keys(nativeIcon).join(', ')}`)

/**
 * An exposure asset (`EXPOSURE` in assets.ts) names its one home token, and its icon is that
 * token's own: the ticker index gave `JLP` to an unrelated launchpad coin.
 */
const exposureIcon = {}
for (const m of literalBody(assets, 'const EXPOSURE:').matchAll(/([A-Za-z0-9]+):\s*\{[^\n]*chainId:\s*'([^']+)',\s*address:\s*'([^']+)'/g)) {
  let list
  try { list = JSON.parse(readFileSync(join(root, `${m[2]}.json`), 'utf8')).list } catch { continue }
  const row = Object.entries(list).find(([a]) => a.toLowerCase() === m[3].toLowerCase())?.[1]
  if (row?.logoURI) exposureIcon[m[1].toUpperCase()] = row.logoURI
}

const out = {}
const missing = []
for (const sym of [...new Set([...bases, ...deskSyms, ...Object.keys(wrapped)])]) {
  // A bridged or renamed wrapper (USDC.e, DAI.e) is folded into its base's asset group upstream,
  // so it has no ticker of its own — it draws as what it is, the base asset.
  const uri = exposureIcon[sym] ?? nativeIcon[sym] ?? deskIcon[sym] ?? homeIcon[sym] ?? index[sym] ?? index[wrapped[sym]]
  if (uri) out[sym] = uri
  else missing.push(sym)
}

writeFileSync(new URL('../src/data/logos.json', import.meta.url), JSON.stringify(out, null, 1) + '\n')
console.log(`${Object.keys(out).length} logos written from ${INDEX}`)
if (missing.length) {
  // A base asset with no icon draws a blank circle in the app, so say which — the fix belongs in
  // token-lists (the asset has no `logoURI` on any chain), not in a hand-written override here.
  console.warn(`no icon for ${missing.join(', ')}`)
  if (missing.some((s) => bases.includes(s) || deskSyms.includes(s))) process.exitCode = 1
}

// ---------------------------------------------------------------------------------------------
// Strategy tokens: what a vault row leaves you holding (wstETH, sUSDS, syrupUSDC, SolvBTC, a
// MetaMorpho share …). The earn listing serves the ASSET's logo on nearly every row, so the
// share token is resolved here instead: the row's `ref` is the vault / share-token address,
// looked up in the chain's token list. Output: src/data/strategy-tokens.json, `chain:ref` →
// { symbol, logoURI }. Needs the API (VITE_BACKEND_BASE_URL or the credited backend).
// ---------------------------------------------------------------------------------------------
const API = process.env.VITE_BACKEND_BASE_URL ?? 'https://allocator.api.1delta.io'
const CHAINS = ['1', '8453', '42161', '56', '43114']
const strat = {}
for (const chain of CHAINS) {
  let list
  try { list = JSON.parse(readFileSync(join(root, `${chain}.json`), 'utf8')).list } catch { continue }
  const byAddr = new Map(Object.entries(list).map(([a, t]) => [a.toLowerCase(), t]))
  let rows = []
  try {
    const res = await fetch(`${API}/v1/data/earn?chainId=${chain}&count=1000&sort=tvl&maxRiskScore=5&minTvlUsd=500000&terms=none`)
    const j = await res.json(); rows = (j.data ?? j).items ?? []
  } catch (e) { console.error('earn fetch failed for chain', chain, e.message); continue }
  for (const r of rows) {
    if (r.venueKind !== 'vault' || !r.ref) continue
    const t = byAddr.get(String(r.ref).toLowerCase())
    if (t && t.symbol) strat[`${chain}:${String(r.ref).toLowerCase()}`] = { symbol: t.symbol, logoURI: t.logoURI ?? null }
  }
}
writeFileSync(new URL('../src/data/strategy-tokens.json', import.meta.url), JSON.stringify(strat, null, 1) + '\n')
console.log(Object.keys(strat).length, 'strategy tokens written')
