/**
 * Refuse to ship a build a phone cannot use.
 *
 * Production went out with `VITE_WC_PROJECT_ID` unset, so `wallet/wagmi.ts`
 * shipped `connectors: [injected()]` and the Connect button on a mobile browser
 * offered nothing but an instruction to go and use a different browser. Nothing
 * failed — the variable is optional by construction — which is exactly why it
 * needs a gate rather than a convention.
 *
 * Wired into `deploy` and `deploy:preview` only: `pnpm dev` and `pnpm build`
 * stay usable without a project id for local work. Cloudflare Pages runs
 * `pnpm build`, so the matching guard for that path is in `vite.config.ts`.
 */
import { readFileSync, existsSync } from 'node:fs'

const fromEnvFile = () => {
  if (!existsSync('.env')) return {}
  return Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
  )
}

const env = { ...fromEnvFile(), ...process.env }
const missing = ['VITE_WC_PROJECT_ID', 'VITE_BACKEND_BASE_URL'].filter((k) => !String(env[k] ?? '').trim())

if (missing.length) {
  console.error(`\n  refusing to deploy: ${missing.join(', ')} not set.\n`)
  if (missing.includes('VITE_WC_PROJECT_ID')) {
    console.error('  Without a WalletConnect project id (cloud.reown.com) the build ships')
    console.error('  injected-only, and nobody on a phone browser can connect a wallet.')
    console.error('  Set it here and in the Cloudflare Pages environment, under BOTH')
    console.error('  Production and Preview — VITE_* is baked in at build time.\n')
  }
  console.error('  Override for a deliberate read-only build: VITE_ALLOW_NO_WC=1\n')
  if (!String(env.VITE_ALLOW_NO_WC ?? '').trim()) process.exit(1)
}
