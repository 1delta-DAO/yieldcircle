import React from 'react'
import { useAccount, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt } from 'wagmi'
import type { ApiTx, LoopActions } from '../sdk/types'
import { useBalancesChanged, useLiveBalances } from '../sdk/liveBalances'

/**
 * The execution ladder, generic over the action that built it: permissions (each mined) →
 * setup transactions → exactly ONE route. Mirrored to sessionStorage keyed on the inputs so the
 * wallet hand-off on a phone survives a discarded tab. A key change drops the bundle.
 */
export type Step = { kind: 'permission' | 'setup' | 'route'; tx: ApiTx; label: string; hash?: `0x${string}`; done?: boolean }
type Bundle = { steps: Step[] }
type Saved = { key: string; bundle: Bundle; pending?: `0x${string}` }
const SS = 'yieldcircle.bundle'
const load = (key: string): Saved | null => { try { const v = JSON.parse(sessionStorage.getItem(SS) ?? 'null') as Saved | null; return v && v.key === key ? v : null } catch { return null } }
const save = (v: Saved | null) => { try { v ? sessionStorage.setItem(SS, JSON.stringify(v)) : sessionStorage.removeItem(SS) } catch { /* private mode */ } }

/**
 * A venue with no native entry takes the gas coin as its own wallet steps — `WETH.deposit()` before
 * the action, `WETH.withdraw(amount)` after it — and the API labels them with the wrapper's address.
 * Said in the coin's name instead, which is the only thing the user needs to recognise.
 */
const WRAP = '0xd0e30db0', UNWRAP = '0x2e1a7d4d'
function wrapWord(tx: ApiTx, coin?: string): string | undefined {
  const sel = tx.data.slice(0, 10).toLowerCase()
  if (sel === WRAP && BigInt(tx.value || '0') > 0n) return `Wrap ${coin ?? 'the native coin'}`
  if (sel === UNWRAP && tx.data.length === 74) return `Unwrap to ${coin ?? 'the native coin'}`
  return undefined
}

export function stepsFrom(a: LoopActions | null | undefined, routeLabel: string, coin?: string): Step[] {
  if (!a) return []
  const steps: Step[] = [
    ...(a.permissions ?? []).map((tx) => ({ kind: 'permission' as const, tx, label: tx.description ?? 'Approve' })),
    ...(a.transactions ?? []).map((tx) => ({ kind: 'setup' as const, tx, label: wrapWord(tx, coin) ?? tx.description ?? routeLabel })),
  ]
  const alts = a.alternatives ?? []
  if (alts.length && !(a.transactions ?? []).length) steps.push({ kind: 'route', tx: alts[0], label: `${routeLabel}${alts[0].description ? ` · ${alts[0].description}` : ''}` })
  steps.push(...(a.postTransactions ?? []).map((tx) => ({ kind: 'setup' as const, tx, label: wrapWord(tx, coin) ?? tx.description ?? routeLabel })))
  return steps
}

export function useLadder(key: string, chainId: string, build: () => Promise<Step[]>) {
  // the wallet's own chain: `useChainId` is the config's, and never follows a wallet onto a chain it lacks
  const { isConnected, chainId: walletChain } = useAccount()
  const { switchChainAsync, isPending: switching } = useSwitchChain()
  const [bundle, setBundle] = React.useState<Bundle | null>(() => load(key)?.bundle ?? null)
  const [pending, setPending] = React.useState<`0x${string}` | undefined>(() => load(key)?.pending)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const send = useSendTransaction()
  const receipt = useWaitForTransactionReceipt({ hash: pending })
  // an open ticket reads its chain's balances live, and a landed step re-reads them (pos-indexer tickets/0044)
  useLiveBalances(chainId)
  const balancesChanged = useBalancesChanged()
  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) { first.current = false; return }
    const saved = load(key)
    setBundle(saved?.bundle ?? null); setPending(saved?.pending); setErr(null)
  }, [key])
  React.useEffect(() => { save(bundle ? { key, bundle, pending } : null) }, [key, bundle, pending])
  const start = async () => {
    setBusy(true); setErr(null)
    try { const steps = await build(); if (!steps.length) throw new Error('the API returned nothing to sign'); setPending(undefined); setBundle({ steps }) }
    catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const next = bundle?.steps.find((s) => !s.done)
  React.useEffect(() => {
    if (receipt.isSuccess && pending) balancesChanged(chainId)
    if (receipt.isSuccess && bundle && pending) { setBundle({ steps: bundle.steps.map((s) => (s.hash === pending ? { ...s, done: true } : s)) }); setPending(undefined) }
    if (receipt.isError && pending) { setErr('the transaction reverted'); setPending(undefined) }
  }, [receipt.isSuccess, receipt.isError])
  const wrongChain = walletChain !== Number(chainId)
  const sendNext = async () => {
    if (!next) return
    setErr(null)
    if (wrongChain) { try { await switchChainAsync({ chainId: Number(chainId) }) } catch (e) { setErr(shortErr((e as Error).message)) } return }
    try {
      const hash = await send.sendTransactionAsync({ to: next.tx.to as `0x${string}`, data: next.tx.data as `0x${string}`, value: BigInt(next.tx.value || '0') })
      setPending(hash); setBundle((b) => b && { steps: b.steps.map((s) => (s === next ? { ...s, hash } : s)) })
    } catch (e) { setErr(shortErr((e as Error).message)) }
  }
  const reset = () => { setBundle(null); setPending(undefined); setErr(null) }
  const done = bundle ? bundle.steps.filter((s) => s.done).length : 0
  return { bundle, next, done, total: bundle?.steps.length ?? 0, pending, err, busy, start, sendNext, reset, isConnected, wrongChain, switching, finished: !!bundle && !next }
}
export type Ladder = ReturnType<typeof useLadder>
const shortErr = (m: string) => (m.length > 160 ? m.slice(0, 160) + '…' : m)
