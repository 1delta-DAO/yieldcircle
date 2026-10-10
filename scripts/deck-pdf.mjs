/**
 * Print the landing's /deck to a PDF, one 1280×720 page per slide.
 *
 *   pnpm deck:pdf                       # starts the landing's vite dev server, prints, stops it
 *   pnpm deck:pdf --url http://localhost:3201   # against a landing dev server you run
 *   pnpm deck:pdf --out docs/deck.pdf   # default: dist/deck.pdf (gitignored)
 *
 * Needs the same playwright + chromium as scripts/shots.mjs
 * (`npx playwright install chromium` once). The print layout lives in
 * landing/deck.css under `@media print`.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1] }
const OUT = path.resolve(ROOT, arg('--out', 'dist/deck.pdf'))
const PORT = 3217
let url = arg('--url')
let server

if (!url) {
  url = `http://localhost:${PORT}`
  // the binary itself, not `npx vite`: killing npx leaves vite running on the port, and the next run prints a stranger
  server = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['--config', 'landing/vite.config.ts', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
  const t0 = Date.now()
  while (Date.now() - t0 < 30_000) {
    try { await fetch(url); break } catch { await new Promise((r) => setTimeout(r, 300)) }
  }
}

try {
  await mkdir(path.dirname(OUT), { recursive: true })
  const browser = await chromium.launch({ executablePath: process.env.YC_CHROME || undefined })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, colorScheme: 'dark' })
  await page.goto(`${url}/deck.html`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.deck-slide')
  await page.evaluate(() => document.fonts.ready)
  await page.emulateMedia({ media: 'print' })
  const n = await page.locator('.deck-slide').count()
  await page.pdf({ path: OUT, width: '1280px', height: '720px', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } })
  await browser.close()
  console.log(`${path.relative(ROOT, OUT)}: ${n} slides`)
} finally {
  server?.kill()
}
