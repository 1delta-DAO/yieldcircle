import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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

/**
 * `dist/_routes.json`: the gate (`functions/_middleware.ts`) runs for the HTML document, `/gate/*` and
 * `?access=`, never for the bundle or `public/`'s files — every asset request was a Functions
 * invocation, so a flood of them spent the quota (tickets/0022 A1). Built from `public/` so a new
 * file there is excluded without anyone remembering to.
 */
const pagesRoutes = () => ({
  name: 'yc:pages-routes',
  apply: 'build' as const,
  writeBundle(opts: { dir?: string }) {
    const pub = fileURLToPath(new URL('public/', import.meta.url))
    const files = readdirSync(pub).filter((f) => !f.startsWith('_')).map((f) => (statSync(pub + f).isDirectory() ? `/${f}/*` : `/${f}`))
    const routes = { version: 1, include: ['/*'], exclude: ['/assets/*', ...files] }
    writeFileSync(`${opts.dir ?? 'dist'}/_routes.json`, JSON.stringify(routes, null, 2) + '\n')
  },
})

export default defineConfig(({ mode }) => ({
  plugins: [react(), guardWalletConnect(mode, process.env), pagesRoutes()],
  // `.env` stays at the repo root, shared with the landing
  envDir: '../..',
  server: { port: 3200, open: false },
}))
