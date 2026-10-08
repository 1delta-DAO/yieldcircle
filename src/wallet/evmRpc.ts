import { createTransport, http, shouldThrow, type Chain, type EIP1193RequestFn, type Transport } from 'viem'

/**
 * The EVM side of what `wallet/solRpc.ts` is for Solana: the transport behind every wagmi
 * client. Almost every number in this app comes from the allocator API, not the chain; the ONLY
 * RPC reads are the receipt watcher in `sdk/txTrace.ts` (receipt, block number, the replacement
 * check) — the critical path after a send, where one rate-limited free endpoint was a ladder
 * that stalled or ended `failed` on a transaction that had landed.
 *
 * Reads ROTATE over public endpoints that serve browsers (CORS, no key, JSON-RPC batches): each
 * request goes to the next one in line, and one that fails (429, 5xx, timeout, a JSON-RPC
 * error) sits out a cooldown while the rest carry on. A per-chain `VITE_RPC_<id>` (a keyed node)
 * is asked first while it answers. Wallet calls (send, estimate) never come here: wagmi sends
 * those through the connector's own provider.
 *
 * Checked 2026-10-08 with an `Origin` header (preflight, then a batch of `eth_chainId`,
 * `eth_blockNumber` and the receipt of an unknown hash, which must answer `null`):
 *   - left out: publicnode on Base, Arbitrum, Optimism and BNB (an unknown hash is an "archive
 *     request" that wants a token — every pending poll would error), llamarpc and 1rpc (down or
 *     timing out), ankr and polygon-rpc.com (key required now), eth.merkle.io (429 at once),
 *     nodies (no CORS preflight), drpc on Plasma, Stable and Plume (not on the free plan).
 *   - Plasma, Stable, Plume and Tempo have one or two endpoints that answer; Tempo's is not in
 *     viem's chain object, which `wallet/wagmi.ts` writes out by hand.
 */
const PUBLIC: Record<number, string[]> = {
  1: ['https://ethereum.reth.rs/rpc', 'https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org', 'https://eth.blockrazor.xyz', 'https://gateway.tenderly.co/public/mainnet', 'https://eth.meowrpc.com'],
  8453: ['https://mainnet.base.org', 'https://developer-access-mainnet.base.org', 'https://base.drpc.org', 'https://base.meowrpc.com', 'https://base.gateway.tenderly.co'],
  42161: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum.drpc.org', 'https://arbitrum.meowrpc.com', 'https://arbitrum.gateway.tenderly.co'],
  56: ['https://bsc-dataseed.bnbchain.org', 'https://bsc-dataseed2.bnbchain.org', 'https://bsc-dataseed1.defibit.io', 'https://56.rpc.thirdweb.com', 'https://bsc.drpc.org', 'https://bsc.meowrpc.com'],
  43114: ['https://api.avax.network/ext/bc/C/rpc', 'https://avalanche-c-chain-rpc.publicnode.com', 'https://avalanche.drpc.org'],
  10: ['https://mainnet.optimism.io', 'https://optimism.drpc.org', 'https://optimism.gateway.tenderly.co'],
  999: ['https://rpc.hyperliquid.xyz/evm', 'https://rpc.hypurrscan.io', 'https://hyperliquid-json-rpc.stakely.io', 'https://hyperliquid.drpc.org'],
  143: ['https://rpc.monad.xyz', 'https://rpc1.monad.xyz', 'https://rpc3.monad.xyz', 'https://monad-mainnet.drpc.org'],
  9745: ['https://rpc.plasma.to', 'https://plasma.gateway.tenderly.co'],
  137: ['https://polygon.drpc.org', 'https://polygon.gateway.tenderly.co'],
  5042: ['https://rpc.mainnet.arc.io', 'https://rpc.blockdaemon.mainnet.arc.io', 'https://rpc.drpc.mainnet.arc.io', 'https://rpc.quicknode.mainnet.arc.io'],
  4663: ['https://rpc.mainnet.chain.robinhood.com', 'https://rpc.ordofi.network'],
  4217: ['https://rpc.tempo.xyz', 'https://tempo.drpc.org'],
  988: ['https://rpc.stable.xyz'],
  98866: ['https://rpc.plume.org'],
}
const COOLDOWN_MS = 60_000
const TIMEOUT_MS = 8_000
const benched = new Map<string, number>()

const keyed = (id: number) => (import.meta.env[`VITE_RPC_${id}`] as string | undefined)?.trim() || undefined

/** The keyed node, then the public ones from the next in turn; benched ones only once every other has failed. */
export function rotatingRpc(chain: Chain): Transport {
  const key = keyed(chain.id)
  const pool = PUBLIC[chain.id] ?? [...chain.rpcUrls.default.http]
  return (args) => {
    // no retries per endpoint: a failure moves on to the next one instead of knocking again
    const one = (url: string) => ({ url, t: http(url, { batch: { wait: 16 }, retryCount: 0, timeout: TIMEOUT_MS })({ ...args, retryCount: 0 }) })
    const own = key ? one(key) : undefined
    const ring = pool.map(one)
    let turn = 0
    const request: EIP1193RequestFn = async ({ method, params }) => {
      const start = turn++ % ring.length
      const now = Date.now(), fresh = (e: { url: string }) => (benched.get(e.url) ?? 0) <= now
      const all = [...(own ? [own] : []), ...ring.slice(start), ...ring.slice(0, start)]
      let last: unknown
      for (const e of [...all.filter(fresh), ...all.filter((e) => !fresh(e))]) {
        try { const v = await e.t.request({ method, params }); benched.delete(e.url); return v as never }
        catch (err) {
          // an answer about the call itself (a revert, a rejection) is the same on every node
          if (shouldThrow(err as Error)) throw err
          last = err; benched.set(e.url, Date.now() + COOLDOWN_MS)
        }
      }
      throw last
    }
    return createTransport({ key: 'rotating', name: 'Rotating JSON-RPC', type: 'rotating', request, retryCount: 1, timeout: TIMEOUT_MS })
  }
}
