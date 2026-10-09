import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { overlay } from '../gate/page'

// The landing's own build (`pnpm build:landing`, `pnpm dev:landing`): this folder is the root, the
// app's `src/` is shared code, `public/` is shared assets, `.env` is the repo's.
// index.html's canonical / og tags need an absolute origin, or share cards break.
process.env.VITE_SITE_URL ||= 'https://yieldcircle.io'
process.env.VITE_APP_URL ||= 'https://app.yieldcircle.io'

/**
 * The gate's card, built into the page: an inline script in the HTML, as the app's middleware
 * injects it, so the landing needs no HTML rewriting at the edge. Shipped hidden; every "Join the
 * waitlist" opens it (`openGate`), and a whitelisted wallet is sent on to the app to sign in.
 */
const gateCard = () => ({
  name: 'yc:gate-card',
  transformIndexHtml(html: string) {
    return html.replace('</body>', `${overlay({ hidden: true, app: process.env.VITE_APP_URL })}</body>`)
  },
})

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir: '..',
  publicDir: '../public',
  plugins: [react(), gateCard()],
  build: { outDir: '../dist-landing', emptyOutDir: true },
  server: { port: 3201, open: false },
})
