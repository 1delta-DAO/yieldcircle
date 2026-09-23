import React from 'react'
import { useAccount, useConnect } from 'wagmi'
import { openWithUri, rememberRedirect } from './deeplink'
import type { WalletEntry } from './wallets'

/**
 * The connect state machine, and the one piece wagmi does not hand you: the
 * pairing uri.
 *
 * With `showQrModal: false` the WalletConnect connector emits `display_uri` and
 * expects the app to do something with it. On a phone that something is a deep
 * link into the wallet; on a desktop it is a QR code. Either way the uri has to
 * be captured BEFORE `connect()` resolves, so the listener is attached up front
 * rather than in response to the click.
 */
export type ConnectPhase = 'idle' | 'waiting' | 'error'

export function useConnectFlow() {
  const { connect, connectors, isPending, error, reset } = useConnect()
  const { isConnected, connector: active } = useAccount()
  const [uri, setUri] = React.useState<string>()
  const [picked, setPicked] = React.useState<WalletEntry>()

  const wc = connectors.find((c) => c.id === 'walletConnect')
  const injected = connectors.find((c) => c.id !== 'walletConnect')

  // `message` carries `display_uri`; the emitter is on the connector, not the hook
  React.useEffect(() => {
    if (!wc) return
    const onMsg = (m: { type: string; data?: unknown }) => {
      if (m.type === 'display_uri' && typeof m.data === 'string') setUri(m.data)
    }
    const e = wc.emitter as unknown as { on: (k: string, f: typeof onMsg) => void; off: (k: string, f: typeof onMsg) => void }
    e.on('message', onMsg)
    return () => e.off('message', onMsg)
  }, [wc])

  /**
   * Cache the wallet's own redirect target the moment a session exists. Every
   * later hand-off reads it synchronously out of a click handler, so it cannot
   * be fetched at the time it is needed.
   */
  React.useEffect(() => {
    if (!isConnected || active?.id !== 'walletConnect') return
    let done = false
    void (async () => {
      try {
        const p = (await active.getProvider()) as { session?: { peer?: { metadata?: { redirect?: { native?: string; universal?: string } } } } }
        if (!done) rememberRedirect(p?.session?.peer?.metadata?.redirect)
      } catch { /* the table in wallets.ts is the fallback */ }
    })()
    return () => { done = true }
  }, [isConnected, active])

  /** The first hand-off: connect, then follow the uri into the wallet app. */
  const pick = React.useCallback((entry: WalletEntry) => {
    if (!wc) return
    setPicked(entry)
    setUri(undefined)
    connect({ connector: wc })
  }, [connect, wc])

  // the uri arrives asynchronously, so the navigation happens when it does
  React.useEffect(() => {
    if (picked && uri) openWithUri(picked, uri)
  }, [picked, uri])

  /**
   * Re-open with the SAME uri. A fresh pairing would invalidate the one the
   * wallet may already be showing, and iOS drops the first hand-off often
   * enough that this is the difference between recoverable and stuck.
   */
  const reopen = React.useCallback(() => {
    if (picked && uri) openWithUri(picked, uri)
  }, [picked, uri])

  const cancel = React.useCallback(() => { setPicked(undefined); setUri(undefined); reset() }, [reset])

  const phase: ConnectPhase = error ? 'error' : picked || isPending ? 'waiting' : 'idle'
  return { connect, connectors, injected, wc, uri, picked, phase, isPending, error, pick, reopen, cancel }
}
