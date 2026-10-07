import React from 'react'
import { useAccount, useConfig } from 'wagmi'
import { getAccount, signMessage } from 'wagmi/actions'
import { ConnectSheet } from './ConnectSheet'
import { openWallet } from './deeplink'
import { isSolAddr } from '../model/address'
import { solAddress, solSignMessage, useSolWallet } from './solana'

/**
 * The beta gate's way into THIS app's wallet stack (tickets/0002).
 *
 * The gate overlay (`gate/page.ts`) is a plain inline script with no bundle, so
 * on its own it only speaks EIP-1193 — which a phone browser does not have.
 * Sending the visitor into MetaMask's in-app browser would sign them in THERE,
 * with the cookie in a browser they do not otherwise use. Instead the overlay
 * borrows the app's own connect sheet — the injected EVM wallets by name,
 * WalletConnect (deep links on a phone, a QR code on a desktop), and the
 * Solana wallets — through `window.ycGate`:
 *
 *   connect() → the sheet opens, always: a wallet the app reconnected by
 *               itself is offered there as "Continue with …", never taken
 *               unasked. Resolves with the address the visitor picks or
 *               newly connects, EVM or Solana; rejects when the sheet is
 *               closed without one
 *   sign(msg) → personal_sign through the EVM wallet, or ed25519 over the
 *               UTF-8 text through the Solana one, both as hex. Call it
 *               straight from a tap: it foregrounds the wallet app first
 *               (`openWallet`), which iOS only allows while the gesture is live.
 *
 * Registered whenever the gate is on the page.
 */
interface GateWallet {
  connect: () => Promise<string>
  /** `who` is the address `connect()` answered: it picks the VM that signs */
  sign: (message: string, who: string) => Promise<string>
}
const toHex = (b: Uint8Array) => '0x' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
declare global { interface Window { ycGate?: GateWallet } }

/** `had`: the addresses connected when the sheet opened — only a NEW one, or an explicit pick, answers */
type Pending = { resolve: (a: string) => void; reject: (e: Error) => void; had: string[] }

export function GateBridge() {
  const config = useConfig()
  const { address } = useAccount()
  const sol = useSolWallet().account?.address
  const [pending, setPending] = React.useState<Pending>()

  React.useEffect(() => {
    if (!document.getElementById('yc-gate')) return
    window.ycGate = {
      connect: () => new Promise<string>((resolve, reject) => {
        setPending({ resolve, reject, had: [getAccount(config).address, solAddress()].filter((x): x is string => !!x) })
      }),
      sign: (message, who) => {
        if (isSolAddr(who)) return solSignMessage(message).then(toHex)
        const { address: account, connector } = getAccount(config)
        if (!account) return Promise.reject(new Error('Connect a wallet first.'))
        openWallet(connector?.id)
        return signMessage(config, { account, message })
      },
    }
    return () => { delete window.ycGate }
  }, [config])

  // a wallet connected while the sheet is up is the pick; one that was already there needs the button
  React.useEffect(() => {
    if (!pending) return
    const a = [address, sol].find((x) => x && !pending.had.includes(x))
    if (a) { pending.resolve(a); setPending(undefined) }
  }, [pending, address, sol])

  if (!pending) return null
  return <ConnectSheet onPick={(a) => { pending.resolve(a); setPending(undefined) }} onClose={() => { pending.reject(new Error('No wallet connected.')); setPending(undefined) }} />
}
