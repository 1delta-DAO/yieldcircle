/**
 * The closed-beta gate (tickets/0002). Runs in front of EVERY request on the
 * Pages project, static assets included: without a valid beta cookie a visitor
 * gets the gate page, never the app bundle. `/lineup` is public: the page
 * where a wallet asks to be whitelisted, with an email address.
 *
 * Bindings (Pages → Settings → Bindings / Variables, Production AND Preview):
 *   WHITELIST       KV namespace — `wl:<lowercase address>` = whitelisted,
 *                   `wait:<lowercase address>` = requested (email in metadata)
 *   GATE_SECRET     Secret — HMAC key for the cookie; rotating it logs everyone out
 *   RESEND_API_KEY  Secret, optional — emails each new request to NOTIFY_EMAIL
 *   NOTIFY_EMAIL    optional, where requests are mailed (default below)
 *   GATE_OFF        optional, "1" opens the app to everyone (the end of the beta)
 */
import { recoverMessageAddress, isAddress, isHex } from 'viem'
import { gatePage, lineupPage, message } from '../gate/page'

interface KV {
  get(key: string): Promise<string | null>
  getWithMetadata<M>(key: string): Promise<{ value: string | null; metadata: M | null }>
  put(key: string, value: string, options?: { metadata?: unknown }): Promise<void>
}
interface Env {
  WHITELIST?: KV
  GATE_SECRET?: string
  RESEND_API_KEY?: string
  NOTIFY_EMAIL?: string
  GATE_OFF?: string
}
type Gated = Env & { WHITELIST: KV; GATE_SECRET: string }
type Ctx = { request: Request; env: Env; next: () => Promise<Response>; waitUntil: (p: Promise<unknown>) => void }

const COOKIE = 'yc_beta'
const COOKIE_DAYS = 30
const SIGNATURE_MAX_AGE_MS = 10 * 60_000
const NOTIFY_EMAIL = 'achim@1delta.io'
const THREAD_ANCHOR = '<beta-requests@yieldcircle.io>'
// Served without a cookie: share cards, icons and the manifest must work for
// a link posted on X, which is the point of the waitlist.
const PUBLIC = /^\/(og\.png|favicon[\w.-]*|apple-touch-icon\.png|icon-[\w.-]+\.png|site\.webmanifest|robots\.txt|logo[\w.-]*\.svg|mark-plain\.svg)$/
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

export const onRequest = async ({ request, env, next, waitUntil }: Ctx): Promise<Response> => {
  if (env.GATE_OFF === '1') return next()
  const url = new URL(request.url)
  if (PUBLIC.test(url.pathname)) return next()
  if (!env.WHITELIST || !env.GATE_SECRET) return new Response('Beta gate is not configured.', { status: 503 })
  const gated = env as Gated

  if (request.method === 'POST' && url.pathname === '/gate/verify') return verify(request, gated, null, waitUntil)
  if (request.method === 'POST' && url.pathname === '/gate/request') return verify(request, gated, 'request', waitUntil)
  if (url.pathname === '/lineup' || url.pathname === '/lineup/') return html(lineupPage(url.origin))

  const holder = await readCookie(request.headers.get('cookie'), env.GATE_SECRET).catch(() => null)
  if (holder) return next()
  return html(gatePage(url.origin))
}

/** Both POSTs: prove the address, then let it in — or, for a request, put it in line. */
async function verify(request: Request, env: Gated, mode: 'request' | null, waitUntil: Ctx['waitUntil']): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { address?: string; issued?: string; signature?: string; email?: string } | null
  const { address, issued, signature } = body ?? {}
  const email = mode === 'request' ? body?.email?.trim().toLowerCase() ?? '' : undefined
  if (!address || !isAddress(address) || !issued || !signature || !isHex(signature)) return json({ error: 'bad request' }, 400)
  if (email !== undefined && !EMAIL.test(email)) return json({ error: 'enter a valid email address' }, 400)
  const age = Date.now() - Date.parse(issued)
  if (!(age >= -60_000 && age < SIGNATURE_MAX_AGE_MS)) return json({ error: 'signature expired, try again' }, 400)

  const signer = await recoverMessageAddress({ message: message(address, issued, email), signature }).catch(() => null)
  const account = address.toLowerCase()
  if (signer?.toLowerCase() !== account) return json({ error: 'signature does not match the address' }, 401)

  if (await env.WHITELIST.get(`wl:${account}`)) return admit(account, env)
  if (email === undefined) return json({ listed: false })

  const key = `wait:${account}`
  const before = (await env.WHITELIST.getWithMetadata<{ email?: string }>(key)).metadata
  if (before?.email !== email) {
    const ts = new Date().toISOString()
    await env.WHITELIST.put(key, JSON.stringify({ ts, email }), { metadata: { ts, email } })
    if (env.RESEND_API_KEY) waitUntil(notify(env, account, email, ts))
  }
  return json({ listed: false, requested: true, again: !!before })
}

async function admit(account: string, env: Gated): Promise<Response> {
  const exp = Date.now() + COOKIE_DAYS * 86_400_000
  const value = `${account}.${exp}.${await hmac(env.GATE_SECRET, `${account}.${exp}`)}`
  return json({ listed: true }, 200, {
    'set-cookie': `${COOKIE}=${value}; Path=/; Max-Age=${COOKIE_DAYS * 86_400}; HttpOnly; Secure; SameSite=Lax`,
  })
}

/** One email per new (or changed) request. A failure is logged, never shown — the request is stored either way. */
async function notify(env: Gated, account: string, email: string, ts: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: 'YieldCircle <onboarding@resend.dev>',
      to: [env.NOTIFY_EMAIL || NOTIFY_EMAIL],
      reply_to: email,
      // A fixed subject plus a shared References anchor keeps every request in ONE mail thread.
      subject: 'YieldCircle beta requests',
      headers: { References: THREAD_ANCHOR, 'In-Reply-To': THREAD_ANCHOR },
      text: `${account},${email},${ts}\n`,
    }),
  }).catch((e) => new Response(String(e), { status: 599 }))
  if (!res.ok) console.error('beta request email failed', res.status, await res.text())
}

async function readCookie(header: string | null, secret: string): Promise<string | null> {
  const raw = header?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
  const [account, exp, mac] = raw?.split('.') ?? []
  if (!account || !exp || !mac || Number(exp) < Date.now()) return null
  const sig = Uint8Array.from(atob(mac.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sig, new TextEncoder().encode(`${account}.${exp}`))
  return ok ? account : null
}

const hmacKey = (secret: string) =>
  crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])

async function hmac(secret: string, data: string): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(data)))
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const html = (body: string) =>
  new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } })
