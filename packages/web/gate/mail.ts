/**
 * The "you're in" email, sent when the bot approves a row (`gate/bot.ts`). Through Resend, like the
 * request notice in `gate/waitlist.ts`, but to the person on the list — which Resend only delivers
 * from a domain verified on the account (`onboarding@resend.dev` reaches the account's own address
 * alone). Optional: without `MAIL_FROM` nothing is sent and the bot says so.
 *
 *   RESEND_API_KEY  Secret — the same key as the request notice
 *   MAIL_FROM       the sender on the verified domain, e.g. `YieldCircle <team@yieldcircle.io>`
 */
import { TELEGRAM_URL } from '../../design/brand'

export interface MailEnv {
  RESEND_API_KEY?: string
  MAIL_FROM?: string
}

const APP_URL = 'https://app.yieldcircle.io'
const REPLY_TO = 'team@yieldcircle.io'

export const mailOn = (env: MailEnv) => !!(env.RESEND_API_KEY && env.MAIL_FROM)

/**
 * What they can do now: a wallet signs in on the web; the iPhone app comes as Apple's own TestFlight
 * mail (`testflight`: whether the invite went out with this approval). Resolves to what happened.
 */
export async function welcome(env: MailEnv, to: string, address: string | undefined, testflight: boolean): Promise<string> {
  const lines = [
    "You're in — welcome to YieldCircle.",
    '',
    ...(address
      ? [`Your wallet ${address} is now on the list. Open ${APP_URL}, connect it and sign once to enter (free, never a transaction).`, '']
      : []),
    ...(testflight
      ? ['The invite to the iPhone app comes in a separate email from Apple (TestFlight). Install the TestFlight app on your iPhone, then open the invite on the phone and accept it.', '']
      : []),
    address
      ? 'No wallet on this device? Paper trading works everywhere: play money, real rates.'
      : 'No wallet yet? No problem: paper trading needs none. Play money, real rates — connect a wallet whenever you have one.',
    '',
    `Questions or feedback: just reply to this email, or find us on Telegram: ${TELEGRAM_URL}`,
  ]
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], reply_to: REPLY_TO, subject: "You're in — YieldCircle", text: lines.join('\n') }),
  }).catch((e) => new Response(String(e), { status: 599 }))
  if (res.ok) return `Welcome email sent to ${to}`
  return `Welcome email failed: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`
}
