// first: hands the build's VITE_* service URLs to core before any module that fetches
import './env'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from './wallet/wagmi'
import { AppProvider } from './state/AppState'
import { SettingsProvider } from '@yieldcircle/app/state/Settings'
import { SessionBridge } from './state/session'
import { WebPlatform } from './state/platform'
import { PaperProvider } from './state/Paper'
import { PaperSignInHost } from './ui/PaperSignIn'
import { configureTrace, initTxTrace } from '@yieldcircle/app/sdk/txTrace'
import App from './App'
import { GateBridge } from './wallet/GateBridge'
import '@yieldcircle/design/index.css'
import './styles/app.css'
import './styles/lite.css'
// a 429 has already waited out the backend's `retryAfter` and tried again inside `http.ts`; retrying it here too only spends the limit
const qc = new QueryClient({ defaultOptions: { queries: { retry: (n, e) => n < 1 && (e as { status?: number })?.status !== 429, refetchOnWindowFocus: false } } })
// every transaction a reload interrupted is picked up again, before anything renders
// the trace store reads EVM receipts through this app's wagmi config (its rotating RPCs)
configureTrace({ evm: (chainId) => wagmiConfig.getClient({ chainId: chainId as (typeof wagmiConfig)['chains'][number]['id'] }) })
initTxTrace(qc)
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <WebPlatform><SettingsProvider><AppProvider><PaperProvider><SessionBridge><App /><GateBridge /><PaperSignInHost /></SessionBridge></PaperProvider></AppProvider></SettingsProvider></WebPlatform>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)
