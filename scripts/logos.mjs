// Build src/data/logos.json from the plain mainnet token list: one logo per base asset / known
// wrapper, preferring the list's `mainTokens` when a symbol appears more than once.
// Usage: node scripts/logos.mjs [/path/to/token-lists/1.json]
import { readFileSync, writeFileSync } from 'node:fs'
const src = process.argv[2] ?? '/home/axtar/token-lists/1.json'
const d = JSON.parse(readFileSync(src, 'utf8'))
const list = Object.values(d.list)
const main = new Set((d.mainTokens ?? []).map((a) => String(a).toLowerCase()))
const WANT = ['WETH', 'USDC', 'USDT', 'USDS', 'DAI', 'USDe', 'USDG', 'GHO', 'PYUSD', 'RLUSD', 'AUSD', 'frxUSD', 'crvUSD', 'DOLA', 'USD1', 'FRAX', 'USDtb', 'WBTC', 'cbBTC', 'tBTC', 'LBTC', 'EURC', 'EURCV', 'XAUt', 'PAXG',
  'sUSDe', 'sUSDS', 'sDAI', 'sDOLA', 'sfrxUSD', 'syrupUSDC', 'syrupUSDT', 'wstETH', 'stETH', 'weETH', 'cbETH', 'rETH', 'ezETH', 'rsETH', 'osETH', 'mETH', 'frxETH', 'sfrxETH', 'ETHx']
const out = {}
for (const w of WANT) {
  const cands = list.filter((t) => (t.symbol ?? '').toUpperCase() === w.toUpperCase() && t.logoURI)
  const pick = cands.find((t) => main.has(String(t.address).toLowerCase())) ?? cands[0]
  if (pick) out[w.toUpperCase()] = pick.logoURI
}
// native ETH: the list's "ETH" entry is a random ERC-20 with that ticker; use the wrapped ether logo
out.ETH = out.WETH ?? 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png'
// BNB Chain: WBNB and the BNB liquid-staking wrappers from the chain-56 list
try {
  const b = JSON.parse(readFileSync(src.replace(/1\.json$/, '56.json'), 'utf8'))
  const blist = Object.values(b.list), bmain = new Set((b.mainTokens ?? []).map((a) => String(a).toLowerCase()))
  for (const w of ['WBNB', 'slisBNB', 'BNBx', 'ankrBNB', 'wBETH']) {
    const cands = blist.filter((t) => (t.symbol ?? '').toUpperCase() === w.toUpperCase() && t.logoURI)
    const pick = cands.find((t) => bmain.has(String(t.address).toLowerCase())) ?? cands[0]
    if (pick && !out[w.toUpperCase()]) out[w.toUpperCase()] = pick.logoURI
  }
  out.BNB = out.WBNB ?? out.BNB
} catch { /* no chain-56 list beside it */ }
writeFileSync(new URL('../src/data/logos.json', import.meta.url), JSON.stringify(out, null, 1) + '\n')
console.log(Object.keys(out).length, 'logos written')

// ---------------------------------------------------------------------------------------------
// Strategy tokens: what a vault row leaves you holding (wstETH, sUSDS, syrupUSDC, SolvBTC, a
// MetaMorpho share …). The earn listing serves the ASSET's logo on nearly every row, so the
// share token is resolved here instead: the row's `ref` is the vault / share-token address,
// looked up in the chain's token list. Output: src/data/strategy-tokens.json, `chain:ref` →
// { symbol, logoURI }. Needs the API (VITE_BACKEND_BASE_URL or the credited backend).
// ---------------------------------------------------------------------------------------------
const API = process.env.VITE_BACKEND_BASE_URL ?? 'https://allocator.api.1delta.io'
const CHAINS = ['1', '8453', '42161', '56']
const strat = {}
for (const chain of CHAINS) {
  let list
  try { list = JSON.parse(readFileSync(src.replace(/1\.json$/, `${chain}.json`), 'utf8')).list } catch { continue }
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
