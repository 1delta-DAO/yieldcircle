import React from 'react'
import type { Holding, Idle } from '@yieldcircle/core/model/positions'

/**
 * Who is looking, at which chains — what the shared hooks (`useBook`, `useLiteMenu`) need from the
 * app around them. The web fills it from its hash route and wallet (`AppState`) and its paper
 * account (`Paper`); the phone from its own. One context, so the hooks never import either app.
 */
export interface Session {
  /** every chain in scope, resolved — never empty */
  chainIds: string[]
  /** the address whose money the screens show: the connected wallet or the "view as" address */
  account?: string
  /** the connected Solana wallet, read when `account` is an EVM one */
  solSigner?: string
  /** set when the screens show someone else's address */
  viewAs?: string
  /** a paper account (tickets/0006) — its ledger stands in for the chain; absent where there is none */
  paper?: PaperBook | null
}

/** What `useBook` reads from a paper account. */
export interface PaperBook {
  active: boolean
  ledger: unknown
  holdings: Holding[]
  idle: (chainIds: string[]) => Idle[]
}

const Ctx = React.createContext<Session | null>(null)

export function SessionProvider({ value, children }: { value: Session; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useSession = () => {
  const c = React.useContext(Ctx)
  if (!c) throw new Error('SessionProvider missing')
  return c
}
