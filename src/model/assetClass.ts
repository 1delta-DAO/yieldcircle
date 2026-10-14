/**
 * What KIND of real-world asset a token is — its ASSET CLASS
 * (docs/asset-classes.md). Orthogonal to `exposure` (what money) and
 * `issuer` (whose contract): TSLAx is class `stock`, issuer `backed`,
 * exposure null.
 *
 * Pure, and read VERBATIM off token-lists `props.rwa` (`type` + `subType`)
 * — never guessed from a ticker: Dinari's Tesla is the bare symbol `TSLA`,
 * and a ticker is not an identity. `null` = not a tokenized real-world
 * asset (crypto), or an `rwa` block of `type: 'other'`.
 *
 * VERBATIM COPIES (a test fails on drift): `apps/sol-indexer/src/api/
 * assetClass.ts` here; yield-tracer `app/src/utils/assetClass.ts`;
 * lending-sdks `packages/worker-api/src/data/issuer/assetClass.ts`;
 * yieldcircle `src/model/assetClass.ts`. Change this file first, then copy.
 */

/** The classes. A closed list: an `assetClasses=` outside it (and the aliases) is a 400. */
export const ASSET_CLASSES = [
  'stock',
  'etf',
  'pre-ipo',
  'fund',
  'credit',
  'commodity',
] as const
export type AssetClass = (typeof ASSET_CLASSES)[number]

/**
 * Words a caller may use for a set of classes. `stocks` is every tokenized
 * equity — an ETF over SPY is a stock to the person filtering (token-lists
 * files it `fund/etf`); `rwa` is every class.
 */
export const ASSET_CLASS_ALIASES: Record<string, readonly AssetClass[]> = {
  stocks: ['stock', 'etf', 'pre-ipo'],
  equity: ['stock', 'etf', 'pre-ipo'],
  rwa: ASSET_CLASSES,
}

/** How a filter matches: the leg's own asset, the market's collateral, or either. */
export const ASSET_CLASS_MATCHES = ['any', 'direct', 'exposure'] as const
export type AssetClassMatch = (typeof ASSET_CLASS_MATCHES)[number]

/** The subset of token-lists `props.rwa` this file reads. */
export interface RwaProps {
  type?: string | null
  subType?: string | null
  underlying?: string | null
}

/**
 * token-lists `rwa.type` / `subType` → the class:
 *   equity/stock, equity/leveraged → stock; equity/pre-ipo → pre-ipo;
 *   fund/etf → etf; fund/* (treasury, money-market, private-credit, …) → fund;
 *   credit/* → credit; commodity/* → commodity; anything else → null.
 */
export function assetClassOf(
  rwa: RwaProps | null | undefined,
): AssetClass | null {
  if (!rwa || typeof rwa !== 'object') return null
  const type = typeof rwa.type === 'string' ? rwa.type.toLowerCase() : null
  const sub = typeof rwa.subType === 'string' ? rwa.subType.toLowerCase() : null
  switch (type) {
    case 'equity':
      return sub === 'pre-ipo' ? 'pre-ipo' : 'stock'
    case 'fund':
      return sub === 'etf' ? 'etf' : 'fund'
    case 'credit':
      return 'credit'
    case 'commodity':
      return 'commodity'
    default:
      return null
  }
}

/**
 * The real-world instrument a tokenized equity / ETF tracks (`AAPL`, `SPY`),
 * upper-cased — the key that puts TSLAx, TSLAon, Dinari's TSLA and
 * Robinhood's TSLA in one filter. Only for the equity classes: a fund's
 * `underlying` is prose (`US T-Bill`) and gold's is a money (`XAU`).
 */
export function underlyingTickerOf(
  rwa: RwaProps | null | undefined,
): string | null {
  const c = assetClassOf(rwa)
  if (c !== 'stock' && c !== 'etf' && c !== 'pre-ipo') return null
  const u = typeof rwa?.underlying === 'string' ? rwa.underlying.trim() : ''
  return /^[A-Za-z0-9.\-]{1,12}$/.test(u) ? u.toUpperCase() : null
}

/**
 * `assetClasses=` → the classes it selects; null when absent / empty;
 * `'invalid'` when a value is neither a class nor an alias (the route
 * answers 400 with {@link ASSET_CLASSES} and the alias words).
 */
export function parseAssetClassParam(
  raw: string | undefined | null,
): AssetClass[] | null | 'invalid' {
  if (raw === undefined || raw === null || raw === '') return null
  const out = new Set<AssetClass>()
  for (const v of String(raw)
    .split(',')
    .map((x) => x.trim().toLowerCase())) {
    if (!v) continue
    const alias = ASSET_CLASS_ALIASES[v]
    if (alias) alias.forEach((c) => out.add(c))
    else if ((ASSET_CLASSES as readonly string[]).includes(v))
      out.add(v as AssetClass)
    else return 'invalid'
  }
  return out.size ? [...out] : null
}

/** `assetClassMatch=` → the mode (default `any`, like `issuerMatch`); `'invalid'` otherwise. */
export function parseAssetClassMatch(
  raw: string | undefined | null,
): AssetClassMatch | 'invalid' {
  if (raw === undefined || raw === null || raw === '') return 'any'
  const v = String(raw).trim().toLowerCase()
  return (ASSET_CLASS_MATCHES as readonly string[]).includes(v)
    ? (v as AssetClassMatch)
    : 'invalid'
}

/** `underlyings=TSLA,nvda` → upper-cased tickers; null when absent; `'invalid'` on a malformed one. */
export function parseUnderlyingsParam(
  raw: string | undefined | null,
): string[] | null | 'invalid' {
  if (raw === undefined || raw === null || raw === '') return null
  const out = new Set<string>()
  for (const v of String(raw)
    .split(',')
    .map((x) => x.trim())) {
    if (!v) continue
    if (!/^[A-Za-z0-9.\-]{1,12}$/.test(v)) return 'invalid'
    out.add(v.toUpperCase())
  }
  return out.size ? [...out] : null
}
