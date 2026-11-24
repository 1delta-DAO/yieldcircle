/**
 * Fluid smart collateral (T2): the collateral is a two-token DEX LP, one share count over both
 * legs, and the pair row names it only by `isBasketLong` and ONE leg — the token the loop deposits.
 * The legs come from the build-time snapshot (`scripts/fluid-smart.mjs`); a vault it does not list
 * (a T3/T4, or one newer than the snapshot) is no LP this app offers, and stays `basket`.
 *
 * Offered only where both legs are the same money (LBTC + cbBTC, reUSD + USDT, weETH + ETH): the
 * pool drifts between them, which is then a peg question, the one a carry already asks. A pool of
 * two monies (INST + ETH) is a price bet whichever leg is put in.
 */
import FLUID_SMART from '../data/fluid-smart.json'
import { baseOfSymbol, sameMoney } from './assets'
import { moneyOf, type DeskToken } from './desk'

/** One leg of the LP, in the vault's token0/token1 order. */
export interface LpLeg { address: string; symbol: string; logo?: string }

const VAULTS = FLUID_SMART as Record<string, LpLeg[]>

/** The collateral LP's two legs of a T2 vault, or undefined for any other lender. */
export const fluidLpLegs = (chainId: string, lender: string): LpLeg[] | undefined => VAULTS[`${chainId}:${lender}`]

/** Same money: the desk's (USD, ETH, BTC), else the same base (PAXG + XAUt are both gold). */
function sameMoneyOf(a: DeskToken, b: DeskToken): boolean {
  const ma = moneyOf(a), mb = moneyOf(b)
  if (ma || mb) return ma === mb
  const ba = baseOfSymbol(a.symbol), bb = baseOfSymbol(b.symbol)
  return !!ba && !!bb && sameMoney(ba, bb)
}

/**
 * The legs of a pair row's smart collateral when the app offers it: a T2 in the snapshot, the row's
 * token one of its legs, the other leg the same money. `row` is the row's own collateral token,
 * with the props the API sent — what reads its money best.
 */
export function correlatedLp(chainId: string, lender: string, row: DeskToken & { address: string }): LpLeg[] | undefined {
  const legs = fluidLpLegs(chainId, lender)
  if (!legs) return undefined
  const mine = row.address.toLowerCase()
  const other = legs.find((l) => l.address !== mine)
  if (!other || !legs.some((l) => l.address === mine)) return undefined
  return sameMoneyOf(row, { chainId, address: other.address, symbol: other.symbol }) ? legs : undefined
}

/** `LBTC + cbBTC`: an LP side spelled out, in the vault's order. */
export const lpLabel = (legs: LpLeg[]): string => legs.map((l) => l.symbol).join(' + ')
