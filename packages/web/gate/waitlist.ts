/**
 * The waitlist's server side, shared by both deployments: the app's Pages
 * middleware (`functions/_middleware.ts`, which adds sign-in on top) and the
 * landing's Worker (`landing/worker.ts`, which only puts visitors in line).
 * Both bind the same `WHITELIST` KV namespace, so a wallet joined on the
 * landing is the wallet the app's gate finds.
 *
 *   GET  /gate/check?address=…  whitelisted, waitlisted, or neither (membership is not a secret)
 *   POST /gate/request          put an address in line, no signature — or just an email, no wallet
 *
 * Rows in `WHITELIST`: `wait:<address>` (a wallet in line, its email in the metadata), `mail:<email>`
 * (an email in line without a wallet — someone with no wallet yet, or on a device without one; on
 * the phone that is all it takes, the TestFlight invite goes to the email), `wl:<address>` (a wallet
 * let in). An email-only row is approved in place (`ok` in its metadata): there is no wallet to let in.
 */
import { isAddress } from 'viem'
import { norm } from './page'
import { isSolAddr } from '@yieldcircle/core/model/address'
import { announce, telegramOn, type TelegramEnv } from './telegram'

export interface KV {
  get(key: string): Promise<string | null>
  getWithMetadata<M>(key: string): Promise<{ value: string | null; metadata: M | null }>
  put(key: string, value: string, options?: { metadata?: unknown }): Promise<void>
  list(options: { prefix: string; cursor?: string }): Promise<{ keys: { name: string; metadata?: unknown }[]; list_complete: boolean; cursor?: string }>
}
export interface WaitlistEnv extends TelegramEnv {
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
 * POST /gate/request — put an address in line, no signature, or with no address an email alone.
 * Nothing is proven, so nothing is overwritten: a row already in line keeps its first email and
 * its place (anyone could send this one).
 */
export async function join(request: Request, env: WaitlistEnv, waitUntil: WaitUntil): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { address?: string; email?: string } | null
  const address = body?.address || undefined
  const email = body?.email?.trim().toLowerCase() ?? ''
  if (address !== undefined && (typeof address !== 'string' || !okAddress(address))) return json({ error: 'bad request' }, 400)
  if (!EMAIL.test(email)) return json({ error: 'enter a valid email address' }, 400)

  const account = address && norm(address)
  if (account && (await env.WHITELIST.get(`wl:${account}`))) return json({ listed: true })
  const key = account ? `wait:${account}` : `mail:${email}`
  if (await env.WHITELIST.get(key)) return json({ listed: false, requested: true, again: true })
  const ts = new Date().toISOString()
  await env.WHITELIST.put(key, JSON.stringify({ ts, email }), { metadata: { ts, email } })
  if (env.RESEND_API_KEY) waitUntil(notify(env, account ?? '', email, ts))
  if (telegramOn(env)) waitUntil(announce(env, account, email))
  return json({ listed: false, requested: true, again: false })
}

/** One row of the waitlist, wallet or email-only; `ok` once approved. */
export interface Entry {
  key: string
  address?: string
  email: string
  ts: string
  ok: boolean
}
type Meta = { ts?: string; email?: string; ok?: string }

async function keysOf(kv: KV, prefix: string) {
  const out: { name: string; metadata?: unknown }[] = []
  for (let cursor: string | undefined; ;) {
    const page = await kv.list({ prefix, cursor })
    out.push(...page.keys)
    if (page.list_complete || !page.cursor) return out
    cursor = page.cursor
  }
}

/**
 * Every row, newest first. A wallet is approved when it is whitelisted; an email-only row when it
 * says so, or when a wallet that joined with the same email was approved. (KV listings lag a write
 * by up to a minute, so a row approved a moment ago can still read as waiting.)
 */
export async function entries(env: WaitlistEnv): Promise<Entry[]> {
  const [wait, mail, wl] = await Promise.all(['wait:', 'mail:', 'wl:'].map((p) => keysOf(env.WHITELIST, p)))
  const listed = new Set(wl.map((k) => k.name.slice(3)))
  const rows: Entry[] = [
    ...wait.map((k) => {
      const m = (k.metadata ?? {}) as Meta
      const address = k.name.slice(5)
      return { key: k.name, address, email: m.email ?? '', ts: m.ts ?? '', ok: listed.has(address) }
    }),
    ...mail.map((k) => {
      const m = (k.metadata ?? {}) as Meta
      return { key: k.name, email: k.name.slice(5), ts: m.ts ?? '', ok: !!m.ok }
    }),
  ]
  const approvedEmails = new Set(rows.filter((r) => r.address && r.ok).map((r) => r.email))
  for (const r of rows) if (!r.address && approvedEmails.has(r.email)) r.ok = true
  return rows.sort((a, b) => b.ts.localeCompare(a.ts))
}

/** Let a row in: a wallet is whitelisted (as `pnpm whitelist add` does), an email-only row marked. */
export async function approve(env: WaitlistEnv, e: Entry, source = 'telegram'): Promise<void> {
  const ts = new Date().toISOString()
  if (e.address) await env.WHITELIST.put(`wl:${e.address}`, JSON.stringify({ source, ts }))
  else await env.WHITELIST.put(e.key, JSON.stringify({ ts: e.ts, email: e.email, ok: ts }), { metadata: { ts: e.ts, email: e.email, ok: ts } })
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
