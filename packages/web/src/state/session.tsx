import React from 'react'
import { SessionProvider } from '@yieldcircle/app/session'
import { useApp } from './AppState'
import { usePaper } from './Paper'

/** The web's side of the shared hooks' session: the hash route's chains and account, the paper account. */
export function SessionBridge({ children }: { children: React.ReactNode }) {
  const { chainIds, account, solSigner, viewAs, isConnected, actorOn } = useApp()
  const paper = usePaper()
  const value = React.useMemo(() => ({ chainIds, account, solSigner, viewAs, paper, isConnected, actorOn }), [chainIds, account, solSigner, viewAs, paper, isConnected, actorOn])
  return <SessionProvider value={value}>{children}</SessionProvider>
}
