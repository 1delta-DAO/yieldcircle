#!/usr/bin/env python3
"""YieldCircle brand — single source of truth for the mark, wordmark, icons and banner.

Mark: an open ring that tapers to a point at its leading end — one turn of yield, with the gap
where the next turn begins — around a solid centre. One path on a 100-unit grid, cyan gradient
(COLOR_A → COLOR_B) or flat currentColor.
Wordmark: YIELD in ink, CIRCLE in the gradient, Montserrat SemiBold, tracked.

Emits brand/out/*.svg (text converted to paths → no font dependency downstream),
src/ui/brand.generated.ts for the React <Logo>, and the README / social banner.
`pnpm brand` runs this, then scripts/brand.mjs rasterises into public/ and docs/.
Fonts (Montserrat 600, IBM Plex Sans 400 — both OFL) are fetched once into brand/.fonts/.
"""
from __future__ import annotations
import io, math, os, re, urllib.request
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

_N = lambda v: (f'{v:.2f}'.rstrip('0').rstrip('.')) if isinstance(v, float) else str(v)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
FONTS = os.path.join(HERE, '.fonts')
TS_OUT = os.path.join(HERE, '..', 'src', 'ui', 'brand.generated.ts')
DOCS = os.path.join(HERE, '..', 'docs')

# ── palette — change here, run `pnpm brand`, and mirror --primary / --brand-* in src/styles/app.css
COLOR_A = '#7ce9f5'   # gradient, light end (top-right)
COLOR_B = '#0b8fb5'   # gradient, deep end (bottom-left)
INK = '#e8e8e8'
INK_DARK = '#111111'
MUTE = '#8a8a8a'
BLACK = '#000000'
ACCENTS = ['#3fbf7f', '#8fa6ff', '#f0a830']   # the app's group colours: USD · ETH · BTC

TAGLINE = 'Everything you hold, earning.'
SUB = 'Dollars, ether, bitcoin. Plain deposits and one-transaction loops, on the 1delta API.'

# ── the mark
CX = CY = 50.0
R_OUT, R_IN = 36.0, 24.0
A_TAIL, A_HEAD, A_TIP = -12.0, 278.0, 297.0   # degrees, SVG space (y down → increasing angle is clockwise)
DOT_R = 8.5

def _p(r: float, deg: float) -> tuple[float, float]:
    a = math.radians(deg)
    return (CX + r * math.cos(a), CY + r * math.sin(a))

def _mark_d() -> str:
    o0, o1 = _p(R_OUT, A_TAIL), _p(R_OUT, A_HEAD)
    i0, i1 = _p(R_IN, A_TAIL), _p(R_IN, A_HEAD)
    tip = _p((R_OUT + R_IN) / 2, A_TIP)
    ring = (f'M{_N(o0[0])} {_N(o0[1])}'
            f'A{_N(R_OUT)} {_N(R_OUT)} 0 1 1 {_N(o1[0])} {_N(o1[1])}'
            f'L{_N(tip[0])} {_N(tip[1])}'
            f'L{_N(i1[0])} {_N(i1[1])}'
            f'A{_N(R_IN)} {_N(R_IN)} 0 1 0 {_N(i0[0])} {_N(i0[1])}Z')
    dot = (f'M{_N(CX - DOT_R)} {_N(CY)}'
           f'a{_N(DOT_R)} {_N(DOT_R)} 0 1 0 {_N(DOT_R * 2)} 0'
           f'a{_N(DOT_R)} {_N(DOT_R)} 0 1 0 {_N(-DOT_R * 2)} 0Z')
    return ring + dot

MARK_D = _mark_d()
MARK_BOX = (CX - R_OUT, CY - R_OUT, CX + R_OUT, CY + R_OUT)

def gradient(gid: str, box=None, themable=False) -> str:
    """Bottom-left deep → top-right light, over `box` (x, w, top, base) or the 100-grid by default."""
    a = f'var(--brand-a, {COLOR_A})' if themable else COLOR_A
    b = f'var(--brand-b, {COLOR_B})' if themable else COLOR_B
    if box:
        x, w, top, base = box
        c = f'x1="{x:.2f}" y1="{base:.2f}" x2="{x + w:.2f}" y2="{top:.2f}"'
    else:
        c = 'x1="16" y1="88" x2="86" y2="14"'
    return f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" {c}><stop offset="0" stop-color="{b}"/><stop offset="1" stop-color="{a}"/></linearGradient>'

def mark(fill: str, transform: str = '') -> str:
    t = f' transform="{transform}"' if transform else ''
    return f'<path{t} fill="{fill}" fill-rule="evenodd" d="{MARK_D}"/>'

def svg(vb, body, w=None, h=None) -> str:
    x, y, bw, bh = vb
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x:g} {y:g} {bw:g} {bh:g}" width="{w or bw:g}" height="{h or bh:g}">{body}</svg>'

def tile(rx=22, glyph_scale=1.0, themable=False) -> str:
    """Mark on a square tile (favicon / app icon). glyph_scale < 1 keeps it inside the maskable safe zone."""
    s = glyph_scale
    t = f'translate({50 * (1 - s):.2f} {50 * (1 - s):.2f}) scale({s:g})' if s != 1 else ''
    return svg((0, 0, 100, 100), f'<defs>{gradient("g", themable=themable)}</defs>'
               f'<rect width="100" height="100" rx="{rx}" fill="{BLACK}"/>' + mark('url(#g)', t))

# ── fonts
GF = 'https://fonts.googleapis.com/css?family=Montserrat:600|IBM+Plex+Sans:400'
def ensure_fonts():
    os.makedirs(FONTS, exist_ok=True)
    if os.path.exists(os.path.join(FONTS, 'Montserrat-600.ttf')) and os.path.exists(os.path.join(FONTS, 'IBMPlexSans-400.ttf')):
        return
    css = urllib.request.urlopen(urllib.request.Request(GF, headers={'User-Agent': 'Mozilla/5.0'})).read().decode()
    for url in re.findall(r'url\((https://[^)]+)\)', css):
        data = urllib.request.urlopen(url).read()
        t = TTFont(io.BytesIO(data))
        fam = t['name'].getDebugName(1).replace(' ', '')
        with open(os.path.join(FONTS, f'{fam}-{t["OS/2"].usWeightClass}.ttf'), 'wb') as f:
            f.write(data)

_fonts: dict[str, TTFont] = {}
def font(name: str) -> TTFont:
    if name not in _fonts:
        _fonts[name] = TTFont(os.path.join(FONTS, name + '.ttf'))
    return _fonts[name]

def _bounds(gs, gn):
    bp = BoundsPen(gs); gs[gn].draw(bp); return bp.bounds

def text_path(text: str, fname: str, size: float, x: float, y: float, tracking=0.0) -> tuple[str, float]:
    """Plain text as one path, baseline at y. Returns (d, advance)."""
    f = font(fname); cmap = f.getBestCmap(); gs = f.getGlyphSet(); hmtx = f['hmtx']; k = size / f['head'].unitsPerEm
    pen = SVGPathPen(gs, ntos=_N); cx = x
    for ch in text:
        gn = cmap[ord(ch)]
        gs[gn].draw(TransformPen(pen, (k, 0, 0, -k, cx, y)))
        cx += hmtx[gn][0] * k + tracking * size
    return pen.getCommands(), cx - x - tracking * size

def cap_of(size: float) -> float:
    f = font('Montserrat-600'); gs = f.getGlyphSet()
    hb = _bounds(gs, f.getBestCmap()[ord('H')])
    return (hb[3] - hb[1]) * size / f['head'].unitsPerEm

# ── lockup: mark · YIELD(ink) · CIRCLE(gradient)
TRACK = 0.13
def lockup(ink=INK, themable=False) -> tuple[str, dict]:
    x0, y0, x1, y1 = MARK_BOX
    size = 40
    cap = cap_of(size)
    base = (y0 + y1) / 2 + cap / 2
    yx = x1 + 22
    yd, yw = text_path('YIELD', 'Montserrat-600', size, yx, base, TRACK)
    cx = yx + yw + TRACK * size
    cd, cw = text_path('CIRCLE', 'Montserrat-600', size, cx, base, TRACK)
    total = cx + cw + 4
    gg = gradient('gg', box=(cx, cw, base - cap, base), themable=themable)
    body = f'<defs>{gradient("g", themable=themable)}{gg}</defs>' + mark('url(#g)') + f'<path d="{yd}" fill="{ink}"/><path d="{cd}" fill="url(#gg)"/>'
    vb = (0, 0, total, 100)
    return svg(vb, body), {'yield': yd, 'circle': cd, 'viewbox': f'0 0 {total:.3f} 100', 'box': (cx, cw, base - cap, base), 'gg': gg}

def _rings(cx: float, cy: float, parts: list[str]):
    """Concentric rings with a few asset dots riding on them — the 'circle' motif behind the copy."""
    for i, r in enumerate((96, 150, 204)):
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{COLOR_A}" stroke-opacity="{0.16 - i*0.04:.2f}" stroke-width="1.5"/>')
    # one bright arc on the middle ring, echoing the mark's open turn
    parts.append(f'<path d="M{cx + 150 * math.cos(math.radians(-150)):.1f} {cy + 150 * math.sin(math.radians(-150)):.1f} '
                 f'A150 150 0 0 1 {cx + 150 * math.cos(math.radians(-20)):.1f} {cy + 150 * math.sin(math.radians(-20)):.1f}" '
                 f'fill="none" stroke="url(#arc)" stroke-width="3" stroke-linecap="round"/>')
    for (r, deg, col, w) in ((96, 40, ACCENTS[0], 54), (150, -62, ACCENTS[1], 38), (204, 118, ACCENTS[2], 46), (150, 170, ACCENTS[0], 30)):
        x, y = cx + r * math.cos(math.radians(deg)), cy + r * math.sin(math.radians(deg))
        parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="9" fill="{col}" opacity="0.9"/>')
        parts.append(f'<rect x="{x + 16:.1f}" y="{y - 4:.1f}" width="{w}" height="8" rx="4" fill="#232323"/>')

def banner(W=1600, H=520) -> str:
    _, parts_d = lockup()
    cx, cy = W - 300, H / 2
    p = [f'<rect width="{W}" height="{H}" fill="{BLACK}"/>',
         f'<defs>{gradient("g")}{parts_d["gg"]}'
         f'<radialGradient id="glow" cx="0.2" cy="0.5" r="0.6"><stop offset="0" stop-color="{COLOR_B}" stop-opacity="0.3"/><stop offset="1" stop-color="{COLOR_B}" stop-opacity="0"/></radialGradient>'
         f'<linearGradient id="arc" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="{COLOR_B}"/><stop offset="1" stop-color="{COLOR_A}"/></linearGradient>'
         f'<linearGradient id="hair" x1="0" x2="1"><stop offset="0" stop-color="{COLOR_A}" stop-opacity="0.9"/><stop offset="1" stop-color="{COLOR_A}" stop-opacity="0"/></linearGradient></defs>',
         f'<rect width="{W}" height="{H}" fill="url(#glow)"/>']
    _rings(cx, cy, p)
    p.append(f'<g transform="translate(96 108) scale(1.55)">{mark("url(#g)")}<path d="{parts_d["yield"]}" fill="{INK}"/><path d="{parts_d["circle"]}" fill="url(#gg)"/></g>')
    d1, _ = text_path(TAGLINE, 'IBMPlexSans-400', 44, 100, 366)
    p.append(f'<path d="{d1}" fill="{INK}" opacity="0.92"/>')
    d2, _ = text_path(SUB, 'IBMPlexSans-400', 22, 100, 412)
    p.append(f'<path d="{d2}" fill="{MUTE}"/>')
    p.append(f'<rect x="100" y="452" width="120" height="3" fill="url(#hair)"/>')
    d3, _ = text_path('by 1delta', 'IBMPlexSans-400', 20, 100, 484, tracking=0.04)
    p.append(f'<path d="{d3}" fill="{MUTE}"/>')
    return svg((0, 0, W, H), ''.join(p))

def og(W=1200, H=630) -> str:
    _, parts_d = lockup()
    cx, cy = W - 170, H / 2
    p = [f'<rect width="{W}" height="{H}" fill="{BLACK}"/>',
         f'<defs>{gradient("g")}{parts_d["gg"]}'
         f'<radialGradient id="glow" cx="0.22" cy="0.45" r="0.65"><stop offset="0" stop-color="{COLOR_B}" stop-opacity="0.28"/><stop offset="1" stop-color="{COLOR_B}" stop-opacity="0"/></radialGradient>'
         f'<linearGradient id="arc" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="{COLOR_B}"/><stop offset="1" stop-color="{COLOR_A}"/></linearGradient></defs>',
         f'<rect width="{W}" height="{H}" fill="url(#glow)"/>']
    _rings(cx, cy, p)
    p.append(f'<g transform="translate(80 150) scale(1.5)">{mark("url(#g)")}<path d="{parts_d["yield"]}" fill="{INK}"/><path d="{parts_d["circle"]}" fill="url(#gg)"/></g>')
    d1, _ = text_path(TAGLINE, 'IBMPlexSans-400', 44, 96, 420)
    p.append(f'<path d="{d1}" fill="{INK}" opacity="0.9"/>')
    d2, _ = text_path('Copy what real wallets earn, in one tap.', 'IBMPlexSans-400', 26, 96, 470)
    p.append(f'<path d="{d2}" fill="{MUTE}"/>')
    p.append(f'<rect x="96" y="528" width="72" height="3" fill="{COLOR_A}"/>')
    return svg((0, 0, W, H), ''.join(p))

X_HEAD = 'Social yield farming.'
X_SUB = ('See what every wallet is farming, talk strategy on every pool,', 'and climb a leaderboard of yield the chain can prove.')

def _characters() -> list[str]:
    """Wallet characters from src/identity/character.tsx, via scripts/brand-characters.mjs."""
    import json
    with open(os.path.join(OUT, 'characters.json')) as f:
        return json.load(f)

def x_header(W=1500, H=500) -> str:
    """X / Twitter profile header (3:1): a circle of wallets around the mark. The avatar covers roughly
    x 40–380, y 330–500 and some clients crop ~60px top and bottom, so the copy sits right of it, mid-height."""
    _, parts_d = lockup()
    cast = _characters()
    cx, cy, R, S = 1262.0, 250.0, 158.0, 62.0
    p = [f'<rect width="{W}" height="{H}" fill="{BLACK}"/>',
         f'<defs>{gradient("g")}{parts_d["gg"]}'
         f'<radialGradient id="glow" cx="{cx / W:.3f}" cy="0.5" r="0.4"><stop offset="0" stop-color="{COLOR_B}" stop-opacity="0.32"/><stop offset="1" stop-color="{COLOR_B}" stop-opacity="0"/></radialGradient>'
         f'<radialGradient id="glow2" cx="0.35" cy="0.4" r="0.45"><stop offset="0" stop-color="{COLOR_B}" stop-opacity="0.12"/><stop offset="1" stop-color="{COLOR_B}" stop-opacity="0"/></radialGradient>'
         f'<linearGradient id="arc" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="{COLOR_B}"/><stop offset="1" stop-color="{COLOR_A}"/></linearGradient></defs>',
         f'<rect width="{W}" height="{H}" fill="url(#glow2)"/><rect width="{W}" height="{H}" fill="url(#glow)"/>']
    # the circle: a faint outer ring, the ring the wallets sit on with one bright turn, the mark at the centre
    p.append(f'<circle cx="{cx}" cy="{cy}" r="{R + 62}" fill="none" stroke="{COLOR_A}" stroke-opacity="0.06" stroke-width="1.5"/>')
    p.append(f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="{COLOR_A}" stroke-opacity="0.18" stroke-width="2"/>')
    a0, a1 = math.radians(-160), math.radians(-35)
    p.append(f'<path d="M{cx + R * math.cos(a0):.1f} {cy + R * math.sin(a0):.1f} A{R} {R} 0 0 1 {cx + R * math.cos(a1):.1f} {cy + R * math.sin(a1):.1f}" '
             f'fill="none" stroke="url(#arc)" stroke-width="3" stroke-linecap="round"/>')
    p.append(mark('url(#g)', f'translate({cx - 50 * 1.25:.1f} {cy - 50 * 1.25:.1f}) scale(1.25)'))
    n = 8
    pills = {0: '+14.2%', 3: '+9.8%', 4: '+21.5%'}
    for i in range(n):
        ang = math.radians(-90 + i * 360 / n + 22.5)
        x, y = cx + R * math.cos(ang), cy + R * math.sin(ang)
        body = cast[i].replace('chr-clip', f'chr{i}')
        p.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{S / 2 + 4}" fill="{BLACK}"/>')
        p.append(f'<g transform="translate({x - S / 2:.1f} {y - S / 2:.1f}) scale({S / 64:g})">{body}</g>')
        if i in pills:
            d, w = text_path(pills[i], 'IBMPlexSans-400', 17, 0, 0)
            px = x + S / 2 - 6 if math.cos(ang) >= 0 else x - S / 2 + 6 - (w + 20)
            py = y + S / 2 - 12
            p.append(f'<rect x="{px:.1f}" y="{py - 15:.1f}" width="{w + 20:.1f}" height="26" rx="13" fill="#0d1a14" stroke="{ACCENTS[0]}" stroke-opacity="0.5"/>')
            p.append(f'<path transform="translate({px + 10:.1f} {py + 4:.1f})" d="{d}" fill="{ACCENTS[0]}"/>')
    x0 = 440
    p.append(f'<g transform="translate({x0 - 13} 92) scale(0.8)">{mark("url(#g)")}<path d="{parts_d["yield"]}" fill="{INK}"/><path d="{parts_d["circle"]}" fill="url(#gg)"/></g>')
    d1, _ = text_path(X_HEAD, 'Montserrat-600', 54, x0, 232)
    p.append(f'<path d="{d1}" fill="{INK}"/>')
    for k, line in enumerate(X_SUB):
        d2, _ = text_path(line, 'IBMPlexSans-400', 23, x0, 288 + k * 34)
        p.append(f'<path d="{d2}" fill="{MUTE}"/>')
    p.append(f'<rect x="{x0}" y="372" width="72" height="3" fill="{COLOR_A}"/>')
    return svg((0, 0, W, H), ''.join(p))

def main():
    ensure_fonts()
    os.makedirs(OUT, exist_ok=True); os.makedirs(DOCS, exist_ok=True)
    lock, parts = lockup()
    files = {
        'mark.svg': tile(),
        'mark-maskable.svg': tile(rx=0, glyph_scale=0.72),
        'mark-plain.svg': svg((0, 0, 100, 100), f'<defs>{gradient("g")}</defs>' + mark('url(#g)')),
        'mark-mono.svg': svg((0, 0, 100, 100), mark('currentColor')),
        'logo.svg': lock,
        'logo-dark-text.svg': lockup(INK_DARK)[0],
        'logo-themable.svg': lockup('currentColor', themable=True)[0],
        'og.svg': og(),
        'banner.svg': banner(),
        'x-header.svg': x_header(),
    }
    for name, body in files.items():
        with open(os.path.join(OUT, name), 'w') as f: f.write(body)
        print('wrote', os.path.relpath(os.path.join(OUT, name)))
    x, w, top, base = parts['box']
    ts = ('// GENERATED by brand/gen.py — do not edit. `pnpm brand` regenerates.\n'
          f'export const MARK_D = {MARK_D!r}\n'
          f"export const MARK_VIEWBOX = '0 0 100 100'\n"
          f'/** YIELD, laid out after the mark. */\nexport const YIELD_D = {parts["yield"]!r}\n'
          f'/** CIRCLE, in the brand gradient. */\nexport const CIRCLE_D = {parts["circle"]!r}\n'
          f'export const LOCKUP_VIEWBOX = {parts["viewbox"]!r}\n'
          f"/** CIRCLE's box in lockup space, for a gradient that spans exactly it. */\n"
          f'export const CIRCLE_BOX = {{ x: {x:.2f}, w: {w:.2f}, top: {top:.2f}, base: {base:.2f} }}\n'
          f'export const COLOR_A = {COLOR_A!r}\nexport const COLOR_B = {COLOR_B!r}\n')
    with open(TS_OUT, 'w') as f: f.write(ts)
    print('wrote', os.path.relpath(TS_OUT))

if __name__ == '__main__':
    main()
