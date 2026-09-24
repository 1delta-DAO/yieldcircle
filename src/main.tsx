import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from './wallet/wagmi'
import { AppProvider } from './state/AppState'
import { SettingsProvider } from './state/Settings'
import App from './App'
import './styles/app.css'
const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } })
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <SettingsProvider><AppProvider><App /></AppProvider></SettingsProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)
