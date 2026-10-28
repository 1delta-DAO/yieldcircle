import React from 'react'
import { Platform } from 'react-native'
import { useAccount } from 'wagmi'
import { SessionProvider } from '@yieldcircle/app/session'
import { isSvmChain } from '@yieldcircle/core/model/address'
import { useChains } from './chains'

/**
 * The phone's side of the shared hooks' session (packages/app/src/session.tsx): the chains picked on
 * You (`useChains`, every chain until one is), the connected EVM wallet. No paper account and no
 * Solana wallet on the phone yet.
 */
/** The web's `?as=0x…` (read an address without its wallet) — in the browser render only, where the app is compared against the web. */
const VIEW_AS = Platform.OS === 'web' ? new URLSearchParams((globalThis as { location?: { search?: string } }).location?.search ?? '').get('as')?.toLowerCase() ?? undefined : undefined

export function PhoneSession({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount()
  const { chainIds } = useChains()
  const value = React.useMemo(() => {
    const account = VIEW_AS ?? address?.toLowerCase()
    // no Solana wallet on the phone yet: an EVM chain acts for the account read (the web's `actorOn`), Solana has none
    return { chainIds, account, viewAs: VIEW_AS, paper: null, isConnected, actorOn: (chainId: string | undefined) => (isSvmChain(chainId) ? undefined : account) }
  }, [address, isConnected, chainIds.join(',')])
  return <SessionProvider value={value}>{children}</SessionProvider>
}
