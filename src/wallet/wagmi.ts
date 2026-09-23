import { createConfig, fallback, http } from 'wagmi'
import { mainnet, base, arbitrum, bsc, avalanche } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'
import type { Chain } from 'viem'
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

export const wagmiConfig = createConfig({
  chains: [mainnet, base, arbitrum, bsc, avalanche],
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
          // app offers five chains and most mobile wallets approve one, so the
          // default costs a re-pair — a second deep link — in the middle of a
          // ladder. False keeps the session and surfaces a switch error instead,
          // which `wallet/useSend.ts` is the place to handle.
          isNewChainsStale: false,
        })]
      : []),
  ],
  transports: {
    [mainnet.id]: rpc(mainnet),
    [base.id]: rpc(base),
    [arbitrum.id]: rpc(arbitrum),
    [bsc.id]: rpc(bsc),
    [avalanche.id]: rpc(avalanche),
  },
  // the receipt watchers poll; 4s is a block on the fastest chain here
  pollingInterval: 4_000,
})
