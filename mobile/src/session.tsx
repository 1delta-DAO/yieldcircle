import React from 'react'
import { useAccount } from 'wagmi'
import { SessionProvider } from '@yieldcircle/app/session'
import { CHAINS } from '@yieldcircle/app/sdk/queries'

/**
 * The phone's side of the shared hooks' session (packages/app/src/session.tsx): every chain the
 * app offers, the connected EVM wallet. No paper account and no Solana wallet on the phone yet.
 */
const ALL = CHAINS.map((c) => c.id)

export function PhoneSession({ children }: { children: React.ReactNode }) {
  const { address } = useAccount()
  const value = React.useMemo(() => ({ chainIds: ALL, account: address?.toLowerCase(), paper: null }), [address])
  return <SessionProvider value={value}>{children}</SessionProvider>
}
