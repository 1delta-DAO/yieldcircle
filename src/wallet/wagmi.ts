import { createConfig, fallback, http } from 'wagmi'
import { mainnet, base, arbitrum, bsc, avalanche, optimism, hyperEvm, monad, plasma, polygon, arc, robinhood, stable, plumeMainnet } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'
import { defineChain, type Chain, type Transport } from 'viem'
import { APP_METADATA, HAS_WC, WC_PROJECT_ID } from './wc'

/**
 * Almost every number in this app comes from the allocator API, not the chain.
 * The ONLY RPC consumers are the receipt watchers in `ui/useLadder.ts` and
 * `ui/GetAsset.tsx` — which is exactly the critical path, so a default public
 * endpoint rate-limiting a poll is a ladder that never advances. A per-chain
 * `VITE_RPC_<id>` takes precedence, with the public endpoint behind it.
 */
const custom = (id: number) => (import.meta.env[`VITE_RPC_${id}`] as string | undefined)?.trim() || undefined
const opts = { batch: { wait: 16 }, retryCount: 2 } as const
const rpc = (c: Chain) => {
  const url = custom(c.id)
  return fallback(url ? [http(url, opts), http(undefined, opts)] : [http(undefined, opts)], { rank: false })
}

/**
 * Every chain `CHAINS` in `sdk/queries.ts` offers must be here: `switchChain`
 * throws `ChainNotConfiguredError` for any other id (and cannot hand the
 * wallet the params for `wallet_addEthereumChain`), and a receipt watcher has
 * no client to poll. Tempo is written out by hand: viem's `tempo` carries
 * Tempo's own transaction formatters (for its native account type, not a plain
 * `eth_sendTransaction` through a wallet) and ~340 kB of `ox/tempo` with them.
 */
const tempo = defineChain({
  id: 4217,
  name: 'Tempo',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.tempo.xyz'] } },
  blockExplorers: { default: { name: 'Tempo Explorer', url: 'https://explore.tempo.xyz' } },
})
const chains = [mainnet, base, arbitrum, bsc, avalanche, optimism, hyperEvm, monad, plasma, polygon, arc, robinhood, tempo, stable, plumeMainnet] as const

export const wagmiConfig = createConfig({
  chains,
  connectors: [
    injected(),
    ...(HAS_WC
      ? [walletConnect({
          projectId: WC_PROJECT_ID!,
          // the connect UI is ours (`ConnectSheet.tsx`): on a phone the answer is
          // a deep link into the wallet app, and a QR code is the desktop case
          showQrModal: false,
          metadata: APP_METADATA,
          // With the default `true`, wagmi treats a chain the wallet has not
          // approved as stale and tears the session down on auto-connect. This
          // app offers fifteen chains and most mobile wallets approve one, so the
          // default costs a re-pair — a second deep link — in the middle of a
          // ladder. False keeps the session and surfaces a switch error instead,
          // which the ladder (`ui/useLadder.ts`) and `ui/GetAsset.tsx` show.
          isNewChainsStale: false,
        })]
      : []),
  ],
  transports: Object.fromEntries(chains.map((c) => [c.id, rpc(c)])) as Record<(typeof chains)[number]['id'], Transport>,
  // the receipt watchers poll; 4s is a block on the fastest chain here
  pollingInterval: 4_000,
})
