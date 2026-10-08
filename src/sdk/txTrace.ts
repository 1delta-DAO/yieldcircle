import type { QueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { getBlockNumber, getTransactionReceipt, waitForTransactionReceipt } from 'viem/actions'
import { wagmiConfig } from '../wallet/wagmi'
import { bridgeStatus, fetchEarnPositions, fetchTokenBalances, type PositionsScope } from './api'
import { balancesChanged } from './liveBalances'
import { isEvmAddr, isEvmChain, isSvmChain, normAddr } from '../model/address'
import { getBlockHeight, getSignatureStatus } from '../wallet/solRpc'
import { isNativeAddress } from '../model/positions'
import { formatUnits, TransactionReceiptNotFoundError, type TransactionReceipt } from 'viem'
import type { EarnPosition, EarnPositionsResponse } from './types'

/**
 * Every transaction the app sends, followed until the app's own numbers show it.
 *
 *   pending   → sent, not in a block yet
 *   included  → in a block, not deep enough to call final
 *   final     → FINAL_CONFIRMATIONS deep, and the receipt re-read in the same block (no reorg)
 *   syncing   → the lender(s) / vault(s) it touched are re-read until they DIFFER from before;
 *               then the wallet balances it moves (`watch`: a swap's or bridge's output, a
 *               ticket's pay and receive tokens), the same way
 *   bridging  → a cross-chain leg is on its way (the bridge's own status)
 *   settled   → done: every number on screen includes it
 *
 * and the ends that are not success: `reverted`, `dropped` (never mined, or cancelled in the
 * wallet) and `failed` (the bridge said so).
 *
 * Nothing is re-read before FINAL. The receipt comes from the wallet-side RPC; the API reads off
 * its own, which can be a block behind — a refetch the moment the receipt lands was exactly how a
 * new deposit came back missing. And a positions answer is only accepted once it has CHANGED
 * against the snapshot taken when the transaction was sent: an answer from a node that has not
 * seen the block yet is the old book, and is retried, not shown as the truth.
 *
 * The re-read is NARROW: only the lenders and vaults the transaction touched (`touches`, the
 * market / earn uids the ticket acted on), on its one chain, merged into the cached lists in
 * place of their old rows. A chain bundle is ten chains and every lender on them; one Aave
 * deposit needs one lender read (~1 s against ~3.7 s for Ethereum alone, measured 2026-09-29).
 * Every re-read bypasses the browser cache: the route answers `max-age=15`, and a retry two
 * seconds after the first would otherwise be handed the first answer back.
 *
 * The store lives outside React so a trace survives the ticket that started it closing, and is
 * mirrored to localStorage so a reload picks up where it was.
 */
export type Phase = 'pending' | 'included' | 'final' | 'syncing' | 'bridging' | 'settled' | 'reverted' | 'dropped' | 'failed'
/** What the app must re-read once the transaction is final. */
export type Moves = 'none' | 'balances' | 'positions'
type Hex = `0x${string}`
type Snap = Record<string, number>
export interface Trace {
  /** The hash it was SENT with; `hash` follows a speed-up in the wallet. A Solana signature (base58) on `solana`. */
  id: string; hash: string; chainId: string; account: string
  /** The action (`Deposit · 100 USDC`) and this transaction's part of it (`Approve USDC`). */
  title: string; label: string
  moves: Moves
  bridge?: { name: string; toChainId: string; tokenIn?: string; tokenOut?: string; status?: string }
  /** The market / earn uids it acts on (`AAVE_V3:1:0x…`, `vault.morpho:8453:0x…`) — what the re-read is narrowed to. */
  touches?: string[]
  /**
   * Wallet balances it moves, read until they do; `watchBase` is their raw amount at send. A swap's or
   * bridge's output; on a positions transaction the tokens the ticket pays with and gets back — the
   * position can show the change while the balance read (a Solana RPC at `finalized`, ~13 s behind
   * `confirmed`) still answers the old amount, and nothing else would read it again.
   */
  watch?: { chainId: string; address: string; symbol?: string }[]
  watchBase?: Record<string, string>
  /** What the watched balances GAINED (a withdrawal, a close, a swap's leftover dust), formatted. */
  received?: { symbol: string; amount: string }[]
  phase: Phase
  at: number; doneAt?: number
  block?: number; blockHash?: string; conf?: number; need: number
  /** Solana only: the block height the blob dies at — past it with no status, the send is `dropped`. */
  lastValidHeight?: number
  note?: string; err?: string
  /** What it touched, as it stood when it was sent — `null` when there was nothing to compare with. */
  snap?: Snap | null
  seen?: boolean
}
export const TERMINAL: Phase[] = ['settled', 'reverted', 'dropped', 'failed']
export const isDone = (t: Trace) => TERMINAL.includes(t.phase)
export const isOk = (t: Trace) => !['reverted', 'dropped', 'failed'].includes(t.phase)
/** In a block, whatever came after: the step it was can be marked done and the next one sent. */
export const hasLanded = (t: Trace | undefined) => !!t && ['included', 'final', 'syncing', 'bridging', 'settled'].includes(t.phase)

/**
 * How deep a block must be before its numbers are read. One on every chain with single-slot
 * finality or a sequencer (the L2s, Avalanche, HyperEVM, Plasma, Arc, Tempo, Stable); more where a
 * short reorg is a thing that happens — a block on Ethereum or BNB, and Polygon, whose finality
 * trails its 2 s blocks. It costs a few seconds, and it is what lets "Done" mean done.
 */
const FINAL_CONFIRMATIONS: Record<string, number> = { '1': 2, '56': 2, '137': 3, '143': 2 }
const SLOW_MS = 3 * 60_000
const DROP_MS = 60 * 60_000
/** ≈ 60 s of re-reads before giving up on seeing the change (the list refreshes on its own later). */
const SYNC_WAITS = [0, 2_000, 3_000, 5_000, 8_000, 12_000, 15_000, 15_000]
/**
 * The schedule for a NARROW positions re-read (one lender / vault, ~0.6 s against ~7 s for a whole
 * Solana sweep, measured 2026-10-04). The lag to cover is the API's own indexer: Jupiter Lend
 * answers the old book for ~15–30 s after a confirmed transaction, and the old schedule's
 * 12–15 s gaps fell exactly in that window — the change was there at ~20 s and shown at ~33 s.
 * A cheap read can afford to knock every 2–3 s instead, so the position shows the moment the API
 * has it; ≈ 90 s in all before giving up.
 */
const NARROW_SYNC_WAITS = [0, 2_000, 2_000, 2_000, 3_000, 3_000, 3_000, 3_000, 3_000, 3_000, 4_000, 4_000, 5_000, 5_000, 5_000, 5_000, 5_000, 5_000, 5_000, 5_000, 5_000, 5_000]
const BRIDGE_POLL_MS = 10_000
const BRIDGE_TERMINAL = new Set(['DONE', 'FAILED', 'TRANSFER_REFUNDED', 'INVALID'])
const KEEP = 20, KEEP_MS = 24 * 3600_000
const LS = 'yieldcircle.txs'

let traces: Trace[] = load()
let qc: QueryClient | null = null
const running = new Set<string>()
const subs = new Set<() => void>()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function load(): Trace[] {
  try { const v = JSON.parse(localStorage.getItem(LS) ?? '[]') as Trace[]; return Array.isArray(v) ? v.filter((t) => Date.now() - t.at < KEEP_MS) : [] } catch { return [] }
}
function emit() {
  traces = traces.slice(0, KEEP)
  try { localStorage.setItem(LS, JSON.stringify(traces)) } catch { /* private mode */ }
  for (const f of subs) f()
}
const get = (id: string) => traces.find((t) => t.id === id)
function patch(id: string, p: Partial<Trace>) {
  traces = traces.map((t) => (t.id === id ? { ...t, ...p } : t))
  emit()
}

/** Once, with the app's query client: resumes whatever a reload interrupted. */
export function initTxTrace(client: QueryClient) {
  qc = client
  for (const t of traces) if (!isDone(t)) void run(t.id)
}

/**
 * Follow a transaction the wallet just returned. Idempotent on the hash, so a ladder restored
 * after a reload can call it again without starting a second watcher.
 */
export function traceTx(t: { hash: string; chainId: string; account: string; title: string; label?: string; moves: Moves; bridge?: Trace['bridge']; touches?: (string | undefined)[]; watch?: Trace['watch']; lastValidHeight?: number }) {
  if (get(t.hash)) { void run(t.hash); return }
  const account = normAddr(t.account)
  const touches = [...new Set(t.touches?.filter((u): u is string => !!u))]
  // the baseline is the cached list — certainly from before the transaction; with none cached,
  // the same narrow read the sync will make, sent now while the transaction is still pending
  const scope = scopeOf(touches)
  const cached = t.moves === 'positions' && qc ? cachedRows(qc, account, t.chainId) : null
  const snap = cached ? fingerprint(cached, t.chainId, scope) : null
  traces = [{ id: t.hash, hash: t.hash, chainId: t.chainId, account, title: t.title, label: t.label ?? t.title, moves: t.moves, bridge: t.bridge, touches, watch: t.watch?.length ? t.watch : undefined, phase: 'pending', at: Date.now(), need: FINAL_CONFIRMATIONS[t.chainId] ?? 1, snap, lastValidHeight: t.lastValidHeight }, ...traces]
  emit()
  if (t.moves === 'positions' && !cached) void readScope(account, t.chainId, scope).then((r) => { if (r && get(t.hash)?.snap == null) patch(t.hash, { snap: fingerprint(r.items, t.chainId, scope) }) })
  // the watched balances before anything arrives: a bridge's destination cannot have moved yet
  if (t.watch?.length) void readWatched(account, t.watch).then((b) => { if (b && !get(t.hash)?.watchBase) patch(t.hash, { watchBase: rawOf(b) }) })
  void run(t.hash)
}
export function dismissTrace(id: string) { patch(id, { seen: true }) }
export function clearSettled(account: string) { traces = traces.filter((t) => t.account !== normAddr(account) || !isDone(t)); emit() }

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
/** Every trace (newest first) for this wallet. */
export function useTraces(account: string | undefined): Trace[] {
  const all = useSyncExternalStore(subscribe, () => traces)
  const a = normAddr(account)
  return a ? all.filter((t) => t.account === a) : NONE
}
const NONE: Trace[] = []
export function useTrace(id: string | undefined): Trace | undefined {
  return useSyncExternalStore(subscribe, () => (id ? get(id) : undefined))
}

// ---------------------------------------------------------------- the watcher

type ChainId = (typeof wagmiConfig)['chains'][number]['id']
async function run(id: string) {
  if (running.has(id)) return
  running.add(id)
  try {
    for (let tries = 0; ;) {
      const before = get(id)?.phase
      try { await step(id); return }
      catch (e) {
        // an RPC hiccup is not the transaction's fault: back off and pick up where it was. The count
        // starts over once a step got further, and a trace is given up on only once it is older than
        // any send stays pending — `failed` reads as the TRANSACTION failing, and it may have landed
        const t = get(id)
        if (!t || isDone(t)) return
        tries = t.phase === before ? tries + 1 : 1
        if (tries >= 5 && Date.now() - t.at > DROP_MS) { patch(id, { phase: 'failed', doneAt: Date.now(), err: `Lost track of it (${short((e as Error).message)}). Your wallet shows whether it landed.` }); return }
        if (tries === 3 && t.phase === 'pending') patch(id, { note: 'Cannot reach a node to check it. Your wallet shows whether it landed; this keeps trying.' })
        await sleep(Math.min(30_000, 5_000 * tries))
      }
    }
  } finally { running.delete(id) }
}

async function step(id: string) {
  let t = get(id)!
  if (isSvmChain(t.chainId)) return solStep(id)
  // viem's actions on wagmi's client, not wagmi's wrappers: wagmi's receipt wait THROWS on a revert
  // (after an extra eth_call for the reason), and a revert is an answer here, not an error
  const client = wagmiConfig.getClient({ chainId: Number(t.chainId) as ChainId })
  if (t.phase === 'pending') {
    const slow = setTimeout(() => { if (get(id)?.phase === 'pending') patch(id, { note: 'Taking longer than usual. If your wallet shows it as dropped, send it again.' }) }, Math.max(0, SLOW_MS - (Date.now() - t.at)))
    let cancelled = false
    try {
      const r = await waitForTransactionReceipt(client, {
        hash: t.hash as Hex, timeout: Math.max(60_000, DROP_MS - (Date.now() - t.at)),
        // a speed-up keeps going under its new hash; a cancel in the wallet ends it
        onReplaced: (rep) => { if (rep.reason === 'cancelled') cancelled = true; else patch(id, { hash: rep.transaction.hash, note: 'Sped up in the wallet.' }) },
      })
      if (cancelled) { patch(id, { phase: 'dropped', doneAt: Date.now(), err: 'Cancelled in the wallet.' }); return }
      if (r.status === 'reverted') { patch(id, { phase: 'reverted', block: Number(r.blockNumber), doneAt: Date.now(), err: 'Nothing moved; only the gas was spent.' }); return }
      patch(id, { phase: 'included', hash: r.transactionHash, block: Number(r.blockNumber), blockHash: r.blockHash, conf: 1, note: undefined })
    } catch (e) {
      if ((e as Error).name === 'WaitForTransactionReceiptTimeoutError') { patch(id, { phase: 'dropped', doneAt: Date.now(), err: 'Never made it into a block.' }); return }
      throw e
    } finally { clearTimeout(slow) }
    t = get(id)!
  }
  if (t.phase === 'included') {
    while ((t.conf ?? 1) < t.need) {
      await sleep(3_000)
      const head = Number(await getBlockNumber(client, { cacheTime: 0 }))
      // the nodes rotate (`wallet/evmRpc.ts`): one a block behind must not count the confirmations back
      const conf = Math.max(t.conf ?? 1, head - t.block! + 1)
      if (conf !== t.conf) patch(id, { conf })
      t = get(id)!
    }
    if (t.need > 1) {
      // deep enough — but only if it is still in the block it landed in. A node that has not seen
      // the block yet answers "no receipt" too, so only a receipt in ANOTHER block, or none from
      // three nodes in turn, is a reorg; a node that cannot be reached throws, and `run` retries
      let again: TransactionReceipt | null = null
      for (let i = 0; i < 3 && !again; i++) {
        if (i) await sleep(2_000)
        again = await getTransactionReceipt(client, { hash: t.hash as Hex }).catch((e) => { if (e instanceof TransactionReceiptNotFoundError) return null; throw e })
      }
      if (!again || again.blockHash !== t.blockHash) { patch(id, { phase: 'pending', block: undefined, blockHash: undefined, conf: 0, note: 'Its block was re-organised away; waiting for it to land again.' }); return step(id) }
    }
    patch(id, { phase: 'final', conf: Math.max(t.conf ?? 1, t.need) })
    t = get(id)!
  }
  if (t.phase === 'final') {
    if (qc && t.moves !== 'none') balancesChanged(qc, t.chainId)
    const next: Phase = t.bridge ? 'bridging' : t.moves === 'positions' || t.watch ? 'syncing' : 'settled'
    patch(id, { phase: next, ...(next === 'settled' ? { doneAt: Date.now() } : {}) })
    t = get(id)!
  }
  if (t.phase === 'bridging') return bridge(id)
  if (t.phase === 'syncing') return t.moves === 'positions' ? sync(id) : balanceSync(id)
}

/**
 * The Solana watcher. A signature has no receipt to wait for: `getSignatureStatuses` is polled
 * until `confirmed` (plan §D — that is when the same scoped positions re-read starts; `finalized`
 * trails it by ~13 s and the index reads finalized slots anyway). A status that never appears
 * before `lastValidBlockHeight` passes is DEAD — the blockhash expired — and reads `dropped`;
 * the ladder's message says to build a fresh transaction, never to retry the blob.
 */
async function solStep(id: string) {
  let t = get(id)!
  if (t.phase === 'pending') {
    const slow = setTimeout(() => { if (get(id)?.phase === 'pending') patch(id, { note: 'Taking longer than usual. Solana transactions expire after ~90 seconds; if this one does, start the action again.' }) }, Math.max(0, SLOW_MS - (Date.now() - t.at)))
    try {
      for (let fails = 0; ;) {
        // a failed read is not "not seen yet": say so, rather than count the seconds up in silence
        const st = await getSignatureStatus(t.hash).then((v) => { fails = 0; return v }, () => { fails++; return null })
        if (fails === 5 && get(id)!.phase === 'pending') patch(id, { note: 'Cannot reach a Solana node to check it. Your wallet shows whether it landed; this keeps trying.' })
        if (st) {
          if (st.err) { patch(id, { phase: 'reverted', block: st.slot, doneAt: Date.now(), err: 'The transaction failed on chain; only the fee was spent.' }); return }
          if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') { patch(id, { phase: 'final', block: st.slot, conf: 1, note: undefined }); break }
          if (get(id)!.phase === 'pending') patch(id, { phase: 'included', block: st.slot, conf: 1, note: undefined })
        } else if (t.lastValidHeight) {
          const h = await getBlockHeight().catch(() => null)
          if (h != null && h > t.lastValidHeight) { patch(id, { phase: 'dropped', doneAt: Date.now(), err: 'It expired before it landed (a Solana transaction lives ~90 seconds). Start the action again for a fresh one.' }); return }
        } else if (Date.now() - t.at > DROP_MS) { patch(id, { phase: 'dropped', doneAt: Date.now(), err: 'Never made it into a block.' }); return }
        await sleep(2_000)
        t = get(id)!
      }
    } finally { clearTimeout(slow) }
    t = get(id)!
  }
  if (t.phase === 'included') { patch(id, { phase: 'final' }); t = get(id)! }
  if (t.phase === 'final') {
    if (qc && t.moves !== 'none') balancesChanged(qc, t.chainId)
    const next: Phase = t.moves === 'positions' || t.watch ? 'syncing' : 'settled'
    patch(id, { phase: next, ...(next === 'settled' ? { doneAt: Date.now() } : {}) })
    t = get(id)!
  }
  if (t.phase === 'syncing') return t.moves === 'positions' ? sync(id) : balanceSync(id)
}

/** The cross-chain leg: the bridge's own status until it says so, then the destination's balances. */
async function bridge(id: string) {
  for (;;) {
    const t = get(id)!, b = t.bridge!
    const r = await bridgeStatus({ bridge: b.name, fromChainId: t.chainId, toChainId: b.toChainId, txHash: t.hash, tokenIn: b.tokenIn, tokenOut: b.tokenOut }).catch(() => null)
    // NOT_FOUND right after the source lands is the bridge's indexing lag: keep asking
    if (r && r.status !== b.status) patch(id, { bridge: { ...b, status: r.status } })
    if (r && BRIDGE_TERMINAL.has(r.status)) {
      // DONE is the bridge's word, not the destination's balance: read that until it moves
      if (r.status === 'DONE') { if (t.watch) { patch(id, { phase: 'syncing' }); return balanceSync(id) } if (qc) balancesChanged(qc, t.chainId, b.toChainId); patch(id, { phase: 'settled', doneAt: Date.now() }) }
      else patch(id, { phase: 'failed', doneAt: Date.now(), err: r.status === 'TRANSFER_REFUNDED' ? 'The bridge refunded it on the source chain.' : r.message ?? `The bridge answered ${r.status.toLowerCase()}.` })
      return
    }
    await sleep(BRIDGE_POLL_MS)
  }
}

/**
 * Re-read what it touched until it differs from the baseline, merging every answer into the
 * cached lists.
 *
 * Read even when nothing is cached for this wallet and chain yet. A trace resumed by a reload
 * (`initTxTrace` runs before the first render) finds no list at all, and skipping the sync then
 * settled it as "Done" while the list the app went on to fetch could still be the old book: the
 * API reads Solana at `finalized`, ~13 s behind the confirmation the trace moves on, so a loop
 * opened just before a reload was missing until some later refetch — "Done", and no position.
 */
async function sync(id: string) {
  const t = get(id)!
  const scope = scopeOf(t.touches ?? [])
  const done = (note?: string) => {
    // the wallet side next: the positions answer is no proof the balance read has caught up
    if (t.watch) return balanceSync(id, note)
    if (qc) balancesChanged(qc, t.chainId); patch(id, { phase: 'settled', doneAt: Date.now(), note })
  }
  if (!qc) return done()
  for (const wait of scope ? NARROW_SYNC_WAITS : SYNC_WAITS) {
    await sleep(wait)
    const r = await readScope(t.account, t.chainId, scope)
    if (!r) continue
    const snap = get(id)?.snap
    const moved = snap == null || changed(snap, fingerprint(r.items, t.chainId, scope))
    // a list read still in flight was asked before this answer: landing after the merge, it would
    // put the old book back over the new position, and nothing reads it again for a minute
    if (moved) await qc.cancelQueries(bucket(t.account, t.chainId))
    merge(qc, t.account, t.chainId, scope, r)
    if (moved) {
      // a list with nothing to merge into (just created, or its read cancelled above) is read now,
      // when the API is known to have the change
      void qc.invalidateQueries({ predicate: (q) => bucket(t.account, t.chainId).predicate(q) && q.state.data === undefined })
      return done()
    }
  }
  done('Final on chain, but the positions have not picked it up yet. They will on the next refresh.')
}

/**
 * The watched balances, read fresh until one differs from the balance at send — then every
 * balance read on those chains, which now answer the new amount too. The destination of a bridge
 * is read only now, never at the source landing, when it could only answer the old amount. What
 * went UP is kept as `received`: on a loop open that is the swap's leftover dust, which the
 * wallet's idle list drops as under a cent and the user would otherwise never see arrive.
 * `carried` is the positions sync's own note, when this runs after it.
 */
async function balanceSync(id: string, carried?: string) {
  const t = get(id)!, w = t.watch ?? []
  let note: string | undefined = t.moves === 'positions'
    ? carried ?? 'Final on chain, but your wallet balance has not picked it up yet. It will on the next refresh.'
    : 'Arrived, but the balance has not shown it yet. It will on the next refresh.'
  let received: Trace['received']
  for (const wait of SYNC_WAITS) {
    await sleep(wait)
    const now = await readWatched(t.account, w)
    const base = get(id)?.watchBase
    if (now && (!base || Object.keys(now).some((k) => now[k].raw !== base[k]))) {
      note = carried
      if (base) received = Object.entries(now).flatMap(([k, b]) => { const d = BigInt(b.raw) - BigInt(base[k] ?? '0'); return d > 0n ? [{ symbol: b.symbol, amount: formatUnits(d, b.decimals) }] : [] })
      break
    }
  }
  if (qc) balancesChanged(qc, t.chainId, t.bridge?.toChainId, ...w.map((x) => x.chainId))
  patch(id, { phase: 'settled', doneAt: Date.now(), note, ...(received?.length ? { received } : {}) })
}
type Watched = Record<string, { raw: string; symbol: string; decimals: number }>
const rawOf = (b: Watched) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.raw]))
/** The watched tokens, `chain:address` → raw amount (and how to say it); `null` if a read failed. */
async function readWatched(account: string, w: NonNullable<Trace['watch']>): Promise<Watched | null> {
  const out: Watched = {}
  try {
    for (const c of [...new Set(w.map((x) => x.chainId))]) {
      const asked = [...new Set(w.filter((x) => x.chainId === c).map((x) => normAddr(x.address)))]
      // the gas coin has several spellings (zero address, `0xeeee…`, the System Program id): any one matches
      const same = (a: string, b: string) => normAddr(a) === b || (isNativeAddress(a) && isNativeAddress(b))
      // the route's `assets` filter wants the native coin as the zero address on EVM; Solana answers it unasked
      const ask = asked.map((a) => (isNativeAddress(a) && isEvmChain(c) ? '0x0000000000000000000000000000000000000000' : a)).filter((a) => !(isSvmChain(c) && isNativeAddress(a)))
      const r = await fetchTokenBalances(account, c, ask, true)
      for (const a of asked) {
        const b = r.items.find((x) => same(x.address, a))
        out[`${c}:${a}`] = { raw: b?.balanceRaw ?? '0', symbol: b?.symbol || w.find((x) => x.chainId === c && normAddr(x.address) === a)?.symbol || '', decimals: b?.decimals ?? 0 }
      }
    }
    return out
  } catch { return null }
}

// ---------------------------------------------------------------- positions, narrowed and compared

/**
 * The narrowest read that covers what a transaction touched, or `null` for the whole chain.
 * A lending uid is `<LENDER>:<chain>:<ref>` with `<LENDER>` the exact meta key the route's
 * `lenders=` takes; a vault's is `vault.<provider>:<chain>:<address>`. Anything else (a uid shape
 * this does not know) widens to the chain rather than guess.
 */
function scopeOf(touches: string[]): PositionsScope | null {
  if (!touches.length) return null
  const lenders = new Set<string>(), vaults = new Set<string>()
  for (const u of touches) {
    const [head, , ref] = u.split(':')
    if (head?.startsWith('vault.') && ref && (isEvmAddr(ref) || !isEvmChain(u.split(':')[1]))) vaults.add(normAddr(ref))
    // Solana lender keys mix case (`JUPITER_LEND_main_8`); EVM ones stay all-caps
    else if (/^[A-Z][A-Za-z0-9_]*$/.test(head ?? '') && ref) lenders.add(head)
    else return null
  }
  return {
    venueKind: !vaults.size ? 'lending' : !lenders.size ? 'vault' : undefined,
    lenders: lenders.size ? [...lenders] : undefined,
    vaults: vaults.size ? [...vaults] : undefined,
  }
}
const inScope = (p: EarnPosition, chainId: string, scope: PositionsScope | null) =>
  p.chainId === chainId && (!scope || (p.venueKind === 'lending' ? !!scope.lenders?.includes(p.lender) : !!scope.vaults?.includes(normAddr(p.vault))))
const readScope = (account: string, chainId: string, scope: PositionsScope | null) =>
  fetchEarnPositions(account, [chainId], scope ?? {}, true).catch(() => null)

/** The `useEarnPositions` request(s) for this wallet that cover this chain. */
const bucket = (account: string, chainId: string) => ({ predicate: (q: { queryKey: readonly unknown[] }) =>
  q.queryKey[0] === 'earn-positions' && normAddr(String(q.queryKey[1])) === account && String(q.queryKey[2]).split(',').includes(chainId) })
function cachedRows(client: QueryClient, account: string, chainId: string): EarnPosition[] | null {
  const hits = client.getQueriesData<EarnPositionsResponse>(bucket(account, chainId)).filter(([, d]) => d)
  return hits.length ? hits.flatMap(([, d]) => d!.items) : null
}
/** The narrow answer in place of the rows it covers, in every cached list that shows this chain — sorted as the route sorts. */
function merge(client: QueryClient, account: string, chainId: string, scope: PositionsScope | null, r: EarnPositionsResponse) {
  const fresh = r.items.filter((p) => inScope(p, chainId, scope))
  for (const [key, old] of client.getQueriesData<EarnPositionsResponse>(bucket(account, chainId))) {
    if (!old) continue
    const items = [...old.items.filter((p) => !inScope(p, chainId, scope)), ...fresh]
      .sort((a, b) => b.netUsd - a.netUsd || b.suppliedUsd + b.borrowedUsd - (a.suppliedUsd + a.borrowedUsd))
    const sum = (k: 'suppliedUsd' | 'borrowedUsd' | 'netUsd') => items.reduce((a, p) => a + p[k], 0)
    client.setQueryData<EarnPositionsResponse>(key, { ...old, items, totals: { suppliedUsd: sum('suppliedUsd'), borrowedUsd: sum('borrowedUsd'), netUsd: sum('netUsd') } })
  }
}

/** Raw amounts per leg of what is in scope — never USD, which moves with the price between two reads. */
function fingerprint(rows: EarnPosition[], chainId: string, scope: PositionsScope | null): Snap {
  const out: Snap = {}
  for (const p of rows) {
    if (!inScope(p, chainId, scope)) continue
    if (p.venueKind === 'vault') out[`${p.positionUid}|shares`] = Number(p.shares) || 0
    else for (const l of p.legs) { out[`${p.positionUid}|${l.marketUid}|d`] = Number(l.deposits) || 0; out[`${p.positionUid}|${l.marketUid}|b`] = Number(l.debt) || 0 }
  }
  return out
}
/**
 * Moved by more than interest could have moved it. A lending balance accrues every block — at 30 %
 * a year that is ~1e-6 of it in two minutes — so one part in ten thousand is our transaction, not
 * the rate. A position that appears or disappears always counts.
 */
function changed(a: Snap, b: Snap) {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] ?? 0, y = b[k] ?? 0, m = Math.max(Math.abs(x), Math.abs(y))
    if (m > 0 && Math.abs(x - y) > m * 1e-4) return true
  }
  return false
}
const short = (m: string) => (m.length > 160 ? m.slice(0, 160) + '…' : m)
