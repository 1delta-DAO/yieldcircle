import React from 'react'
import { useAccount, useConfig } from 'wagmi'
import { getAccount, signMessage } from 'wagmi/actions'
import { ConnectSheet } from './ConnectSheet'
import { openWallet } from './deeplink'
import { HAS_WC } from './wc'

/**
 * The beta gate's way into THIS app's wallet stack (tickets/0002).
 *
 * The gate overlay (`gate/page.ts`) is a plain inline script with no bundle, so
 * on its own it only speaks EIP-1193 — which a phone browser does not have.
 * Sending the visitor into MetaMask's in-app browser would sign them in THERE,
 * with the cookie in a browser they do not otherwise use. Instead the overlay
 * borrows the app's own connect sheet (WalletConnect deep links on a phone, a
 * QR code on a desktop without an extension) through `window.ycGate`:
 *
 *   connect() → the sheet opens; resolves with the address once connected,
 *               rejects when the sheet is closed without one
 *   sign(msg) → personal_sign through the connected wallet. Call it straight
 *               from a tap: it foregrounds the wallet app first (`openWallet`),
 *               which iOS only allows while the gesture is live.
 *
 * Registered only when the gate is on the page and WalletConnect is
 * configured; the overlay keeps its own injected path either way.
 */
interface GateWallet {
  connect: () => Promise<string>
  sign: (message: string) => Promise<string>
}
declare global { interface Window { ycGate?: GateWallet } }

type Pending = { resolve: (a: string) => void; reject: (e: Error) => void }

export function GateBridge() {
  const config = useConfig()
  const { address } = useAccount()
  const [pending, setPending] = React.useState<Pending>()

  React.useEffect(() => {
    if (!HAS_WC || !document.getElementById('yc-gate')) return
    window.ycGate = {
      connect: () => new Promise<string>((resolve, reject) => {
        const a = getAccount(config).address
        if (a) resolve(a)
        else setPending({ resolve, reject })
      }),
      sign: (message) => {
        const { address: account, connector } = getAccount(config)
        if (!account) return Promise.reject(new Error('Connect a wallet first.'))
        openWallet(connector?.id)
        return signMessage(config, { account, message })
      },
    }
    return () => { delete window.ycGate }
  }, [config])

  React.useEffect(() => {
    if (pending && address) { pending.resolve(address); setPending(undefined) }
  }, [pending, address])

  if (!pending) return null
  return <ConnectSheet onClose={() => { pending.reject(new Error('No wallet connected.')); setPending(undefined) }} />
}
