/**
 * The build's environment, handed to core before anything else runs: every entry (`main.tsx`,
 * the landing's `main.tsx` and `deck-main.tsx`) imports this FIRST, so its side effect lands
 * before any module that fetches. Unset leaves core's production defaults.
 */
import { configureBackend } from '@yieldcircle/core/config/backend'

configureBackend({
  backend: import.meta.env.VITE_BACKEND_BASE_URL as string | undefined,
  index: import.meta.env.VITE_INDEX_BASE_URL as string | undefined,
  solIndex: import.meta.env.VITE_SOL_INDEX_BASE_URL as string | undefined,
  social: import.meta.env.VITE_SOCIAL_BASE_URL as string | undefined,
})
