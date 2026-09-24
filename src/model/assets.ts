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
  { id: 'MORE', name: 'More', desc: 'BNB, AVAX, euro, gold, other', color: '#c084fc', unit: '' },
]
export const group = (id: GroupId) => GROUPS.find((g) => g.id === id)!

/** Base assets we present, keyed by upper-cased symbol → { canonical symbol, group, what, colour }. */
const BASE: Record<string, { sym: string; group: GroupId; what: string; color: string }> = {
  USDC: { sym: 'USDC', group: 'USD', what: 'Circle stablecoin', color: '#2775ca' },
  USDT: { sym: 'USDT', group: 'USD', what: 'Tether stablecoin', color: '#26a17b' },
  USDT0: { sym: 'USDT0', group: 'USD', what: 'Tether omnichain dollar (LayerZero OFT) · the gas coin of Stable', color: '#26a17b' },
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
  AVUSD: { sym: 'avUSD', group: 'USD', what: 'Avant synthetic dollar', color: '#5b8def' },
  ETH: { sym: 'ETH', group: 'ETH', what: 'Ether', color: '#8fa6ff' },
  WETH: { sym: 'ETH', group: 'ETH', what: 'Ether', color: '#8fa6ff' },
  WBTC: { sym: 'WBTC', group: 'BTC', what: 'Wrapped bitcoin (BitGo)', color: '#f09242' },
  CBBTC: { sym: 'cbBTC', group: 'BTC', what: 'Coinbase wrapped bitcoin', color: '#1652f0' },
  TBTC: { sym: 'tBTC', group: 'BTC', what: 'Threshold bitcoin', color: '#7d7d7d' },
  LBTC: { sym: 'LBTC', group: 'BTC', what: 'Lombard staked bitcoin', color: '#62d0a5' },
  // the key is the UPPER-CASED symbol, so the dot survives: 'BTC.b' → 'BTC.B'
  'BTC.B': { sym: 'BTC.b', group: 'BTC', what: 'Avalanche bridged bitcoin (Core)', color: '#f09242' },
  BNB: { sym: 'BNB', group: 'MORE', what: 'BNB Chain native coin', color: '#f0b90b' },
  WBNB: { sym: 'BNB', group: 'MORE', what: 'BNB Chain native coin', color: '#f0b90b' },
  AVAX: { sym: 'AVAX', group: 'MORE', what: 'Avalanche native coin', color: '#e84142' },
  WAVAX: { sym: 'AVAX', group: 'MORE', what: 'Avalanche native coin', color: '#e84142' },
  // The gas coins of the other chains the app offers. They are here for the same reason BNB and
  // AVAX are: a wallet's gas balance is money it holds, and without an entry it draws a hashed
  // colour and describes itself with its own ticker. `nativeSymbol` in positions.ts says which
  // chain each one belongs to. Arc's and Stable's gas coins are USDC and USDT0, which are already
  // above — a dollar does not become another asset by being the thing you pay fees with.
  HYPE: { sym: 'HYPE', group: 'MORE', what: 'Hyperliquid native coin', color: '#1a9e8f' },
  MON: { sym: 'MON', group: 'MORE', what: 'Monad native coin', color: '#836ef9' },
  POL: { sym: 'POL', group: 'MORE', what: 'Polygon native coin (formerly MATIC)', color: '#8247e5' },
  XPL: { sym: 'XPL', group: 'MORE', what: 'Plasma native coin', color: '#64748b' },
  PLUME: { sym: 'PLUME', group: 'MORE', what: 'Plume native coin', color: '#64748b' },
  // Tempo's gas coin. It is dollar-priced but it sits in `MORE`, not `USD`: the USD group is what
  // `sameMoney` reads to call a loop carry rather than a price bet, and that claim needs more than
  // a ticker ending in USD. Arc's USDC and Stable's USDT0 are in `USD` because they are USDC and USDT0.
  PATHUSD: { sym: 'pathUSD', group: 'MORE', what: 'Tempo native coin · dollar-priced', color: '#64748b' },
  EURC: { sym: 'EURC', group: 'MORE', what: 'Circle euro stablecoin', color: '#2775ca' },
  EURCV: { sym: 'EURCV', group: 'MORE', what: 'Société Générale euro stablecoin', color: '#e9041e' },
  XAUT: { sym: 'XAUt', group: 'MORE', what: 'Tether gold', color: '#d4af37' },
  PAXG: { sym: 'PAXG', group: 'MORE', what: 'Paxos gold', color: '#d4af37' },
}
/** Known wrappers → their base, for places that only have a symbol (positions, balances). */
const WRAPPER: Record<string, string> = {
  SUSDE: 'USDe', SUSDS: 'USDS', SDAI: 'DAI', SDOLA: 'DOLA', SFRXUSD: 'frxUSD', SYRUPUSDC: 'USDC', SYRUPUSDT: 'USDT', SUSDC: 'USDC', SGHO: 'GHO', SFRAX: 'FRAX',
  SLISBNB: 'BNB', WBETH: 'ETH', BNBX: 'BNB', ANKRBNB: 'BNB',
  SAVAX: 'AVAX', GGAVAX: 'AVAX', SAVUSD: 'avUSD',
  WHYPE: 'HYPE', WMON: 'MON', WXPL: 'XPL', WPLUME: 'PLUME', WPOL: 'POL', WMATIC: 'POL', MATIC: 'POL',
  // Monad / HyperEVM liquid staking. Upstream carried no `props.lst` for any of them until
  // token-lists' LST_MANUAL named them (2026-09-24), and a position only has a symbol: without
  // these, shMON resolved to MON only by falling back to the DEBT leg's symbol.
  SHMON: 'MON', SMON: 'MON', GMON: 'MON', APRMON: 'MON',
  KHYPE: 'HYPE', STHYPE: 'HYPE', WSTHYPE: 'HYPE', BEHYPE: 'HYPE', LSTHYPE: 'HYPE', SHYPE: 'HYPE', HYPED: 'HYPE', VHYPE: 'HYPE',
  // Avalanche's bridged ERC-20s keep a '.e' suffix; the same money either way
  'USDC.E': 'USDC', 'USDT.E': 'USDT', 'DAI.E': 'DAI', 'WETH.E': 'ETH', 'WBTC.E': 'WBTC',
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

/**
 * The money a base asset is actually denominated in — which is NOT its display
 * group. `MORE` is a drawer: BNB, AVAX, the euro and gold all live in it
 * because none of them deserves a tab of its own, and a group test therefore
 * calls sAVAX / EURC a same-denomination carry when it is a bet on AVAX
 * against the euro. Avalanche made that visible (a real `sAVAX/EURC` row came
 * back from the optimizer); BNB / EURC could always have done the same.
 *
 * A loop is only carry when both legs are the same money. That is this.
 */
export type Denomination = 'usd' | 'eth' | 'btc' | 'bnb' | 'avax' | 'eur' | 'xau' | string
const DENOM: Record<string, Denomination> = {
  BNB: 'bnb', AVAX: 'avax',
  EURC: 'eur', EURCV: 'eur',
  XAUT: 'xau', PAXG: 'xau',
}
export function denomOf(base: string): Denomination {
  const g = groupOf(base)
  if (g === 'USD') return 'usd'
  if (g === 'ETH') return 'eth'
  if (g === 'BTC') return 'btc'
  return DENOM[base.toUpperCase()] ?? base.toUpperCase()
}
/** Both legs are the same money — the test a carry has to pass. */
export const sameMoney = (a: string, b: string): boolean => denomOf(a) === denomOf(b)
export const whatIs = (base: string): string => baseInfo(base)?.what ?? base
export function colorOf(sym: string): string {
  const b = baseInfo(sym); if (b) return b.color
  let h = 0; for (const c of sym) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return `hsl(${h % 360} 45% 55%)`
}
export const short = (sym: string) => sym.replace(/^PT-/, '').slice(0, 3).toUpperCase()

/**
 * Logos for base assets and known wrappers: the token-lists pipeline publishes one ranked icon
 * per ticker across every chain (`logos-by-symbol.json`), and `scripts/logos.mjs` keeps the
 * subset named by BASE + WRAPPER above → `src/data/logos.json`. Nothing here is curated by hand:
 * an asset added to BASE gets its icon on the next run of that script.
 *
 * The API's per-row `logoURI` pictures the venue's token (a vault, an LST), not the base asset,
 * so it is never used for an asset mark.
 */
import LOGOS from '../data/logos.json'
export const assetLogo = (sym: string | undefined): string | undefined => (sym ? (LOGOS as Record<string, string>)[sym.toUpperCase()] : undefined)
/** Unit a group's amounts are typed in: dollars for USD, the asset itself elsewhere. */
export const unitOf = (base: string) => (groupOf(base) === 'USD' ? '$' : base)
