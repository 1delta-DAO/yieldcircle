// Build src/data/desks.json from the token-lists repo's chain lists.
//
// Usage: node scripts/desks.mjs [/path/to/token-lists]   (or TOKEN_LISTS_DIR=…)
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? process.env.TOKEN_LISTS_DIR ?? '/home/axtar/token-lists'
// ---------------------------------------------------------------------------------------------
// Desks: whose credit each USD, ETH and BTC token on an offered chain is (docs/stablecoin-exposure.md).
// The catalogue's rows carry `props.issuer{,Exposures}` themselves; positions and wallet balances
// carry an address and a symbol only, so they are resolved through this table. Output:
// src/data/desks.json, `{ desks: { id: [name, kind] }, tokens | eth | btc: { 'chain:address': id | '~ROOT' | '' } }`
// for every token whose money is USD (`tokens`), ETH or BTC — '' is a token nobody is named for
// (it stands for itself). Plain ETH/WETH carry no issuer and land in `eth` as ''.
//
// The desk is the CREDIT desk: the token's own `issuer` unless that is only a wrapper's
// instrument (Pendle on a PT), then `issuerExposures` (fewest hops), so a PT over sUSDe is
// Ethena's and Strata's srUSDe (exposed to Ethena) is Strata's. A wrapper the lists did not attribute inherits through its
// declared underlying (`pendle`/`spectra`/`exponent`.underlyingAsset, `receipt.underlying`, by
// address). Never through `savings.underlying`: that is a SYMBOL, and on Ethereum `USD3` is both
// 3Jane's and Reserve's — an unattributed savings token stays unattributed until token-lists
// names it (a ticker is not an identity).
// ---------------------------------------------------------------------------------------------
const queriesSrc = readFileSync(new URL('../src/sdk/queries.ts', import.meta.url), 'utf8')
// the chains the app offers: `CHAINS` in src/sdk/queries.ts, read from there rather than repeated
const chainsSrc = queriesSrc.slice(queriesSrc.indexOf('export const CHAINS'), queriesSrc.indexOf('\n]', queriesSrc.indexOf('export const CHAINS')))
const offered = [...chainsSrc.matchAll(/id:\s*'(\d+)'/g)].map((m) => m[1])
const deskNames = {}
const deskTokens = {}
const ethTokens = {}
const btcTokens = {}
const byHops = (a, b) => (a.hops ?? 9) - (b.hops ?? 9)
/** desks that only ever issue the wrapper (whose contract, never whose credit) — model/desk.ts `INSTRUMENT` */
const INSTRUMENT = new Set(['pendle', 'spectra', 'exponent'])
/**
 * `props.stablecoin` is trusted when token-lists stamped it by IDENTITY — the token's group (or
 * chain-address) is in its group-keyed snapshot — or when a desk is named for the token. Since
 * token-lists 100ace1 it is also stamped by bare TICKER (`stablecoin-symbols.json`), which tags
 * Ethernity's ERN, Hacken's HAI, a DefiAi `DAI` … as dollars; those are not let in here.
 */
let stableGroups = {}
try { stableGroups = JSON.parse(readFileSync(join(root, 'scripts/stablecoin/stablecoin.json'), 'utf8')) } catch { console.warn('no scripts/stablecoin/stablecoin.json — props.stablecoin taken as stamped') }
const guarded = Object.keys(stableGroups).length > 0
const trusted = (t, chain) => !guarded || !!t.props?.issuer || !!t.props?.issuerExposures?.length || !!stableGroups[t.assetGroup] || !!stableGroups[`${chain}-${String(t.address ?? '').toLowerCase()}`]
for (const chain of offered) {
  let list
  try { list = JSON.parse(readFileSync(join(root, `${chain}.json`), 'utf8')).list } catch { continue }
  const byAddr = new Map(Object.entries(list).map(([a, t]) => [a.toLowerCase(), t]))
  const underOf = (p) => {
    const u = p.pendle?.underlyingAsset ?? p.spectra?.underlyingAsset ?? p.exponent?.underlyingAsset ?? p.receipt?.underlying
    return typeof u === 'string' ? byAddr.get(u.toLowerCase()) : undefined
  }
  // A wrapper's own `issuer` is its INSTRUMENT (Pendle on a PT), not whose credit it holds: with
  // no exposure named, the walk goes on to the underlying, and ends unattributed rather than
  // filing a PT over an unknown dollar under Pendle.
  const deskOf = (t, depth = 0) => {
    const p = t.props ?? {}
    if (p.issuer && !INSTRUMENT.has(p.issuer.id) && !(p.pendle || p.spectra || p.exponent || p.receipt)) return p.issuer
    const ex = (p.issuerExposures ?? []).filter((e) => !INSTRUMENT.has(e.id))
    if (ex.length) return [...ex].sort(byHops)[0]
    const u = depth < 3 ? underOf(p) : undefined
    if (u) return deskOf(u, depth + 1)
    return null
  }
  // the money: a dollar by the (guarded) stablecoin flag or savings base; ether / bitcoin by the
  // LST's asset or the canonical `denomination` (WETH, WBTC, cbBTC — never a ticker like `USDC`)
  const MONEY = new Set(['USD', 'ETH', 'BTC'])
  const denomOf = (t, depth = 0) => {
    const p = t.props ?? {}
    const m = [trusted(t, chain) ? p.stablecoin?.base : undefined, p.savings?.base, p.lst?.asset, p.denomination].find((x) => x && MONEY.has(String(x).toUpperCase()))
    if (m) return String(m).toUpperCase()
    const u = depth < 3 ? underOf(p) : undefined
    return u ? denomOf(u, depth + 1) : undefined
  }
  const rootOf = (t, depth = 0) => {
    const p = t.props ?? {}
    const u = depth < 3 ? underOf(p) : undefined
    return u ? rootOf(u, depth + 1) ?? u.symbol : p.savings?.underlying
  }
  for (const [addr, t] of byAddr) {
    const money = denomOf(t)
    if (!money) continue
    const d = deskOf(t)
    if (d) deskNames[d.id] ??= [d.name ?? d.id, d.kind ?? null]
    // no desk: `~ROOT` names the dollar it wraps (sUSDf → `~USDf`, a PT → its underlying's root),
    // so a position read by address lands on the same unattributed row as the catalogue's
    const table = money === 'USD' ? deskTokens : money === 'ETH' ? ethTokens : btcTokens
    table[`${chain}:${addr}`] = d?.id ?? (money === 'USD' && rootOf(t) ? `~${rootOf(t)}` : '')
  }
}
writeFileSync(new URL('../src/data/desks.json', import.meta.url), JSON.stringify({ desks: deskNames, tokens: deskTokens, eth: ethTokens, btc: btcTokens }) + '\n')
for (const [money, table] of [['dollar', deskTokens], ['ether', ethTokens], ['bitcoin', btcTokens]]) {
  const attributed = Object.values(table).filter((v) => v && !v.startsWith('~')).length
  console.log(`${Object.keys(table).length} ${money} tokens written, ${attributed} with a desk`)
}
console.log(`${Object.keys(deskNames).length} desks`)
