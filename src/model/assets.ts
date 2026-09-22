/**
 * The three layers of the simple app:
 *   group    USD · ETH · BTC · More            (collateral exposure)
 *   asset    USDC, USDT, USDe, USDS, … ETH, WBTC, cbBTC …   (what you own — a WHITELIST, so
 *            wrappers never appear as assets)
 *   strategy everything on top of an asset (a plain deposit or a loop)
 */
export type GroupId = 'USD' | 'ETH' | 'BTC' | 'MORE'
export interface Group { id: GroupId; name: string; desc: string; color: string; unit: string }
export const GROUPS: Group[] = [
  { id: 'USD', name: 'US Dollar', desc: 'Stablecoin strategies', color: '#3fbf7f', unit: '$' },
  { id: 'ETH', name: 'Ether', desc: 'ETH and staked ETH', color: '#8fa6ff', unit: 'ETH' },
  { id: 'BTC', name: 'Bitcoin', desc: 'BTC wrappers', color: '#f0a830', unit: 'BTC' },
  { id: 'MORE', name: 'More', desc: 'BNB, euro, gold, other', color: '#c084fc', unit: '' },
]
export const group = (id: GroupId) => GROUPS.find((g) => g.id === id)!

/** Base assets we present, keyed by upper-cased symbol → { canonical symbol, group, what, colour }. */
const BASE: Record<string, { sym: string; group: GroupId; what: string; color: string }> = {
  USDC: { sym: 'USDC', group: 'USD', what: 'Circle stablecoin', color: '#2775ca' },
  USDT: { sym: 'USDT', group: 'USD', what: 'Tether stablecoin', color: '#26a17b' },
  USDS: { sym: 'USDS', group: 'USD', what: 'Sky (Maker) stablecoin', color: '#f5ac37' },
  DAI: { sym: 'DAI', group: 'USD', what: 'Maker stablecoin', color: '#f5ac37' },
  USDE: { sym: 'USDe', group: 'USD', what: 'Ethena synthetic dollar · hedged ETH/BTC basis', color: '#bdbdbd' },
  USDG: { sym: 'USDG', group: 'USD', what: 'Paxos / Global Dollar Network stablecoin', color: '#4fb3d9' },
  GHO: { sym: 'GHO', group: 'USD', what: 'Aave stablecoin', color: '#b6509e' },
  PYUSD: { sym: 'PYUSD', group: 'USD', what: 'PayPal stablecoin', color: '#0070ba' },
  RLUSD: { sym: 'RLUSD', group: 'USD', what: 'Ripple stablecoin', color: '#0a8fd0' },
  AUSD: { sym: 'AUSD', group: 'USD', what: 'Agora stablecoin', color: '#c9a86b' },
  FRXUSD: { sym: 'frxUSD', group: 'USD', what: 'Frax stablecoin', color: '#111' },
  CRVUSD: { sym: 'crvUSD', group: 'USD', what: 'Curve stablecoin', color: '#ffd400' },
  DOLA: { sym: 'DOLA', group: 'USD', what: 'Inverse Finance stablecoin', color: '#7c5cff' },
  USD1: { sym: 'USD1', group: 'USD', what: 'World Liberty stablecoin', color: '#d4b04a' },
  FRAX: { sym: 'FRAX', group: 'USD', what: 'Frax stablecoin', color: '#111' },
  USDTB: { sym: 'USDtb', group: 'USD', what: 'Ethena / BlackRock BUIDL-backed dollar', color: '#7d7d7d' },
  ETH: { sym: 'ETH', group: 'ETH', what: 'Ether', color: '#8fa6ff' },
  WETH: { sym: 'ETH', group: 'ETH', what: 'Ether', color: '#8fa6ff' },
  WBTC: { sym: 'WBTC', group: 'BTC', what: 'Wrapped bitcoin (BitGo)', color: '#f09242' },
  CBBTC: { sym: 'cbBTC', group: 'BTC', what: 'Coinbase wrapped bitcoin', color: '#1652f0' },
  TBTC: { sym: 'tBTC', group: 'BTC', what: 'Threshold bitcoin', color: '#7d7d7d' },
  LBTC: { sym: 'LBTC', group: 'BTC', what: 'Lombard staked bitcoin', color: '#62d0a5' },
  BNB: { sym: 'BNB', group: 'MORE', what: 'BNB Chain native coin', color: '#f0b90b' },
  WBNB: { sym: 'BNB', group: 'MORE', what: 'BNB Chain native coin', color: '#f0b90b' },
  EURC: { sym: 'EURC', group: 'MORE', what: 'Circle euro stablecoin', color: '#2775ca' },
  EURCV: { sym: 'EURCV', group: 'MORE', what: 'Société Générale euro stablecoin', color: '#e9041e' },
  XAUT: { sym: 'XAUt', group: 'MORE', what: 'Tether gold', color: '#d4af37' },
  PAXG: { sym: 'PAXG', group: 'MORE', what: 'Paxos gold', color: '#d4af37' },
}
/** Known wrappers → their base, for places that only have a symbol (positions, balances). */
const WRAPPER: Record<string, string> = {
  SUSDE: 'USDe', SUSDS: 'USDS', SDAI: 'DAI', SDOLA: 'DOLA', SFRXUSD: 'frxUSD', SYRUPUSDC: 'USDC', SYRUPUSDT: 'USDT', SUSDC: 'USDC', SGHO: 'GHO', SFRAX: 'FRAX',
  SLISBNB: 'BNB', WBETH: 'ETH', BNBX: 'BNB', ANKRBNB: 'BNB',
  WSTETH: 'ETH', STETH: 'ETH', WEETH: 'ETH', EETH: 'ETH', CBETH: 'ETH', RETH: 'ETH', EZETH: 'ETH', RSETH: 'ETH', OSETH: 'ETH', METH: 'ETH', FRXETH: 'ETH', SFRXETH: 'ETH', ETHX: 'ETH', SWETH: 'ETH',
}

export const baseInfo = (sym: string | undefined) => (sym ? BASE[sym.toUpperCase()] : undefined)
/** Canonical base symbol for a symbol the user might own, or undefined when it is not a base asset we present. */
export function baseOfSymbol(sym: string | undefined): string | undefined {
  if (!sym) return undefined
  const u = sym.toUpperCase()
  if (BASE[u]) return BASE[u].sym
  if (WRAPPER[u]) return WRAPPER[u]
  const pt = /^PT-([A-Za-z0-9]+)-/.exec(sym)   // PT-USDG-24SEP2026 → USDG (and PT-sUSDe → USDe through the wrapper map)
  if (pt) return baseOfSymbol(pt[1])
  return undefined
}
/**
 * Base asset of a loop's collateral from its props: savings.underlying (sUSDe → USDe), lst.asset (wstETH → ETH),
 * the parenthesised underlying of a PT's name ("PT reUSD (USDC) …" → USDC), then the symbol itself.
 */
export function baseOfCollateral(a: { symbol: string; name?: string; assetGroup?: string; props?: { lst?: { asset?: string }; savings?: { underlying?: string }; pendle?: unknown; spectra?: unknown } }, debtSymbol: string): string | undefined {
  const p = a.props ?? {}
  const cands: (string | undefined)[] = [p.savings?.underlying, p.lst?.asset]
  if (p.pendle || p.spectra) { const m = /\(([A-Za-z0-9]+)\)/.exec(a.assetGroup ?? a.name ?? ''); cands.push(m?.[1]) }
  cands.push(a.symbol)
  for (const c of cands) { const b = baseOfSymbol(c); if (b) return b }
  // an LST-BTC (lst.asset = BTC) has no base of its own: the debt wrapper (WBTC) is what the user owns
  return baseOfSymbol(debtSymbol)
}
export const groupOf = (base: string): GroupId => baseInfo(base)?.group ?? 'MORE'
export const whatIs = (base: string): string => baseInfo(base)?.what ?? base
export function colorOf(sym: string): string {
  const b = baseInfo(sym); if (b) return b.color
  let h = 0; for (const c of sym) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return `hsl(${h % 360} 45% 55%)`
}
export const short = (sym: string) => sym.replace(/^PT-/, '').slice(0, 3).toUpperCase()

/**
 * Logos for base assets and known wrappers, from the plain mainnet token list
 * (`scripts/logos.mjs` → `src/data/logos.json`). The API's per-row `logoURI` pictures the venue's
 * token (a vault, an LST), not the base asset, so it is never used for an asset mark.
 */
import LOGOS from '../data/logos.json'
export const assetLogo = (sym: string | undefined): string | undefined => (sym ? (LOGOS as Record<string, string>)[sym.toUpperCase()] : undefined)
/** Unit a group's amounts are typed in: dollars for USD, the asset itself elsewhere. */
export const unitOf = (base: string) => (groupOf(base) === 'USD' ? '$' : base)
