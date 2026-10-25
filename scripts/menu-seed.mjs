// Build src/data/menu-seed.json: the market uids the home feed's "In the menu" tab filters on
// before this visit's catalogue has loaded.
//
// A first visit has no kept set (`useMenu`'s localStorage), and the live one needs the whole
// catalogue — 50 requests, seconds — so without a seed the tab's first request waited for it.
// The seed is the DEPOSIT side of the menu at the default settings, computed with the app's own
// code (the same request, classifier, floors, dedupe and cap), so it is the menu minus its loops:
// measured 2026-09-29, the deposits alone matched 46 of the 46 menu moves in the newest 500. The
// live set replaces it as soon as the catalogue settles, so a stale seed costs a first paint that
// is missing a new market for a few seconds, never a wrong one.
//
// Run by `pnpm deploy`; on any failure the checked-in file is kept and the deploy goes on.
// Usage: node scripts/menu-seed.mjs
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'vite'

const ROOT = join(import.meta.dirname, '..')
const WEB = join(ROOT, 'packages/web')
const CORE = join(ROOT, 'packages/core/src')
const OUT = join(CORE, 'data/menu-seed.json')

const vite = await createServer({ root: WEB, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const load = (p) => vite.ssrLoadModule(p)
  // core by file path; env.ts first, so the run talks to the services .env names
  const core = (p) => load(join(CORE, p))
  await load('/src/env.ts')
  const [{ fetchEarn }, { classifyEarn, dedupe, capPerAsset }, { softHide }, { uidOf }, { DEFAULTS }, { CHAINS, chainBuckets }] = await Promise.all([
    core('sdk/api.ts'), core('model/strategies.ts'), core('model/visibility.ts'),
    core('model/uid.ts'), load('/src/state/Settings.tsx'), load('/src/sdk/queries.ts'),
  ])
  const pages = await Promise.all(chainBuckets(CHAINS.map((c) => c.id)).map((ids) =>
    fetchEarn({ chainIds: ids, count: 1000, maxRiskScore: 5, minTvlUsd: DEFAULTS.minTvlUsd })))
  const rows = pages.flatMap((p) => p.items).map((m) => classifyEarn(m).s).filter(Boolean)
  const menu = capPerAsset(dedupe(rows.filter((r) => !softHide(r, DEFAULTS))))
  const uids = [...new Set(menu.map(uidOf).filter(Boolean))].sort()
  if (uids.length < 50) throw new Error(`only ${uids.length} uids — not writing a seed that small`)
  writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString().slice(0, 10), uids }, null, 0) + '\n')
  console.log(`menu-seed: ${uids.length} uids → src/data/menu-seed.json`)
} catch (e) {
  console.warn(`menu-seed: kept the old seed (${e instanceof Error ? e.message : e})`)
} finally {
  await vite.close()
}
