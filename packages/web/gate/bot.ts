/**
 * The waitlist's Telegram bot: its webhook, `POST /gate/telegram` on the app
 * (`functions/_middleware.ts`). Only the admins' user ids (`TELEGRAM_ADMIN`) are answered; anyone
 * else is told their id and nothing more. Made for approving someone on the spot — they sign up on
 * their phone, the request pops up here with an Approve button (`gate/telegram.ts`, `announce`).
 *
 *   /pending        the newest rows still waiting, each with Approve
 *   /find <text>    rows whose email or address has it (any message without a slash does the same)
 *   /approve <text> approve the one waiting row that matches
 *   /invite <email> a TestFlight invite for any email, on the list or not
 *   /all            every row as a CSV file
 *   /stats          the counts
 *
 * Approve whitelists the row's wallet (it signs in on the app) and, with the App Store Connect
 * secrets set (`gate/testflight.ts`), invites its email to TestFlight.
 *
 *   TELEGRAM_WEBHOOK_SECRET  Secret — the `secret_token` the webhook was registered with
 *                            (`pnpm telegram webhook`); Telegram sends it on every update
 */
import { approve, entries, type Entry, type WaitlistEnv } from './waitlist'
import { admins, esc, line, rowId, short, tg } from './telegram'
import { invite, testflightOn, type TestFlightEnv } from './testflight'

export interface BotEnv extends WaitlistEnv, TestFlightEnv {
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_WEBHOOK_SECRET: string
}

interface Update {
  message?: { chat: { id: number }; from?: { id: number }; text?: string }
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number } } }
}

const SHOWN = 15

const ok = () => new Response('ok')

/** Equal strings, compared without stopping at the first difference. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export async function webhook(request: Request, env: BotEnv): Promise<Response> {
  if (!same(request.headers.get('x-telegram-bot-api-secret-token') ?? '', env.TELEGRAM_WEBHOOK_SECRET)) return new Response('forbidden', { status: 403 })
  const u = (await request.json().catch(() => null)) as Update | null
  const from = u?.message?.from?.id ?? u?.callback_query?.from.id
  const chat = u?.message?.chat.id ?? u?.callback_query?.message?.chat.id
  if (!u || from === undefined || chat === undefined) return ok()
  if (!admins(env).includes(String(from))) {
    if (u.message) await say(env, chat, `This bot is private. Your Telegram user id is <code>${from}</code>.`)
    return ok()
  }
  // always 200: Telegram resends an update it got an error for, and a resent Approve is no use
  try {
    if (u.callback_query) await button(env, chat, u.callback_query)
    else if (u.message?.text) await command(env, chat, u.message.text.trim())
  } catch (e) {
    await say(env, chat, `Something broke: ${esc(e instanceof Error ? e.message : String(e))}`)
  }
  return ok()
}

const say = (env: BotEnv, chat: number, text: string, buttons?: { text: string; callback_data: string }[][]) =>
  tg(env, 'sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}) })

async function command(env: BotEnv, chat: number, text: string): Promise<void> {
  const [head, ...rest] = text.split(/\s+/)
  const arg = rest.join(' ').toLowerCase()
  const cmd = head.startsWith('/') ? head.slice(1).replace(/@.*/, '').toLowerCase() : 'find'
  const query = head.startsWith('/') ? arg : text.toLowerCase()

  switch (cmd) {
    case 'start':
    case 'help':
      return void (await say(env, chat, [
        'Waitlist bot. New requests show up here with an Approve button.',
        '',
        '/pending — the newest still waiting',
        '/find &lt;email or address&gt; — or just send the text',
        '/approve &lt;email or address&gt;',
        '/invite &lt;email&gt; — TestFlight invite for any email',
        '/all — everything as CSV',
        '/stats — counts',
        '',
        testflightOn(env) ? 'Approve also sends the TestFlight invite.' : 'TestFlight is not connected: add approved emails to TestFlight by hand.',
      ].join('\n')))
    case 'pending': {
      const waiting = (await entries(env)).filter((e) => !e.ok)
      if (!waiting.length) return void (await say(env, chat, 'Nobody is waiting.'))
      return list(env, chat, `${waiting.length} waiting${waiting.length > SHOWN ? `, the newest ${SHOWN}` : ''}`, waiting.slice(0, SHOWN))
    }
    case 'find': {
      if (!query) return void (await say(env, chat, 'Send part of an email or an address.'))
      const hits = matching(await entries(env), query)
      if (!hits.length) return void (await say(env, chat, `Nothing matches <b>${esc(query)}</b>.`))
      return list(env, chat, `${hits.length} match${hits.length === 1 ? '' : 'es'}`, hits.slice(0, SHOWN))
    }
    case 'approve': {
      if (!query) return void (await say(env, chat, 'Usage: /approve &lt;email or address&gt;'))
      const hits = matching(await entries(env), query).filter((e) => !e.ok)
      if (hits.length === 1) return approveRow(env, chat, hits[0])
      if (!hits.length) return void (await say(env, chat, `No waiting row matches <b>${esc(query)}</b>.`))
      return list(env, chat, `${hits.length} waiting rows match — pick one`, hits.slice(0, SHOWN))
    }
    case 'invite': {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(arg)) return void (await say(env, chat, 'Usage: /invite &lt;email&gt;'))
      if (!testflightOn(env)) return void (await say(env, chat, 'TestFlight is not connected (the ASC_* secrets).'))
      return void (await say(env, chat, `${esc(arg)}: ${esc(await invite(env, arg))}`))
    }
    case 'all':
      return csv(env, chat, await entries(env))
    case 'stats': {
      const all = await entries(env)
      const waiting = all.filter((e) => !e.ok)
      const day = new Date(Date.now() - 86_400_000).toISOString()
      return void (await say(env, chat, [
        `${all.length} on the list, ${waiting.length} waiting`,
        `${waiting.filter((e) => e.address).length} waiting with a wallet, ${waiting.filter((e) => !e.address).length} email only`,
        `${all.filter((e) => e.ts >= day).length} joined in the last 24 h`,
      ].join('\n')))
    }
    default:
      return void (await say(env, chat, 'Unknown command. /help'))
  }
}

const matching = (rows: Entry[], q: string) => rows.filter((e) => e.email.includes(q) || (e.address ?? '').toLowerCase().includes(q))

const ago = (ts: string) => {
  const m = Math.round((Date.now() - Date.parse(ts)) / 60_000)
  if (!(m >= 0)) return ''
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

/** Rows as one message, an Approve button for each one still waiting. */
async function list(env: BotEnv, chat: number, title: string, rows: Entry[]): Promise<void> {
  const text = [title, ...rows.map((e, i) => `\n${i + 1}. ${line(e.address, e.email)}\n${e.ok ? '✓ approved' : 'waiting'} · ${ago(e.ts)}`)].join('\n')
  const buttons = await Promise.all(rows.map(async (e, i) => (e.ok ? null : [{ text: `✓ ${i + 1}. ${e.email || short(e.address ?? '')}`.slice(0, 60), callback_data: `ok:${await rowId(e.address, e.email)}` }])))
  await say(env, chat, text, buttons.filter((b) => b !== null))
}

async function button(env: BotEnv, chat: number, q: NonNullable<Update['callback_query']>): Promise<void> {
  const id = q.data?.startsWith('ok:') ? q.data.slice(3) : null
  const all = id ? await entries(env) : []
  const ids = await Promise.all(all.map((e) => rowId(e.address, e.email)))
  const e = all[ids.indexOf(id ?? '')]
  if (!e) return void (await tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text: 'Not on the list (any more)' }))
  if (e.ok) return void (await tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text: 'Already approved' }))
  await tg(env, 'answerCallbackQuery', { callback_query_id: q.id, text: 'Approving…' })
  await approveRow(env, chat, e)
}

async function approveRow(env: BotEnv, chat: number, e: Entry): Promise<void> {
  await approve(env, e)
  const done = [e.address ? 'Wallet whitelisted: they sign in on the app.' : 'Approved (no wallet: paper only until they join with one).']
  if (e.email) done.push(testflightOn(env) ? await invite(env, e.email) : 'Add the email to TestFlight by hand.')
  await say(env, chat, `✓ ${line(e.address, e.email)}\n${done.map(esc).join('\n')}`)
}

async function csv(env: BotEnv, chat: number, rows: Entry[]): Promise<void> {
  const cell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const body = ['email,address,joined,status', ...rows.map((e) => [e.email, e.address ?? '', e.ts, e.ok ? 'approved' : 'waiting'].map(cell).join(','))].join('\n') + '\n'
  const form = new FormData()
  form.set('chat_id', String(chat))
  form.set('caption', `${rows.length} rows`)
  form.set('document', new Blob([body], { type: 'text/csv' }), `waitlist-${new Date().toISOString().slice(0, 10)}.csv`)
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: 'POST', body: form })
  if (!res.ok) await say(env, chat, `Could not send the file: ${res.status}`)
}
