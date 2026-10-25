/**
 * The build's environment, handed to core: the phone's counterpart of packages/web/src/env.ts.
 * Expo inlines `process.env.EXPO_PUBLIC_*` at bundle time: `pnpm mobile` maps the root `.env`'s
 * `VITE_*` onto them (scripts/mobile.mjs); EAS preview/production builds get them from `pnpm mobile env:push`.
 * Unset leaves core's production defaults.
 */
import { configureBackend } from '@yieldcircle/core/config/backend'

configureBackend({
  backend: process.env.EXPO_PUBLIC_BACKEND_BASE_URL,
  index: process.env.EXPO_PUBLIC_INDEX_BASE_URL,
  solIndex: process.env.EXPO_PUBLIC_SOL_INDEX_BASE_URL,
  social: process.env.EXPO_PUBLIC_SOCIAL_BASE_URL,
  solRpc: process.env.EXPO_PUBLIC_RPC_SOLANA,
})

/** Reown project id — the web's `VITE_WC_PROJECT_ID`. */
export const WC_PROJECT_ID = process.env.EXPO_PUBLIC_WC_PROJECT_ID?.trim() || undefined
