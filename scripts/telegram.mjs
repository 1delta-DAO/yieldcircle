// The waitlist's Telegram bot (packages/web/gate/bot.ts): point it at the app and register its commands.
//
//   TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… node scripts/telegram.mjs webhook [url]
//       set the webhook (default https://app.yieldcircle.io/gate/telegram) with the secret the app
//       checks, and the command menu. The same two values go into the app's Pages secrets.
//   TELEGRAM_BOT_TOKEN=… node scripts/telegram.mjs info      what Telegram has: the webhook, its last error
//
// A new webhook secret: `openssl rand -hex 32` (letters, digits, _ and - only).
const [cmd, url = 'https://app.yieldcircle.io/gate/telegram'] = process.argv.slice(2)
const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) { console.error('set TELEGRAM_BOT_TOKEN'); process.exit(1) }

const call = async (method, body) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const out = await res.json()
  if (!out.ok) { console.error(method, out.description); process.exit(1) }
  return out.result
}

const COMMANDS = [
  ['pending', 'the newest still waiting'],
  ['find', 'rows matching an email or address'],
  ['approve', 'approve one waiting row'],
  ['invite', 'TestFlight invite for any email'],
  ['all', 'every row as CSV'],
  ['stats', 'counts'],
]

switch (cmd) {
  case 'webhook': {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!secret || !/^[A-Za-z0-9_-]{16,256}$/.test(secret)) { console.error('set TELEGRAM_WEBHOOK_SECRET (16+ of A-Z a-z 0-9 _ -)'); process.exit(1) }
    await call('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'callback_query'], drop_pending_updates: true })
    await call('setMyCommands', { commands: COMMANDS.map(([command, description]) => ({ command, description })) })
    const me = await call('getMe')
    console.log(`@${me.username} → ${url}`)
    break
  }
  case 'info':
    console.log(await call('getWebhookInfo'))
    break
  default:
    console.error('usage: telegram.mjs webhook [url] | info — see the header of this file')
    process.exit(1)
}
