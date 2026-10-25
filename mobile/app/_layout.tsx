// Order matters: polyfills, then the environment, then anything that fetches or connects.
import '@walletconnect/react-native-compat'
import 'react-native-url-polyfill/auto' // core builds requests with `new URL(path, base)`
// a synchronous localStorage on SQLite: the shared settings and stores read it as the web does
import 'expo-sqlite/localStorage/install'
import '../src/env'

import { Stack } from 'expo-router'
import { useFonts } from 'expo-font'
import { FONTS } from '../src/fonts'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { AppKit, AppKitProvider } from '@reown/appkit-react-native'
import { SettingsProvider } from '@yieldcircle/app/state/Settings'
import { appKit, wagmiAdapter } from '../src/appkit'
import { PhoneSession } from '../src/session'
import { PhonePlatform } from '../src/platform'
import { configureTrace, initTxTrace } from '@yieldcircle/app/sdk/txTrace'
import { C } from '../src/theme'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } })
// every transaction followed to final and re-read, through this app's wagmi config (app/sdk/txTrace)
configureTrace({ evm: (chainId) => wagmiAdapter.wagmiConfig.getClient({ chainId: chainId as never }) })
initTxTrace(queryClient)

const header = { headerStyle: { backgroundColor: C.bg }, headerTintColor: C.tx, headerShadowVisible: false, contentStyle: { backgroundColor: C.bg } }

export default function RootLayout() {
  // the web's Plex, before the first word is drawn: no flash of the system font
  const [fonts] = useFonts(FONTS)
  if (!fonts) return null
  return (
    <AppKitProvider instance={appKit}>
      <WagmiProvider config={wagmiAdapter.wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <PhonePlatform>
          <SettingsProvider>
            <PhoneSession>
              <StatusBar style="light" />
              <Stack screenOptions={{ ...header, headerShown: false }}>
                <Stack.Screen name="strategy/[id]" options={{ presentation: 'modal', headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
                <Stack.Screen name="you" options={{ headerShown: false }} />
                <Stack.Screen name="details" options={{ ...header, headerShown: true, title: 'Details' }} />
                <Stack.Screen name="probe" options={{ ...header, headerShown: true, title: 'Wallet probe' }} />
              </Stack>
              {/* absolute: with Expo Router the modal does not open on Android otherwise (Reown's documented workaround) */}
              <View pointerEvents="box-none" style={{ position: 'absolute', height: '100%', width: '100%' }}>
                <AppKit />
              </View>
            </PhoneSession>
          </SettingsProvider>
          </PhonePlatform>
        </QueryClientProvider>
      </WagmiProvider>
    </AppKitProvider>
  )
}
