import { createConfig, http } from 'wagmi'
import { mainnet, base, arbitrum, bsc, avalanche } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'
/** Injected first; WalletConnect when `VITE_WC_PROJECT_ID` is set (the only way a plain mobile browser signs). */
const wcId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined
export const wagmiConfig = createConfig({
  chains: [mainnet, base, arbitrum, bsc, avalanche],
  connectors: [
    injected(),
    ...(wcId ? [walletConnect({ projectId: wcId, showQrModal: true, metadata: { name: 'YieldCircle', description: 'everything you hold, earning', url: location.origin, icons: [`${location.origin}/icon-192.png`] } })] : []),
  ],
  transports: { [mainnet.id]: http(), [base.id]: http(), [arbitrum.id]: http(), [bsc.id]: http(), [avalanche.id]: http() },
})
