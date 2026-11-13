/**
 * The X link worker.
 *
 * It exists for one reason: OAuth needs a client secret, and a static site
 * cannot hold one. Everything else stays where it belongs — the wallet key in
 * the browser, the link in the social service.
 *
 *   GET  /challenge?account=0x…&action=link   → { nonce }
 *   POST /begin   { account, nonce, action, signed }  → { url } | { ok }
 *   GET  /callback?code&state                 → finishes and closes the popup
 *
 * The nonce ties the two halves together: it is inside the EIP-712 message the
 * wallet signed AND inside the OAuth `state`, so a signature cannot be replayed
 * against someone else's X account and an OAuth code cannot be redirected onto
 * someone else's wallet. PKCE covers the code itself.
 *
 * The challenge itself is stateless (an HMAC of the address and its expiry),
 * so an anonymous `GET /challenge` costs no KV write. `/begin` sets an HttpOnly
 * cookie that `/callback` must see: the OAuth round trip finishes only in the
 * browser that started it, so an authorize URL sent to someone else cannot bind
 * their X account to the sender's wallet (docs/security-review-2026-11.md #12).
 * The worker and the app are same-site, so the app's `fetch` to `/begin` must
 * send `credentials: 'include'` for the cookie to be kept.
 *
 * Pending state lives in one KV namespace with a ten-minute TTL — a link is not
 * worth a database.
 *
 * Bindings (wrangler.toml / secrets):
 *   XLINK          KV namespace
 *   X_CLIENT_ID    the app's client id          (var)
 *   X_CLIENT_SECRET                             (secret)
 *   SOCIAL_URL     https://social.1delta.io     (var)
 *   XLINK_SECRET   shared with the social service (secret)
 *   REDIRECT_URI   this worker's /callback url  (var)
 *   ALLOWED_ORIGIN the app origins allowed to call, comma-separated (var); "*" in dev only
 */
export interface Env {
  XLINK: KVNamespace
  X_CLIENT_ID: string
  X_CLIENT_SECRET: string
  SOCIAL_URL: string
  XLINK_SECRET: string
  REDIRECT_URI: string
  ALLOWED_ORIGIN?: string
}

const ADDR = /^0x[0-9a-fA-F]{40}$/
const TTL = 600
/** `/begin`'s body is an address, a nonce and one signed EIP-712 message: a few KB at most (tickets/0022 A2). */
const MAX_BODY = 8 * 1024
const COOKIE = 'yc_xl'

/**
 * CORS for one named origin out of `ALLOWED_ORIGIN`, never `*` with credentials: the cookie `/begin`
 * sets is only kept by a browser that sees its own origin echoed back.
 */
const cors = (env: Env, req: Request): Record<string, string> => {
  const allowed = (env.ALLOWED_ORIGIN || '*').split(',').map((o) => o.trim()).filter(Boolean)
  const origin = req.headers.get('origin') ?? ''
  const base = { 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' }
  if (allowed.includes('*')) return { ...base, 'access-control-allow-origin': origin || '*', ...(origin ? { 'access-control-allow-credentials': 'true' } : {}) }
  return allowed.includes(origin) ? { ...base, 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' } : base
}
const json = (env: Env, req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors(env, req), ...extra } })

const rand = (n: number) => {
  const b = new Uint8Array(n)
  crypto.getRandomValues(b)
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}
/** PKCE: base64url(SHA-256(verifier)). */
async function challengeOf(verifier: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const hmacHex = async (secret: string, data: string, bytes = 16) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
  return [...sig.slice(0, bytes)].map((x) => x.toString(16).padStart(2, '0')).join('')
}
/** Constant-time compare of two hex strings. */
const same = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}
/** A nonce is `<16 hex random><8 hex expiry, unix s><32 hex mac>` — 56 hex chars, checkable without storage. */
async function issueNonce(env: Env, account: string): Promise<string> {
  const head = rand(8) + (Math.floor(Date.now() / 1000) + TTL).toString(16).padStart(8, '0')
  return head + (await hmacHex(`xlink-challenge:${env.XLINK_SECRET}`, `${account}:${head}`))
}
async function nonceOk(env: Env, account: string, nonce: string): Promise<boolean> {
  if (!/^[0-9a-f]{56}$/.test(nonce)) return false
  const head = nonce.slice(0, 24)
  if (parseInt(head.slice(16), 16) * 1000 < Date.now()) return false
  return same(nonce.slice(24), await hmacHex(`xlink-challenge:${env.XLINK_SECRET}`, `${account}:${head}`))
}

/** The request body as JSON, refused past `max` bytes whether or not a content-length says so. */
async function readJson(req: Request, max: number): Promise<unknown> {
  if (Number(req.headers.get('content-length') ?? 0) > max) return null
  const reader = req.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) { await reader.cancel(); return null }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let at = 0
  for (const c of chunks) { all.set(c, at); at += c.byteLength }
  try { return JSON.parse(new TextDecoder().decode(all)) } catch { return null }
}

const cookieOf = (req: Request) =>
  req.headers.get('cookie')?.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? ''

interface Pending { account: string; nonce: string; action: string; verifier: string; signed: unknown; bind: string }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const json_ = (body: unknown, status = 200, extra?: Record<string, string>) => json(env, req, body, status, extra)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, req) })

    // 1 — a nonce bound to this address, which both halves will quote
    if (url.pathname === '/challenge') {
      const account = (url.searchParams.get('account') ?? '').toLowerCase()
      if (!ADDR.test(account)) return json_({ error: 'bad address' }, 400)
      return json_({ nonce: await issueNonce(env, account) })
    }

    // 2 — the signed half arrives; hand back the authorize url
    if (url.pathname === '/begin' && req.method === 'POST') {
      const body = (await readJson(req, MAX_BODY)) as {
        account?: string; nonce?: string; action?: string; signed?: { message?: Record<string, unknown> }
      } | null
      if (!body || typeof body !== 'object') return json_({ error: 'bad or oversized body' }, 400)
      const account = (body.account ?? '').toLowerCase()
      const nonce = String(body.nonce ?? '')
      const action = body.action === 'unlink' ? 'unlink' : 'link'
      if (!ADDR.test(account)) return json_({ error: 'bad address' }, 400)
      if (!(await nonceOk(env, account, nonce)) || (await env.XLINK.get(`u:${nonce}`)))
        return json_({ error: 'unknown or expired challenge' }, 400)
      // the signature must be over THIS nonce and THIS address: the worker
      // does not verify it (the social service recovers the signer), but it
      // will not carry a message that disagrees with what it issued
      const m = body.signed?.message ?? {}
      if (String(m.nonce) !== nonce || String(m.author).toLowerCase() !== account || String(m.action) !== action)
        return json_({ error: 'the signed message does not match the challenge' }, 400)

      if (action === 'unlink') {
        const r = await post(env, { signed: body.signed })
        await env.XLINK.put(`u:${nonce}`, '1', { expirationTtl: TTL })
        return json_(r.ok ? { ok: true } : { error: 'the social service refused the unlink' }, r.ok ? 200 : 502)
      }

      const verifier = rand(32)
      // the browser that begins is the only one that may finish: `/callback` wants this back from its cookie
      const bind = rand(16)
      const pending: Pending = { account, nonce, action, verifier, signed: body.signed, bind }
      await env.XLINK.put(`p:${nonce}`, JSON.stringify(pending), { expirationTtl: TTL })
      const auth = new URL('https://x.com/i/oauth2/authorize')
      auth.searchParams.set('response_type', 'code')
      auth.searchParams.set('client_id', env.X_CLIENT_ID)
      auth.searchParams.set('redirect_uri', env.REDIRECT_URI)
      auth.searchParams.set('scope', 'users.read tweet.read')
      auth.searchParams.set('state', nonce)
      auth.searchParams.set('code_challenge', await challengeOf(verifier))
      auth.searchParams.set('code_challenge_method', 'S256')
      return json_({ url: auth.toString() }, 200, {
        'set-cookie': `${COOKIE}=${nonce}.${bind}; Path=/callback; Max-Age=${TTL}; HttpOnly; Secure; SameSite=Lax`,
      })
    }

    // 3 — X sends the user back; exchange, read who they are, store the link
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state') ?? ''
      const denied = url.searchParams.get('error')
      if (denied) return close('You declined. Nothing was linked.')
      const raw = await env.XLINK.get(`p:${state}`)
      if (!code || !raw) return close('That link request expired. Start again from the app.')
      const p = JSON.parse(raw) as Pending
      // OAuth login CSRF: an authorize URL begun in someone else's browser has no cookie here
      const [cNonce, cBind] = cookieOf(req).split('.')
      if (cNonce !== state || !p.bind || !same(cBind ?? '', p.bind))
        return close('This link was started in another browser. Start again from the app, in this one.')
      await env.XLINK.delete(`p:${state}`)
      await env.XLINK.put(`u:${state}`, '1', { expirationTtl: TTL })

      const tok = await fetch('https://api.x.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: 'Basic ' + btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`),
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: env.REDIRECT_URI,
          code_verifier: p.verifier,
        }),
      })
      if (!tok.ok) return close('X refused the exchange. Nothing was linked.')
      const { access_token } = (await tok.json()) as { access_token?: string }
      if (!access_token) return close('X returned no token. Nothing was linked.')

      const me = await fetch('https://api.x.com/2/users/me?user.fields=profile_image_url,verified', {
        headers: { authorization: `Bearer ${access_token}` },
      })
      if (!me.ok) return close('X would not say who you are. Nothing was linked.')
      const { data } = (await me.json()) as {
        data?: { id: string; username: string; name?: string; profile_image_url?: string; verified?: boolean }
      }
      if (!data?.id) return close('X returned no account. Nothing was linked.')

      const r = await post(env, {
        signed: p.signed,
        x: { id: data.id, handle: data.username, name: data.name, avatarUrl: data.profile_image_url, verified: data.verified },
      })
      return close(r.ok ? `Linked @${data.username}. You can close this window.` : `Could not save the link: ${r.error ?? 'the social service refused it'}`)
    }

    return json_({ error: 'not found' }, 404)
  },
}

/** Hand both halves to the social service, which matches them and stores the link. */
async function post(env: Env, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`${env.SOCIAL_URL.replace(/\/$/, '')}/x-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-link-secret': env.XLINK_SECRET },
    body: JSON.stringify(body),
  })
  const j = (await r.json().catch(() => ({}))) as { error?: string }
  return { ok: r.ok, error: j.error }
}

/** The popup closes itself; the app refreshes the profile when it sees it go. */
const close = (msg: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>X link</title>
<style>body{margin:0;display:grid;place-items:center;height:100dvh;background:#000;color:#e8e8e8;font:14px/1.5 system-ui,sans-serif;text-align:center;padding:24px}p{max-width:34ch}</style>
<p>${msg.replace(/[<>&]/g, '')}</p><script>setTimeout(()=>window.close(),2200)</script>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'set-cookie': `${COOKIE}=; Path=/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax` } },
  )
