// Build src/data/brand-icons.json: which brand marks the protocol-icons set has under `lender/`.
//
// A vault whose share token has no picture wears its curator's or issuer's mark (`brandMark` in
// model/vaultDesk.ts). Guessing `lender/<name>.webp` for every curator would 404 for most and
// log a console error per row, so the app asks this list first. Instance files (a market's hex
// or base58 tail, `_main_5`) are left out: only the bare brand names are marks.
//
// Usage: node scripts/brand-icons.mjs [/path/to/protocol-icons]   (or PROTOCOL_ICONS_DIR=…)
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? process.env.PROTOCOL_ICONS_DIR ?? '/home/axtar/protocol-icons'
const names = readdirSync(join(root, 'lender'))
  .filter((f) => f.endsWith('.webp'))
  .map((f) => f.slice(0, -5))
  // the same instance tails `venueIconUrls` strips: 40–64 hex, a 32–44 char base58 key, a number
  .filter((n) => !/(_[0-9a-f]{40,64}|_[a-z0-9]{32,44}|_\d+)$/.test(n))
  .sort()
writeFileSync(new URL('../packages/core/src/data/brand-icons.json', import.meta.url), JSON.stringify(names) + '\n')
console.log(names.length, 'brand marks written')
