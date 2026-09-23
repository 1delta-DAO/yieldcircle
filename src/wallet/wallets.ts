/**
 * The wallets a phone can be handed off to, and how.
 *
 * UNIVERSAL LINKS ONLY, never a custom scheme: on iOS `metamask://…` raises a
 * "Cannot Open Page" dialog when the app is not installed, while the https link
 * falls through to the App Store. The cost is that each entry is a vendor's
 * published link format rather than something derivable.
 *
 * `connect` takes a fresh pairing uri. `open` only foregrounds the app, which
 * is what every step AFTER the first connect needs — see `deeplink.ts`.
 */
export interface WalletEntry {
  id: string
  name: string
  connect: (uri: string) => string
  open: string
}

const link = (base: string) => (uri: string) => `${base}${encodeURIComponent(uri)}`

export const WALLETS: WalletEntry[] = [
  { id: 'metamask', name: 'MetaMask', connect: link('https://metamask.app.link/wc?uri='), open: 'https://metamask.app.link/' },
  { id: 'rainbow', name: 'Rainbow', connect: link('https://rnbwapp.com/wc?uri='), open: 'https://rnbwapp.com/' },
  { id: 'trust', name: 'Trust', connect: link('https://link.trustwallet.com/wc?uri='), open: 'https://link.trustwallet.com/' },
  { id: 'coinbase', name: 'Coinbase Wallet', connect: link('https://go.cb-w.com/wc?uri='), open: 'https://go.cb-w.com/' },
  { id: 'zerion', name: 'Zerion', connect: link('https://wallet.zerion.io/wc?uri='), open: 'https://wallet.zerion.io/' },
  { id: 'uniswap', name: 'Uniswap', connect: link('https://uniswap.org/app/wc?uri='), open: 'https://uniswap.org/app' },
  { id: 'phantom', name: 'Phantom', connect: link('https://phantom.app/ul/wc?uri='), open: 'https://phantom.app/ul/' },
]

export const walletById = (id?: string) => WALLETS.find((w) => w.id === id)
