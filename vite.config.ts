import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app's own build. The landing page is a separate deployment with its own config
// (`landing/vite.config.ts`, docs/deploy.md); it shares `src/` and `public/` with this one.
// index.html's canonical / og tags need an absolute origin, or share cards break.
process.env.VITE_SITE_URL ||= 'https://app.yieldcircle.io'

/**
 * Warns, never fails: without `VITE_WC_PROJECT_ID` the build ships
 * `connectors: [injected()]` and a phone browser cannot connect a wallet.
 */
const guardWalletConnect = (mode: string, env: NodeJS.ProcessEnv) => ({
  name: 'yc:guard-walletconnect',
  buildStart() {
    if (mode !== 'production') return
    if (env.VITE_WC_PROJECT_ID?.trim() || env.VITE_ALLOW_NO_WC?.trim()) return
    console.warn(
      '\n  ⚠ VITE_WC_PROJECT_ID is not set: this build ships injected-only and no phone ' +
        'browser can connect a wallet. Set it (cloud.reown.com) as a build variable.\n',
    )
  },
})

export default defineConfig(({ mode }) => ({
  plugins: [react(), guardWalletConnect(mode, process.env)],
  server: { port: 3200, open: false },
}))
