// Render a cast of wallet characters (src/identity/character.tsx) to brand/out/characters.json for brand/gen.py.
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// b backdrop · c creature · e eyes · m mouth · a accessory · p palette — picked by hand for a varied cast
const CAST = ['b1.c1.e0.m0.a0.p0', 'b2.c4.e1.m1.a0.p3', 'b0.c7.e2.m2.a0.p4', 'b3.c3.e0.m1.a0.p2', 'b9.c6.e1.m0.a0.p1', 'b2.c10.e3.m2.a0.p8', 'b1.c5.e2.m1.a0.p5', 'b0.c9.e0.m0.a0.p6', 'b3.c13.e1.m2.a0.p10', 'b9.c0.e3.m1.a0.p7']
const vite = await createServer({ root, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' })
try {
  const { Character, parseSpec } = await vite.ssrLoadModule('/src/identity/character.tsx')
  const out = CAST.map((s) => renderToStaticMarkup(React.createElement(Character, { addr: '0x0', spec: parseSpec(`yc1:${s}`), size: 64 }))
    .replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '').replace(/<title>.*?<\/title>/, ''))
  mkdirSync(join(root, 'brand', 'out'), { recursive: true })
  writeFileSync(join(root, 'brand', 'out', 'characters.json'), JSON.stringify(out, null, 1))
  console.log(`brand/out/characters.json: ${out.length} characters`)
} finally { await vite.close() }
