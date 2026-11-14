/**
 * The Telegram side of the waitlist, the low half: calling the Bot API and announcing a new request
 * to the admins with an Approve button. The bot's webhook (`gate/bot.ts`) answers those buttons.
 * Kept free of the waitlist store so `gate/waitlist.ts` can import it without a cycle.
 *
 *   TELEGRAM_BOT_TOKEN  Secret — from @BotFather
 *   TELEGRAM_ADMIN      the Telegram user ids allowed to use the bot, comma-separated (the bot tells
 *                       anyone else their id, so message it once to learn yours)
 */
export interface TelegramEnv {
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_ADMIN?: string
}

export const admins = (env: TelegramEnv) => (env.TELEGRAM_ADMIN ?? '').split(',').map((s) => s.trim()).filter(Boolean)

export const telegramOn = (env: TelegramEnv) => !!env.TELEGRAM_BOT_TOKEN && admins(env).length > 0

/** One Bot API call. A failure is logged and comes back as null — the waitlist never waits on Telegram. */
export async function tg(env: TelegramEnv, method: string, body: unknown): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch((e) => new Response(JSON.stringify({ ok: false, description: String(e) }), { status: 599 }))
  const out = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; description?: string }
  if (!out.ok) console.error('telegram', method, res.status, out.description)
  return out.ok ? out.result : null
}

/**
 * The id a button carries (`callback_data`, 64 bytes at most): a wallet row by its address, an
 * email-only row by a hash of the email, which can be longer than the button allows.
 */
export async function rowId(address: string | undefined, email: string): Promise<string> {
  if (address) return `w:${address}`
  const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email)))
  return `m:${Array.from(sum.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('')}`
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

/** A waitlist row as the bot writes it: the email, then the wallet or that there is none. */
export const line = (address: string | undefined, email: string) =>
  `<b>${esc(email || '(no email)')}</b>\n${address ? `<code>${esc(address)}</code>` : '<i>no wallet</i>'}`

/** A new request, to every admin, with the button that approves it on the spot. */
export async function announce(env: TelegramEnv, address: string | undefined, email: string): Promise<void> {
  const id = await rowId(address, email)
  await Promise.all(admins(env).map((chat) => tg(env, 'sendMessage', {
    chat_id: chat,
    parse_mode: 'HTML',
    text: `New on the waitlist\n${line(address, email)}`,
    reply_markup: { inline_keyboard: [[{ text: '✓ Approve', callback_data: `ok:${id}` }]] },
  })))
}
