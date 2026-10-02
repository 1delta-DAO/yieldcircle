/**
 * The one Solana RPC consumer, mirroring what `wallet/wagmi.ts` is for EVM:
 * almost every number comes from the allocator API or the Solana index, and
 * the ONLY chain reads are the signature watcher in `sdk/txTrace.ts` — the
 * critical path after a send. `VITE_RPC_SOLANA` takes precedence; the public
 * mainnet endpoint behind it is heavily rate-limited, which a poll every few
 * seconds tolerates but a busy deploy should override.
 */
const SOL_RPC_URL =
  (import.meta.env.VITE_RPC_SOLANA as string | undefined)?.trim() || 'https://api.mainnet-beta.solana.com'

let seq = 0
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const r = await fetch(SOL_RPC_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method, params }),
  })
  const j = (await r.json()) as { result?: T; error?: { message?: string } }
  if (j.error) throw new Error(j.error.message || `${method} failed`)
  return j.result as T
}

export interface SigStatus {
  slot: number
  confirmations: number | null
  err: unknown
  confirmationStatus?: 'processed' | 'confirmed' | 'finalized'
}
/** One signature's status; `null` while the cluster has not seen it (or has forgotten it). */
export async function getSignatureStatus(signature: string): Promise<SigStatus | null> {
  const r = await rpc<{ value: (SigStatus | null)[] }>('getSignatureStatuses', [[signature], { searchTransactionHistory: true }])
  return r.value?.[0] ?? null
}
/** The current block height — what a transaction's `lastValidBlockHeight` expires against. */
export const getBlockHeight = () => rpc<number>('getBlockHeight', [{ commitment: 'confirmed' }])
