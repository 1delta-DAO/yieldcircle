import React from 'react'
import { privateKeyToAccount } from 'viem/accounts'
import { useAccountEffect } from 'wagmi'
import { createPaperSocial, usePaperEngine, type PaperEngine } from '@yieldcircle/app/paper/engine'
import type { PaperKeys } from '@yieldcircle/app/paper/keys'

/**
 * The phone's paper account (tickets/0006; the web's is `state/Paper.tsx` + `wallet/paper.ts`): the
 * derived keys — never the password — kept on the device (the SQLite-backed localStorage), so the
 * slow derivation (docs/mobile.md) runs once per phone, and the shared engine over them. There is
 * no wallet connector on the phone: in use, the session (`src/session.tsx`) shows the paper
 * account as the account, and its key signs social writes through `Platform.useLocalSigner`.
 *
 * Paper is optional and steps aside, as on the web: signed in, it is IN USE (`on`) until a real
 * wallet connects, which takes over; "Use it" brings it back without signing in again (the keys
 * stay), "Use my wallet" hands over. Signing out forgets the keys.
 */
const KEY = 'yieldcircle.paper.session'
const ON = 'yieldcircle.paper.on'
const read = (): PaperKeys | null => {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PaperKeys | null; return v?.evmKey && v.evm && v.solKey && v.sol ? v : null } catch { return null }
}
let session = read()
let on = (() => { try { return localStorage.getItem(ON) !== '0' } catch { return true } })()
const subs = new Set<() => void>()
function setSession(k: PaperKeys | null) {
  session = k
  try { k ? localStorage.setItem(KEY, JSON.stringify(k)) : localStorage.removeItem(KEY) } catch { /* the store is optional */ }
  subs.forEach((f) => f())
}
function setOn(v: boolean) {
  on = v
  try { localStorage.setItem(ON, v ? '1' : '0') } catch { /* the store is optional */ }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export function usePaperSession(): PaperKeys | null {
  return React.useSyncExternalStore(subscribe, () => session)
}
const usePaperOn = () => React.useSyncExternalStore(subscribe, () => on)

/** The paper account's key as a signer of social writes (`Platform.useLocalSigner`): none when signed out. */
export function usePaperSigner() {
  const k = usePaperSession()
  return React.useMemo(() => k && {
    address: k.evm,
    signTypedData: (td: { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }) => privateKeyToAccount(k.evmKey).signTypedData(td as never),
  }, [k])
}

interface PaperCtx extends PaperEngine {
  /** sign in with derived keys; `create` also posts the profile (the name as its handle) and links the Solana key */
  signIn: (k: PaperKeys, o: { create: boolean }) => Promise<void>
  signOut: () => void
  /** in use (`true`) or stepped aside for the connected wallet (`false`); the keys stay either way */
  use: (on: boolean) => void
}
const Ctx = React.createContext<PaperCtx | null>(null)

export function PhonePaper({ children }: { children: React.ReactNode }) {
  const s = usePaperSession()
  const isOn = usePaperOn()
  // the phone holds one account at a time: the paper one while it is in use
  const engine = usePaperEngine(s, !!s && isOn)
  // a wallet connected now takes over (the web's: connecting another wallet leaves paper signed in, not in use);
  // the AppKit session coming back at launch is not a new choice and leaves paper as it was
  useAccountEffect({ onConnect: ({ isReconnected }) => { if (!isReconnected && session) setOn(false) } })
  const value = React.useMemo<PaperCtx>(() => ({
    ...engine,
    signIn: async (k, o) => { setSession(k); setOn(true); if (o.create) await createPaperSocial(k) },
    signOut: () => { setSession(null); setOn(true) },
    use: setOn,
  }), [engine])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export const usePaper = () => { const c = React.useContext(Ctx); if (!c) throw new Error('PhonePaper missing'); return c }
