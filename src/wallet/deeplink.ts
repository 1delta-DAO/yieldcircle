import { readTouch } from '../ui/useViewport'
import { walletById, type WalletEntry } from './wallets'

/**
 * Foregrounding the wallet app.
 *
 * The thing that is easy to miss: after the first connect there is NO new `wc:`
 * uri. Every later `sendTransaction` and `signTypedData` travels the relay
 * session that already exists, and the wallet only shows it once the user
 * switches apps by hand. Without this module a phone user taps "Send", nothing
 * appears to happen, and they are expected to work out that the request is
 * waiting in another app.
 *
 * `openWallet()` must be called SYNCHRONOUSLY inside the click handler, before
 * the await — iOS only honours a navigation while the user gesture is live.
 */
const LAST = 'yc.v1.wallet.last'
const REDIRECT = 'yc.v1.wallet.redirect'

const read = (k: string) => { try { return localStorage.getItem(k) ?? undefined } catch { return undefined } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } }
const clear = (k: string) => { try { localStorage.removeItem(k) } catch { /* private mode */ } }

export const rememberWallet = (id: string) => write(LAST, id)
export const lastWallet = (): WalletEntry | undefined => walletById(read(LAST))
export const forgetWallet = () => { clear(LAST); clear(REDIRECT) }

/**
 * WalletConnect sessions carry the peer's own `redirect` in their metadata, and
 * it is more reliable than our table because the wallet published it. Cached
 * eagerly on connect so `openWallet` can read it without awaiting a provider.
 */
export const rememberRedirect = (r?: { native?: string; universal?: string } | null) => {
  const target = r?.universal || r?.native
  if (target) write(REDIRECT, target)
}

/** The stored target, preferring what the wallet told us over what we guessed. */
export function walletOpenUrl(): string | undefined {
  return read(REDIRECT) ?? lastWallet()?.open
}

/**
 * Bring the paired wallet forward. A no-op unless this is a WalletConnect
 * session on a touch device: on a desktop the wallet is an extension (already
 * in front) or a phone across the room, and navigating away would only lose the
 * page.
 */
export function openWallet(connectorId?: string): void {
  if (connectorId !== 'walletConnect') return
  if (!readTouch()) return
  const url = walletOpenUrl()
  if (!url) return
  try { window.location.href = url } catch { /* blocked: the user switches apps by hand */ }
}

/** The first hand-off, which DOES carry a pairing uri. */
export function openWithUri(entry: WalletEntry, uri: string): void {
  rememberWallet(entry.id)
  try { window.location.href = entry.connect(uri) } catch { /* the sheet keeps a Copy link */ }
}
