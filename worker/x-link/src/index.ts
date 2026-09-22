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
 * State lives in one KV namespace with a ten-minute TTL — a challenge is not
 * worth a database.
 *
 * Bindings (wrangler.toml / secrets):
 *   XLINK          KV namespace
 *   X_CLIENT_ID    the app's client id          (var)
 *   X_CLIENT_SECRET                             (secret)
 *   SOCIAL_URL     https://social.1delta.io     (var)
 *   XLINK_SECRET   shared with the social service (secret)
 *   REDIRECT_URI   this worker's /callback url  (var)
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

const cors = (env: Env) => ({
  'access-control-allow-origin': env.ALLOWED_ORIGIN || '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
})
const json = (env: Env, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors(env) } })

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

interface Pending { account: string; nonce: string; action: string; verifier: string; signed: unknown }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) })

    // 1 — a nonce bound to this address, which both halves will quote
    if (url.pathname === '/challenge') {
      const account = (url.searchParams.get('account') ?? '').toLowerCase()
      if (!ADDR.test(account)) return json(env, { error: 'bad address' }, 400)
      const nonce = rand(16)
      await env.XLINK.put(`n:${nonce}`, account, { expirationTtl: TTL })
      return json(env, { nonce })
    }

    // 2 — the signed half arrives; hand back the authorize url
    if (url.pathname === '/begin' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as {
        account?: string; nonce?: string; action?: string; signed?: { message?: Record<string, unknown> }
      }
      const account = (body.account ?? '').toLowerCase()
      const nonce = body.nonce ?? ''
      const action = body.action === 'unlink' ? 'unlink' : 'link'
      if (!ADDR.test(account)) return json(env, { error: 'bad address' }, 400)
      if ((await env.XLINK.get(`n:${nonce}`)) !== account)
        return json(env, { error: 'unknown or expired challenge' }, 400)
      // the signature must be over THIS nonce and THIS address: the worker
      // does not verify it (the social service recovers the signer), but it
      // will not carry a message that disagrees with what it issued
      const m = body.signed?.message ?? {}
      if (String(m.nonce) !== nonce || String(m.author).toLowerCase() !== account || String(m.action) !== action)
        return json(env, { error: 'the signed message does not match the challenge' }, 400)

      if (action === 'unlink') {
        const r = await post(env, { signed: body.signed })
        await env.XLINK.delete(`n:${nonce}`)
        return json(env, r.ok ? { ok: true } : { error: 'the social service refused the unlink' }, r.ok ? 200 : 502)
      }

      const verifier = rand(32)
      const pending: Pending = { account, nonce, action, verifier, signed: body.signed }
      await env.XLINK.put(`p:${nonce}`, JSON.stringify(pending), { expirationTtl: TTL })
      const auth = new URL('https://x.com/i/oauth2/authorize')
      auth.searchParams.set('response_type', 'code')
      auth.searchParams.set('client_id', env.X_CLIENT_ID)
      auth.searchParams.set('redirect_uri', env.REDIRECT_URI)
      auth.searchParams.set('scope', 'users.read tweet.read')
      auth.searchParams.set('state', nonce)
      auth.searchParams.set('code_challenge', await challengeOf(verifier))
      auth.searchParams.set('code_challenge_method', 'S256')
      return json(env, { url: auth.toString() })
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
      await env.XLINK.delete(`p:${state}`)
      await env.XLINK.delete(`n:${state}`)

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

    return json(env, { error: 'not found' }, 404)
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
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
