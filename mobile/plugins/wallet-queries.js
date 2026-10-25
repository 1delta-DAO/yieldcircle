// Android 11+ hides other apps unless the manifest names them: without this AppKit cannot tell
// which wallets are installed (it still connects to any of them over WalletConnect). iOS is the
// `LSApplicationQueriesSchemes` list in app.json. Same wallets as packages/web/src/wallet/wallets.ts.
const { withAndroidManifest, createRunOncePlugin } = require('expo/config-plugins')

const WALLETS = [
  'io.metamask',
  'me.rainbow',
  'com.wallet.crypto.trustapp',
  'org.toshi', // Coinbase Wallet
  'io.zerion.android',
  'com.uniswap.mobile',
  'app.phantom',
  'io.gnosis.safe',
]

const withWalletQueries = (config) =>
  withAndroidManifest(config, (c) => {
    c.modResults.manifest.queries = [{ package: WALLETS.map((name) => ({ $: { 'android:name': name } })) }]
    return c
  })

module.exports = createRunOncePlugin(withWalletQueries, 'yieldcircle-wallet-queries', '1.0.0')
