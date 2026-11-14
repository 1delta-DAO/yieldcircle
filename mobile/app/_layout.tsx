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
import React from 'react'
import { AppState, View } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { AppKit, AppKitProvider } from '@reown/appkit-react-native'
import { SettingsProvider } from '@yieldcircle/app/state/Settings'
import { BookProvider } from '@yieldcircle/app/book'
import { LiteMenuProvider } from '@yieldcircle/app/lite'
import { appKit, wagmiAdapter } from '../src/appkit'
import { PhoneSession } from '../src/session'
import { PhonePaper } from '../src/paper'
import { PhonePlatform } from '../src/platform'
import { PhoneNav } from '../src/nav'
import { BridgeReminders } from '../src/feel'
import { AppTabBar } from '../src/ui/TabBar'
import { configureTrace, initTxTrace, resumeTraces } from '@yieldcircle/app/sdk/txTrace'
import { C } from '../src/theme'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } })
// every transaction followed to final and re-read, through this app's wagmi config (app/sdk/txTrace)
configureTrace({ evm: (chainId) => wagmiAdapter.wagmiConfig.getClient({ chainId: chainId as never }) })
initTxTrace(queryClient)

const header = { headerStyle: { backgroundColor: C.bg }, headerTintColor: C.tx, headerShadowVisible: false, contentStyle: { backgroundColor: C.bg } }

export default function RootLayout() {
  // the web's Plex, before the first word is drawn: no flash of the system font
  const [fonts] = useFonts(FONTS)
  // every signature is a trip to the wallet app: what was on its way is looked at again on the way back
  React.useEffect(() => { const sub = AppState.addEventListener('change', (s) => { if (s === 'active') resumeTraces() }); return () => sub.remove() }, [])
  if (!fonts) return null
  return (
    <AppKitProvider instance={appKit}>
      <WagmiProvider config={wagmiAdapter.wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <PhonePlatform>
          <PhoneNav>
          <SettingsProvider>
            <PhonePaper>
            <PhoneSession>
            {/* one book and one menu for every page: the header, each tab and each sheet read these, not their own (docs/mobile-perf.md) */}
            <BookProvider>
            <LiteMenuProvider>
              <StatusBar style="light" />
              {/* a tap as an action ends, a reminder when a bridge lands while the app is away (src/feel.tsx) */}
              <BridgeReminders />
              {/* one tab bar under every page, pushed ones too: the anchor home (src/ui/TabBar.tsx) */}
              <AppTabBar>
              <Stack screenOptions={{ ...header, headerShown: false }}>
                <Stack.Screen name="strategy/[id]" options={{ presentation: 'modal', headerShown: false, contentStyle: { backgroundColor: 'transparent' } }} />
                <Stack.Screen name="you" options={{ headerShown: false }} />
                <Stack.Screen name="profile" options={{ headerShown: false }} />
                <Stack.Screen name="position" options={{ headerShown: false }} />
                <Stack.Screen name="made" options={{ headerShown: false }} />
                <Stack.Screen name="paper-book" options={{ headerShown: false }} />
                <Stack.Screen name="activity" options={{ headerShown: false }} />
                <Stack.Screen name="receipt" options={{ presentation: 'fullScreenModal', animation: 'fade', headerShown: false }} />
                <Stack.Screen name="details" options={{ ...header, headerShown: true, title: 'Details' }} />
                <Stack.Screen name="probe" options={{ ...header, headerShown: true, title: 'Wallet probe' }} />
              </Stack>
              </AppTabBar>
              {/* absolute: with Expo Router the modal does not open on Android otherwise (Reown's documented workaround) */}
              <View pointerEvents="box-none" style={{ position: 'absolute', height: '100%', width: '100%' }}>
                <AppKit />
              </View>
            </LiteMenuProvider>
            </BookProvider>
            </PhoneSession>
            </PhonePaper>
          </SettingsProvider>
          </PhoneNav>
          </PhonePlatform>
        </QueryClientProvider>
      </WagmiProvider>
    </AppKitProvider>
  )
}
