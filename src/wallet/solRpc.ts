/**
 * The one Solana RPC consumer, mirroring what `wallet/wagmi.ts` is for EVM:
 * almost every number comes from the allocator API or the Solana index, and
 * the ONLY chain reads are the signature watcher in `sdk/txTrace.ts` — the
 * critical path after a send.
 *
 * Reads ROTATE over public endpoints that serve browsers (CORS, no key), so no
 * single free tier's rate limit stalls a trace: each call goes to the next one
 * in line, and one that fails (403, 429, network) sits out a cooldown while the
 * rest carry on. `VITE_RPC_SOLANA` (a keyed node) is always asked first.
 * Checked 2026-10-04 with an `Origin` header:
 *   - `api.mainnet-beta.solana.com` answers 403 to every browser request — as
 *     the old sole default it left Solana traces "waiting for a block" forever;
 *     it is not in the list.
 *   - publicnode answers `getBlockHeight` with the SLOT (~22M too high), which
 *     against `lastValidBlockHeight` would call a live transaction expired; it
 *     serves signature statuses only.
 */
const KEYED = (import.meta.env.VITE_RPC_SOLANA as string | undefined)?.trim()
const PUBLIC: { url: string; height: boolean }[] = [
  { url: 'https://solana-rpc.publicnode.com', height: false },
  { url: 'https://public.rpc.solanavibestation.com', height: true },
  { url: 'https://solana.leorpc.com/?api_key=FREE', height: true },
  { url: 'https://api.tatum.io/v3/blockchain/node/solana-mainnet', height: true },
]
const COOLDOWN_MS = 60_000
const benched = new Map<string, number>()
let seq = 0, turn = 0

async function call<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const r = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method, params }),
    signal: AbortSignal.timeout(8_000),
  })
  const j = (await r.json().catch(() => ({}))) as { result?: T; error?: { message?: string } }
  if (j.error || !r.ok || !('result' in j)) throw new Error(j.error?.message || `${method}: HTTP ${r.status}`)
  return j.result as T
}
/** The keyed node, then the public ones from the next in turn; benched ones only once every other has failed. */
async function rpc<T>(method: string, params: unknown[], heightSafe = false): Promise<T> {
  const pool = PUBLIC.filter((e) => !heightSafe || e.height).map((e) => e.url)
  const start = turn++ % pool.length
  const ring = [...pool.slice(start), ...pool.slice(0, start)]
  const now = Date.now(), fresh = (u: string) => (benched.get(u) ?? 0) <= now
  const order = [...(KEYED ? [KEYED] : []), ...ring.filter(fresh), ...ring.filter((u) => !fresh(u))]
  let last: unknown
  for (const url of order) {
    try { const v = await call<T>(url, method, params); benched.delete(url); return v }
    catch (e) { last = e; benched.set(url, Date.now() + COOLDOWN_MS) }
  }
  throw last
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
export const getBlockHeight = () => rpc<number>('getBlockHeight', [{ commitment: 'confirmed' }], true)
