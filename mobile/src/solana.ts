import React from 'react'
import { Linking } from 'react-native'
import { useSnapshot } from 'valtio'
import { ConnectionsController } from '@reown/appkit-core-react-native'
import { base58Decode, base58Encode } from '@yieldcircle/core/model/address'
import { sendTransaction } from '@yieldcircle/core/sdk/solRpc'
import { appKit } from './appkit'

/**
 * The phone's Solana wallet: the web's `wallet/solana.ts` (the Wallet Standard) has no window to
 * live in here, so it is AppKit's Solana connection (`src/appkit.ts`). Two kinds carry it:
 *
 * - **WalletConnect** — a multichain wallet's session (Trust, Phantom, …), the same one that may
 *   carry the EVM account. Transactions go base64, as the WalletConnect Solana RPC has them; a
 *   wallet that did not approve `solana_signAndSendTransaction` signs and this app broadcasts.
 * - **Phantom / Solflare deep links** — their own encrypted protocol, beside any EVM wallet.
 *   Transactions go base58; the provider opens the wallet itself and reads the answer off the
 *   `yieldcircle://?nonce=…&data=…` it comes back on (`app/+native-intent.tsx` lets it pass).
 *
 * One account per VM, as on the web: this is the Solana one, wagmi keeps the EVM one. It is read off
 * AppKit's connections by namespace, not its "active" account: AppKit has one active namespace, and
 * disconnecting the EVM wallet leaves it on `eip155` with the Solana connection still there.
 */
const MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'

interface Req { request: <T>(args: { method: string; params: unknown }, chain?: string) => Promise<T> }
interface WcProvider extends Req {
  client: unknown
  session?: {
    namespaces?: Record<string, { accounts?: string[]; methods?: string[] }>
    peer?: { metadata?: { redirect?: { native?: string; universal?: string } } }
  }
}
const connection = () => ConnectionsController.state.connections.get('solana')
const provider = () => appKit.getProvider('solana') as unknown as (Req | WcProvider) | null
/** carried by the WalletConnect session (a `UniversalProvider`); otherwise Phantom's or Solflare's deep links */
const isWc = (_p: Req | WcProvider): _p is WcProvider => connection()?.adapter.connector?.type === 'walletconnect'

const wcSol = (p: WcProvider) => p.session?.namespaces?.solana
const wcPubkey = (p: WcProvider) => wcSol(p)?.accounts?.[0]?.split(':')[2] ?? ''
/** the wallet shows a WalletConnect request only once it is in front: its own redirect, opened in the tap (before any await) */
function bringForward(p: WcProvider) {
  const r = p.session?.peer?.metadata?.redirect
  const url = r?.native || r?.universal
  if (url) void Linking.openURL(url).catch(() => {})
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
function sigBytes(s: string | undefined): Uint8Array {
  const b = s ? base58Decode(s) : null
  if (!b || b.length !== 64) throw new Error('the wallet returned no signature')
  return b
}
/**
 * The fee payer's signature written into the unsigned wire bytes: the older WalletConnect answer to
 * `solana_signTransaction` is the signature alone. Signatures lead the wire format (a compact-u16
 * count, then 64 bytes each), the fee payer's first.
 */
function withFeePayerSig(tx: Uint8Array, sig: Uint8Array): Uint8Array {
  if (tx[0] === 0 || tx[0] >= 0x80) throw new Error('the transaction has no signature slot for the wallet')
  const out = tx.slice()
  out.set(sig, 1)
  return out
}

/**
 * Sign and send one serialized transaction → its signature. The blob PERISHES (~60–90 s
 * blockhash): on an expiry error the caller rebuilds it, as on the web.
 */
export async function solSignAndSend(tx: Uint8Array): Promise<Uint8Array> {
  const p = provider()
  if (!p) throw new Error('connect a Solana wallet first')
  if (!isWc(p)) {
    const r = await p.request<{ signature?: string }>({ method: 'solana_signAndSendTransaction', params: { transaction: base58Encode(tx) } })
    return sigBytes(r.signature)
  }
  const pubkey = wcPubkey(p)
  const params = { transaction: toB64(tx), pubkey }
  bringForward(p)
  if (wcSol(p)?.methods?.includes('solana_signAndSendTransaction')) {
    const r = await p.request<{ signature?: string }>({ method: 'solana_signAndSendTransaction', params }, MAINNET)
    return sigBytes(r.signature)
  }
  // signs only: the newer answer is the signed transaction, the older the signature alone
  const r = await p.request<{ signature?: string; transaction?: string }>({ method: 'solana_signTransaction', params }, MAINNET)
  const signed = r.transaction ? fromB64(r.transaction) : withFeePayerSig(tx, sigBytes(r.signature))
  return sigBytes(await sendTransaction(toB64(signed)))
}

/** ed25519 over a UTF-8 message → its signature: a Solana author's social writes (`app/social/sign.ts`). */
export async function solSignMessage(message: string): Promise<Uint8Array> {
  const p = provider()
  if (!p) throw new Error('connect a Solana wallet first')
  const bytes = new TextEncoder().encode(message)
  if (!isWc(p)) {
    const r = await p.request<{ signature?: string }>({ method: 'solana_signMessage', params: { message: bytes, display: 'utf8' } })
    return sigBytes(r.signature)
  }
  bringForward(p)
  const r = await p.request<{ signature?: string }>({ method: 'solana_signMessage', params: { message: base58Encode(bytes), pubkey: wcPubkey(p) } }, MAINNET)
  return sigBytes(r.signature)
}

/**
 * The connected Solana account (`Platform.useSol`): AppKit's connection in the `solana` namespace,
 * whichever wallet carries it, and that wallet's name. `viaEvm` — the same WalletConnect session
 * carries the EVM account too, so disconnecting one disconnects both.
 */
export function useSolAccount(): { account: { address: string } | null; wallet?: string; viaEvm: boolean } {
  const { connections } = useSnapshot(ConnectionsController.state)
  const c = connections.get('solana')
  const address = c?.accounts[0]?.split(':')[2]
  const wallet = c?.wallet?.name
  const viaEvm = !!c && connections.get('eip155')?.adapter.connector === c.adapter.connector
  return React.useMemo(() => ({ account: address ? { address } : null, wallet, viaEvm }), [address, wallet, viaEvm])
}

/** Disconnect the Solana wallet (and, when one WalletConnect session carries both, the EVM one with it). */
export const disconnectSol = () => appKit.disconnect('solana')
