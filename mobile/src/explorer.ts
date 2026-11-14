import { wagmiAdapter } from './appkit'

/**
 * A transaction on its chain's explorer: the explorer each wagmi chain carries (`src/appkit.ts`'s
 * list), Solscan on Solana. A paper op or a batch not yet known has nothing to open, and a chain with
 * no explorer gets no link rather than a guessed one (the web's `txUrl`, `ui/ChainMark.tsx`).
 */
export function txUrl(chainId: string | undefined, hash: string | undefined): string | undefined {
  if (!chainId || !hash || hash.startsWith('paper:') || hash.startsWith('batch:')) return undefined
  if (chainId === 'solana') return `https://solscan.io/tx/${hash}`
  const url = wagmiAdapter.wagmiConfig.chains.find((c) => String(c.id) === chainId)?.blockExplorers?.default.url
  return url ? `${url.replace(/\/$/, '')}/tx/${hash}` : undefined
}
