// Rasterise brand/out/*.svg (from `python3 brand/gen.py`) into public/ and docs/. Needs @resvg/resvg-js.
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
let Resvg
try { ({ Resvg } = require('@resvg/resvg-js')) } catch { ({ Resvg } = require(process.env.RESVG_PATH ?? '/home/axtar/credx/app/node_modules/@resvg/resvg-js')) }
const src = (n) => join(root, 'brand', 'out', n), pub = (n) => join(root, 'public', n), doc = (n) => join(root, 'docs', n)
mkdirSync(pub(''), { recursive: true }); mkdirSync(doc(''), { recursive: true })
const png = (svgName, width) => new Resvg(readFileSync(src(svgName), 'utf8'), { fitTo: { mode: 'width', value: width } }).render().asPng()
const out = { 'favicon-16.png': png('mark.svg', 16), 'favicon-32.png': png('mark.svg', 32), 'favicon-48.png': png('mark.svg', 48), 'apple-touch-icon.png': png('mark.svg', 180), 'icon-192.png': png('mark.svg', 192), 'icon-512.png': png('mark.svg', 512), 'icon-maskable-512.png': png('mark-maskable.svg', 512), 'og.png': png('og.svg', 1200) }
for (const [n, buf] of Object.entries(out)) writeFileSync(pub(n), buf)
writeFileSync(doc('banner.png'), png('banner.svg', 1600))
writeFileSync(doc('x-header.png'), png('x-header.svg', 1500))
const entries = [out['favicon-16.png'], out['favicon-32.png'], out['favicon-48.png']], sizes = [16, 32, 48]
const header = Buffer.alloc(6 + 16 * entries.length); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4)
let offset = header.length
entries.forEach((b, i) => { const o = 6 + 16 * i; header.writeUInt8(sizes[i], o); header.writeUInt8(sizes[i], o + 1); header.writeUInt8(0, o + 2); header.writeUInt8(0, o + 3); header.writeUInt16LE(1, o + 4); header.writeUInt16LE(32, o + 6); header.writeUInt32LE(b.length, o + 8); header.writeUInt32LE(offset, o + 12); offset += b.length })
writeFileSync(pub('favicon.ico'), Buffer.concat([header, ...entries]))
copyFileSync(src('mark.svg'), pub('favicon.svg')); copyFileSync(src('logo.svg'), pub('logo.svg')); copyFileSync(src('banner.svg'), doc('banner.svg'))
for (const n of ['logo-dark-text.svg', 'logo-themable.svg', 'mark-plain.svg']) copyFileSync(src(n), pub(n))
for (const n of ['logo-stacked.svg', 'logo-stacked-dark-text.svg', 'mark-mono.svg', 'mark-themable.svg']) if (existsSync(pub(n))) { /* desk-only assets no longer produced */ }
console.log('public/ and docs/banner.*, docs/x-header.png written')
