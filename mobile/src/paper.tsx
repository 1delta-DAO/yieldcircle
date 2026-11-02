import React from 'react'
import { privateKeyToAccount } from 'viem/accounts'
import { createPaperSocial, usePaperEngine, type PaperEngine } from '@yieldcircle/app/paper/engine'
import type { PaperKeys } from '@yieldcircle/app/paper/keys'

/**
 * The phone's paper account (tickets/0006; the web's is `state/Paper.tsx` + `wallet/paper.ts`): the
 * derived keys — never the password — kept on the device (the SQLite-backed localStorage), so the
 * slow derivation (docs/mobile.md) runs once per phone, and the shared engine over them. There is
 * no wallet connector on the phone: signed in, the session (`src/session.tsx`) shows the paper
 * account as the account, and its key signs social writes through `Platform.useLocalSigner`.
 */
const KEY = 'yieldcircle.paper.session'
const read = (): PaperKeys | null => {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as PaperKeys | null; return v?.evmKey && v.evm && v.solKey && v.sol ? v : null } catch { return null }
}
let session = read()
const subs = new Set<() => void>()
function setSession(k: PaperKeys | null) {
  session = k
  try { k ? localStorage.setItem(KEY, JSON.stringify(k)) : localStorage.removeItem(KEY) } catch { /* the store is optional */ }
  subs.forEach((f) => f())
}
export function usePaperSession(): PaperKeys | null {
  return React.useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => session)
}

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
}
const Ctx = React.createContext<PaperCtx | null>(null)

export function PhonePaper({ children }: { children: React.ReactNode }) {
  const s = usePaperSession()
  // signed in is active: the phone holds one account at a time, and the paper one wins while it is in
  const engine = usePaperEngine(s, !!s)
  const value = React.useMemo<PaperCtx>(() => ({
    ...engine,
    signIn: async (k, o) => { setSession(k); if (o.create) await createPaperSocial(k) },
    signOut: () => setSession(null),
  }), [engine])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export const usePaper = () => { const c = React.useContext(Ctx); if (!c) throw new Error('PhonePaper missing'); return c }
