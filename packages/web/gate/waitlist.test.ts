import { afterEach, describe, expect, it, vi } from 'vitest'
import { approve, entries, join, type KV } from './waitlist'
import { webhook, type BotEnv } from './bot'

/** The KV namespace in memory, with the binding's `list` (metadata included). */
function memoryKV(): KV & { rows: Map<string, { value: string; metadata?: unknown }> } {
  const rows = new Map<string, { value: string; metadata?: unknown }>()
  return {
    rows,
    get: async (k) => rows.get(k)?.value ?? null,
    getWithMetadata: async <M,>(k: string) => ({ value: rows.get(k)?.value ?? null, metadata: (rows.get(k)?.metadata ?? null) as M | null }),
    put: async (k, value, o) => void rows.set(k, { value, metadata: o?.metadata }),
    list: async ({ prefix }) => ({ keys: [...rows].filter(([k]) => k.startsWith(prefix)).map(([name, r]) => ({ name, metadata: r.metadata })), list_complete: true }),
  }
}

const request = (body: unknown) => new Request('https://x/gate/request', { method: 'POST', body: JSON.stringify(body) })
const noWait = () => {}

afterEach(() => vi.unstubAllGlobals())

describe('the waitlist without a wallet', () => {
  it('puts an email alone in line, once', async () => {
    const env = { WHITELIST: memoryKV() }
    const first = await (await join(request({ email: ' Me@Example.com ' }), env, noWait)).json()
    expect(first).toEqual({ listed: false, requested: true, again: false })
    expect(env.WHITELIST.rows.has('mail:me@example.com')).toBe(true)
    expect(await (await join(request({ email: 'me@example.com' }), env, noWait)).json()).toMatchObject({ again: true })
  })

  it('still rejects a bad address or email', async () => {
    const env = { WHITELIST: memoryKV() }
    expect((await join(request({ address: 'nope', email: 'a@b.co' }), env, noWait)).status).toBe(400)
    expect((await join(request({ email: 'nope' }), env, noWait)).status).toBe(400)
  })

  it('lists both kinds, and approving a wallet covers its email-only row', async () => {
    const env = { WHITELIST: memoryKV() }
    const a = '0x' + 'ab'.repeat(20)
    await join(request({ email: 'me@example.com' }), env, noWait)
    await join(request({ address: a, email: 'me@example.com' }), env, noWait)
    await join(request({ email: 'other@example.com' }), env, noWait)
    const rows = await entries(env)
    expect(rows.map((r) => [r.address ?? '', r.email, r.ok])).toHaveLength(3)
    await approve(env, rows.find((r) => r.address)!)
    expect(env.WHITELIST.rows.has(`wl:${a}`)).toBe(true)
    const after = await entries(env)
    expect(after.filter((r) => r.ok).map((r) => r.email).sort()).toEqual(['me@example.com', 'me@example.com'])
    await approve(env, after.find((r) => r.email === 'other@example.com')!)
    expect((await entries(env)).every((r) => r.ok)).toBe(true)
  })
})

describe('the bot', () => {
  const env = (): BotEnv => ({ WHITELIST: memoryKV(), TELEGRAM_BOT_TOKEN: 't', TELEGRAM_WEBHOOK_SECRET: 's'.repeat(20), TELEGRAM_ADMIN: '42' })
  const update = (e: BotEnv, body: unknown, secret = e.TELEGRAM_WEBHOOK_SECRET) =>
    webhook(new Request('https://x/gate/telegram', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(body) }), e)
  const telegram = () => {
    const sent: { method: string; body: Record<string, unknown> }[] = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      sent.push({ method: url.split('/').pop()!, body: JSON.parse(String(init.body)) })
      return new Response(JSON.stringify({ ok: true, result: {} }))
    })
    return sent
  }

  it('refuses a wrong secret and answers only the admins', async () => {
    const e = env()
    const sent = telegram()
    expect((await update(e, {}, 'wrong')).status).toBe(403)
    await update(e, { message: { chat: { id: 7 }, from: { id: 7 }, text: '/all' } })
    expect(sent).toHaveLength(1)
    expect(String(sent[0].body.text)).toContain('private')
  })

  it('announces a request and approves it from its button', async () => {
    const e = env()
    const sent = telegram()
    const waits: Promise<unknown>[] = []
    await join(request({ email: 'met@conf.io' }), e, (p) => waits.push(p))
    await Promise.all(waits)
    const button = (sent[0].body.reply_markup as { inline_keyboard: { callback_data: string }[][] }).inline_keyboard[0][0]
    await update(e, { callback_query: { id: 'q', from: { id: 42 }, data: button.callback_data, message: { chat: { id: 42 } } } })
    expect((await entries(e))[0].ok).toBe(true)
    expect(sent.some((s) => s.method === 'sendMessage' && String(s.body.text).startsWith('✓'))).toBe(true)
  })

  it('lists the waiting wallets, and mails the approved', async () => {
    const e = { ...env(), RESEND_API_KEY: 'r', MAIL_FROM: 'YieldCircle <team@yieldcircle.io>' }
    const sent = telegram()
    const a = '0x' + 'cd'.repeat(20)
    await join(request({ address: a, email: 'w@conf.io' }), e, noWait)
    await join(request({ email: 'nowallet@conf.io' }), e, noWait)
    await update(e, { message: { chat: { id: 42 }, from: { id: 42 }, text: '/wallets' } })
    expect(String(sent[0].body.text)).toContain(a)
    expect(String(sent[0].body.text)).not.toContain('nowallet')
    await update(e, { message: { chat: { id: 42 }, from: { id: 42 }, text: `/approve ${a}` } })
    // the first mail is the request notice to the team; the welcome is the last
    const mail = sent.filter((s) => s.method === 'emails').at(-1)
    expect(mail?.body).toMatchObject({ to: ['w@conf.io'] })
    expect(String(mail?.body.text)).toContain(a)
  })
})
