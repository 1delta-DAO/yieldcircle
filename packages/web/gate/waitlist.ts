/**
 * The waitlist's server side, shared by both deployments: the app's Pages
 * middleware (`functions/_middleware.ts`, which adds sign-in on top) and the
 * landing's Worker (`landing/worker.ts`, which only puts visitors in line).
 * Both bind the same `WHITELIST` KV namespace, so a wallet joined on the
 * landing is the wallet the app's gate finds.
 *
 *   GET  /gate/check?address=…  whitelisted, waitlisted, or neither (membership is not a secret)
 *   POST /gate/request          put an address in line, no signature
 */
import { isAddress } from 'viem'
import { norm } from './page'
import { isSolAddr } from '../src/model/address'

export interface KV {
  get(key: string): Promise<string | null>
  getWithMetadata<M>(key: string): Promise<{ value: string | null; metadata: M | null }>
  put(key: string, value: string, options?: { metadata?: unknown }): Promise<void>
}
export interface WaitlistEnv {
  WHITELIST: KV
  RESEND_API_KEY?: string
  NOTIFY_EMAIL?: string
}
export type WaitUntil = (p: Promise<unknown>) => void

const NOTIFY_EMAIL = 'achim@1delta.io'
const THREAD_ANCHOR = '<beta-requests@yieldcircle.io>'
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/

export const okAddress = (a: string) => isAddress(a) || isSolAddr(a)

/** GET /gate/check?address=0x… — whitelisted, waitlisted, or neither (membership is not a secret) */
export async function check(url: URL, env: WaitlistEnv): Promise<Response> {
  const address = url.searchParams.get('address') ?? ''
  if (!okAddress(address)) return json({ error: 'bad address' }, 400)
  const account = norm(address)
  if (await env.WHITELIST.get(`wl:${account}`)) return json({ listed: true })
  return json({ listed: false, waitlisted: !!(await env.WHITELIST.get(`wait:${account}`)) })
}

/**
 * POST /gate/request — put an address in line, no signature. Nothing is proven, so nothing is
 * overwritten: an address already in line keeps its first email (anyone could send this one).
 */
export async function join(request: Request, env: WaitlistEnv, waitUntil: WaitUntil): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { address?: string; email?: string } | null
  const address = body?.address
  const email = body?.email?.trim().toLowerCase() ?? ''
  if (!address || !okAddress(address)) return json({ error: 'bad request' }, 400)
  if (!EMAIL.test(email)) return json({ error: 'enter a valid email address' }, 400)

  const account = norm(address)
  if (await env.WHITELIST.get(`wl:${account}`)) return json({ listed: true })
  const key = `wait:${account}`
  if (await env.WHITELIST.get(key)) return json({ listed: false, requested: true, again: true })
  const ts = new Date().toISOString()
  await env.WHITELIST.put(key, JSON.stringify({ ts, email }), { metadata: { ts, email } })
  if (env.RESEND_API_KEY) waitUntil(notify(env, account, email, ts))
  return json({ listed: false, requested: true, again: false })
}

/** One email per new request. A failure is logged, never shown — the request is stored either way. */
async function notify(env: WaitlistEnv, account: string, email: string, ts: string): Promise<void> {
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

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } })
