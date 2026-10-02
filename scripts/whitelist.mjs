// Manage the closed-beta whitelist (tickets/0002) in the WHITELIST KV namespace.
//
//   node scripts/whitelist.mjs add 0xabc… 0xdef… [--source team]   whitelist addresses
//   node scripts/whitelist.mjs add --file wave1.txt [--source wave1] one address per line
//   node scripts/whitelist.mjs remove 0xabc…
//   node scripts/whitelist.mjs list                                 whitelisted wallets
//   node scripts/whitelist.mjs waitlist                             requests from /lineup as CSV: address,email,when
//   node scripts/whitelist.mjs wait 0xabc… [--email you@x.y]        waitlist addresses by hand (same write as the gate)
//   node scripts/whitelist.mjs promote 100                          whitelist the 100 oldest waitlist entries
//
// Both layers in one go (the wait: row is kept for the record; wl: wins):
//   node scripts/whitelist.mjs wait 0xabc… --email you@x.y && node scripts/whitelist.mjs add 0xabc…
//
// Keys are always lower-cased: the gate looks up `wl:<lowercase address>`.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const NAMESPACE = '23ce3e9b23224ce09a4cd4f486480870'
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID ?? 'd8773eeff51cfcf5d53f08344acae545'

const wrangler = (...args) =>
  execFileSync('npx', ['--yes', 'wrangler@4', 'kv', ...args, '--namespace-id', NAMESPACE, '--remote'], {
    encoding: 'utf8',
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT },
    stdio: ['ignore', 'pipe', 'inherit'],
  })

const [cmd, ...rest] = process.argv.slice(2)
const flag = (name) => { const i = rest.indexOf(`--${name}`); return i < 0 ? undefined : rest.splice(i, 2)[1] }

const addresses = (list) => {
  const out = list.map((a) => a.trim().toLowerCase()).filter(Boolean)
  const bad = out.filter((a) => !/^0x[0-9a-f]{40}$/.test(a))
  if (bad.length) { console.error(`not an address: ${bad.join(', ')}`); process.exit(1) }
  return [...new Set(out)]
}

const entries = (prefix) => JSON.parse(wrangler('key', 'list', '--prefix', prefix))
const keys = (prefix) => entries(prefix).map((k) => k.name)
const pending = () => {
  const listed = new Set(keys('wl:').map((k) => k.slice(3)))
  return entries('wait:')
    .map((k) => ({ a: k.name.slice(5), email: k.metadata?.email ?? '', ts: k.metadata?.ts ?? '' }))
    .filter((x) => !listed.has(x.a))
    .sort((x, y) => x.ts.localeCompare(y.ts))
}

const bulk = (rows) => {
  const dir = mkdtempSync(join(tmpdir(), 'wl-'))
  const file = join(dir, 'bulk.json')
  writeFileSync(file, JSON.stringify(rows))
  wrangler('bulk', 'put', file)
}

const put = (list, source) => {
  const ts = new Date().toISOString()
  bulk(list.map((a) => ({ key: `wl:${a}`, value: JSON.stringify({ source, ts }) })))
  console.log(`whitelisted ${list.length}`)
}

switch (cmd) {
  case 'add': {
    const source = flag('source') ?? 'manual'
    const file = flag('file')
    const list = addresses(file ? readFileSync(file, 'utf8').split(/\s+/) : rest)
    if (!list.length) { console.error('no addresses given'); process.exit(1) }
    put(list, source)
    break
  }
  case 'remove':
    for (const a of addresses(rest)) wrangler('key', 'delete', `wl:${a}`)
    console.log('removed')
    break
  case 'list':
    console.log(keys('wl:').map((k) => k.slice(3)).join('\n'))
    break
  case 'waitlist':
    console.log(pending().map((x) => `${x.a},${x.email},${x.ts}`).join('\n'))
    break
  case 'wait': {
    const email = flag('email') ?? ''
    const list = addresses(rest)
    if (!list.length) { console.error('no addresses given'); process.exit(1) }
    const ts = new Date().toISOString()
    bulk(list.map((a) => ({ key: `wait:${a}`, value: JSON.stringify({ ts, email }), metadata: { ts, email } })))
    console.log(`waitlisted ${list.length}`)
    break
  }
  case 'promote': {
    const n = Number(rest[0])
    if (!(n > 0)) { console.error('usage: promote <count>'); process.exit(1) }
    const next = pending().slice(0, n).map((x) => x.a)
    if (next.length) put(next, 'waitlist')
    else console.log('waitlist is empty')
    break
  }
  default:
    console.error('usage: whitelist.mjs add|remove|list|waitlist|wait|promote — see the header of this file')
    process.exit(1)
}
