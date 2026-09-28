/**
 * The mobile-refit measurement harness.
 *
 * Three questions, answered as numbers rather than opinions:
 *   1. does any page overflow its viewport?      scrollWidth vs innerWidth
 *   2. how many controls are too small to tap?   rects under --tap (44px)
 *   3. did the DESKTOP change?                   a hash per screenshot
 *
 * (3) is the point. The refit inverts a 900-line desktop-first stylesheet, and
 * "the desktop is unchanged" has to be a command, not a claim:
 *
 *   node scripts/shots.mjs --baseline     # before you touch anything
 *   node scripts/shots.mjs                # after every commit; exits 1 on a regression
 *
 * (3) only means anything if the page is DETERMINISTIC, and this app reads live
 * prices, a live feed and a live leaderboard — two runs a minute apart differ in
 * every number. So the harness records one set of API responses to a HAR and
 * replays it forever after, and pins the clock the ages are computed from:
 *
 *   node scripts/shots.mjs --record      # once, and again when you want fresh data
 *
 * Browsers: `npx playwright install chromium` once. If you already have one
 * cached under a different revision, point YC_CHROME at the binary.
 * Target: --url http://localhost:3200 (default) or --url https://yieldcircle.io.
 */
import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.join(HERE, '..')
const OUT = path.join(ROOT, '.harness')

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1] }
const has = (k) => process.argv.includes(k)

const BASE = arg('--url', 'http://localhost:3200')
/** A wallet with positions on several chains, so the "yours" surfaces are not empty. */
const AS = arg('--as', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')
const TAP = 44
const HAR = path.join(OUT, 'api.har')
/** Pinned so "3h ago" is the same string on every run. Arbitrary, and only has
 *  to sit AFTER the recorded data, or every age renders as a future date. */
const CLOCK = Number(arg('--clock', '1790000000000'))
/** Everything the app fetches is https; the dev server is http://localhost. */
const REMOTE = /^https:\/\//

/**
 * `open` runs after load and is how a route that is only reachable by clicking
 * (the ticket) gets measured without hard-coding a strategy id that rotates.
 */
const ROUTES = [
  { id: 'home', hash: '#/' },
  { id: 'earn', hash: '#/earn' },
  { id: 'asset', hash: '#/USD?u=USDC' },
  { id: 'ticket', hash: '#/USD?u=USDC', open: async (p) => p.locator('table.strat-t tbody tr, .slist .lr').first().click() },
  { id: 'board', hash: '#/board' },
  // the two sheets and the search: reachable only by a click, like the ticket. Each on its
  // own hash — a goto to the URL already open is a same-document jump that keeps the last sheet up
  { id: 'you', hash: '#/earn', open: async (p) => p.locator('button.meface').click() },
  { id: 'money', hash: '#/board', open: async (p) => p.locator('button.moneychip').click() },
  { id: 'search', hash: '#/', open: async (p) => p.locator('.search input').fill('usd') },
  { id: 'wallet', hash: `#/w/${AS.toLowerCase()}` },
]

/** Phone → desk. The three at the end are the ones that must not move. */
const WIDTHS = [320, 360, 390, 430, 600, 768, 900, 1080, 1280, 1440]
const DESK = [1080, 1280, 1440]

/**
 * What the page says about itself. Runs in the browser, so it must be
 * self-contained — no closures over anything out here.
 */
function probe(tap) {
  const vw = document.documentElement.clientWidth
  const inScroller = (el) => {
    for (let a = el.parentElement; a; a = a.parentElement) {
      const o = getComputedStyle(a).overflowX
      if (o === 'auto' || o === 'scroll') return true
    }
    return false
  }
  // an element past the edge INSIDE a horizontal scroller is a carousel, not a bug
  const over = []
  for (const el of document.querySelectorAll('body *')) {
    const b = el.getBoundingClientRect()
    if (b.width > 0 && (b.right > vw + 1 || b.left < -1) && !inScroller(el)) {
      const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.') : ''
      over.push(el.tagName.toLowerCase() + (cls ? '.' + cls : '') + ` @${Math.round(b.left)}..${Math.round(b.right)}`)
    }
  }
  const small = {}
  for (const el of document.querySelectorAll('a,button,input,select,textarea,[role="button"],[role="tab"]')) {
    const b = el.getBoundingClientRect()
    if (b.width === 0 || b.height === 0) continue
    if (b.height < tap || b.width < tap) {
      const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : ''
      const k = el.tagName.toLowerCase() + (cls ? '.' + cls : '')
      small[k] = (small[k] ?? 0) + 1
    }
  }
  // a leaf whose text does not fit: the truncation that made two rows identical
  const clipped = []
  for (const el of document.querySelectorAll('*')) {
    if (el.children.length || !el.textContent?.trim()) continue
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2) {
      clipped.push({ t: el.textContent.trim().slice(0, 40), shown: el.clientWidth, needs: el.scrollWidth })
    }
  }
  return {
    vw,
    scrollW: document.documentElement.scrollWidth,
    overN: over.length,
    over: over.slice(0, 8),
    smallN: Object.values(small).reduce((a, b) => a + b, 0),
    small: Object.entries(small).sort((a, b) => b[1] - a[1]).slice(0, 8),
    clippedN: clipped.length,
    clipped: clipped.slice(0, 6),
  }
}

const settle = async (p) => {
  try { await p.waitForLoadState('networkidle', { timeout: 30_000 }) } catch { /* a live feed never idles */ }
  await p.waitForTimeout(2500)
}

async function run() {
  const record = has('--record')
  const baseline = has('--baseline')
  const dir = path.join(OUT, baseline ? 'baseline' : 'current')
  await rm(dir, { recursive: true, force: true })
  await mkdir(path.join(dir, 'png'), { recursive: true })

  const exe = process.env.YC_CHROME
  const browser = await chromium.launch(exe ? { executablePath: exe } : {})
  const results = {}

  // recording only needs one pass; the responses do not vary by viewport
  for (const w of (record ? [1280] : WIDTHS)) {
    const ctx = await browser.newContext({
      ...(record ? { recordHar: { path: HAR, mode: 'full', content: 'embed' } } : {}),
      viewport: { width: w, height: 900 },
      deviceScaleFactor: 1,
      isMobile: w < 768,
      hasTouch: w < 768,
      // the clock and the live feed are the only non-determinism that matters;
      // a fixed locale at least keeps the number formatting stable
      locale: 'en-US',
      timezoneId: 'UTC',
    })
    // Replay the recorded API, so the only thing that can move a pixel is the CSS.
    if (!record && existsSync(HAR)) await ctx.routeFromHAR(HAR, { url: REMOTE, notFound: 'fallback' })
    const p = await ctx.newPage()
    await p.clock.setFixedTime(CLOCK)
    for (const r of ROUTES) {
      const key = `${r.id}@${w}`
      try {
        await p.goto(`${BASE}/?as=${AS}${r.hash}`, { waitUntil: 'commit', timeout: 45_000 })
        await settle(p)
        await p.addStyleTag({ content: '.pulse .p-body{visibility:hidden}' }).catch(() => {})
        if (r.open) { await r.open(p); await p.waitForTimeout(2500) }
        const m = await p.evaluate(probe, TAP)
        // `animations: disabled` rewinds every CSS animation to its first frame —
        // without it the pulse's breathing live-dot alone makes two runs differ
        const png = await p.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' })
        await writeFile(path.join(dir, 'png', `${key}.png`), png)
        results[key] = { ...m, hash: createHash('sha256').update(png).digest('hex').slice(0, 16) }
      } catch (e) {
        results[key] = { error: String(e).split('\n')[0] }
      }
    }
    await ctx.close()
    process.stdout.write(`  ${w}px\n`)
  }
  await browser.close()
  if (record) { console.log(`\nrecorded → ${path.relative(ROOT, HAR)}`); process.exit(0) }
  await writeFile(path.join(dir, 'metrics.json'), JSON.stringify(results, null, 1))
  return { results, dir, baseline }
}

const { results, dir, baseline } = await run()
console.log(`\n${baseline ? 'baseline' : 'run'} → ${path.relative(ROOT, dir)}`)
if (!existsSync(HAR)) console.log('  note  no .harness/api.har — run --record first, or the desktop check is noise')

/* ---------- report ---------- */
const fail = []
const warn = []

for (const [key, m] of Object.entries(results)) {
  if (m.error) { fail.push(`${key}: ${m.error}`); continue }
  if (m.scrollW > m.vw + 1) {
    fail.push(`${key}: OVERFLOW ${m.scrollW} > ${m.vw} (${m.overN} elements) — ${m.over[0] ?? ''}`)
  }
  const w = Number(key.split('@')[1])
  if (w < 768 && m.smallN > 0) warn.push(`${key}: ${m.smallN} targets under ${TAP}px — ${m.small.map(([k, n]) => `${k}×${n}`).join(' ')}`)
  if (w < 768 && m.clippedN > 0) warn.push(`${key}: ${m.clippedN} clipped — ${m.clipped.map((c) => `"${c.t}"`).join(' ')}`)
}

if (!baseline) {
  const prev = path.join(OUT, 'baseline', 'metrics.json')
  if (!existsSync(prev)) {
    warn.push('no baseline — run with --baseline to make the desktop check possible')
  } else {
    const before = JSON.parse(await readFile(prev, 'utf8'))
    for (const w of DESK) {
      for (const r of ROUTES) {
        const key = `${r.id}@${w}`
        const a = before[key], b = results[key]
        if (!a?.hash || !b?.hash) continue
        if (a.hash !== b.hash) fail.push(`${key}: DESKTOP CHANGED (${a.hash} → ${b.hash})`)
      }
    }
  }
}

for (const w of warn) console.log(`  warn  ${w}`)
for (const f of fail) console.log(`  FAIL  ${f}`)
console.log(`\n${fail.length} failures, ${warn.length} warnings`)
process.exit(fail.length ? 1 : 0)
