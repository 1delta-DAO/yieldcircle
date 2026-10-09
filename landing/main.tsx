import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '../src/wallet/wagmi'
import { AppProvider } from '../src/state/AppState'
import { SettingsProvider } from '../src/state/Settings'
import { GateBridge } from '../src/wallet/GateBridge'
import { Landing } from './Landing'
import '@yieldcircle/design/index.css'

// The landing's own entry (`vite.config.ts` beside it): the page and the app's wallet stack, which
// the gate's card borrows to connect (`GateBridge`) — no shell, no routes, no transactions.
const qc = new QueryClient({ defaultOptions: { queries: { retry: (n, e) => n < 1 && (e as { status?: number })?.status !== 429, refetchOnWindowFocus: false } } })
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <SettingsProvider><AppProvider><Landing /><GateBridge /></AppProvider></SettingsProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)
