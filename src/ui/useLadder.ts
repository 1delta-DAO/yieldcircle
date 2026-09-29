import React from 'react'
import { useAccount, useSendTransaction } from 'wagmi'
import type { ApiTx, LoopActions } from '../sdk/types'
import { nativeSymbol, WRAPPED_NATIVE } from '../model/positions'
import { useLiveBalances } from '../sdk/liveBalances'
import { hasLanded, isDone, traceTx, useTrace, type Moves } from '../sdk/txTrace'
import { isRemote, openWallet } from '../wallet/deeplink'
import { useSwitchTo } from '../wallet/useSwitchTo'

/**
 * The execution ladder, generic over the action that built it: permissions (each mined) →
 * setup transactions → exactly ONE route. Mirrored to sessionStorage keyed on the inputs so the
 * wallet hand-off on a phone survives a discarded tab. A key change drops the bundle.
 *
 * Each sent step is handed to `txTrace.ts`, which follows it to final and re-reads what it moved;
 * the ladder only listens. A step is done once it is IN A BLOCK (the next one can be signed on
 * top of it); the ladder is settled once the step that moves the position has shown up in it.
 */
/**
 * `onFail`: what a revert of THIS step means for the user's funds, when the generic "reverted" would mislead.
 * `moves`: what it changes once final — an approval nothing on screen, a wrap the balances, and the
 * one step that IS the action (the last one that is neither) the positions.
 */
export type Step = { kind: 'permission' | 'setup' | 'route'; tx: ApiTx; label: string; hash?: `0x${string}`; done?: boolean; onFail?: string; moves?: Moves }
type Bundle = { steps: Step[]; title?: string; touches?: string[] }
type Saved = { key: string; bundle: Bundle; pending?: `0x${string}` }
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

export function stepsFrom(a: LoopActions | null | undefined, routeLabel: string, chainId?: string): Step[] {
  if (!a) return []
  const step = (tx: ApiTx): Step => ({ kind: 'setup', tx, label: tx.description ?? routeLabel, ...wrapStep(tx, chainId) })
  const steps: Step[] = [
    ...(a.permissions ?? []).map((tx) => ({ kind: 'permission' as const, tx, label: tx.description ?? 'Approve', moves: 'none' as const })),
    ...(a.transactions ?? []).map(step),
  ]
  const alts = a.alternatives ?? []
  if (alts.length && !(a.transactions ?? []).length) steps.push({ kind: 'route', tx: alts[0], label: `${routeLabel}${alts[0].description ? ` · ${alts[0].description}` : ''}` })
  steps.push(...(a.postTransactions ?? []).map(step))
  // one step waits for the positions to show it; any other pre-step only moves balances
  let main = -1
  steps.forEach((s, i) => { if (!s.moves) main = i })
  return steps.map((s, i) => (s.moves ? s : { ...s, moves: i === main ? 'positions' : 'balances' }))
}

/** `touches`: the market / earn uids the action works on — what `txTrace` re-reads once it is final, and nothing else. */
export function useLadder(key: string, chainId: string, build: () => Promise<Step[]>, touches: (string | undefined)[] = []) {
  // the wallet's own chain: `useChainId` is the config's, and never follows a wallet onto a chain it lacks
  const { isConnected, chainId: walletChain, address, connector } = useAccount()
  const { switchTo, switching } = useSwitchTo()
  const [bundle, setBundle] = React.useState<Bundle | null>(() => load(key)?.bundle ?? null)
  const [pending, setPending] = React.useState<`0x${string}` | undefined>(() => load(key)?.pending)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const send = useSendTransaction()
  const tr = useTrace(pending)
  // an open ticket reads its chain's balances live (pos-indexer tickets/0044); a final step re-reads them (txTrace)
  useLiveBalances(chainId)
  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) { first.current = false; return }
    const saved = load(key)
    setBundle(saved?.bundle ?? null); setPending(saved?.pending); setErr(null)
  }, [key])
  React.useEffect(() => { save(bundle ? { key, bundle, pending } : null) }, [key, bundle, pending])
  const start = async (title?: string) => {
    setBusy(true); setErr(null)
    try { const steps = await build(); if (!steps.length) throw new Error('the API returned nothing to sign'); setPending(undefined); setBundle({ steps, title, touches: touches.filter((u): u is string => !!u) }) }
    catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const next = bundle?.steps.find((s) => !s.done)
  const pendingStep = bundle?.steps.find((s) => s.hash === pending)
  const follow = (hash: `0x${string}`, st: Step) => address && traceTx({ hash, chainId, account: address, title: bundle?.title ?? st.label, label: st.label, moves: st.moves ?? 'positions', touches: bundle?.touches })
  // a ladder restored after a reload whose trace did not survive (storage off): pick the hash up again
  React.useEffect(() => { if (pending && !tr && pendingStep) follow(pending, pendingStep) }, [pending, !!tr, address])
  React.useEffect(() => {
    if (!pending || !tr) return
    if (hasLanded(tr)) { setBundle((b) => b && { ...b, steps: b.steps.map((s) => (s.hash === pending ? { ...s, done: true } : s)) }); setPending(undefined) }
    else if (isDone(tr)) { setErr(tr.phase === 'reverted' ? pendingStep?.onFail ?? 'the transaction reverted' : tr.err ?? 'the transaction did not go through'); setPending(undefined) }
  }, [pending, tr?.phase])
  const wrongChain = walletChain !== Number(chainId)
  const sendNext = async () => {
    if (!next) return
    setErr(null)
    if (wrongChain) { try { await switchTo(Number(chainId)) } catch (e) { setErr(shortErr((e as Error).message)) } return }
    // before the first await: iOS only follows the hand-off while the tap is live (wallet/deeplink.ts)
    openWallet(connector?.id)
    try {
      const hash = await send.sendTransactionAsync({ to: next.tx.to as `0x${string}`, data: next.tx.data as `0x${string}`, value: BigInt(next.tx.value || '0') })
      follow(hash, next)
      setPending(hash); setBundle((b) => b && { ...b, steps: b.steps.map((s) => (s === next ? { ...s, hash } : s)) })
    } catch (e) { setErr(next.onFail && /revert/i.test((e as Error).message) ? next.onFail : shortErr((e as Error).message)) }
  }
  const reset = () => { setBundle(null); setPending(undefined); setErr(null) }
  // a request out to a wallet in another app: the button brings it back rather than sitting disabled
  const remote = isRemote(connector?.id)
  const reopen = () => { openWallet(connector?.id) }
  const done = bundle ? bundle.steps.filter((s) => s.done).length : 0
  // every step in a block is not yet every number on screen: the action's own trace says when it is
  const main = useTrace(bundle?.steps.find((s) => s.moves === 'positions')?.hash)
  const finished = !!bundle && !next
  return { bundle, next, done, total: bundle?.steps.length ?? 0, pending, err, busy, start, sendNext, reset, isConnected, wrongChain, switching, signing: send.isPending, remote, reopen, finished, settled: finished && (!main || isDone(main)), main }
}
export type Ladder = ReturnType<typeof useLadder>
const shortErr = (m: string) => (m.length > 160 ? m.slice(0, 160) + '…' : m)
