import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Cloudflare Pages builds with a plain `pnpm build`, so the guard in
 * `scripts/check-env.mjs` (wired into the deploy scripts) never runs there.
 * This is the same gate on the path Pages actually takes.
 *
 * It only THROWS in a deploy environment — production went out once with
 * `VITE_WC_PROJECT_ID` unset, shipping `connectors: [injected()]`, which left a
 * phone browser with no way to connect a wallet at all. A local production
 * build only warns, so `pnpm build` stays usable while working on the parts
 * that do not need a wallet.
 */
const guardWalletConnect = (mode: string, env: NodeJS.ProcessEnv) => ({
  name: 'yc:guard-walletconnect',
  buildStart() {
    if (mode !== 'production') return
    if (env.VITE_WC_PROJECT_ID?.trim() || env.VITE_ALLOW_NO_WC?.trim()) return
    const msg =
      'VITE_WC_PROJECT_ID is not set: this build ships injected-only and no phone ' +
      'browser can connect a wallet. Set it (cloud.reown.com) under BOTH Production ' +
      'and Preview in Cloudflare Pages — VITE_* is baked in at build time. ' +
      'VITE_ALLOW_NO_WC=1 makes it deliberate.'
    // CF_PAGES is set by Pages; CI by every runner worth the name
    if (env.CF_PAGES || env.CI) throw new Error(msg)
    console.warn(`\n  ⚠ ${msg}\n`)
  },
})

export default defineConfig(({ mode }) => ({
  plugins: [react(), guardWalletConnect(mode, process.env)],
  server: { port: 3200, open: false },
}))
