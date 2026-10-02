/**
 * Whose credit a token is — the row a dollar, ether or bitcoin strategy, position or balance
 * belongs to (docs/stablecoin-exposure.md, `DESK` in assets.ts). Pure functions over what each response
 * carries, plus two tables for the responses that carry nothing:
 *
 * - `desks.json` (scripts/desks.mjs, from token-lists): `chain:address` → desk id for every USD
 *   (`tokens`), ETH (`eth`) and BTC (`btc`) token on an offered chain; `~ROOT` for a dollar nobody is named for that wraps another
 *   (sUSDf → `~USDf`), '' for one that wraps nothing. Positions and wallet balances carry an
 *   address and a symbol only.
 * - `SEEN`: the key the catalogue gave each token it classified, so a position in a market the
 *   catalogue lists lands on the same row even when the lists cannot place its token.
 *
 * The desk is the CREDIT desk, in this order: a desk the API resolved (`desk`), the token's own
 * `issuer` — unless that is only the wrapper's instrument (Pendle on a PT) — then its
 * `issuerExposures` (fewest hops: a PT over sUSDe is Ethena's), the token-lists table, the
 * whitelist by symbol. The issuer wins over an exposure on purpose: Strata's srUSDe is exposed to
 * Ethena, but a tranche is Strata's product and sits on Strata's row. Nothing infers a desk from a
 * ticker it does not curate.
 */
import DESKS from '../data/desks.json'
import { normAddr } from './address'
import { baseInfo, baseOfSymbol, deskById, deskOfBase, groupOf, learnDesk, learnUnattributed, type DeskGroup } from './assets'

export interface IssuerLike { id: string; name?: string | null; kind?: string | null; hops?: number }
export interface DeskToken {
  chainId?: string
  address?: string
  symbol?: string
  /** resolved upstream (`asset.desk`, `collateralDesk`): taken as-is */
  desk?: IssuerLike | null
  issuer?: IssuerLike | null
  issuerExposures?: IssuerLike[] | null
  /** the money, upper-case (`USD`, `ETH`), when the API says it */
  denomination?: string | null
  props?: { issuer?: IssuerLike | null; issuerExposures?: IssuerLike[] | null; stablecoin?: { base?: string }; savings?: { base?: string; underlying?: string }; lst?: { asset?: string }; denomination?: string; rwa?: { denomination?: string }; pendle?: unknown; spectra?: unknown; exponent?: unknown; receipt?: unknown }
}

const TABLE: Record<DeskGroup, Record<string, string>> = { USD: DESKS.tokens as Record<string, string>, ETH: DESKS.eth as Record<string, string>, BTC: DESKS.btc as Record<string, string> }
const NAMES = DESKS.desks as unknown as Record<string, [string, string | null]>
const SEEN = new Map<string, string>()
const at = (t: DeskToken) => (t.chainId && t.address ? `${t.chainId}:${normAddr(t.address)}` : '')
const byHops = (a: IssuerLike, b: IssuerLike) => (a.hops ?? 9) - (b.hops ?? 9)
const isWrapper = (p: DeskToken['props']) => !!(p && (p.pendle || p.spectra || p.exponent || p.receipt))
/** Desks that only ever issue the WRAPPER: whose contract, never whose credit. */
const INSTRUMENT = new Set(['pendle', 'spectra', 'exponent'])
/** `PT-sUSDE-27NOV2025` → `sUSDE` */
const ptInner = (sym: string | undefined) => (sym ? /^PT-([A-Za-z0-9.]+)-/.exec(sym)?.[1] : undefined)
const MONIES = new Set<string>(['USD', 'ETH', 'BTC'])

/** The credit desk of a token in a money, or undefined when nothing names one. */
export function creditDesk(t: DeskToken, money: DeskGroup = 'USD'): IssuerLike | undefined {
  // `sym:<TICKER>` is the API saying nobody is named: no desk, the token stands for itself below
  if (t.desk?.id && !INSTRUMENT.has(t.desk.id) && !t.desk.id.startsWith('sym:')) return t.desk
  const p = t.props
  const iss = t.issuer ?? p?.issuer
  if (iss?.id && !isWrapper(p) && !INSTRUMENT.has(iss.id)) return iss
  const ex = (t.issuerExposures ?? p?.issuerExposures)?.filter((e) => !INSTRUMENT.has(e.id))
  if (ex?.length) return [...ex].sort(byHops)[0]
  const listed = TABLE[money][at(t)]
  if (listed && !listed.startsWith('~') && !INSTRUMENT.has(listed)) return { id: listed, name: NAMES[listed]?.[0], kind: NAMES[listed]?.[1] }
  // by symbol: the token's own (wstETH → lido), a PT's inner token, then its whitelisted base
  // (sUSDe → USDe → ethena). The base comes last: WRAPPER folds wstETH into ETH, which is the
  // right money and the wrong credit
  const d = deskOfBase(t.symbol) ?? deskOfBase(ptInner(t.symbol)) ?? deskOfBase(baseOfSymbol(t.symbol))
  return d ? { id: d, name: deskById(d, money)?.name } : undefined
}

/**
 * Which money a token is, among the three read by desk — USD, ETH, BTC — or undefined (BNB,
 * AVAX, the euro, a governance token: the whitelist decides those). The whitelist answers first
 * for what it names (pathUSD is a dollar the app keeps in More on purpose; EURC is not one), then
 * the API, the table and what the catalogue already said, then the token's own props.
 */
export function moneyOf(t: DeskToken): DeskGroup | undefined {
  const b = baseOfSymbol(t.symbol)
  if (b && baseInfo(b)) { const g = groupOf(b); return g === 'MORE' ? undefined : g }
  const den = t.denomination?.toUpperCase()
  if (den && den !== 'USD') return MONIES.has(den) ? (den as DeskGroup) : undefined
  const k = at(t)
  if (k) {
    for (const m of ['USD', 'ETH', 'BTC'] as const) if (k in TABLE[m]) return m
    const seen = SEEN.get(k); if (seen) return groupOf(seen) as DeskGroup
  }
  // the API's `denomination: 'USD'` is read off `props.stablecoin` (see below), so it counts only
  // with a desk named for the token
  if (den === 'USD') return creditDesk(t, 'USD') ? 'USD' : undefined
  const p = t.props
  // `denomination` is sometimes a TICKER (`USDC` on Plume's USDC), so only a money counts. A fund
  // share names the money its NAV is in (`rwa.denomination`: nOPAL is $1.10 of pUSD, not a peg)
  const own = [p?.lst?.asset, p?.denomination, p?.savings?.base, p?.rwa?.denomination].map((x) => x?.toUpperCase()).find((x) => !!x && MONIES.has(x))
  if (own) return own as DeskGroup
  if (p?.lst?.asset || p?.savings?.base) return undefined
  // `stablecoin` alone is not enough: token-lists also stamped it by bare ticker, which made
  // Ethernity's ERN a dollar. desks.json (built with that guard) is the answer for listed tokens;
  // an unlisted one needs a desk named for it as well.
  const m = p?.stablecoin?.base
  return !!m && m.toUpperCase() === 'USD' && !!(p?.issuer || p?.issuerExposures?.length) ? 'USD' : undefined
}
export const isUsd = (t: DeskToken): boolean => moneyOf(t) === 'USD'

/**
 * The row a token of a money belongs to: its desk's key; else, for a token no desk is named for:
 * - a dollar: the dollar it wraps when that is a desk's own protocol coin (sDOLA → Inverse),
 *   otherwise its own ticker (sUSDf → `USDf`, marked unknown) — never an ISSUED dollar it wraps:
 *   an unattributed `sUSDC` is somebody's vault around USDC, not Circle's credit;
 * - ETH / BTC: the whitelisted coin itself (`BTC.b`), otherwise its own ticker, marked unknown.
 */
export function deskKey(t: DeskToken, money: DeskGroup): string {
  const d = creditDesk(t, money)
  if (d) return learnDesk(d, money)
  const seen = SEEN.get(at(t)); if (seen) return seen
  const own = t.symbol ?? '?'
  if (money !== 'USD') return baseInfo(own) ? baseInfo(own)!.sym : learnUnattributed(own, own, money)
  const hint = TABLE.USD[at(t)]
  const root = t.props?.savings?.underlying ?? (hint?.startsWith('~') ? hint.slice(1) : undefined) ?? ptInner(own) ?? own
  const rb = baseOfSymbol(root)
  if (rb && baseInfo(rb)) {
    const rd = deskOfBase(rb)
    if (!rd) return baseInfo(rb)!.sym
    const desk = deskById(rd)
    if (desk && desk.kind !== 'issued') return desk.sym
  }
  return learnUnattributed(rb && baseInfo(rb) ? own : root, own)
}
export const usdKey = (t: DeskToken): string => deskKey(t, 'USD')

/** A token's row key in any group: its desk in USD / ETH / BTC, else its whitelisted base. */
export const keyOfToken = (t: DeskToken): string | undefined => { const m = moneyOf(t); return m ? deskKey(t, m) : baseOfSymbol(t.symbol) }

/** Remember the row the catalogue gave a token, for the responses that carry only its address. */
export function noteToken(chainId: string, address: string | undefined, key: string): void {
  if (address) SEEN.set(`${chainId}:${normAddr(address)}`, key)
}
