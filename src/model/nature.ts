/**
 * What a strategy IS, before what it pays: a saving, or a position that takes market exposure.
 *
 * Every rate on the menu is an APR, and a lending market's 6 % and JLP's 8 % read the same on a
 * list. They are not the same proposition. A saving pays interest (lending, a savings rate,
 * staking, a PT, a same-money carry): what can go wrong is the venue, the issuer or the exit, and
 * the money does not move with a market. The other natures earn by taking a market's side, and
 * the rate is the smaller half of what they can do to the principal:
 *
 * - `perp-lp`: the house against perpetual-futures traders (JLP, GMX's GM pools, Hyperliquid's
 *   HLP). Paid the traders' fees, on the other side of their profits, and — for a basket pool —
 *   holding the pool's coins, so the value moves with SOL, ETH, BTC.
 * - `managed`: a manager trades the money and reports what it is worth (Lagoon, Hyperliquid user
 *   vaults). Even denominated in dollars the share can fall: the rate is a past result, not
 *   interest. The API carries no strategy tag that would tell a Lagoon lending vault from a
 *   Lagoon trading desk, so the whole platform is read as managed — the honest default for a NAV
 *   that someone else reports.
 * - `marked`: the share is priced off a market rather than accrued — the API's
 *   `yieldProfile: 'volatile'` (Yield Basis' leveraged BTC / ETH pools, Saturn's USDat). The rate
 *   is a trailing result, and it can be negative.
 *
 * Pure: read off the venue and the asset, never off the rate.
 */
import { exposureOf } from './assets'

export type Nature = 'savings' | 'perp-lp' | 'managed' | 'marked'
export interface NatureMeta {
  /** the pill's word */
  word: string
  /** one sentence: what the money is exposed to */
  why: string
}
export const NATURES: Record<Nature, NatureMeta> = {
  savings: { word: 'savings', why: 'Interest, staking or a savings rate on the money you put in. Its value does not move with a market; what can go wrong is the venue, the issuer or the exit.' },
  'perp-lp': { word: 'perp LP', why: 'You are the house for perpetual-futures traders: paid their fees, on the other side of their profits, and holding the pool’s coins. The value moves with those coins and with the traders’ PnL — the rate is fees, and the price can fall by more.' },
  managed: { word: 'managed', why: 'A manager trades the money and reports what the share is worth. Even in dollars it can fall: the rate is a past result, not interest.' },
  marked: { word: 'marked to market', why: 'The share is priced off a market, not accrued like interest. The rate is what it returned over a past window, it can turn negative, and the value can end below what you put in.' },
}
export const isSavings = (n: Nature) => n === 'savings'

/** A deposit's nature, from the venue it sits in, the asset it holds and the API's `risk.yieldProfile`. */
export function natureOfDeposit(venue: string, asset: string, name?: string | null, yieldProfile?: string): Nature {
  const ex = exposureOf(asset)
  if (ex) return ex.nature
  if (venue === 'vault.gmx') return 'perp-lp'
  if (venue === 'vault.hypercore') return /\bHLP\b|Hyperliquidity Provider/i.test(name ?? '') ? 'perp-lp' : 'managed'
  if (venue === 'vault.lagoon') return 'managed'
  if (yieldProfile === 'volatile') return 'marked'
  return 'savings'
}
