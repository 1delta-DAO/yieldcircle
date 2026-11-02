/**
 * The paper account's state (tickets/0006 §B): who is signed in, the book, its prices, and `act` —
 * the one way an op happens. The book's truth is the server's (pos-indexer `paper.*`, applied with
 * the same `model/paper.ts`); the copy here is its cache, applied first so the screen answers at
 * once, and queued when the service cannot be reached.
 *
 * The paper account is a WALLET (wallet/paper.ts): signed in, it is the connected EVM account and
 * the connected Solana one, and `useBook` reads its money from here instead of the chain. The engine
 * under it is shared (`@yieldcircle/app/paper/engine`); this file is the web's connection to it.
 */
import React from 'react'
import { paperId } from '@yieldcircle/core/model/paper'
import { useAccount, useConfig, useConnect, useDisconnect } from 'wagmi'
import { createPaperSocial, missingRoute, usePaperEngine, type PaperEngine, type PaperStatus } from '@yieldcircle/app/paper/engine'
import { connectPaperSol, disconnectPaperSol, PAPER_CONNECTOR_ID, setPaperSession, usePaperSession } from '../wallet/paper'
import type { PaperKeys } from '../wallet/paperKey'
import { useSolWallet } from '../wallet/solana'

// the engine — the book, its sync and `act` — is shared with the phone (`@yieldcircle/app/paper/engine`)
export { missingRoute, paperId, type PaperStatus }

interface PaperCtx extends PaperEngine {
  /** sign in (or create) with derived keys; `create` also posts the profile and links the Solana key */
  signIn: (k: PaperKeys, o: { remember: boolean; create: boolean }) => Promise<void>
  signOut: () => Promise<void>
}
const Ctx = React.createContext<PaperCtx | null>(null)

/** The web's paper account: a wagmi connector for its EVM key and the Solana slot for its Solana key (wallet/paper.ts), over the shared engine. */
export function PaperProvider({ children }: { children: React.ReactNode }) {
  const session = usePaperSession()
  const { address, connector } = useAccount()
  const config = useConfig()
  const { connectAsync } = useConnect()
  const { disconnectAsync } = useDisconnect()
  const sol = useSolWallet()
  const active = !!session && address?.toLowerCase() === session.evm && connector?.id === PAPER_CONNECTOR_ID
  const engine = usePaperEngine(session, active)
  // the Solana half rides along: signed in, the Solana slot holds the paper key unless a real Solana wallet holds it
  React.useEffect(() => { if (session && active && !sol.account) void connectPaperSol(session).catch(() => {}) }, [session?.sol, active, !!sol.account])
  const signIn: PaperCtx['signIn'] = async (k, o) => {
    setPaperSession(k, o.remember)
    const c = config.connectors.find((x) => x.id === PAPER_CONNECTOR_ID)
    if (!c) throw new Error('the paper connector is missing')
    await connectAsync({ connector: c })
    // a real Solana wallet keeps its slot; otherwise the paper key takes it
    if (!sol.account || sol.wallet?.name === 'Paper account') await connectPaperSol(k).catch(() => {})
    if (o.create) await createPaperSocial(k)
  }
  const signOut: PaperCtx['signOut'] = async () => {
    const k = session
    if (connector?.id === PAPER_CONNECTOR_ID) await disconnectAsync({ connector }).catch(() => {})
    disconnectPaperSol(k)
    setPaperSession(null)
  }
  const value = React.useMemo<PaperCtx>(() => ({ ...engine, signIn, signOut }), [engine]) // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export const usePaper = () => { const c = React.useContext(Ctx); if (!c) throw new Error('PaperProvider missing'); return c }

