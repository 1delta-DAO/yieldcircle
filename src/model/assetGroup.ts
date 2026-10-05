/**
 * The index's asset GROUP key (yield-tracer's cross-chain price key: `USDC`,
 * `ETH`, `Jito Staked SOL::JitoSOL`) — what an asset page (`#/t/<group>`) is
 * keyed by. Not the app's own `GroupId` (`USD`, `ETH`, …), which is a shelf
 * of the Earn menu.
 *
 * yield-tracer files a token it cannot match to another chain under a
 * chain-local key: `<name>::<symbol>::solana`, or `solana-<mint>` when it has
 * no name either. Only the Solana index can know those.
 */

/** a key no EVM chain can hold: asked of the Solana index alone */
export const isSolGroup = (g: string) => g.endsWith('::solana') || g.startsWith('solana-')

/**
 * Chain-local keys that are the same money as a cross-chain group. Wrapped SOL
 * is SOL as WETH is ETH — which yield-tracer already unifies on EVM (Base's
 * WETH arrives as `ETH`) but not on Solana. Drop an entry once upstream files
 * the token under the cross-chain key.
 */
const SAME_AS: Record<string, string> = {
  'Wrapped SOL::SOL::solana': 'SOL',
}

/** the key an asset page should be opened with */
export const canonGroup = (g: string): string => SAME_AS[g] ?? g
/** every key that means `g`: the canonical one and its chain-local spellings */
export const spellingsOf = (g: string): string[] => [g, ...Object.keys(SAME_AS).filter((k) => SAME_AS[k] === g)]
