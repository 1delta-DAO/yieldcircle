import React from 'react'
import { Platform } from 'react-native'
import { useAccount } from 'wagmi'
import { SessionProvider } from '@yieldcircle/app/session'
import { CHAINS } from '@yieldcircle/app/sdk/queries'
import { isSvmChain } from '@yieldcircle/core/model/address'

/**
 * The phone's side of the shared hooks' session (packages/app/src/session.tsx): every chain the
 * app offers, the connected EVM wallet. No paper account and no Solana wallet on the phone yet.
 */
const ALL = CHAINS.map((c) => c.id)
/** The web's `?as=0x…` (read an address without its wallet) — in the browser render only, where the app is compared against the web. */
const VIEW_AS = Platform.OS === 'web' ? new URLSearchParams((globalThis as { location?: { search?: string } }).location?.search ?? '').get('as')?.toLowerCase() ?? undefined : undefined

export function PhoneSession({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount()
  const value = React.useMemo(() => {
    const account = VIEW_AS ?? address?.toLowerCase()
    // no Solana wallet on the phone yet: an EVM chain acts for the account read (the web's `actorOn`), Solana has none
    return { chainIds: ALL, account, viewAs: VIEW_AS, paper: null, isConnected, actorOn: (chainId: string | undefined) => (isSvmChain(chainId) ? undefined : account) }
  }, [address, isConnected])
  return <SessionProvider value={value}>{children}</SessionProvider>
}
