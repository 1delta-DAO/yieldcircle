/**
 * Destination gas for a bridge (tickets/0007 C): asked for only when the receiving wallet has too
 * little of the destination's gas coin to act there — a wallet that lands on Base with USDC and no
 * ETH cannot deposit it. Paper and real wallets alike; the fee table is the paper ledger's.
 *
 * SIZED TO THE TRADE. The first cut asked for five loop opens' worth whatever was bridged — $12 of
 * ETH on a $22 bridge to Ethereum (2026-10-22), more than half the trade spent on gas. Now: about
 * one and a half loop opens (Ethereum ~$3.60, an L2 the $0.50 floor), capped at 10 % of what is
 * bridged; below the price of ONE deposit there it is not worth sending at all, and the drawer says
 * so instead of buying gas nobody can use.
 */
import { gasTokenOf, isSol, nativeOf, networkFeeUsd, starterRef, tokenKey } from './paper'

/** Below this much gas (USD) on the destination, a bridge brings some: one loop open's worth. */
export const gasFloorUsd = (chainId: string) => networkFeeUsd(chainId, 'loop')

/** The user's standing choice (Settings in the drawer), kept per device (web: `state/gasPref.ts`). */
export interface GasPref { mode: 'auto' | 'custom' | 'off'; /** custom: USD to bring */ usd?: number }
export const DEFAULT_GAS_PREF: GasPref = { mode: 'auto' }
/** A stored preference, if it is a valid one. */
export const isGasPref = (p: unknown): p is GasPref => {
  const g = p as GasPref | null
  return !!g && (g.mode === 'auto' || g.mode === 'off' || (g.mode === 'custom' && Number(g.usd) > 0))
}

/** Auto never asks a bridge for more than this share of what it bridges. */
export const AUTO_GAS_SHARE = 0.1
/** A bridge's gas leg has fixed costs of its own: never ask for less than this. */
export const MIN_GAS_USD = 0.5

/** What the drawer asks for and why — `amount` is what the API takes (`destinationGas`). */
export interface GasAsk {
  /** decimal in the destination gas coin's units, or `auto` on Solana */
  amount: string
  /** what it is worth on arrival */
  usd: number
  /** the rule that sized it, in words, for the settings card */
  why: string
}
/** Gas is wanted but not asked for: `tooSmall` = the trade is too small to carry useful gas. */
export type GasSkip = { skip: 'tooSmall'; needUsd: number }

/**
 * Whether the destination needs gas at all: the wallet has too little, the token bridged is not
 * the gas coin itself, and the chain's gas is not its dollar (Arc, Stable, Tempo).
 */
export function needsDestinationGas(toChainId: string, targetToken: string, gasHeldUsd: number): boolean {
  const gas = gasTokenOf(toChainId)
  if (gas !== nativeOf(toChainId)) return false
  if (tokenKey(toChainId, targetToken) === tokenKey(toChainId, gas)) return false
  return gasHeldUsd < gasFloorUsd(toChainId)
}

/**
 * What to ask the bridge to deliver for a `tradeUsd` bridge, under `pref` — undefined when no gas
 * is needed or the user turned it off, `GasSkip` when it is needed but the trade cannot carry it.
 */
export function destinationGasFor(toChainId: string, targetToken: string, gasHeldUsd: number, tradeUsd: number, pref: GasPref = DEFAULT_GAS_PREF): GasAsk | GasSkip | undefined {
  if (pref.mode === 'off' || !needsDestinationGas(toChainId, targetToken, gasHeldUsd)) return undefined
  const one = networkFeeUsd(toChainId, 'deposit')
  let usd: number, why: string
  if (pref.mode === 'custom') {
    usd = Math.max(pref.usd ?? 0, MIN_GAS_USD)
    why = `your setting: $${usd.toFixed(2)}`
  } else {
    const want = Math.max(1.5 * networkFeeUsd(toChainId, 'loop'), MIN_GAS_USD)
    const cap = tradeUsd > 0 ? AUTO_GAS_SHARE * tradeUsd : want
    usd = Math.min(want, cap)
    why = usd < want ? `${Math.round(AUTO_GAS_SHARE * 100)} % of what you bridge (a full allowance would be $${want.toFixed(2)})` : 'about two transactions there'
    // not even one deposit's worth, or under the leg's own floor: buying it wastes money
    if (usd < Math.max(one, MIN_GAS_USD)) return { skip: 'tooSmall', needUsd: Math.max(one, MIN_GAS_USD) / AUTO_GAS_SHARE }
  }
  if (isSol(toChainId)) return { amount: 'auto', usd: 0.6, why: 'enough to open token accounts and send a few dozen transactions (0.005 SOL)' }
  const p = starterRef(toChainId, gasTokenOf(toChainId))
  if (!p) return undefined
  const units = Number((usd / p).toPrecision(2))
  return { amount: units.toString(), usd: units * p, why }
}
export const isGasAsk = (g: GasAsk | GasSkip | undefined): g is GasAsk => !!g && 'amount' in g
