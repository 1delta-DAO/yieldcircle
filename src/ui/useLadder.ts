import React from 'react'
import { useAccount, useChainId, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt } from 'wagmi'
import type { ApiTx, LoopActions } from '../sdk/types'

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

export function stepsFrom(a: LoopActions | null | undefined, routeLabel: string): Step[] {
  if (!a) return []
  const steps: Step[] = [
    ...(a.permissions ?? []).map((tx) => ({ kind: 'permission' as const, tx, label: tx.description ?? 'Approve' })),
    ...(a.transactions ?? []).map((tx) => ({ kind: 'setup' as const, tx, label: tx.description ?? routeLabel })),
  ]
  const alts = a.alternatives ?? []
  if (alts.length && !(a.transactions ?? []).length) steps.push({ kind: 'route', tx: alts[0], label: `${routeLabel}${alts[0].description ? ` · ${alts[0].description}` : ''}` })
  return steps
}

export function useLadder(key: string, chainId: string, build: () => Promise<Step[]>) {
  const { isConnected } = useAccount()
  const walletChain = useChainId()
  const { switchChain, isPending: switching } = useSwitchChain()
  const [bundle, setBundle] = React.useState<Bundle | null>(() => load(key)?.bundle ?? null)
  const [pending, setPending] = React.useState<`0x${string}` | undefined>(() => load(key)?.pending)
  const [err, setErr] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const send = useSendTransaction()
  const receipt = useWaitForTransactionReceipt({ hash: pending })
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
    if (receipt.isSuccess && bundle && pending) { setBundle({ steps: bundle.steps.map((s) => (s.hash === pending ? { ...s, done: true } : s)) }); setPending(undefined) }
    if (receipt.isError && pending) { setErr('the transaction reverted'); setPending(undefined) }
  }, [receipt.isSuccess, receipt.isError])
  const wrongChain = walletChain !== Number(chainId)
  const sendNext = async () => {
    if (!next) return
    if (wrongChain) { switchChain({ chainId: Number(chainId) }); return }
    setErr(null)
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
