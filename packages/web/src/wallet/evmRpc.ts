import { createTransport, http, shouldThrow, type Chain, type EIP1193RequestFn, type Transport } from 'viem'
import RPCS from '../data/rpcs.json'

/**
 * The EVM side of what `wallet/solRpc.ts` is for Solana: the transport behind every wagmi
 * client. Almost every number in this app comes from the allocator API, not the chain; the ONLY
 * RPC reads are the receipt watcher in `sdk/txTrace.ts` (receipt, block number, the replacement
 * check) — the critical path after a send, where one rate-limited free endpoint was a ladder
 * that stalled or ended `failed` on a transaction that had landed.
 *
 * The endpoints are every public one chainlist.org lists for the chain that a browser can use,
 * checked by `scripts/rpcs.mjs` (`pnpm rpcs` → `src/data/rpcs.json`: CORS, batches of three, a
 * `null` receipt for an unknown hash, a fresh head). A per-chain `VITE_RPC_<id>` (a keyed node)
 * is asked first while it answers. Wallet calls (send, estimate) never come here: wagmi sends
 * those through the connector's own provider.
 *
 *   - ROTATE: each request starts at the next endpoint in line, so no single free tier carries
 *     the polling.
 *   - BACK OFF: an endpoint that fails (429, 5xx, timeout, a JSON-RPC error) is benched, and every
 *     failure in a row doubles it — 30 s, 1 min, 2 min … up to 30 min; one answer clears it. A
 *     benched endpoint is not asked at all while others are free; with every one benched, only
 *     the one back soonest is. The bench is kept across reloads (localStorage), so a dead endpoint
 *     costs one request per half hour, not one per page load.
 *   - A request tries at most MAX_TRIES endpoints before it fails (the watcher retries later).
 */
const LIST = (RPCS as { chains: Record<string, string[]> }).chains
const BASE_MS = 30_000, MAX_MS = 30 * 60_000
const MAX_TRIES = 3
const TIMEOUT_MS = 8_000
const LS = 'yieldcircle.rpcBench'

/** url → [benched until, failures in a row] */
type Bench = Record<string, [number, number]>
const bench: Bench = (() => { try { return JSON.parse(localStorage.getItem(LS) ?? '{}') as Bench } catch { return {} } })()
const save = () => { try { localStorage.setItem(LS, JSON.stringify(bench)) } catch { /* private mode */ } }
function failed(url: string) {
  const n = (bench[url]?.[1] ?? 0) + 1
  bench[url] = [Date.now() + Math.min(MAX_MS, BASE_MS * 2 ** (n - 1)), n]
  save()
}
function answered(url: string) { if (bench[url]) { delete bench[url]; save() } }

const keyed = (id: number) => (import.meta.env[`VITE_RPC_${id}`] as string | undefined)?.trim() || undefined

/** The keyed node, then the public ones from the next in turn — never one still benched while another is free. */
export function rotatingRpc(chain: Chain): Transport {
  const key = keyed(chain.id)
  const pool = LIST[chain.id]?.length ? LIST[chain.id] : [...chain.rpcUrls.default.http]
  return (args) => {
    // no retries per endpoint: a failure moves on to the next one instead of knocking again.
    // Batches of three: drpc's free plan refuses a bigger one outright
    const one = (url: string) => ({ url, t: http(url, { batch: { batchSize: 3, wait: 16 }, retryCount: 0, timeout: TIMEOUT_MS })({ ...args, retryCount: 0 }) })
    const own = key ? one(key) : undefined
    const ring = pool.map(one)
    let turn = 0
    const request: EIP1193RequestFn = async ({ method, params }) => {
      const start = turn++ % ring.length
      const all = [...(own ? [own] : []), ...ring.slice(start), ...ring.slice(0, start)]
      const now = Date.now(), until = (e: { url: string }) => bench[e.url]?.[0] ?? 0
      const free = all.filter((e) => until(e) <= now)
      const order = (free.length ? free : [all.reduce((a, b) => (until(b) < until(a) ? b : a))]).slice(0, MAX_TRIES)
      let last: unknown
      for (const e of order) {
        try { const v = await e.t.request({ method, params }); answered(e.url); return v as never }
        catch (err) {
          // an answer about the call itself (a revert, a rejection) is the same on every node
          if (shouldThrow(err as Error)) throw err
          last = err; failed(e.url)
        }
      }
      throw last
    }
    return createTransport({ key: 'rotating', name: 'Rotating JSON-RPC', type: 'rotating', request, retryCount: 1, timeout: TIMEOUT_MS })
  }
}
