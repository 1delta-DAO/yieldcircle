/**
 * Which market a lending row IS.
 *
 * `Lend on Morpho` is the same sentence for three hundred Morpho markets, and the ticket
 * deposits into exactly one of them — the one whose collateral and LLTV decide what the
 * deposit is actually lent against. The listing already names it (`wstETH-USDT 86`,
 * `USDC · Ethena Ecosystem`, `USDC · vs HYBOND`, `REUSD+USDT-USDT`); this turns that name
 * into the part the row does not already say.
 *
 * Dropped: the row's own asset (the headline is `USDT` already) and the `· 0xE7E9` id tail
 * upstream appends when two market names would collide — the catalogue keeps one row per
 * venue per asset, so nothing a reader can see collides with it, and four hex digits are
 * not a thing anyone chooses between.
 *
 * A single-market venue (`USDT` on Aave V3, `USDC · 0x481d` on Euler, where the whole name
 * is the asset) answers `''`: there is nothing to add, and `Lend on Aave V3` is the truth.
 */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function marketTag(name: string | undefined, symbol: string): string {
  let n = (name ?? '').trim()
  if (!n) return ''
  n = n.replace(/\s*·\s*0x[0-9a-f]{3,}$/i, '').trim()
  const S = symbol.toUpperCase()
  // `USDT · Ethena Ecosystem`, `USDC · vs HYBOND`: the asset leads, the instance follows
  if (n.toUpperCase().startsWith(`${S} · `)) n = n.slice(S.length + 3).trim()
  // `wstETH-USDT 86`, `PT-sUSDS-26NOV2026-USDT 92`, `Institutional USDC`: the loan leg is
  // the row's asset, so only the collateral and the LLTV are news. A name that LEADS with
  // the asset (`cbBTC-USDC` on Fluid, `crvUSD / WETH` on LlamaLend) is left whole: there
  // the asset is the collateral, and cutting it would flip what the market is.
  else n = n.replace(new RegExp(`[-\\s]${escapeRe(S)}(?=\\s|$)`, 'i'), '').trim()
  return n.toUpperCase() === S ? '' : n
}
