// WalletConnect's React Native polyfills (crypto.getRandomValues, TextEncoder, …): first, before AppKit loads.
import '@walletconnect/react-native-compat'

import { Platform } from 'react-native'
import { createAppKit, solana } from '@reown/appkit-react-native'
import { WagmiAdapter } from '@reown/appkit-wagmi-react-native'
import { PhantomConnector, SolanaAdapter, SolflareConnector } from '@reown/appkit-solana-react-native'
import { mainnet, base, arbitrum, bsc, avalanche, optimism, hyperEvm, monad, plasma, polygon, arc, robinhood, stable, plumeMainnet } from 'wagmi/chains'
import { defineChain } from 'viem'
import { WC_PROJECT_ID } from './env'
import { storage } from './storage'

/** A wallet's answer coming back over a universal link (`app/+native-intent.tsx` keeps it from navigating). */
export const WALLET_RETURN = 'https://app.yieldcircle.io/wallet-return'

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

/**
 * Solana beside EVM: one account per VM, as on the web (`packages/web/src/wallet/solana.ts`). A
 * multichain wallet over WalletConnect (Trust, Phantom, …) approves both namespaces in one session;
 * Phantom and Solflare also connect on their own deep-link protocol, next to an EVM wallet over
 * WalletConnect — AppKit keeps one connection per namespace (`src/solana.ts` reads the Solana one).
 */
export const solanaAdapter = new SolanaAdapter()

export const appKit = createAppKit({
  projectId,
  networks: [...networks, solana],
  defaultNetwork: base,
  adapters: [wagmiAdapter, solanaAdapter],
  extraConnectors: [new PhantomConnector({ cluster: 'mainnet-beta' }), new SolflareConnector({ cluster: 'mainnet-beta' })],
  storage,
  metadata: {
    name: 'YieldCircle',
    description: 'everything you hold, earning',
    // must be an origin registered on the Reown project, or wallets warn "cannot verify domain"
    url: 'https://app.yieldcircle.io',
    icons: ['https://app.yieldcircle.io/icon-192.png'],
    // where the wallet sends the user back after approving (app.json `scheme`). On iOS also a
    // universal link on the same domain as `url` (app.json `associatedDomains`, the web's
    // `public/.well-known/apple-app-site-association`): Phantom's and Solflare's deep links prefer it
    // over the scheme, which any app can claim — a scanner can tie that return to app.yieldcircle.io.
    // Android keeps the scheme until `assetlinks.json` has the signing key (docs/mobile.md)
    redirect: { native: 'yieldcircle://', universal: Platform.OS === 'ios' ? WALLET_RETURN : undefined },
  },
  // the user's own wallet only: no AppKit email/social (embedded) accounts, swaps or onramp —
  // smart-account features come from the wallet (EIP-5792 / 7702), never from an SDK wallet
  features: { socials: false, swaps: false, onramp: false },
})
