/**
 * The three layers of the simple app:
 *   group    USD · ETH · BTC · More            (collateral exposure)
 *   asset    BNB, AVAX, … (what you own — a WHITELIST, so wrappers never appear as assets);
 *            in the US Dollar, Ether and Bitcoin groups a DESK instead — Circle, Ethena, Maple,
 *            Lido, ether.fi, BitGo, Lombard … — whose credit the money sits behind, not which
 *            ticker it wears (see DESK below)
 *   strategy everything on top of an asset (a plain deposit or a loop)
 */
export type GroupId = 'USD' | 'ETH' | 'BTC' | 'MORE'
export interface Group { id: GroupId; name: string; desc: string; color: string; unit: string }
export const GROUPS: Group[] = [
  { id: 'USD', name: 'US Dollar', desc: 'Dollars, by whose credit they are', color: '#3fbf7f', unit: '$' },
  { id: 'ETH', name: 'Ether', desc: 'ETH and staked ETH', color: '#8fa6ff', unit: 'ETH' },
  { id: 'BTC', name: 'Bitcoin', desc: 'BTC wrappers', color: '#f0a830', unit: 'BTC' },
  { id: 'MORE', name: 'More', desc: 'BNB, AVAX, euro, gold, other', color: '#c084fc', unit: '' },
]
export const group = (id: GroupId) => GROUPS.find((g) => g.id === id)!

/** Base assets we present, keyed by upper-cased symbol → { canonical symbol, group, what, colour }. */
const BASE: Record<string, { sym: string; group: GroupId; what: string; color: string; desk?: string }> = {
  USDC: { sym: 'USDC', group: 'USD', what: 'Circle stablecoin', color: '#2775ca', desk: 'circle' },
  // USDT0 — the LayerZero omnichain deployment, and the gas coin of Stable — is deliberately
  // NOT a base asset: it IS USDT (one lock-box of USDT on Ethereum backs every USDT0), and
  // token-lists already unifies the group (assetGroupUnifier `USDT0 → USDT`). It folds in
  // through WRAPPER below, so a wallet's USDT0 and its USDT are one row of the USD group,
  // exactly as USDT.e is. Same for Tether Gold's XAUt0.
  USDT: { sym: 'USDT', group: 'USD', what: 'Tether stablecoin · USDT0 on newer chains', color: '#26a17b', desk: 'tether' },
  USDS: { sym: 'USDS', group: 'USD', what: 'Sky (Maker) stablecoin', color: '#f5ac37', desk: 'sky' },
  DAI: { sym: 'DAI', group: 'USD', what: 'Maker stablecoin', color: '#f5ac37', desk: 'sky' },
  USDE: { sym: 'USDe', group: 'USD', what: 'Ethena synthetic dollar · hedged ETH/BTC basis', color: '#bdbdbd', desk: 'ethena' },
  USDG: { sym: 'USDG', group: 'USD', what: 'Paxos / Global Dollar Network stablecoin', color: '#4fb3d9', desk: 'paxos' },
  GHO: { sym: 'GHO', group: 'USD', what: 'Aave stablecoin', color: '#b6509e', desk: 'aave' },
  PYUSD: { sym: 'PYUSD', group: 'USD', what: 'PayPal stablecoin', color: '#0070ba', desk: 'paypal' },
  RLUSD: { sym: 'RLUSD', group: 'USD', what: 'Ripple stablecoin', color: '#0a8fd0', desk: 'ripple' },
  AUSD: { sym: 'AUSD', group: 'USD', what: 'Agora stablecoin', color: '#c9a86b', desk: 'agora' },
  FRXUSD: { sym: 'frxUSD', group: 'USD', what: 'Frax stablecoin', color: '#111', desk: 'frax' },
  CRVUSD: { sym: 'crvUSD', group: 'USD', what: 'Curve stablecoin', color: '#ffd400', desk: 'curve' },
  DOLA: { sym: 'DOLA', group: 'USD', what: 'Inverse Finance stablecoin', color: '#7c5cff', desk: 'inverse' },
  USD1: { sym: 'USD1', group: 'USD', what: 'World Liberty stablecoin', color: '#d4b04a', desk: 'world-liberty' },
  FRAX: { sym: 'FRAX', group: 'USD', what: 'Frax stablecoin', color: '#111', desk: 'frax' },
  USDTB: { sym: 'USDtb', group: 'USD', what: 'Ethena / BlackRock BUIDL-backed dollar', color: '#7d7d7d', desk: 'ethena' },
  AVUSD: { sym: 'avUSD', group: 'USD', what: 'Avant synthetic dollar', color: '#5b8def', desk: 'avant' },
  // Plume's dollar, and the money every Nest RWA market there lends and borrows in. Without it
  // Plume answered 12 of its 17 earn rows and both of its RWA loops, and every one was `unmapped`.
  PUSD: { sym: 'pUSD', group: 'USD', what: 'Plume USD · USDC-backed stablecoin', color: '#e8ff5a', desk: 'nest' },
  ETH: { sym: 'ETH', group: 'ETH', what: 'Ether', color: '#8fa6ff', desk: 'plain:ETH' },
  WETH: { sym: 'ETH', group: 'ETH', what: 'Ether', color: '#8fa6ff', desk: 'plain:ETH' },
  WBTC: { sym: 'WBTC', group: 'BTC', what: 'Wrapped bitcoin (BitGo)', color: '#f09242', desk: 'bitgo' },
  CBBTC: { sym: 'cbBTC', group: 'BTC', what: 'Coinbase wrapped bitcoin', color: '#1652f0', desk: 'coinbase' },
  TBTC: { sym: 'tBTC', group: 'BTC', what: 'Threshold bitcoin', color: '#7d7d7d', desk: 'threshold' },
  LBTC: { sym: 'LBTC', group: 'BTC', what: 'Lombard staked bitcoin', color: '#62d0a5', desk: 'lombard' },
  // the key is the UPPER-CASED symbol, so the dot survives: 'BTC.b' → 'BTC.B'
  'BTC.B': { sym: 'BTC.b', group: 'BTC', what: 'Avalanche bridged bitcoin (Core)', color: '#f09242' },
  BNB: { sym: 'BNB', group: 'MORE', what: 'BNB Chain native coin', color: '#f0b90b' },
  WBNB: { sym: 'BNB', group: 'MORE', what: 'BNB Chain native coin', color: '#f0b90b' },
  AVAX: { sym: 'AVAX', group: 'MORE', what: 'Avalanche native coin', color: '#e84142' },
  WAVAX: { sym: 'AVAX', group: 'MORE', what: 'Avalanche native coin', color: '#e84142' },
  // The gas coins of the other chains the app offers. They are here for the same reason BNB and
  // AVAX are: a wallet's gas balance is money it holds, and without an entry it draws a hashed
  // colour and describes itself with its own ticker. `nativeSymbol` in positions.ts says which
  // chain each one belongs to. Arc's and Stable's gas coins are USDC and USDT0, which resolve
  // above (USDT0 through WRAPPER) — a dollar does not become another asset by being the thing
  // you pay fees with.
  HYPE: { sym: 'HYPE', group: 'MORE', what: 'Hyperliquid native coin', color: '#1a9e8f' },
  MON: { sym: 'MON', group: 'MORE', what: 'Monad native coin', color: '#836ef9' },
  POL: { sym: 'POL', group: 'MORE', what: 'Polygon native coin (formerly MATIC)', color: '#8247e5' },
  XPL: { sym: 'XPL', group: 'MORE', what: 'Plasma native coin', color: '#64748b' },
  PLUME: { sym: 'PLUME', group: 'MORE', what: 'Plume native coin', color: '#64748b' },
  // Tempo's gas coin. It is dollar-priced but it sits in `MORE`, not `USD`: the USD group is what
  // `sameMoney` reads to call a loop carry rather than a price bet, and that claim needs more than
  // a ticker ending in USD. Arc's USDC and Stable's USDT0 are in `USD` because they are USDC and USDT.
  PATHUSD: { sym: 'pathUSD', group: 'MORE', what: 'Tempo native coin · dollar-priced', color: '#64748b' },
  EURC: { sym: 'EURC', group: 'MORE', what: 'Circle euro stablecoin', color: '#2775ca' },
  EURCV: { sym: 'EURCV', group: 'MORE', what: 'Société Générale euro stablecoin', color: '#e9041e' },
  XAUT: { sym: 'XAUt', group: 'MORE', what: 'Tether gold', color: '#d4af37' },
  PAXG: { sym: 'PAXG', group: 'MORE', what: 'Paxos gold', color: '#d4af37' },
}
/** Known wrappers → their base, for places that only have a symbol (positions, balances). */
const WRAPPER: Record<string, string> = {
  SUSDE: 'USDe', SUSDS: 'USDS', SDAI: 'DAI', SDOLA: 'DOLA', SFRXUSD: 'frxUSD', SGHO: 'GHO', SFRAX: 'FRAX',
  // NOT here: syrupUSDC / syrupUSDT (Maple's credit, lent out to Maple's borrowers) and sUSDC
  // (Sky's savings vault). A wrapper belongs in this map only when it IS its base's credit; these
  // were filed under Circle and Tether, which is the misreading DESK below exists to stop.
  SLISBNB: 'BNB', WBETH: 'ETH', BNBX: 'BNB', ANKRBNB: 'BNB',
  SAVAX: 'AVAX', GGAVAX: 'AVAX', SAVUSD: 'avUSD',
  WHYPE: 'HYPE', WMON: 'MON', WXPL: 'XPL', WPLUME: 'PLUME', WPOL: 'POL', WMATIC: 'POL', MATIC: 'POL',
  // Monad / HyperEVM liquid staking. Upstream carried no `props.lst` for any of them until
  // token-lists' LST_MANUAL named them (2026-09-24), and a position only has a symbol: without
  // these, shMON resolved to MON only by falling back to the DEBT leg's symbol.
  SHMON: 'MON', SMON: 'MON', GMON: 'MON', APRMON: 'MON',
  KHYPE: 'HYPE', STHYPE: 'HYPE', WSTHYPE: 'HYPE', BEHYPE: 'HYPE', LSTHYPE: 'HYPE', SHYPE: 'HYPE', HYPED: 'HYPE', VHYPE: 'HYPE',
  // Tether's omnichain (LayerZero OFT) deployments: the same money under a 0-suffixed ticker
  // (see the USDT note in BASE). Balances keep their own symbol and address — only the ASSET merges.
  USDT0: 'USDT', XAUT0: 'XAUt',
  // Avalanche's bridged ERC-20s keep a '.e' suffix; the same money either way
  'USDC.E': 'USDC', 'USDT.E': 'USDT', 'DAI.E': 'DAI', 'WETH.E': 'ETH', 'WBTC.E': 'WBTC',
  WSTETH: 'ETH', STETH: 'ETH', WEETH: 'ETH', EETH: 'ETH', CBETH: 'ETH', RETH: 'ETH', EZETH: 'ETH', RSETH: 'ETH', OSETH: 'ETH', METH: 'ETH', FRXETH: 'ETH', SFRXETH: 'ETH', ETHX: 'ETH', SWETH: 'ETH',
}

/**
 * The rows of the US Dollar group: DESKS, keyed by token-lists' issuer id (`props.issuer`,
 * `props.issuerExposures` — whose solvency, administration and redemption you hold).
 *
 * A dollar strategy's exposure is its COLLATERAL's desk, never its debt's: a stablecoin does not
 * depeg upward, and the lenders price stable debt at or under $1, so a loop that borrows USDC
 * against sUSDe loses money when Ethena fails and gains when Circle does. Filing it under USDC —
 * which is what grouping by ticker did, through the debt — made the USDC row 60 strategies of
 * other people's credit (docs/stablecoin-exposure.md).
 *
 * `sym` is the row's KEY (and its icon): the desk's flagship ticker, unique across desks. It is
 * what `Strategy.asset` / `Holding.asset` carry for a dollar, so the routes (`?u=USDe`), the
 * icons and `groupOf` keep working; `nameOf` turns it into the desk's name for the eye.
 * `issued` desks are institutions' fiat-backed dollars (a plain deposit there is lending that
 * dollar out); `yield` desks are protocols. A desk missing here still gets a row — named by the
 * API, keyed by its id (`learnDesk`).
 */
export type DeskGroup = 'USD' | 'ETH' | 'BTC'
/** `plain`: the coin itself, nobody's liability (ETH, WETH) · `issued`: an institution's or exchange's · `yield`: a protocol's */
export type DeskKind = 'plain' | 'issued' | 'yield' | 'unknown'
export interface Desk { id: string; group: DeskGroup; sym: string; name: string; what: string; color: string; kind: DeskKind }
type Entry = Omit<Desk, 'id' | 'group'>
/**
 * Per money, because one desk issues several (Coinbase's cbETH and cbBTC, Frax's frxUSD and
 * sfrxETH are different rows of different groups). ETH and BTC follow the same rule as the dollar
 * (docs/stablecoin-exposure.md, phase 5): wstETH is Lido's, weETH ether.fi's, LBTC Lombard's —
 * and a wstETH/WETH loop sits on Lido's row, not on Ether's. Plain ETH/WETH have no issuer and
 * are the Ether row; every BTC wrapper is somebody's.
 */
const DESK: Record<DeskGroup, Record<string, Entry>> = {
  USD: {
    circle: { sym: 'USDC', name: 'Circle', what: 'USDC · fiat-backed, cash and T-bills', color: '#2775ca', kind: 'issued' },
    tether: { sym: 'USDT', name: 'Tether', what: 'USDT · USDT0 on newer chains', color: '#26a17b', kind: 'issued' },
    paxos: { sym: 'USDG', name: 'Paxos', what: 'USDG (Global Dollar Network), USDP', color: '#4fb3d9', kind: 'issued' },
    paypal: { sym: 'PYUSD', name: 'PayPal', what: 'PYUSD · issued by Paxos for PayPal', color: '#0070ba', kind: 'issued' },
    ripple: { sym: 'RLUSD', name: 'Ripple', what: 'RLUSD · fiat-backed', color: '#0a8fd0', kind: 'issued' },
    agora: { sym: 'AUSD', name: 'Agora', what: 'AUSD · fiat-backed', color: '#c9a86b', kind: 'issued' },
    'world-liberty': { sym: 'USD1', name: 'World Liberty', what: 'USD1 · fiat-backed', color: '#d4b04a', kind: 'issued' },
    'first-digital': { sym: 'FDUSD', name: 'First Digital', what: 'FDUSD · fiat-backed', color: '#2d6bff', kind: 'issued' },
    sky: { sym: 'USDS', name: 'Sky', what: 'USDS and DAI (Maker), and their savings rate', color: '#f5ac37', kind: 'yield' },
    ethena: { sym: 'USDe', name: 'Ethena', what: 'USDe, sUSDe · hedged ETH/BTC basis; USDtb', color: '#bdbdbd', kind: 'yield' },
    frax: { sym: 'frxUSD', name: 'Frax', what: 'frxUSD, sfrxUSD, FRAX', color: '#111', kind: 'yield' },
    curve: { sym: 'crvUSD', name: 'Curve', what: 'crvUSD · CDP stablecoin, scrvUSD', color: '#ffd400', kind: 'yield' },
    inverse: { sym: 'DOLA', name: 'Inverse Finance', what: 'DOLA, sDOLA · CDP stablecoin', color: '#7c5cff', kind: 'yield' },
    aave: { sym: 'GHO', name: 'Aave', what: 'GHO · Aave’s stablecoin', color: '#b6509e', kind: 'yield' },
    avant: { sym: 'avUSD', name: 'Avant', what: 'avUSD, savUSD · synthetic dollar', color: '#5b8def', kind: 'yield' },
    maple: { sym: 'syrupUSDC', name: 'Maple', what: 'syrupUSDC, syrupUSDT · loans to institutional borrowers', color: '#ff6a3d', kind: 'yield' },
    '3jane': { sym: 'USD3', name: '3Jane', what: 'USD3, sUSD3 · unsecured credit lines', color: '#9b87f5', kind: 'yield' },
    re: { sym: 'reUSD', name: 'Re', what: 'reUSD, reUSDe · reinsurance-backed', color: '#3fa7a0', kind: 'yield' },
    resupply: { sym: 'sreUSD', name: 'Resupply', what: 'reUSD, sreUSD · CDP over Curve and Fraxlend', color: '#7aa2f7', kind: 'yield' },
    reservoir: { sym: 'rUSD', name: 'Reservoir', what: 'rUSD, srUSD', color: '#4c6ef5', kind: 'yield' },
    resolv: { sym: 'USR', name: 'Resolv', what: 'USR, stUSR · delta-neutral dollar', color: '#e8590c', kind: 'yield' },
    infinifi: { sym: 'iUSD', name: 'infiniFi', what: 'iUSD, siUSD · fractional-reserve savings', color: '#22b8cf', kind: 'yield' },
    falcon: { sym: 'USDf', name: 'Falcon', what: 'USDf, sUSDf · synthetic dollar', color: '#f08c00', kind: 'yield' },
    strata: { sym: 'srUSDe', name: 'Strata', what: 'srUSDe, jrUSDe · tranched Ethena yield', color: '#845ef7', kind: 'yield' },
    usdai: { sym: 'USDai', name: 'USDai', what: 'USDai, sUSDai · GPU-backed loans', color: '#2f9e44', kind: 'yield' },
    cap: { sym: 'cUSD', name: 'Cap', what: 'cUSD, stcUSD', color: '#1c7ed6', kind: 'yield' },
    'fx-protocol': { sym: 'fxUSD', name: 'f(x) Protocol', what: 'fxUSD, fxSAVE', color: '#495057', kind: 'yield' },
    usual: { sym: 'USD0', name: 'Usual', what: 'USD0, USD0++', color: '#868e96', kind: 'yield' },
    elixir: { sym: 'deUSD', name: 'Elixir', what: 'deUSD, sdeUSD', color: '#343a40', kind: 'yield' },
    nest: { sym: 'pUSD', name: 'Nest', what: 'pUSD · Plume’s dollar, USDC-backed', color: '#e8ff5a', kind: 'issued' },
    liquity: { sym: 'BOLD', name: 'Liquity', what: 'BOLD · immutable CDP stablecoin', color: '#405aff', kind: 'yield' },
  },
  ETH: {
    'plain:ETH': { sym: 'ETH', name: 'Ether', what: 'ETH and WETH · nobody’s liability', color: '#8fa6ff', kind: 'plain' },
    lido: { sym: 'wstETH', name: 'Lido', what: 'stETH, wstETH · staked ether', color: '#00a3ff', kind: 'yield' },
    etherfi: { sym: 'weETH', name: 'ether.fi', what: 'eETH, weETH · restaked ether', color: '#6e56cf', kind: 'yield' },
    rocketpool: { sym: 'rETH', name: 'Rocket Pool', what: 'rETH · decentralised staking', color: '#ff6e30', kind: 'yield' },
    coinbase: { sym: 'cbETH', name: 'Coinbase', what: 'cbETH · staked with Coinbase', color: '#1652f0', kind: 'issued' },
    binance: { sym: 'wBETH', name: 'Binance', what: 'wBETH · staked with Binance', color: '#f0b90b', kind: 'issued' },
    renzo: { sym: 'ezETH', name: 'Renzo', what: 'ezETH · restaked ether', color: '#a3e635', kind: 'yield' },
    kelp: { sym: 'rsETH', name: 'Kelp', what: 'rsETH · restaked ether', color: '#14b8a6', kind: 'yield' },
    stakewise: { sym: 'osETH', name: 'StakeWise', what: 'osETH · staked ether', color: '#3b82f6', kind: 'yield' },
    mantle: { sym: 'mETH', name: 'Mantle', what: 'mETH, cmETH · staked ether', color: '#0f172a', kind: 'yield' },
    frax: { sym: 'sfrxETH', name: 'Frax', what: 'frxETH, sfrxETH · staked ether', color: '#111', kind: 'yield' },
    stader: { sym: 'ETHx', name: 'Stader', what: 'ETHx · staked ether', color: '#07c160', kind: 'yield' },
    swell: { sym: 'rswETH', name: 'Swell', what: 'swETH, rswETH · (re)staked ether', color: '#2563eb', kind: 'yield' },
    puffer: { sym: 'pufETH', name: 'Puffer', what: 'pufETH · restaked ether', color: '#0ea5e9', kind: 'yield' },
  },
  BTC: {
    bitgo: { sym: 'WBTC', name: 'BitGo', what: 'WBTC · custodied by BitGo', color: '#f09242', kind: 'issued' },
    coinbase: { sym: 'cbBTC', name: 'Coinbase', what: 'cbBTC · custodied by Coinbase', color: '#1652f0', kind: 'issued' },
    binance: { sym: 'BTCB', name: 'Binance', what: 'BTCB · custodied by Binance', color: '#f0b90b', kind: 'issued' },
    threshold: { sym: 'tBTC', name: 'Threshold', what: 'tBTC · threshold-signed bridge', color: '#7d7d7d', kind: 'yield' },
    lombard: { sym: 'LBTC', name: 'Lombard', what: 'LBTC · staked bitcoin (Babylon)', color: '#62d0a5', kind: 'yield' },
    solv: { sym: 'SolvBTC', name: 'Solv', what: 'SolvBTC, xSolvBTC', color: '#a78bfa', kind: 'yield' },
    bedrock: { sym: 'uniBTC', name: 'Bedrock', what: 'uniBTC', color: '#f97316', kind: 'yield' },
    pumpbtc: { sym: 'pumpBTC', name: 'PumpBTC', what: 'pumpBTC', color: '#22c55e', kind: 'yield' },
    etherfi: { sym: 'eBTC', name: 'ether.fi', what: 'eBTC · restaked bitcoin', color: '#6e56cf', kind: 'yield' },
  },
}
const GROUPS_WITH_DESKS: DeskGroup[] = ['USD', 'ETH', 'BTC']
/** Desks named at runtime: unregistered desks the API names, and tokens nobody is named for. Keyed by row key. */
const LEARNED = new Map<string, Desk>()
const DESK_BY_SYM = new Map(GROUPS_WITH_DESKS.flatMap((group) => Object.entries(DESK[group]).map(([id, d]) => [d.sym.toUpperCase(), { id, group, ...d }] as const)))
const deskByKey = (key: string | undefined): Desk | undefined => (key ? DESK_BY_SYM.get(key.toUpperCase()) ?? LEARNED.get(key) : undefined)
export const deskById = (id: string, group: DeskGroup = 'USD'): Desk | undefined => (DESK[group][id] ? { id, group, ...DESK[group][id] } : [...LEARNED.values()].find((d) => d.id === id && d.group === group))
const kindOf = (k: string | null | undefined): DeskKind => (k === 'institution' || k === 'cex' ? 'issued' : k === 'unknown' || k === 'unattributed' ? 'unknown' : k === 'plain' ? 'plain' : 'yield')
const MONEY_WORD: Record<DeskGroup, string> = { USD: 'Dollar', ETH: 'Ether', BTC: 'Bitcoin' }
/** The row key of a desk in a money: its flagship ticker when registered, else learned from the API's name. */
export function learnDesk(d: { id: string; name?: string | null; kind?: string | null }, group: DeskGroup = 'USD'): string {
  const reg = DESK[group][d.id]; if (reg) return reg.sym
  const key = group === 'USD' ? d.id.toUpperCase() : `${d.id.toUpperCase()}:${group}`
  if (!LEARNED.has(key)) LEARNED.set(key, { id: d.id, group, sym: key, name: d.name || d.id, what: `${MONEY_WORD[group]} · ${d.name || d.id}`, color: '', kind: kindOf(d.kind) })
  return key
}
/**
 * A token no desk is named for stands for ITSELF — under its own ticker, marked unknown — and
 * never for the money it is lent against. It must not borrow a desk's key by sharing a ticker
 * (`USD3` is 3Jane's AND Reserve's), so a clash takes the token's own symbol, then a mark.
 */
export function learnUnattributed(root: string, own: string, group: DeskGroup = 'USD'): string {
  const taken = (k: string) => DESK_BY_SYM.has(k.toUpperCase()) || !!BASE[k.toUpperCase()] || (LEARNED.has(k) && (LEARNED.get(k)!.kind !== 'unknown' || LEARNED.get(k)!.group !== group))
  const pick = !taken(root) ? root : !taken(own) ? own : `${own}?`
  // one row per ticker, whichever way a list spells it (`USDat` and `USDAT`)
  const key = [...LEARNED.keys()].find((k) => k.toUpperCase() === pick.toUpperCase() && LEARNED.get(k)!.kind === 'unknown' && LEARNED.get(k)!.group === group) ?? pick
  if (!LEARNED.has(key)) LEARNED.set(key, { id: `sym:${key}`, group, sym: key, name: key.replace(/\?$/, ''), what: `${MONEY_WORD[group]} · issuer not named in the token lists`, color: '', kind: 'unknown' })
  return key
}
/**
 * The desk a symbol belongs to when that is all there is (a position, a balance): a whitelisted
 * base's (`DAI` → sky, `WETH` → plain ether), else a known LST's. The LSTs are listed here and not
 * read through WRAPPER, which folds wstETH into ETH — the right answer for the money, the wrong
 * one for the credit.
 */
const SYMBOL_DESK: Record<string, string> = {
  WSTETH: 'lido', STETH: 'lido', WEETH: 'etherfi', EETH: 'etherfi', CBETH: 'coinbase', WBETH: 'binance', RETH: 'rocketpool', EZETH: 'renzo', RSETH: 'kelp',
  OSETH: 'stakewise', METH: 'mantle', CMETH: 'mantle', FRXETH: 'frax', SFRXETH: 'frax', ETHX: 'stader', SWETH: 'swell', RSWETH: 'swell', PUFETH: 'puffer',
  'WETH.E': 'plain:ETH', 'WBTC.E': 'bitgo',
}
export const deskOfBase = (sym: string | undefined): string | undefined => (sym ? SYMBOL_DESK[sym.toUpperCase()] ?? BASE[sym.toUpperCase()]?.desk : undefined)
/** What to call a row: the desk's name for a desk, the asset itself elsewhere. */
export const nameOf = (key: string): string => deskByKey(key)?.name ?? key
export const deskOf = (key: string): Desk | undefined => deskByKey(key)
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
export function baseOfCollateral(a: { symbol: string; name?: string; assetGroup?: string; props?: { lst?: { asset?: string }; savings?: { base?: string; underlying?: string }; stablecoin?: { base?: string }; pendle?: unknown; spectra?: unknown } }, debtSymbol: string): string | undefined {
  const p = a.props ?? {}
  const cands: (string | undefined)[] = [p.savings?.underlying, p.lst?.asset]
  if (p.pendle || p.spectra) { const m = /\(([A-Za-z0-9]+)\)/.exec(a.assetGroup ?? a.name ?? ''); cands.push(m?.[1]) }
  cands.push(a.symbol)
  for (const c of cands) { const b = baseOfSymbol(c); if (b) return b }
  const debtBase = baseOfSymbol(debtSymbol)
  // No whitelisted base. Which money the collateral is decides the fallback:
  // - an LST of an unwhitelisted coin: it is the debt's money only when its
  //   `lst.asset` is that same money — a BTC LST against WBTC/cbBTC, never
  //   against WETH (that is a price bet, not a carry).
  if (p.lst && !p.savings && !p.stablecoin) {
    const lstDenom = denomOf(p.lst.asset ?? a.symbol)
    return debtBase && lstDenom === denomOf(debtBase) ? debtBase : a.symbol
  }
  // - a savings/stablecoin token is its OWN money (`*.base`, e.g. `USD`): it
  //   inherits the debt only when the debt is that same money; otherwise the
  //   token is returned as-is so the cross-denom gate rejects it — a srUSD/WETH
  //   bet must not read as an ETH carry.
  if (p.savings || p.stablecoin) {
    const own = (p.savings?.base ?? p.stablecoin?.base ?? '').toLowerCase()
    return own && debtBase && own === denomOf(debtBase) ? debtBase : a.symbol
  }
  // - anything else (a governance token, an LP) is a foreign money, never the debt.
  return a.symbol
}
export const groupOf = (base: string): GroupId => baseInfo(base)?.group ?? deskByKey(base)?.group ?? 'MORE'

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
  // raw chain coins, for an LST's `lst.asset` (`LBTC → BTC`) that has no
  // wrapper of its own in the whitelist
  BTC: 'btc', SOL: 'sol',
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
export const whatIs = (base: string): string => deskByKey(base)?.what ?? baseInfo(base)?.what ?? base
export function colorOf(sym: string): string {
  const d = deskByKey(sym); if (d?.color) return d.color
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
/** Unit a group's amounts are typed in: dollars for USD, the asset itself elsewhere (the group's coin for a desk known only by id, `SWELL:ETH`). */
export const unitOf = (base: string) => (groupOf(base) === 'USD' ? '$' : base.includes(':') ? groupOf(base) : base)
