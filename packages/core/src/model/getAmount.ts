import { fromUnits, portion, type Amount, type Have } from './amount'

/** The least a cross-chain prefill asks for, in dollars: under it a bridge's fixed fees leave no route. */
export const GET_FLOOR_USD = 1
/** No amount: the box is empty and the reader says what to spend. */
export const NO_AMOUNT: Amount = { text: '' }

/**
 * What "Get <asset>" starts with, in the source token: what covers the shortfall (plus 1 % for the
 * route, and 5 cents — a small buy loses more than 1 % to fixed fees), capped at the balance.
 * Nothing when there is no shortfall — an empty ticket, or a wallet that already covers it — and
 * nothing without a price on both sides (no oracle to work backwards from). Across chains a
 * shortfall of cents is raised to {@link GET_FLOOR_USD}: a dollar too much is harmless, dust never routes.
 */
export function prefill(need: number, src: Have & { price: number; decimals: number }, targetPrice: number, cross: boolean): Amount {
  if (!(need > 0) || !(src.price > 0) || !(targetPrice > 0)) return NO_AMOUNT
  const usd = need * targetPrice * 1.01 + 0.05
  const want = (cross ? Math.max(usd, GET_FLOOR_USD) : usd) / src.price
  return want >= src.amount ? portion(src, 100, src.decimals) : fromUnits(+want.toFixed(6))
}
