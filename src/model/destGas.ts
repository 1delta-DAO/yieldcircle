/**
 * Destination gas for a bridge (tickets/0007 C): asked for only when the receiving wallet has too
 * little of the destination's gas coin to act there — a wallet that lands on Base with USDC and no
 * ETH cannot deposit it. Paper and real wallets alike; the fee table is the paper ledger's.
 */
import { gasTokenOf, isSol, nativeOf, networkFeeUsd, starterRef, tokenKey } from './paper'

/** Below this much gas (USD) on the destination, a bridge brings some: two loop opens' worth. */
export const gasFloorUsd = (chainId: string) => 2 * networkFeeUsd(chainId, 'loop')

/**
 * What to ask the bridge to deliver, as the API takes it: a decimal in the destination gas coin's
 * units (`auto` on Solana), or undefined when no gas is needed — the wallet has enough, the token
 * bridged IS the gas coin, or the chain's gas is its dollar (Arc, Stable, Tempo). About five loop
 * opens' worth, never under $1 (a bridge's gas leg has floors of its own).
 */
export function destinationGasFor(toChainId: string, targetToken: string, gasHeldUsd: number): string | undefined {
  const gas = gasTokenOf(toChainId)
  if (gas !== nativeOf(toChainId)) return undefined
  if (tokenKey(toChainId, targetToken) === tokenKey(toChainId, gas)) return undefined
  if (gasHeldUsd >= gasFloorUsd(toChainId)) return undefined
  if (isSol(toChainId)) return 'auto'
  const p = starterRef(toChainId, gas)
  if (!p) return undefined
  const units = Math.max(5 * networkFeeUsd(toChainId, 'loop'), 1) / p
  return Number(units.toPrecision(2)).toString()
}
