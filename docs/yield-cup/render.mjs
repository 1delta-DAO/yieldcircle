// Renders the Yield Cup teaser graphics next to this file: `node docs/yield-cup/render.mjs` (needs playwright's chromium)
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../../package.json', import.meta.url))
const { chromium } = require('playwright')
const B = JSON.parse(fs.readFileSync(new URL('./brand.json', import.meta.url)))
const OUT = new URL('.', import.meta.url).pathname.replace(/\/$/, '')

const CHAINS = ['ETHEREUM', 'BASE', 'ARBITRUM', 'SOLANA', 'BNB', 'AVALANCHE', 'OPTIMISM', 'HYPEREVM', 'MONAD', 'PLASMA', 'POLYGON', 'PLUME']

let uid = 0
/** The cup: amber bowl, the YieldCircle mark struck into it in ink. */
function cup(size) {
  const id = 'c' + uid++
  return `<svg width="${size}" height="${size * 1.1}" viewBox="0 0 200 220" aria-hidden="true">
  <defs>
    <linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe29a"/><stop offset=".45" stop-color="#f4b740"/><stop offset="1" stop-color="#b9780c"/></linearGradient>
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c98a12"/><stop offset=".5" stop-color="#f4b740"/><stop offset="1" stop-color="#a86a08"/></linearGradient>
    <linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <path d="M44 44 C14 44 10 70 20 88 C30 106 50 112 60 112" fill="none" stroke="url(#${id}s)" stroke-width="9" stroke-linecap="round"/>
  <path d="M156 44 C186 44 190 70 180 88 C170 106 150 112 140 112" fill="none" stroke="url(#${id}s)" stroke-width="9" stroke-linecap="round"/>
  <path d="M38 26 H162 V70 C162 122 130 150 100 150 C70 150 38 122 38 70 Z" fill="url(#${id}b)"/>
  <path d="M48 32 H62 V70 C62 100 72 122 84 134 C62 126 48 104 48 72 Z" fill="url(#${id}h)" opacity=".7"/>
  <rect x="34" y="20" width="132" height="12" rx="6" fill="#ffe29a"/>
  <g transform="translate(70 52) scale(.6)"><path d="${B.MARK}" fill-rule="evenodd" fill="#2a1d00"/></g>
  <path d="M90 150 H110 L114 176 H86 Z" fill="url(#${id}s)"/>
  <rect x="64" y="176" width="72" height="14" rx="3" fill="url(#${id}s)"/>
  <rect x="54" y="190" width="92" height="20" rx="4" fill="#2a1d00" stroke="#5a4512" stroke-width="2"/>
  <text x="100" y="204.5" text-anchor="middle" font-family="IBM Plex Mono" font-weight="500" font-size="10" letter-spacing="2" fill="#f4b740">SEASON 0</text>
</svg>`
}

function lockup(h) {
  const id = 'l' + uid++
  return `<svg height="${h}" viewBox="0 0 437.2 100" aria-hidden="true"><defs>
    <linearGradient id="${id}m" gradientUnits="userSpaceOnUse" x1="16" y1="88" x2="86" y2="14"><stop offset="0" stop-color="#0b8fb5"/><stop offset="1" stop-color="#7ce9f5"/></linearGradient>
    <linearGradient id="${id}c" gradientUnits="userSpaceOnUse" x1="257" y1="64" x2="433.2" y2="36"><stop offset="0" stop-color="#0b8fb5"/><stop offset="1" stop-color="#7ce9f5"/></linearGradient></defs>
    <path d="${B.MARK}" fill-rule="evenodd" fill="url(#${id}m)"/><path d="${B.YIELD}" fill="#e8e8e8"/><path d="${B.CIRCLE}" fill="url(#${id}c)"/></svg>`
}

/** Concentric rings with the chains running round the outer one. */
function orbit(r, cx, cy) {
  const id = 'o' + uid++
  const ring = `M ${cx - r} ${cy} a ${r} ${r} 0 1 1 ${2 * r} 0 a ${r} ${r} 0 1 1 ${-2 * r} 0`
  const names = CHAINS.join('  ·  ') + '  ·  '
  return `<svg class="orbit" width="100%" height="100%" style="position:absolute;inset:0" aria-hidden="true">
    <defs><path id="${id}" d="${ring}"/></defs>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="none" stroke="#f4b740" stroke-opacity=".14" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.8}" fill="none" stroke="#7ce9f5" stroke-opacity=".12" stroke-width="1.5" stroke-dasharray="2 8"/>
    <circle cx="${cx}" cy="${cy}" r="${r + 30}" fill="none" stroke="#7ce9f5" stroke-opacity=".07" stroke-width="1.5"/>
    <text font-family="IBM Plex Mono" font-size="${Math.round(r / 11)}" letter-spacing="3" fill="#7ce9f5" fill-opacity=".45"><textPath href="#${id}" textLength="${2 * Math.PI * r - 10}">${names}</textPath></text>
    <circle cx="${cx + r * 0.8 * Math.cos(-0.6)}" cy="${cy + r * 0.8 * Math.sin(-0.6)}" r="6" fill="#3fbf7f"/>
    <circle cx="${cx + r * 0.8 * Math.cos(2.3)}" cy="${cy + r * 0.8 * Math.sin(2.3)}" r="6" fill="#c084fc"/>
    <circle cx="${cx + r * 0.62 * Math.cos(0.9)}" cy="${cy + r * 0.62 * Math.sin(0.9)}" r="5" fill="#2fd3e8"/>
  </svg>`
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{background:#111;font-family:"IBM Plex Sans",sans-serif;color:#e8e8e8;-webkit-font-smoothing:antialiased}
.f{position:relative;overflow:hidden;background:#000;margin:0 0 40px}
.f::before{content:"";position:absolute;inset:0;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(ellipse at center,#000 30%,transparent 80%)}
.glow-a{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(244,183,64,.28),transparent 65%)}
.glow-c{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(11,143,181,.32),transparent 65%)}
.mono{font-family:"IBM Plex Mono",monospace}
.kick{font-family:"IBM Plex Mono";font-weight:500;letter-spacing:.28em;color:#f4b740;text-transform:uppercase}
.title{font-weight:700;letter-spacing:-.02em;line-height:.92;text-transform:uppercase}
.title .y{background:linear-gradient(100deg,#ffe29a,#f4b740 55%,#c98a12);-webkit-background-clip:text;color:transparent}
.chip{display:inline-flex;align-items:center;gap:10px;border:1px solid #34343c;background:#0e0e11;border-radius:999px;padding:10px 20px;font-weight:500}
.chip i{width:9px;height:9px;border-radius:50%;background:#f4b740;display:block}
.stamp{display:inline-block;border:2px solid #f4b740;color:#f4b740;font-family:"IBM Plex Mono";font-weight:500;letter-spacing:.2em;padding:6px 14px;border-radius:6px;transform:rotate(-4deg);background:rgba(244,183,64,.08)}
.foot{position:absolute;left:0;right:0;display:flex;justify-content:space-between;align-items:center;color:rgba(232,232,232,.5);font-family:"IBM Plex Mono"}
.tile{border:1px solid #232329;background:linear-gradient(180deg,#0e0e11,#08080a);border-radius:18px;padding:26px 26px 24px;position:relative}
.tile h3{font-size:30px;font-weight:600;margin:14px 0 8px}
.tile p{color:rgba(232,232,232,.6);font-size:19px;line-height:1.35}
.tile .ic{width:48px;height:48px;border-radius:12px;display:grid;place-items:center;font-family:"IBM Plex Mono";font-weight:500;font-size:20px}
.tile.tba{border-style:dashed;border-color:#5a4512;background:rgba(244,183,64,.05)}
`

const frames = {
  // X / Twitter header (1500x500) — cup right, title left
  'x-header': [1500, 500, `
    <div class="glow-c" style="width:900px;height:900px;left:-300px;top:-250px"></div>
    <div class="glow-a" style="width:700px;height:700px;right:-60px;top:-110px"></div>
    ${orbit(200, 1180, 250)}
    <div style="position:absolute;left:1180px;top:250px;transform:translate(-50%,-52%)">${cup(230)}</div>
    <div style="position:absolute;left:96px;top:92px">
      <div class="kick" style="font-size:20px">Paper farming tournament</div>
      <div class="title" style="font-size:124px;margin-top:22px">The <span class="y">Yield</span><br><span class="y">Cup</span></div>
      <div style="font-size:26px;color:rgba(232,232,232,.72);margin-top:26px">Cash prizes · every chain · many ways to win</div>
    </div>
    <div style="position:absolute;right:48px;bottom:30px;opacity:.9">${lockup(26)}</div>`],

  // Teaser post, 16:9 (1600x900)
  'teaser': [1600, 900, `
    <div class="glow-a" style="width:1100px;height:1100px;left:250px;top:-280px"></div>
    <div class="glow-c" style="width:900px;height:900px;left:-350px;top:300px"></div>
    ${orbit(232, 800, 345)}
    <div style="position:absolute;left:800px;top:345px;transform:translate(-50%,-52%)">${cup(270)}</div>
    
    <div style="position:absolute;left:0;right:0;top:640px;text-align:center">
      <div class="title" style="font-size:96px">The <span class="y">Yield Cup</span></div>
      <div class="kick" style="font-size:20px;margin-top:20px">A paper farming tournament</div>
      <div style="display:flex;gap:16px;justify-content:center;margin-top:34px;font-size:22px">
        <span class="chip"><i></i>Cash prizes</span><span class="chip"><i style="background:#2fd3e8"></i>Every chain</span><span class="chip"><i style="background:#c084fc"></i>Categories for every farmer</span>
      </div>
    </div>
    <div style="position:absolute;left:48px;top:42px">${lockup(36)}</div>
    <div style="position:absolute;right:48px;top:40px"><span class="stamp" style="font-size:18px">COMING SOON</span></div>`],

  // The categories card, 16:9 (1600x900)
  'categories': [1600, 900, `
    <div class="glow-a" style="width:900px;height:900px;right:-300px;top:-400px"></div>
    <div class="glow-c" style="width:800px;height:800px;left:-300px;bottom:-500px"></div>
    <div style="position:absolute;left:72px;top:64px;right:72px;display:flex;align-items:flex-end;justify-content:space-between">
      <div>
        <div class="kick" style="font-size:18px">The Yield Cup · Season 0</div>
        <div class="title" style="font-size:72px;margin-top:16px">Many ways <span class="y">to win</span></div>
      </div>
      <div style="margin-bottom:10px">${cup(110)}</div>
    </div>
    <div style="position:absolute;left:72px;right:72px;top:290px;display:grid;grid-template-columns:repeat(4,1fr);gap:20px">
      <div class="tile"><div class="ic" style="background:rgba(244,183,64,.14);color:#f4b740">#1</div><h3>Overall</h3><p>Best return, net of every fee, swap and bridge</p></div>
      <div class="tile"><div class="ic" style="background:rgba(63,191,127,.13);color:#3fbf7f">$</div><h3>Dollar farmers</h3><p>Stables, savings dollars, PTs and vaults</p></div>
      <div class="tile"><div class="ic" style="background:rgba(143,166,255,.14);color:#8fa6ff">Ξ</div><h3>ETH farmers</h3><p>Ether and staked ether, looped or not</p></div>
      <div class="tile"><div class="ic" style="background:rgba(226,163,58,.14);color:#e2a33a">₿</div><h3>BTC farmers</h3><p>Bitcoin wrappers and staked bitcoin</p></div>
      <div class="tile"><div class="ic" style="background:rgba(192,132,252,.14);color:#c084fc">◎</div><h3>SOL farmers</h3><p>SOL and its liquid-staking tokens</p></div>
      <div class="tile"><div class="ic" style="background:rgba(47,211,232,.12);color:#2fd3e8">H</div><h3>HYPE farmers</h3><p>HYPE and staked HYPE</p></div>
      <div class="tile"><div class="ic" style="background:rgba(47,211,232,.12);color:#7ce9f5">⛓</div><h3>Chain champions</h3><p>The top farmer on each chain we follow</p></div>
      <div class="tile tba"><div class="ic" style="background:rgba(244,183,64,.14);color:#f4b740">?</div><h3>+ more</h3><p>Announced in the coming days</p></div>
    </div>
    <div class="foot" style="left:72px;right:72px;bottom:44px;font-size:18px">
      <span>Play money · real rates · cash prizes</span><span style="opacity:.9">${lockup(26)}</span>
    </div>`],

  // Square "warm up" card (1080x1080) — for IG / TG / the second post
  'warm-up': [1080, 1080, `
    <div class="glow-a" style="width:1000px;height:1000px;left:40px;top:-300px"></div>
    <div class="glow-c" style="width:800px;height:800px;left:-300px;bottom:-400px"></div>
    ${orbit(250, 540, 400)}
    <div style="position:absolute;left:540px;top:400px;transform:translate(-50%,-52%)">${cup(270)}</div>
    <div style="position:absolute;left:0;right:0;top:56px;text-align:center"><span class="kick" style="font-size:18px">Paper farming tournament</span></div>
    <div style="position:absolute;left:0;right:0;top:720px;text-align:center">
      <div class="title" style="font-size:88px">The <span class="y">Yield Cup</span></div>
      <div style="font-size:28px;color:rgba(232,232,232,.72);margin-top:22px;line-height:1.4">Cash prizes for the best farmers on every chain.<br>Rules, dates and prizes in the coming days.</div>
    </div>
    <div class="foot" style="left:56px;right:56px;bottom:44px;font-size:17px;letter-spacing:.12em"><span>${lockup(24)}</span><span class="stamp" style="font-size:15px;transform:none">WARM UP ON PAPER</span></div>`],
}

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${CSS}</style></head><body>
${Object.entries(frames).map(([k, [w, h, body]]) => `<div class="f" id="${k}" style="width:${w}px;height:${h}px">${body}</div>`).join('\n')}
</body></html>`
fs.writeFileSync(OUT + '/graphics.html', html)

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1700, height: 1000 } })
await page.goto('file://' + OUT + '/graphics.html', { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
for (const k of Object.keys(frames)) await page.locator('#' + k).screenshot({ path: `${OUT}/${k}.png` })
const hi = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1700, height: 1000 } })
await hi.goto('file://' + OUT + '/graphics.html', { waitUntil: 'networkidle' })
await hi.evaluate(() => document.fonts.ready)
for (const k of Object.keys(frames)) if (k !== 'x-header') await hi.locator('#' + k).screenshot({ path: `${OUT}/${k}@2x.png` })
await browser.close()
console.log('ok')
