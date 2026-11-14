/**
 * Invite an email to the iPhone app's TestFlight group through the App Store Connect API — what the
 * bot's Approve does for the email on the row (`gate/bot.ts`). Optional: without the four secrets
 * the bot approves as before and says to add the tester by hand.
 *
 *   ASC_KEY_ID       the API key's id (App Store Connect → Users and Access → Integrations → Team Keys,
 *                    role App Manager)
 *   ASC_ISSUER_ID    the issuer id shown above the keys
 *   ASC_PRIVATE_KEY  Secret — the whole downloaded `AuthKey_<id>.p8`, BEGIN/END lines included
 *   ASC_GROUP_ID     the beta group's id (Alpha): the last part of its URL in App Store Connect
 */
export interface TestFlightEnv {
  ASC_KEY_ID?: string
  ASC_ISSUER_ID?: string
  ASC_PRIVATE_KEY?: string
  ASC_GROUP_ID?: string
}

const API = 'https://api.appstoreconnect.apple.com/v1'

export const testflightOn = (env: TestFlightEnv) => !!(env.ASC_KEY_ID && env.ASC_ISSUER_ID && env.ASC_PRIVATE_KEY && env.ASC_GROUP_ID)

const b64url = (b: Uint8Array | string) =>
  btoa(typeof b === 'string' ? b : String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** The API's bearer: an ES256 JWT signed with the .p8 key, good for 20 minutes at most. */
async function token(env: TestFlightEnv): Promise<string> {
  const der = Uint8Array.from(atob(env.ASC_PRIVATE_KEY!.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT' }))
  const body = b64url(JSON.stringify({ iss: env.ASC_ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' }))
  // WebCrypto signs ECDSA as r‖s, which is the JWT encoding already
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${body}`)))
  return `${head}.${body}.${b64url(sig)}`
}

/**
 * Add the email to the group; Apple mails the invite. Someone who is already a tester (409) is
 * added to the group instead. Resolves to what happened, in words for the bot.
 */
export async function invite(env: TestFlightEnv, email: string): Promise<string> {
  try {
    const auth = { authorization: `Bearer ${await token(env)}`, 'content-type': 'application/json' }
    const group = { type: 'betaGroups', id: env.ASC_GROUP_ID }
    const res = await fetch(`${API}/betaTesters`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ data: { type: 'betaTesters', attributes: { email }, relationships: { betaGroups: { data: [group] } } } }),
    })
    if (res.ok) return 'TestFlight invite sent'
    if (res.status !== 409) return `TestFlight failed: ${res.status} ${await detail(res)}`

    const found = await fetch(`${API}/betaTesters?filter[email]=${encodeURIComponent(email)}&limit=1`, { headers: auth })
    const id = ((await found.json().catch(() => ({}))) as { data?: { id: string }[] }).data?.[0]?.id
    if (!id) return 'TestFlight: already a tester'
    const add = await fetch(`${API}/betaGroups/${env.ASC_GROUP_ID}/relationships/betaTesters`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ data: [{ type: 'betaTesters', id }] }),
    })
    return add.ok ? 'TestFlight: already a tester, now in the group' : `TestFlight failed: ${add.status} ${await detail(add)}`
  } catch (e) {
    return `TestFlight failed: ${e instanceof Error ? e.message : String(e)}`
  }
}

async function detail(res: Response): Promise<string> {
  const out = (await res.json().catch(() => ({}))) as { errors?: { detail?: string; title?: string }[] }
  return out.errors?.[0]?.detail ?? out.errors?.[0]?.title ?? ''
}
