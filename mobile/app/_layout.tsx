// Order matters: polyfills, then the environment, then anything that fetches or connects.
import '@walletconnect/react-native-compat'
import 'react-native-url-polyfill/auto' // core builds requests with `new URL(path, base)`
// a synchronous localStorage on SQLite: the shared settings and stores read it as the web does
import 'expo-sqlite/localStorage/install'
import '../src/env'

import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { AppKit, AppKitProvider } from '@reown/appkit-react-native'
import { SettingsProvider } from '@yieldcircle/app/state/Settings'
import { appKit, wagmiAdapter } from '../src/appkit'
import { PhoneSession } from '../src/session'
import { C } from '../src/theme'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } })

const header = { headerStyle: { backgroundColor: C.bg }, headerTintColor: C.tx, headerShadowVisible: false, contentStyle: { backgroundColor: C.bg } }

export default function RootLayout() {
  return (
    <AppKitProvider instance={appKit}>
      <WagmiProvider config={wagmiAdapter.wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <SettingsProvider>
            <PhoneSession>
              <StatusBar style="light" />
              <Stack screenOptions={{ ...header, headerShown: false }}>
                <Stack.Screen name="strategy/[id]" options={{ ...header, headerShown: true, title: '', headerBackTitle: 'Back' }} />
                <Stack.Screen name="you" options={{ ...header, headerShown: true, title: 'You', presentation: 'modal' }} />
                <Stack.Screen name="probe" options={{ ...header, headerShown: true, title: 'Wallet probe' }} />
              </Stack>
              {/* absolute: with Expo Router the modal does not open on Android otherwise (Reown's documented workaround) */}
              <View pointerEvents="box-none" style={{ position: 'absolute', height: '100%', width: '100%' }}>
                <AppKit />
              </View>
            </PhoneSession>
          </SettingsProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </AppKitProvider>
  )
}
