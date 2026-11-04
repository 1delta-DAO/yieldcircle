import React from 'react'
import { Linking } from 'react-native'
import { useSwitchChain } from 'wagmi'
import { getConnections } from 'wagmi/actions'
import { PlatformProvider, type Platform } from '@yieldcircle/app/platform'
import { wagmiAdapter } from './appkit'
import { usePaperSigner } from './paper'
import { solSignAndSend, solSignMessage, useSolAccount } from './solana'

/**
 * The wallet a request went to, brought forward: the WalletConnect session's own redirect (the
 * wallet publishes it on connect), opened as a link. After the first connect no new `wc:` uri
 * comes — every later request rides the session, and the wallet only shows it once it is in front.
 */
async function openWallet(connectorId?: string) {
  try {
    const c = getConnections(wagmiAdapter.wagmiConfig).find((x) => !connectorId || x.connector.id === connectorId)?.connector
    const provider = (await c?.getProvider()) as { session?: { peer?: { metadata?: { redirect?: { native?: string; universal?: string } } } } } | undefined
    const r = provider?.session?.peer?.metadata?.redirect
    const url = r?.native || r?.universal
    if (url) await Linking.openURL(url)
  } catch { /* the wallet shows the request when it is next opened */ }
}

const usePhoneSwitchTo = () => {
  const { switchChainAsync, isPending } = useSwitchChain()
  return { switchTo: async (chainId: number) => { await switchChainAsync({ chainId }) }, switching: isPending }
}

/** The phone's side of the shared ticket machinery (`@yieldcircle/app/platform`). */
const PHONE: Platform = {
  // the SQLite-backed localStorage (`expo-sqlite/localStorage/install`): it survives a trip to the wallet app
  scratch: { get: (k) => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v), remove: (k) => localStorage.removeItem(k) },
  openWallet: (id) => { void openWallet(id) },
  // every wallet on the phone is another app (WalletConnect)
  isRemote: () => true,
  useSwitchTo: usePhoneSwitchTo,
  // AppKit's Solana connection: a WalletConnect session or Phantom's / Solflare's deep links (src/solana.ts)
  useSol: useSolAccount,
  solSignAndSend,
  solSignMessage,
  // the paper account's key signs social writes: there is no connector to carry it on the phone
  useLocalSigner: usePaperSigner,
  // the web's closed-beta gate is a cookie the gate service sets; the phone has no gate yet (owner's call)
  gated: () => false,
}

export function PhonePlatform({ children }: { children: React.ReactNode }) {
  return <PlatformProvider value={PHONE}>{children}</PlatformProvider>
}
