/**
 * The closed-beta gate (tickets/0002). Runs in front of EVERY request on the
 * Pages project, static assets included: without a valid beta cookie a visitor
 * gets the gate page, never the app bundle.
 *
 * Bindings (Pages → Settings → Bindings / Variables, Production AND Preview):
 *   WHITELIST    KV namespace — `wl:<lowercase address>` = whitelisted,
 *                `wait:<lowercase address>` = asked to join (written here)
 *   GATE_SECRET  Secret — HMAC key for the cookie; rotating it logs everyone out
 *   GATE_OFF     optional, "1" opens the app to everyone (the end of the beta)
 */
import { recoverMessageAddress, isAddress, isHex } from 'viem'
import { gatePage, message } from '../gate/page'

interface KV {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
}
interface Env {
  WHITELIST?: KV
  GATE_SECRET?: string
  GATE_OFF?: string
}
type Ctx = { request: Request; env: Env; next: () => Promise<Response> }

const COOKIE = 'yc_beta'
const COOKIE_DAYS = 30
const SIGNATURE_MAX_AGE_MS = 10 * 60_000
// Served without a cookie: share cards, icons and the manifest must work for
// a link posted on X, which is the point of the waitlist.
const PUBLIC = /^\/(og\.png|favicon[\w.-]*|apple-touch-icon\.png|icon-[\w.-]+\.png|site\.webmanifest|robots\.txt|logo[\w.-]*\.svg|mark-plain\.svg)$/

export const onRequest = async ({ request, env, next }: Ctx): Promise<Response> => {
  if (env.GATE_OFF === '1') return next()
  const url = new URL(request.url)
  if (PUBLIC.test(url.pathname)) return next()
  if (!env.WHITELIST || !env.GATE_SECRET) return new Response('Beta gate is not configured.', { status: 503 })

  if (url.pathname === '/gate/verify' && request.method === 'POST') return verify(request, env as Required<Env>)

  const holder = await readCookie(request.headers.get('cookie'), env.GATE_SECRET).catch(() => null)
  if (holder) return next()
  return new Response(gatePage(url.origin), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

async function verify(request: Request, env: Required<Env>): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { address?: string; issued?: string; signature?: string } | null
  const { address, issued, signature } = body ?? {}
  if (!address || !isAddress(address) || !issued || !signature || !isHex(signature)) return json({ error: 'bad request' }, 400)
  const age = Date.now() - Date.parse(issued)
  if (!(age >= -60_000 && age < SIGNATURE_MAX_AGE_MS)) return json({ error: 'signature expired, try again' }, 400)

  const signer = await recoverMessageAddress({ message: message(address, issued), signature }).catch(() => null)
  const account = address.toLowerCase()
  if (signer?.toLowerCase() !== account) return json({ error: 'signature does not match the address' }, 401)

  if (!(await env.WHITELIST.get(`wl:${account}`))) {
    if (!(await env.WHITELIST.get(`wait:${account}`)))
      await env.WHITELIST.put(`wait:${account}`, JSON.stringify({ ts: new Date().toISOString() }))
    return json({ listed: false })
  }
  const exp = Date.now() + COOKIE_DAYS * 86_400_000
  const value = `${account}.${exp}.${await hmac(env.GATE_SECRET, `${account}.${exp}`)}`
  return json({ listed: true }, 200, {
    'set-cookie': `${COOKIE}=${value}; Path=/; Max-Age=${COOKIE_DAYS * 86_400}; HttpOnly; Secure; SameSite=Lax`,
  })
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

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } })
