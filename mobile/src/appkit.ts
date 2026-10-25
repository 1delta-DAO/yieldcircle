// WalletConnect's React Native polyfills (crypto.getRandomValues, TextEncoder, …): first, before AppKit loads.
import '@walletconnect/react-native-compat'

import { createAppKit } from '@reown/appkit-react-native'
import { WagmiAdapter } from '@reown/appkit-wagmi-react-native'
import { mainnet, base, arbitrum, bsc, avalanche, optimism, hyperEvm, monad, plasma, polygon, arc, robinhood, stable, plumeMainnet } from 'wagmi/chains'
import { defineChain } from 'viem'
import { WC_PROJECT_ID } from './env'
import { storage } from './storage'

/**
 * The web's chain list (packages/web/src/wallet/wagmi.ts, which explains Tempo's hand-written
 * definition). Kept in step by hand until the list moves into a shared package.
 */
const tempo = defineChain({
  id: 4217,
  name: 'Tempo',
  nativeCurrency: { name: 'USD', symbol: 'USD', decimals: 6 },
  rpcUrls: { default: { http: ['https://rpc.tempo.xyz'] } },
  blockExplorers: { default: { name: 'Tempo Explorer', url: 'https://explore.tempo.xyz' } },
})
const networks = [mainnet, base, arbitrum, bsc, avalanche, optimism, hyperEvm, monad, plasma, polygon, arc, robinhood, tempo, stable, plumeMainnet] as const

// WalletConnect refuses an empty project id; a placeholder lets the app start and show what is missing
const projectId = WC_PROJECT_ID ?? 'missing-EXPO_PUBLIC_WC_PROJECT_ID'

export const wagmiAdapter = new WagmiAdapter({ projectId, networks: [...networks] })

export const appKit = createAppKit({
  projectId,
  networks: [...networks],
  defaultNetwork: base,
  adapters: [wagmiAdapter],
  storage,
  metadata: {
    name: 'YieldCircle',
    description: 'everything you hold, earning',
    // must be an origin registered on the Reown project, or wallets warn "cannot verify domain"
    url: 'https://app.yieldcircle.io',
    icons: ['https://app.yieldcircle.io/icon-192.png'],
    // where the wallet sends the user back after approving (app.json `scheme`)
    redirect: { native: 'yieldcircle://' },
  },
  // the user's own wallet only: no AppKit email/social (embedded) accounts, swaps or onramp —
  // smart-account features come from the wallet (EIP-5792 / 7702), never from an SDK wallet
  features: { socials: false, swaps: false, onramp: false },
})
