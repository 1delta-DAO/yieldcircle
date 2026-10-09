/**
 * The closed-beta gate (tickets/0002) — an OVERLAY, never a wall. The app is
 * always served and renders behind a frosted layer that the middleware injects
 * into the HTML for visitors without a valid beta cookie. Assets, data and the
 * bundle itself pass through untouched; only the HTML document is modified.
 *
 * The narrative is a WAITLIST, in two layers: a wallet is *waitlisted*
 * (`wait:` — the overlay says it is in line, access soon) or *whitelisted*
 * (`wl:` — sign in and the app is yours). "Whitelist" stays the internal and
 * admin term; the visitor only ever hears "waitlist". Joining the waitlist takes
 * no signature — visitors took the email step for the finish line and never
 * signed — so an unproven address can be put in line, but only once: the first
 * email stands, and getting in still takes the signature.
 *
 * Bindings (Pages → Settings → Bindings / Variables, Production AND Preview):
 *   WHITELIST       KV namespace — `wl:<address>` = whitelisted, `wait:<address>` = waitlisted
 *                   (email in metadata). An EVM address is lower-cased; a Solana pubkey is
 *                   stored as is (base58 is case-sensitive) and signs in with an ed25519
 *                   signature over the same text instead of EIP-191
 *   GATE_SECRET     Secret — HMAC key for the cookie; rotating it logs everyone out
 *   RESEND_API_KEY  Secret, optional — emails each new request to NOTIFY_EMAIL
 *   NOTIFY_EMAIL    optional, where requests are mailed (default in `gate/waitlist.ts`)
 *   GATE_OFF        optional, "1" opens the app to everyone (the end of the beta)
 *   GATE_PASS       Secret, optional — an access code: `/?access=<code>` lets the holder in
 *                   without a whitelisted wallet (hackathon judges, reviewers). Such a
 *                   visitor never joined the waitlist, so the app nudges them to: the
 *                   HTML carries `window.ycPass`, and `/?waitlist` serves them the
 *                   overlay in its waitlist mode (`src/wallet/gate.ts`)
 *
 * Unconfigured (missing binding or secret) the gate is OFF and the app serves
 * normally — a misconfiguration must never take the site down.
 */
import { recoverMessageAddress, isHex } from 'viem'
import { overlay, message, norm } from '../gate/page'
import { check, join, json, okAddress, type KV, type WaitUntil, type WaitlistEnv } from '../gate/waitlist'
import { isSolAddr, base58Decode } from '../src/model/address'

interface Env extends Partial<WaitlistEnv> {
  GATE_SECRET?: string
  GATE_OFF?: string
  GATE_PASS?: string
}
type Gated = Env & { WHITELIST: KV; GATE_SECRET: string }
type Ctx = { request: Request; env: Env; next: () => Promise<Response>; waitUntil: WaitUntil }

const COOKIE = 'yc_beta'
const COOKIE_DAYS = 30
const SIGNATURE_MAX_AGE_MS = 10 * 60_000

export const onRequest = async ({ request, env, next, waitUntil }: Ctx): Promise<Response> => {
  const configured = !!(env.WHITELIST && env.GATE_SECRET) && env.GATE_OFF !== '1'
  const url = new URL(request.url)
  if (configured) {
    const gated = env as Gated
    if (request.method === 'POST' && url.pathname === '/gate/verify') return verify(request, gated)
    if (request.method === 'POST' && url.pathname === '/gate/request') return join(request, gated, waitUntil)
    if (request.method === 'GET' && url.pathname === '/gate/check') return check(url, gated)
    if (request.method === 'GET' && url.searchParams.has('access')) return pass(url, gated)
  }

  const res = await next()
  if (!configured) return res
  // Only the HTML document gets the overlay; every asset passes through untouched.
  if (request.method !== 'GET' || !(res.headers.get('content-type') ?? '').includes('text/html')) return res
  const holder = await readCookie(request.headers.get('cookie'), env.GATE_SECRET!).catch(() => null)
  if (holder && holder !== 'pass') return res

  // no access: the app shows its one-screen join page (window.ycGated, src/ui/Join.tsx) and the
  // overlay ships hidden — the join page's button is what opens it. (The full landing is its own
  // deployment, `landing/`, which only puts wallets in line; signing in always happens here.) An access-code holder is in, but not on the
  // list: the app asks them to join (window.ycPass), and the page it links to, `/?waitlist`, is
  // the overlay's own waitlist flow
  const inject = holder !== 'pass' ? `<script>window.ycGated=true</script>${overlay({ hidden: true })}`
    : url.searchParams.has('waitlist') ? overlay({ waitlist: true })
    : '<script>window.ycPass=true</script>'
  const body = (await res.text()).replace('</body>', `${inject}</body>`)
  const headers = new Headers(res.headers)
  headers.set('cache-control', 'no-store')
  headers.delete('content-length')
  return new Response(body, { status: res.status, headers })
}

/** POST /gate/verify — prove the address; a whitelisted one is let in. */
async function verify(request: Request, env: Gated): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { address?: string; issued?: string; signature?: string } | null
  const { address, issued, signature } = body ?? {}
  if (!address || !okAddress(address) || !issued || !signature || !isHex(signature)) return json({ error: 'bad request' }, 400)
  const age = Date.now() - Date.parse(issued)
  if (!(age >= -60_000 && age < SIGNATURE_MAX_AGE_MS)) return json({ error: 'signature expired, try again' }, 400)

  const account = norm(address)
  const text = message(address, issued)
  const ok = isSolAddr(address)
    ? await verifySol(address, text, signature).catch(() => false)
    : (await recoverMessageAddress({ message: text, signature }).catch(() => null))?.toLowerCase() === account
  if (!ok) return json({ error: 'signature does not match the address' }, 401)

  if (await env.WHITELIST.get(`wl:${account}`)) return admit(account, env)
  return json({ listed: false })
}

/** A Solana wallet signs the raw UTF-8 text with its ed25519 key — the pubkey IS the address. */
export async function verifySol(address: string, text: string, signatureHex: string): Promise<boolean> {
  const pub = base58Decode(address)
  const sig = Uint8Array.from(signatureHex.slice(2).match(/../g) ?? [], (h) => parseInt(h, 16))
  if (!pub || pub.length !== 32 || sig.length !== 64) return false
  const key = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify'])
  return crypto.subtle.verify('Ed25519', key, sig, new TextEncoder().encode(text))
}

async function admit(account: string, env: Gated): Promise<Response> {
  return json({ listed: true }, 200, { 'set-cookie': await cookie(account, env) })
}

/**
 * `?access=<GATE_PASS>` — the same cookie as a whitelisted wallet, under the account `pass`, then a
 * redirect that drops the code from the address bar (the browser keeps the `#/…` route). A wrong
 * code just lands on the gated app.
 */
async function pass(url: URL, env: Gated): Promise<Response> {
  const code = url.searchParams.get('access') ?? ''
  url.searchParams.delete('access')
  const headers: Record<string, string> = { location: url.pathname + url.search, 'cache-control': 'no-store' }
  // compare MACs, not the strings, so the check takes the same time however much of the code is right
  if (env.GATE_PASS && (await hmac(env.GATE_SECRET, code)) === (await hmac(env.GATE_SECRET, env.GATE_PASS))) {
    headers['set-cookie'] = await cookie('pass', env)
  }
  return new Response(null, { status: 302, headers })
}

async function cookie(account: string, env: Gated): Promise<string> {
  const exp = Date.now() + COOKIE_DAYS * 86_400_000
  const value = `${account}.${exp}.${await hmac(env.GATE_SECRET, `${account}.${exp}`)}`
  return `${COOKIE}=${value}; Path=/; Max-Age=${COOKIE_DAYS * 86_400}; HttpOnly; Secure; SameSite=Lax`
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
