import React from 'react'
import { useAccount, useCapabilities, useSendTransaction, useWalletClient } from 'wagmi'
import { isSvmTx, type AnyTx, type ApiTx, type LoopActions } from '../sdk/types'
import { base58Encode, isSvmChain } from '../model/address'
import { nativeSymbol, WRAPPED_NATIVE } from '../model/positions'
import { venueLabel } from '../model/strategies'
import { useLiveBalances } from '../sdk/liveBalances'
import { hasLanded, isDone, traceTx, useTrace, type Moves } from '../sdk/txTrace'
import { isRemote, openWallet } from '../wallet/deeplink'
import { isRejection } from '../wallet/errors'
import { solSignAndSend, useSolWallet } from '../wallet/solana'
import { useSwitchTo } from '../wallet/useSwitchTo'
import { tracePaper } from '../sdk/txTrace'
import type { PaperOp } from '../model/paper'
import { usePaper } from '../state/Paper'

/**
 * The execution ladder, generic over the action that built it: permissions (each mined) →
 * setup transactions → exactly ONE route. Mirrored to sessionStorage keyed on the inputs so the
 * wallet hand-off on a phone survives a discarded tab. A key change drops the bundle.
 *
 * Each sent step is handed to `txTrace.ts`, which follows it to final and re-reads what it moved;
 * the ladder only listens. A step is done once it is IN A BLOCK (the next one can be signed on
 * top of it); the ladder is settled once the step that moves the position has shown up in it.
 *
 * Two VMs (docs/solana.md §D). An EVM step is `{to, data, value}` through wagmi; an svm step is
 * one serialized unsigned transaction the Solana wallet signs AND sends. The svm blob PERISHES
 * (~60–90 s blockhash): an expiry — before signing or on send — drops the bundle with a message
 * to start again, which re-calls the action endpoint for a fresh one. The old blob is never
 * retried. `wrongChain` / `switchTo` do not apply on Solana: the wallet has no chain to switch.
 *
 * One signature where the wallet batches (EIP-5792): when it reports `atomic` as `supported` or
 * `ready` (it upgrades the EOA on first use, EIP-7702) on the chain, one tap sends every step left
 * — approvals, setup, the route, the unwrap — as ONE atomic `wallet_sendCalls`. All of them land
 * or none does, so a step's `onFail` (which assumes the earlier ones landed) does not apply. On a
 * phone that is one trip to the wallet app instead of one per step. A wallet that refuses the
 * batch (other than the user saying no) drops the ladder back to one step per tap.
 */
/**
 * `onFail`: what a revert of THIS step means for the user's funds, when the generic "reverted" would mislead.
 * `moves`: what it changes once final — an approval nothing on screen, a wrap the balances, and the
 * one step that IS the action (the last one that is neither) the positions.
 */
export type Step = { kind: 'permission' | 'setup' | 'route'; tx: AnyTx; label: string; hash?: string; done?: boolean; onFail?: string; moves?: Moves }
/** A token the action moves in the wallet — paid with, or paid back into (a close, a swap's leftover). */
export type Watch = { address: string | undefined; symbol?: string }
type Bundle = { steps: Step[]; title?: string; touches?: string[]; watch?: { address: string; symbol?: string }[] }
/** `batch`: the `wallet_sendCalls` id in flight, until the wallet reports the transaction it became. */
type Saved = { key: string; bundle: Bundle; pending?: string; batch?: string }
const SS = 'yieldcircle.bundle'
const load = (key: string): Saved | null => { try { const v = JSON.parse(sessionStorage.getItem(SS) ?? 'null') as Saved | null; return v && v.key === key ? v : null } catch { return null } }
const save = (v: Saved | null) => { try { v ? sessionStorage.setItem(SS, JSON.stringify(v)) : sessionStorage.removeItem(SS) } catch { /* private mode */ } }

/**
 * A venue with no native entry takes the gas coin as its own wallet steps — `WETH.deposit()` before
 * the action, `WETH.withdraw(amount)` after it. Said in the coin's name, which is the only thing
 * the user needs to recognise. Matched on the wrapper's ADDRESS as well as the selector: Vesper's
 * pool `withdraw(shares)` shares `0x2e1a7d4d`, and a plain Vesper exit read as "Unwrap to ETH".
 *
 * The unwrap is its own transaction after the withdraw, so if it reverts the withdrawal has already
 * landed — the funds are in the wallet as the wrapper, not lost, and the error says so.
 */
const WRAP = '0xd0e30db0', UNWRAP = '0x2e1a7d4d'
function wrapStep(tx: ApiTx, chainId?: string): Pick<Step, 'label' | 'onFail' | 'moves'> | undefined {
  const wrapper = chainId ? WRAPPED_NATIVE[chainId] : undefined
  if (!wrapper || tx.to.toLowerCase() !== wrapper) return undefined
  const coin = nativeSymbol(chainId!), sel = tx.data.slice(0, 10).toLowerCase()
  if (sel === WRAP && BigInt(tx.value || '0') > 0n) return { label: `Wrap ${coin} → W${coin}`, moves: 'balances' }
  if (sel === UNWRAP && tx.data.length === 74) return { label: `Unwrap W${coin} → ${coin}`, onFail: `The unwrap reverted. The withdrawal itself went through: the funds are in your wallet as W${coin}.`, moves: 'balances' }
  return undefined
}

/**
 * The API names a spender by its lender key — `Approve for MORPHO_BLUE_8BDB7D2C…` — which is a
 * 64-hex market id to a reader (and overflowed the ticket). Said as the venue instead.
 */
const readableKeys = (d: string) => d.replace(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g, (k) => venueLabel(k))

/** `route`: which of `alternatives` to run (the API's best is 0; a ticket's route list picks another). */
export function stepsFrom(a: LoopActions | null | undefined, routeLabel: string, chainId?: string, route = 0): Step[] {
  if (!a) return []
  // an svm "wrap" has no selector to recognise — the message does it internally, so no wrapStep
  const step = (tx: AnyTx): Step => ({ kind: 'setup', tx, label: tx.description ?? routeLabel, ...(isSvmTx(tx) ? undefined : wrapStep(tx, chainId)) })
  const steps: Step[] = [
    ...(a.permissions ?? []).map((tx) => ({ kind: 'permission' as const, tx, label: tx.description ? readableKeys(tx.description) : 'Approve', moves: 'none' as const })),
    ...(a.transactions ?? []).map(step),
  ]
  // with `alternatives`, `transactions` are PRE-steps (a Flying Tulip margin deposit, a Term native wrap)
  // and the chosen route still runs after them — skipping it whenever pre-steps existed sent the margin
  // and never opened the loop. No answer carries its main action in both slots.
  const alts = a.alternatives ?? []
  const alt = alts[Math.min(Math.max(0, route), alts.length - 1)]
  if (alt) steps.push({ kind: 'route', tx: alt, label: `${routeLabel}${alt.description ? ` · ${alt.description}` : ''}` })
  steps.push(...(a.postTransactions ?? []).map(step))
  // one step waits for the positions to show it; any other pre-step only moves balances
  let main = -1
  steps.forEach((s, i) => { if (!s.moves) main = i })
  return steps.map((s, i) => (s.moves ? s : { ...s, moves: i === main ? 'positions' : 'balances' }))
}

const EXPIRED = 'The transaction expired before it was sent — a Solana transaction lives about 90 seconds. Start the action again to build a fresh one.'

/**
 * `touches`: the market / earn uids the action works on — what `txTrace` re-reads once it is final, and nothing else.
 * `watch`: the wallet tokens it moves, re-read after the positions until the balance shows it (and what came back is said).
 */
export function useLadder(key: string, chainId: string, build: () => Promise<Step[]>, touches: (string | undefined)[] = [], watch: Watch[] = []) {
  const svm = isSvmChain(chainId)
  // the wallet's own chain: `useChainId` is the config's, and never follows a wallet onto a chain it lacks
  const { isConnected, chainId: walletChain, address, connector } = useAccount()
  const sol = useSolWallet()
  const { switchTo, switching } = useSwitchTo()
  const [bundle, setBundle] = React.useState<Bundle | null>(() => load(key)?.bundle ?? null)
  const [pending, setPending] = React.useState<string | undefined>(() => load(key)?.pending)
  const [batch, setBatch] = React.useState<string | undefined>(() => load(key)?.batch)
  const [batchSigning, setBatchSigning] = React.useState(false)
  const [noBatch, setNoBatch] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const send = useSendTransaction()
  const { data: walletClient } = useWalletClient()
  const onPaper = usePaper().active
  const caps = useCapabilities({ account: address, query: { enabled: !!address && !svm && !onPaper, retry: false, staleTime: 60_000 } })
  const atomic = (caps.data as Record<number, { atomic?: { status?: string } }> | undefined)?.[Number(chainId)]?.atomic?.status
  const canBatch = !svm && !noBatch && (atomic === 'supported' || atomic === 'ready')
  const tr = useTrace(pending)
  // an open ticket reads its chain's balances live (pos-indexer tickets/0044); a final step re-reads them (txTrace)
  useLiveBalances(chainId)
  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) { first.current = false; return }
    const saved = load(key)
    setBundle(saved?.bundle ?? null); setPending(saved?.pending); setBatch(saved?.batch); setErr(null)
  }, [key])
  React.useEffect(() => { save(bundle ? { key, bundle, pending, batch } : null) }, [key, bundle, pending, batch])
  const start = async (title?: string) => {
    setBusy(true); setErr(null)
    try { const steps = await build(); if (!steps.length) throw new Error('the API returned nothing to sign'); setPending(undefined); setBundle({ steps, title, touches: touches.filter((u): u is string => !!u), watch: watch.filter((w): w is { address: string; symbol?: string } => !!w.address) }) }
    catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const next = bundle?.steps.find((s) => !s.done)
  /** What the next tap sends as one batch: every step not yet sent, when there are two or more and the wallet batches. */
  const rest = bundle?.steps.filter((s) => !s.done && !s.hash) ?? []
  const together = canBatch && !pending && !batch && rest.length > 1 && rest.every((s) => !isSvmTx(s.tx)) ? rest : null
  const pendingStep = bundle?.steps.find((s) => s.hash === pending)
  // one signer per VM: the Solana account signs svm steps, wagmi's signs the rest
  const signer = svm ? sol.account?.address : address
  const follow = (hash: string, st: Step, lastValidHeight?: number) =>
    signer && traceTx({ hash, chainId, account: signer, title: bundle?.title ?? st.label, label: st.label, moves: st.moves ?? 'positions', touches: bundle?.touches, lastValidHeight,
      // only the step that waits for the positions: an approval moves nothing, a wrap is its own read
      watch: (st.moves ?? 'positions') === 'positions' ? bundle?.watch?.map((w) => ({ chainId, ...w })) : undefined })
  // a ladder restored after a reload whose trace did not survive (storage off): pick the hash up again
  React.useEffect(() => { if (pending && !tr && pendingStep) follow(pending, pendingStep, isSvmTx(pendingStep.tx) ? pendingStep.tx.lastValidBlockHeight : undefined) }, [pending, !!tr, signer])
  React.useEffect(() => {
    if (!pending || !tr) return
    if (hasLanded(tr)) { setBundle((b) => b && { ...b, steps: b.steps.map((s) => (s.hash === pending ? { ...s, done: true } : s)) }); setPending(undefined) }
    else if (isDone(tr)) { setErr(tr.phase === 'reverted' ? pendingStep?.onFail ?? 'the transaction reverted' : tr.err ?? 'the transaction did not go through'); setPending(undefined) }
  }, [pending, tr?.phase])
  const wrongChain = !svm && walletChain !== Number(chainId)
  const sendNext = async () => {
    if (!next) return
    setErr(null)
    if (svm) {
      const tx = next.tx
      if (!isSvmTx(tx)) { setErr('the API answered an EVM step for a Solana chain'); return }
      // dead before it was even signed: rebuild, never retry the blob
      if (tx.expiresAt && Date.parse(tx.expiresAt) <= Date.now()) { setBundle(null); setPending(undefined); setErr(EXPIRED); return }
      try {
        const bytes = Uint8Array.from(atob(tx.transaction), (c) => c.charCodeAt(0))
        const sig = base58Encode(await solSignAndSend(bytes))
        follow(sig, next, tx.lastValidBlockHeight)
        setPending(sig); setBundle((b) => b && { ...b, steps: b.steps.map((s) => (s === next ? { ...s, hash: sig } : s)) })
      } catch (e) {
        const m = (e as Error).message
        if (/expired|block ?height|blockhash/i.test(m)) { setBundle(null); setPending(undefined); setErr(EXPIRED) }
        else setErr(shortErr(m))
      }
      return
    }
    if (wrongChain) { try { await switchTo(Number(chainId)) } catch (e) { setErr(shortErr((e as Error).message)) } return }
    // before the first await: iOS only follows the hand-off while the tap is live (wallet/deeplink.ts)
    openWallet(connector?.id)
    if (together && walletClient) {
      setBatchSigning(true)
      try {
        const calls = together.map((s) => { const tx = s.tx as ApiTx; return { to: tx.to as `0x${string}`, data: (tx.data || '0x') as `0x${string}`, value: BigInt(tx.value || '0') } })
        const { id } = await walletClient.sendCalls({ account: walletClient.account, chain: walletClient.chain, calls, forceAtomic: true })
        setBatch(id)
      } catch (e) {
        if (isRejection(e)) setErr('Rejected in the wallet — nothing was sent.')
        // the wallet would not take it as one: the same steps, one per tap (a second tap, so the hand-off stays live on iOS)
        else { setNoBatch(true); setErr('Your wallet would not send these as one batch. Send them one at a time below.') }
      } finally { setBatchSigning(false) }
      return
    }
    try {
      const tx = next.tx as ApiTx
      const hash = await send.sendTransactionAsync({ to: tx.to as `0x${string}`, data: tx.data as `0x${string}`, value: BigInt(tx.value || '0') })
      follow(hash, next)
      setPending(hash); setBundle((b) => b && { ...b, steps: b.steps.map((s) => (s === next ? { ...s, hash } : s)) })
    } catch (e) { setErr(next.onFail && /revert/i.test((e as Error).message) ? next.onFail : shortErr((e as Error).message)) }
  }
  // a batch the wallet took: wait for the one transaction it became, then every step in it is followed as that hash
  React.useEffect(() => {
    if (!batch || !walletClient) return
    let live = true
    walletClient.waitForCallsStatus({ id: batch, timeout: 300_000 }).then((st) => {
      if (!live) return
      const hash = st.receipts?.[st.receipts.length - 1]?.transactionHash
      if (st.status === 'success' && hash) {
        const sent = (bundle?.steps ?? []).filter((s) => !s.done && !s.hash)
        const main = sent.find((s) => s.moves === 'positions') ?? sent[sent.length - 1]
        if (main) follow(hash, main)
        setBundle((b) => b && { ...b, steps: b.steps.map((s) => (!s.done && !s.hash ? { ...s, hash } : s)) })
        setPending(hash)
      } else setErr(st.status === 'failure' ? 'The batch reverted on chain — nothing was moved.' : 'The batch was sent; your wallet has not reported it yet. Check the wallet before sending again.')
      setBatch(undefined)
    }).catch(() => { if (live) { setErr('The batch was sent; its status could not be read. Check the wallet before sending again.'); setBatch(undefined) } })
    return () => { live = false }
  }, [batch, !!walletClient])
  const reset = () => { setBundle(null); setPending(undefined); setBatch(undefined); setErr(null) }
  // a request out to a wallet in another app: the button brings it back rather than sitting disabled.
  // A Solana wallet is an extension in this tab — nothing to bring back.
  const remote = !svm && isRemote(connector?.id)
  const reopen = () => { if (!svm) openWallet(connector?.id) }
  const done = bundle ? bundle.steps.filter((s) => s.done).length : 0
  // every step in a block is not yet every number on screen: the action's own trace says when it is
  const main = useTrace(bundle?.steps.find((s) => s.moves === 'positions')?.hash)
  const finished = !!bundle && !next
  return { bundle, next, together, done, total: bundle?.steps.length ?? 0, pending: pending ?? batch, err, busy, start, sendNext, reset, isConnected: svm ? !!sol.account : isConnected, wrongChain, switching, signing: send.isPending || batchSigning, remote, reopen, finished, settled: finished && (!main || isDone(main)), main }
}
export type Ladder = ReturnType<typeof useLadder> & { paper?: boolean }

/**
 * What a paper confirm does (tickets/0006): build the op — awaiting a quote if it needs one — and
 * say what it is in the tray. Nothing is built by the action endpoints and nothing is signed but the
 * op itself.
 */
export interface PaperBuilt {
  op: PaperOp
  /** names for tokens the op puts in the bank, so the bank can say them */
  names?: { chainId: string; address: string; symbol: string; decimals: number; logo?: string }[]
  /** a paper bridge: the tray shows it in flight until the route's time is up */
  bridge?: { name: string; toChainId: string }
  arrivesAt?: number
}
const PAPER_TX = { to: '0x0000000000000000000000000000000000000000', data: '0x', value: '0' } as ApiTx
const PAPER_SS = 'yieldcircle.paperbundle'
const loadPaper = (key: string): Bundle | null => { try { const v = JSON.parse(sessionStorage.getItem(PAPER_SS) ?? 'null') as { key: string; bundle: Bundle } | null; return v && v.key === key ? v.bundle : null } catch { return null } }

/**
 * The paper twin of {@link useLadder}: the same shape, so a ticket's button, step list and "Done"
 * work unchanged — but one tap applies the op to the paper ledger, and it is settled at once.
 */
/**
 * A builder's refusal that only says the paper address holds nothing on chain (no balance, no
 * allowance, no token account): not the action being refused, so the paper action goes ahead.
 */
const FUNDS_ONLY = /insufficient|balance|allowance|not enough|funds|AccountNotFound|does not exist on chain|token account/i

export function usePaperLadder(key: string, chainId: string, plan?: () => Promise<PaperBuilt>, dryBuild?: () => Promise<Step[]>): Ladder {
  const paper = usePaper()
  // mirrored like the real ladder's: the position a confirm creates remounts the ticket body (its
  // `key` is the holding), and "Done" must survive that
  const [bundle, setBundleRaw] = React.useState<Bundle | null>(() => loadPaper(key))
  const setBundle = (b: Bundle | null) => { setBundleRaw(b); try { b ? sessionStorage.setItem(PAPER_SS, JSON.stringify({ key, bundle: b })) : sessionStorage.removeItem(PAPER_SS) } catch { /* private mode */ } }
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const first = React.useRef(true)
  React.useEffect(() => { if (first.current) { first.current = false; return } setBundleRaw(loadPaper(key)); setErr(null) }, [key])
  const start = async (title?: string) => {
    if (!plan) { setErr('This action is not available on paper yet.'); return }
    setBusy(true); setErr(null)
    try {
      // the real builder, asked and not signed: whatever the API would refuse to build, paper refuses too
      if (dryBuild) {
        let steps: Step[] | null = null
        try { steps = await dryBuild() } catch (e) { if (!FUNDS_ONLY.test((e as Error).message)) throw e }
        if (steps && !steps.length) throw new Error('The API builds nothing for this right now, so it cannot be done on paper either.')
      }
      const b = await plan()
      await paper.act(b.op, b.names)
      const id = tracePaper({ id: (b.op as { id?: string }).id ?? Math.random().toString(16).slice(2), chainId, account: paper.session!.evm, title: title ?? 'Paper', label: 'on paper', bridge: b.bridge ? { name: b.bridge.name, toChainId: b.bridge.toChainId } : undefined, arrivesAt: b.arrivesAt })
      setBundle({ steps: [{ kind: 'route', tx: PAPER_TX, label: title ?? 'Paper', hash: id, done: true, moves: 'positions' }], title })
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const finished = !!bundle
  return {
    bundle, next: undefined, together: null, done: bundle ? 1 : 0, total: bundle ? 1 : 0, pending: undefined, err, busy, start, sendNext: async () => {}, reset: () => { setBundle(null); setErr(null) },
    isConnected: paper.active, wrongChain: false, switching: false, signing: false, remote: false, reopen: () => {}, finished, settled: finished, main: undefined, paper: true,
  }
}

/**
 * The ladder a ticket runs: the real one, or — when the connected account is the paper account —
 * its paper twin. Both are always called (hooks), and the paper plan is only ever run on paper.
 */
export function useTicketLadder(key: string, chainId: string, build: () => Promise<Step[]>, touches: (string | undefined)[] = [], watch: Watch[] = [], plan?: () => Promise<PaperBuilt>, dryRun = false): Ladder {
  const real = useLadder(key, chainId, build, touches, watch)
  const onPaper = usePaper().active
  // `dryRun`: on paper, the real build runs first, unsigned (tickets/0006: paper may do only what the API would build)
  const paper = usePaperLadder(key, chainId, plan, dryRun ? build : undefined)
  return onPaper ? paper : real
}
const shortErr = (m: string) => (m.length > 160 ? m.slice(0, 160) + '…' : m)
