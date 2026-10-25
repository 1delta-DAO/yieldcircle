// Order matters: polyfills, then the environment, then anything that fetches or connects.
import '@walletconnect/react-native-compat'
import 'react-native-url-polyfill/auto' // core builds requests with `new URL(path, base)`
import '../src/env'

import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { AppKit, AppKitProvider } from '@reown/appkit-react-native'
import { appKit, wagmiAdapter } from '../src/appkit'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } })

export default function RootLayout() {
  return (
    <AppKitProvider instance={appKit}>
      <WagmiProvider config={wagmiAdapter.wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }} />
          {/* absolute: with Expo Router the modal does not open on Android otherwise (Reown's documented workaround) */}
          <View pointerEvents="box-none" style={{ position: 'absolute', height: '100%', width: '100%' }}>
            <AppKit />
          </View>
        </QueryClientProvider>
      </WagmiProvider>
    </AppKitProvider>
  )
}
