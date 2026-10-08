// Copy token-lists' asset notes (`asset-notes.json`, built by `npm run notes` there from
// scripts/notes/notes.json + derived lines) into src/data, where the asset page lazy-loads it.
// ONE source for "what is this token": a note is written in token-lists, never here.
//
// Usage: node scripts/notes.mjs [/path/to/token-lists]   (or TOKEN_LISTS_DIR=…)
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? process.env.TOKEN_LISTS_DIR ?? '/home/axtar/token-lists'
const notes = JSON.parse(readFileSync(join(root, 'asset-notes.json'), 'utf8'))
const n = Object.keys(notes).length
// a broken or half-written source must never replace a good copy with an empty one
if (n < 1000) { console.error(`only ${n} notes in ${root}/asset-notes.json — refusing to write`); process.exit(1) }
writeFileSync(new URL('../src/data/asset-notes.json', import.meta.url), JSON.stringify(notes) + '\n')
const curated = Object.values(notes).filter((x) => x.source === 'curated').length
console.log(`${n} asset notes written (${curated} curated)`)
