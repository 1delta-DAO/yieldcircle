import React from 'react'
import { Platform } from 'react-native'
import { useAccount } from 'wagmi'
import { SessionProvider } from '@yieldcircle/app/session'
import { isSvmChain } from '@yieldcircle/core/model/address'
import { useChains } from './chains'
import { usePaper } from './paper'

/**
 * The phone's side of the shared hooks' session (packages/app/src/session.tsx): the chains picked on
 * You (`useChains`, every chain until one is), and who is looking — the paper account while one is
 * signed in (`src/paper.tsx`: its ledger is the book, its Solana key acts on Solana), else the
 * connected EVM wallet. No real Solana wallet on the phone yet.
 */
/** The web's `?as=0x…` (read an address without its wallet) — in the browser render only, where the app is compared against the web. */
const VIEW_AS = Platform.OS === 'web' ? new URLSearchParams((globalThis as { location?: { search?: string } }).location?.search ?? '').get('as')?.toLowerCase() ?? undefined : undefined

export function PhoneSession({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount()
  const { chainIds } = useChains()
  const paper = usePaper()
  const k = paper.active ? paper.session : null
  const value = React.useMemo(() => {
    if (k) {
      const book = { active: true, ledger: paper.ledger, holdings: paper.holdings, idle: paper.idle, session: { evm: k.evm }, price: paper.price, act: paper.act }
      return { chainIds, account: k.evm, solSigner: k.sol, paper: book, isConnected: true, actorOn: (chainId: string | undefined) => (isSvmChain(chainId) ? k.sol : k.evm) }
    }
    const account = VIEW_AS ?? address?.toLowerCase()
    // no Solana wallet on the phone yet: an EVM chain acts for the account read (the web's `actorOn`), Solana has none
    return { chainIds, account, viewAs: VIEW_AS, paper: null, isConnected, actorOn: (chainId: string | undefined) => (isSvmChain(chainId) ? undefined : account) }
  }, [address, isConnected, chainIds.join(','), k, paper.ledger, paper.holdings, paper.idle, paper.price, paper.act])
  return <SessionProvider value={value}>{children}</SessionProvider>
}
