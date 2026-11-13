import React from 'react'
import { Platform } from 'react-native'
import { useAccount } from 'wagmi'
import { SessionProvider } from '@yieldcircle/app/session'
import { isEvmAddr, isSvmChain } from '@yieldcircle/core/model/address'
import { useChains } from './chains'
import { usePaper } from './paper'
import { useSolAccount } from './solana'

/**
 * The phone's side of the shared hooks' session (packages/app/src/session.tsx): the chains picked on
 * You (`useChains`, every chain until one is), and who is looking — the paper account while one is
 * signed in (`src/paper.tsx`: its ledger is the book, its Solana key acts on Solana), else the
 * connected wallets: the EVM one leads, the Solana one (`src/solana.ts`) acts on Solana and is "you"
 * for a Solana-only user — the web's `AppState`.
 */
/** The web's `?as=0x…` (read an address without its wallet) — in the browser render only, where the app is compared against the web. */
const VIEW_AS = Platform.OS === 'web' ? new URLSearchParams((globalThis as { location?: { search?: string } }).location?.search ?? '').get('as')?.toLowerCase() ?? undefined : undefined

export function PhoneSession({ children }: { children: React.ReactNode }) {
  const { address, isConnected } = useAccount()
  const { chainIds } = useChains()
  const paper = usePaper()
  const sol = useSolAccount().account?.address
  const k = paper.active ? paper.session : null
  const value = React.useMemo(() => {
    if (k) {
      const book = { active: true, ledger: paper.ledger, holdings: paper.holdings, idle: paper.idle, session: { evm: k.evm }, price: paper.price, act: paper.act }
      return { chainIds, account: k.evm, solSigner: k.sol, paper: book, isConnected: true, actorOn: (chainId: string | undefined) => (isSvmChain(chainId) ? k.sol : k.evm) }
    }
    // a Solana-only user is still "somebody" everywhere a screen shows you to yourself — but never an EVM sender or receiver
    const account = VIEW_AS ?? address?.toLowerCase() ?? sol
    // the signer acts, never VIEW_AS (docs/security-review-2026-11.md #1)
    const actorOn = (chainId: string | undefined) => (isSvmChain(chainId) ? sol : isEvmAddr(address) ? address.toLowerCase() : undefined)
    return { chainIds, account, solSigner: sol, viewAs: VIEW_AS, paper: null, isConnected: isConnected || !!sol, actorOn }
  }, [address, isConnected, sol, chainIds.join(','), k, paper.ledger, paper.holdings, paper.idle, paper.price, paper.act])
  return <SessionProvider value={value}>{children}</SessionProvider>
}
