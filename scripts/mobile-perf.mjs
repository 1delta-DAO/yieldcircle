#!/usr/bin/env node
/**
 * The phone app's speed, measured (docs/mobile-perf.md): its browser render under a throttled
 * CPU, tab by tab, with a CPU profile of the whole run — what holds the thread, by function.
 *
 * The browser is not the phone: V8 has a JIT and Hermes does not, and the DOM is not Fabric. But
 * the JS is the same bundle — the hooks, the catalogue, React's render — and that is where the
 * phone's time went. Read the numbers against each other (before / after), not as the phone's.
 *
 *   1. export the app for the browser, unminified so the profile has names (from mobile/):
 *        EXPO_PUBLIC_BACKEND_BASE_URL=… npx expo export --platform web --no-minify --output-dir <dir>
 *   2. node scripts/mobile-perf.mjs <dir> <label> [--as=0x…] [--rate=6]
 *
 * `--as` reads a wallet without connecting it (the phone's browser-only `?as=`, src/session.tsx):
 * a book with positions is the case that hurts. Writes `.harness/mobile-perf/prof-<label>.txt`
 * (the table and the profile's top), `.cpuprofile` (open in Chrome DevTools) and `.png`.
 */
import http from 'node:http'
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, extname } from 'node:path'
import { chromium } from 'playwright'

const [dir, label, ...rest] = process.argv.slice(2)
if (!dir || !label) { console.error('usage: node scripts/mobile-perf.mjs <export dir> <label> [--as=0x…] [--rate=6]'); process.exit(1) }
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')))
const RATE = Number(opt.rate ?? 6)
const OUT = join(import.meta.dirname, '..', '.harness', 'mobile-perf')
mkdirSync(OUT, { recursive: true })
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.css': 'text/css', '.ico': 'image/x-icon' }
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let f = join(dir, p)
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(dir, 'index.html')
  res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise((r) => server.listen(0, r))
const base = `http://localhost:${server.address().port}`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
await page.addInitScript(() => {
  window.__lt = []
  window.__ev = []
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push({ t: e.startTime, d: e.duration }) }).observe({ type: 'longtask', buffered: true })
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'click' || e.name === 'pointerup') window.__ev.push({ n: e.name, t: e.startTime, d: e.duration }) }).observe({ type: 'event', durationThreshold: 16, buffered: true })
})
const cdp = await page.context().newCDPSession(page)

const t0 = Date.now()
await page.goto(`${base}/${opt.as ? `?as=${opt.as}` : ''}`)
await page.getByRole('tab', { name: 'Earn' }).waitFor({ timeout: 60_000 })
// let the catalogue land, unthrottled: the measurement is of a settled app
await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(() => {})
await page.waitForTimeout(6000)
const loadMs = Date.now() - t0

await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE })
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 500 })
await cdp.send('Profiler.start')

const mark = () => page.evaluate(() => ({ now: performance.now(), lt: window.__lt.length, ev: window.__ev.length }))
const since = (m) => page.evaluate((m) => ({
  blocked: window.__lt.slice(m.lt).reduce((a, e) => a + e.d, 0),
  longest: Math.max(0, ...window.__lt.slice(m.lt).map((e) => e.d)),
  tasks: window.__lt.length - m.lt,
  click: Math.max(0, ...window.__ev.slice(m.ev).map((e) => e.d)),
}), m)

const steps = []
async function tap(name, what) {
  const m = await mark()
  const t = Date.now()
  await what()
  // two frames after the tap, then let any follow-up work show
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const toFrame = Date.now() - t
  await page.waitForTimeout(2500)
  steps.push({ name, toFrame, ...(await since(m)) })
}
const tab = (n) => () => page.getByRole('tab', { name: n }).click()

await tap('Earn (first)', tab('Earn'))
await tap('Board (first)', tab('Board'))
await tap('Home (back)', tab('Home'))
await tap('Earn (again)', tab('Earn'))
await tap('Board (again)', tab('Board'))
await tap('Home (again)', tab('Home'))
await tap('Earn (3rd)', tab('Earn'))
await tap('Earn: pick Dollars', () => page.getByText('Dollars', { exact: true }).first().click())
await tap('Home (4th)', tab('Home'))
// idle: what the app burns while nothing is touched
{
  const m = await mark()
  await page.waitForTimeout(20_000)
  steps.push({ name: 'idle 20 s', toFrame: 0, ...(await since(m)) })
}

const { profile } = await cdp.send('Profiler.stop')
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })

// self and inclusive time per function
const byId = new Map(profile.nodes.map((n) => [n.id, n]))
const selfUs = new Map()
for (let i = 0; i < profile.samples.length; i++) selfUs.set(profile.samples[i], (selfUs.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0))
const incl = new Map(), self = new Map()
const nameOf = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop().slice(0, 28)}:${n.callFrame.lineNumber}`
function walk(n, stack) {
  const k = nameOf(n)
  const mine = selfUs.get(n.id) ?? 0
  self.set(k, (self.get(k) ?? 0) + mine)
  let total = mine
  const fresh = !stack.has(k)
  if (fresh) stack.add(k)
  for (const c of n.children ?? []) total += walk(byId.get(c), stack)
  if (fresh) { stack.delete(k); incl.set(k, (incl.get(k) ?? 0) + total) }
  return total
}
const total = walk(profile.nodes[0], new Set())
const skip = /^\((root|program|idle|garbage collector)\)/
const top = (m, n) => [...m].filter(([k]) => !skip.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / 1000).toFixed(0).padStart(7)} ms  ${k}`)
const idle = [...self].filter(([k]) => /^\((idle|program)\)/.test(k)).reduce((a, [, v]) => a + v, 0)

const out = [
  `# ${label} — CPU ×${RATE}${opt.as ? `, as ${opt.as}` : ', no wallet'} (load ${loadMs} ms unthrottled)`,
  '',
  'step                     to-frame  click→paint  blocked  longest  tasks',
  ...steps.map((s) => `${s.name.padEnd(24)} ${String(s.toFrame).padStart(7)}  ${String(Math.round(s.click)).padStart(10)}  ${String(Math.round(s.blocked)).padStart(7)}  ${String(Math.round(s.longest)).padStart(7)}  ${String(s.tasks).padStart(5)}`),
  '',
  `profile: ${(total / 1000).toFixed(0)} ms, of it busy ${((total - idle) / 1000).toFixed(0)} ms`,
  '', '## self time', ...top(self, 28),
  '', '## inclusive time', ...top(incl, 45),
  '', `errors: ${errors.slice(0, 5).join(' | ') || 'none'}`,
].join('\n')
writeFileSync(join(OUT, `prof-${label}.txt`), out)
writeFileSync(join(OUT, `prof-${label}.cpuprofile`), JSON.stringify(profile))
await page.screenshot({ path: join(OUT, `prof-${label}.png`) })
console.log(out)
await browser.close()
server.close()
