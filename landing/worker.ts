/**
 * The landing's Worker — bundled as the Pages project's `_worker.js`
 * (`build-worker.mjs`), with `_routes.json` sending it only `/gate/*`. The page
 * itself is static; this answers the two waitlist endpoints the gate's card
 * calls on the landing's own origin. It binds the same `WHITELIST` KV
 * namespace as the app (`functions/_middleware.ts`), so a wallet put in line
 * here is in line there. Signing in is the app's alone — the beta cookie is
 * set on the app's origin — so there is no `/gate/verify` here.
 *
 * Bindings (Pages → Settings): `WHITELIST` KV, the app's namespace;
 * `RESEND_API_KEY` (Secret) and `NOTIFY_EMAIL` optional, as on the app. Without the KV binding the endpoints
 * answer 503 and the page still serves.
 */
import { check, join, json, type WaitlistEnv } from '../gate/waitlist'

type Env = Partial<WaitlistEnv> & { ASSETS: { fetch: (r: Request) => Promise<Response> } }
type ExecutionContext = { waitUntil: (p: Promise<unknown>) => void }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/gate/')) {
      if (!env.WHITELIST) return json({ error: 'the waitlist is not configured' }, 503)
      const wl = env as WaitlistEnv
      if (request.method === 'GET' && url.pathname === '/gate/check') return check(url, wl)
      if (request.method === 'POST' && url.pathname === '/gate/request') return join(request, wl, (p) => ctx.waitUntil(p))
      return json({ error: 'not found' }, 404)
    }
    return env.ASSETS.fetch(request)
  },
}
