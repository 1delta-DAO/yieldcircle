/**
 * The character: every wallet has a face, and the face is a small creature
 * built from six layers — backdrop, body, eyes, mouth, accessory, palette.
 *
 * Three properties matter, and they are why this is drawn rather than fetched:
 *
 *  - **Deterministic.** With no profile, the layers are derived from the
 *    address alone, so an un-profiled wallet in the feed still has a face and
 *    the same face in every client. A feed of `0x7a3f…` is unreadable; a feed
 *    of faces is not.
 *  - **Free.** Inline SVG from a table of numbers: no uploads, no hosting, no
 *    image requests, nothing to moderate, crisp at any size.
 *  - **Signed.** A customised character is the string `yc1:b3.c7.e1.m4.a2.p9`
 *    carried in the profile's `avatarUrl`, signed like every other social
 *    write. It rides in the existing field on purpose: changing the `Profile`
 *    EIP-712 type would change its struct hash, and every profile signature
 *    already stored was made against the current shape.
 *
 * A profile may instead carry a plain picture URL (`https://…` or `ipfs://…`)
 * in the same field. It is fetched from wherever it lives — the one exception
 * to "no requests" — and falls back to the derived character when it does not
 * load, so a dead link never leaves a hole in the feed.
 *
 * Some layers are EARNED — they render for anyone, but a profile claiming one
 * without the matching system tag is shown as unverified (`docs/social.md`
 * §3.5). Status you cannot buy is the whole point.
 */
import React from 'react'
import { fnv1a } from '@yieldcircle/core/identity/name'

// ---------------------------------------------------------------- palettes
export interface Palette { name: string; bg: string; bg2: string; body: string; body2: string; ink: string; accent: string }
export const PALETTES: Palette[] = [
  { name: 'cyan',    bg: '#06282f', bg2: '#0a3b45', body: '#2fd3e8', body2: '#1b9cb0', ink: '#042028', accent: '#7ce9f5' },
  { name: 'moss',    bg: '#0a2419', bg2: '#0f3626', body: '#3fbf7f', body2: '#2a8a5b', ink: '#042114', accent: '#8ff0bd' },
  { name: 'ember',   bg: '#2b1207', bg2: '#3d1c0b', body: '#e2823a', body2: '#b05f24', ink: '#2a1206', accent: '#ffc38a' },
  { name: 'plum',    bg: '#22103a', bg2: '#31184f', body: '#c084fc', body2: '#8f57c4', ink: '#1b0d2e', accent: '#e3c2ff' },
  { name: 'slate',   bg: '#12161b', bg2: '#1c232b', body: '#8fa6ff', body2: '#5e73c9', ink: '#0d1016', accent: '#c3cfff' },
  { name: 'rose',    bg: '#2d0f1b', bg2: '#421627', body: '#e5708f', body2: '#b04a67', ink: '#280d18', accent: '#ffb3c6' },
  { name: 'gold',    bg: '#2a220a', bg2: '#3c310f', body: '#e2c33a', body2: '#ab9020', ink: '#241d08', accent: '#ffe993' },
  { name: 'teal',    bg: '#07241f', bg2: '#0c352e', body: '#37c2ab', body2: '#22887a', ink: '#04201b', accent: '#8ff0e2' },
  { name: 'ice',     bg: '#111a24', bg2: '#1a2734', body: '#9fd4e8', body2: '#6ba3bb', ink: '#0c141d', accent: '#d6f0fb' },
  { name: 'clay',    bg: '#241713', bg2: '#35221c', body: '#c98a6b', body2: '#96604a', ink: '#1f1310', accent: '#f0bfa4' },
  { name: 'lime',    bg: '#1a2409', bg2: '#27340f', body: '#a8d13a', body2: '#7a9c22', ink: '#161f07', accent: '#d8f58a' },
  { name: 'ink',     bg: '#0e0e12', bg2: '#181820', body: '#b9bfd0', body2: '#7d8396', ink: '#0a0a0e', accent: '#e9ecf5' },
]

// ---------------------------------------------------------------- backdrops
/**
 * The SVG primitives a drawing is made of — the DOM's elements on the web, react-native-svg's on the
 * phone. Every layer below draws with these, so one table of numbers is every client's face.
 */
export interface Prims { Circle: React.ElementType; Path: React.ElementType; G: React.ElementType; Rect: React.ElementType; Line: React.ElementType; Ellipse: React.ElementType; Defs: React.ElementType; ClipPath: React.ElementType }
type Draw = (p: Palette, P: Prims) => React.ReactNode
export const BACKDROPS: { name: string; draw: Draw }[] = [
  { name: 'plain', draw: (_p, P) => null },
  { name: 'ring', draw: (p, P) => <P.Circle cx="32" cy="32" r="22" fill="none" stroke={p.bg2} strokeWidth="6" /> },
  { name: 'halo', draw: (p, P) => <><P.Circle cx="32" cy="32" r="26" fill={p.bg2} opacity=".7" /><P.Circle cx="32" cy="32" r="18" fill={p.bg} /></> },
  { name: 'rise', draw: (p, P) => <P.Path d="M0 44h64v20H0z" fill={p.bg2} /> },
  { name: 'rays', draw: (p, P) => <P.G stroke={p.bg2} strokeWidth="4" strokeLinecap="round">{[0, 45, 90, 135].map((a) => <P.Line key={a} x1="32" y1="32" x2={32 + 34 * Math.cos((a * Math.PI) / 180)} y2={32 + 34 * Math.sin((a * Math.PI) / 180)} />)}</P.G> },
  { name: 'grid', draw: (p, P) => <P.G stroke={p.bg2} strokeWidth="2">{[12, 26, 40, 54].map((v) => <React.Fragment key={v}><P.Line x1={v} y1="0" x2={v} y2="64" /><P.Line x1="0" y1={v} x2="64" y2={v} /></React.Fragment>)}</P.G> },
  { name: 'wave', draw: (p, P) => <P.Path d="M-4 46q12-10 22 0t22 0 22 0v22h-66z" fill={p.bg2} /> },
  { name: 'bars', draw: (p, P) => <P.G fill={p.bg2}>{[8, 22, 36, 50].map((y, i) => <P.Rect key={y} x="0" y={y} width={64} height={4 + i} />)}</P.G> },
  { name: 'dots', draw: (p, P) => <P.G fill={p.bg2}>{[10, 24, 38, 52].flatMap((x) => [10, 24, 38, 52].map((y) => <P.Circle key={`${x}-${y}`} cx={x} cy={y} r="3" />))}</P.G> },
  { name: 'arc', draw: (p, P) => <P.Path d="M2 62a30 30 0 0 1 60 0z" fill={p.bg2} /> },
  { name: 'aurora', draw: (p, P) => <><P.Path d="M0 14q16 12 32 0t32 0v-14h-64z" fill={p.bg2} /><P.Path d="M0 26q16 10 32 0t32 0" fill="none" stroke={p.bg2} strokeWidth="3" opacity=".6" /></> },
  { name: 'vault', draw: (p, P) => <><P.Circle cx="32" cy="32" r="27" fill="none" stroke={p.accent} strokeWidth="2" opacity=".55" /><P.Circle cx="32" cy="32" r="31" fill="none" stroke={p.accent} strokeWidth="1" opacity=".3" /></> },
]

// ---------------------------------------------------------------- creatures
/** A body is a rounded head plus ears plus an optional extra, all from numbers. */
interface Creature { name: string; w: number; h: number; r: number; ear: 'none' | 'tri' | 'round' | 'tuft' | 'long' | 'fin' | 'antenna' | 'horn'; earX?: number; earS?: number; extra?: Draw }
export const CREATURES: Creature[] = [
  { name: 'otter', w: 34, h: 32, r: 15, ear: 'round', earX: 13, earS: 5 },
  { name: 'fox', w: 34, h: 31, r: 13, ear: 'tri', earX: 14, earS: 9 },
  { name: 'cat', w: 33, h: 30, r: 12, ear: 'tri', earX: 13, earS: 10 },
  { name: 'bear', w: 36, h: 33, r: 16, ear: 'round', earX: 15, earS: 7 },
  { name: 'owl', w: 38, h: 32, r: 15, ear: 'tuft', earX: 14, earS: 8, extra: (p, P) => <P.Path d="M32 40l-4 6h8z" fill={p.accent} /> },
  { name: 'hare', w: 30, h: 32, r: 14, ear: 'long', earX: 8, earS: 13 },
  { name: 'frog', w: 36, h: 28, r: 13, ear: 'none', extra: (p, P) => <><P.Circle cx="22" cy="20" r="7" fill={p.body} /><P.Circle cx="42" cy="20" r="7" fill={p.body} /></> },
  { name: 'whale', w: 38, h: 29, r: 14, ear: 'fin', earX: 18, earS: 7, extra: (p, P) => <P.Path d="M32 14q-3-6 0-8 3 2 0 8" fill={p.accent} opacity=".8" /> },
  { name: 'crab', w: 34, h: 26, r: 11, ear: 'round', earX: 17, earS: 6, extra: (p, P) => <P.G stroke={p.body2} strokeWidth="3" strokeLinecap="round"><P.Path d="M14 44l-7 7" /><P.Path d="M50 44l7 7" /></P.G> },
  { name: 'bird', w: 30, h: 30, r: 15, ear: 'none', extra: (p, P) => <P.Path d="M32 36l-5 5 5 4 5-4z" fill={p.accent} /> },
  { name: 'robot', w: 34, h: 30, r: 6, ear: 'antenna', earX: 0, earS: 8, extra: (p, P) => <P.G fill={p.body2}><P.Rect x="12" y="30" width="4" height="8" rx="2" /><P.Rect x="48" y="30" width="4" height="8" rx="2" /></P.G> },
  { name: 'ghost', w: 32, h: 34, r: 16, ear: 'none', extra: (p, P) => <P.Path d="M16 46q4 6 8 0t8 0 8 0 8 0v6H16z" fill={p.body} /> },
  { name: 'shroom', w: 36, h: 24, r: 12, ear: 'none', extra: (p, P) => <><P.Rect x="24" y="36" width="16" height="16" rx="6" fill={p.body2} /><P.Circle cx="22" cy="22" r="4" fill={p.accent} opacity=".7" /><P.Circle cx="42" cy="26" r="3" fill={p.accent} opacity=".7" /></> },
  { name: 'bee', w: 32, h: 30, r: 14, ear: 'antenna', earX: 8, earS: 7, extra: (p, P) => <P.G fill={p.ink} opacity=".45"><P.Rect x="16" y="34" width="32" height="4" rx="2" /><P.Rect x="18" y="42" width="28" height="4" rx="2" /></P.G> },
  { name: 'turtle', w: 36, h: 28, r: 13, ear: 'none', extra: (p, P) => <P.G fill="none" stroke={p.body2} strokeWidth="2"><P.Path d="M22 30h20" /><P.Path d="M32 22v16" /></P.G> },
  { name: 'moth', w: 30, h: 28, r: 13, ear: 'antenna', earX: 9, earS: 9, extra: (p, P) => <P.G fill={p.body2} opacity=".75"><P.Ellipse cx="12" cy="36" rx="9" ry="12" /><P.Ellipse cx="52" cy="36" rx="9" ry="12" /></P.G> },
]

function ears(c: Creature, p: Palette, P: Prims): React.ReactNode {
  const x = c.earX ?? 12, s = c.earS ?? 7, top = 32 - c.h / 2
  switch (c.ear) {
    case 'tri': return <P.G fill={c.name === 'cat' ? p.body : p.body2}><P.Path d={`M${32 - x - s / 2} ${top + 6} l${s / 2} ${-s} l${s / 2} ${s}z`} /><P.Path d={`M${32 + x - s / 2} ${top + 6} l${s / 2} ${-s} l${s / 2} ${s}z`} /></P.G>
    case 'round': return <P.G fill={p.body2}><P.Circle cx={32 - x} cy={top + 2} r={s} /><P.Circle cx={32 + x} cy={top + 2} r={s} /></P.G>
    case 'tuft': return <P.G fill={p.body2}><P.Path d={`M${32 - x} ${top + 4}l-3-${s}l7 3z`} /><P.Path d={`M${32 + x} ${top + 4}l3-${s}l-7 3z`} /></P.G>
    case 'long': return <P.G fill={p.body2}><P.Rect x={32 - x - 3} y={top - s} width="6" height={s + 6} rx="3" /><P.Rect x={32 + x - 3} y={top - s} width="6" height={s + 6} rx="3" /></P.G>
    case 'fin': return <P.Path d={`M${32 - x} ${top + 8}q-8-2-10 6 6 2 10-6z`} fill={p.body2} />
    case 'antenna': return <P.G stroke={p.body2} strokeWidth="2.5" strokeLinecap="round" fill={p.accent}>{(x ? [-x, x] : [0]).map((d) => <React.Fragment key={d}><P.Line x1={32 + d} y1={top + 2} x2={32 + d * 1.4} y2={top - s} /><P.Circle cx={32 + d * 1.4} cy={top - s} r="2.6" stroke="none" /></React.Fragment>)}</P.G>
    case 'horn': return <P.G fill={p.accent}><P.Path d={`M${32 - x} ${top + 4}l-2-${s}l6 2z`} /><P.Path d={`M${32 + x} ${top + 4}l2-${s}l-6 2z`} /></P.G>
    default: return null
  }
}

// ---------------------------------------------------------------- eyes / mouth
export const EYES: { name: string; draw: Draw }[] = [
  { name: 'round', draw: (p, P) => <P.G fill={p.ink}><P.Circle cx="25" cy="31" r="3.4" /><P.Circle cx="39" cy="31" r="3.4" /></P.G> },
  { name: 'bright', draw: (p, P) => <P.G><P.Circle cx="25" cy="31" r="4" fill={p.ink} /><P.Circle cx="39" cy="31" r="4" fill={p.ink} /><P.Circle cx="26.3" cy="29.7" r="1.3" fill="#fff" /><P.Circle cx="40.3" cy="29.7" r="1.3" fill="#fff" /></P.G> },
  { name: 'calm', draw: (p, P) => <P.G stroke={p.ink} strokeWidth="2.6" strokeLinecap="round" fill="none"><P.Path d="M21.5 31q3.5-3 7 0" /><P.Path d="M35.5 31q3.5-3 7 0" /></P.G> },
  { name: 'sharp', draw: (p, P) => <P.G fill={p.ink}><P.Path d="M21 29h8l-8 4z" /><P.Path d="M43 29h-8l8 4z" /></P.G> },
  { name: 'wide', draw: (p, P) => <P.G><P.Ellipse cx="25" cy="31" rx="5" ry="5.5" fill="#fff" opacity=".9" /><P.Ellipse cx="39" cy="31" rx="5" ry="5.5" fill="#fff" opacity=".9" /><P.Circle cx="25.6" cy="31.6" r="2.4" fill={p.ink} /><P.Circle cx="39.6" cy="31.6" r="2.4" fill={p.ink} /></P.G> },
  { name: 'visorled', draw: (p, P) => <P.G><P.Rect x="18" y="27" width="28" height="8" rx="4" fill={p.ink} /><P.Circle cx="26" cy="31" r="2" fill={p.accent} /><P.Circle cx="38" cy="31" r="2" fill={p.accent} /></P.G> },
  { name: 'wink', draw: (p, P) => <P.G fill={p.ink} stroke={p.ink} strokeWidth="2.6" strokeLinecap="round"><P.Circle cx="25" cy="31" r="3.4" stroke="none" /><P.Path d="M35.5 31.5q3.5-3 7 0" fill="none" /></P.G> },
  { name: 'dizzy', draw: (p, P) => <P.G stroke={p.ink} strokeWidth="2.2" fill="none" strokeLinecap="round"><P.Path d="M22 28l6 6M28 28l-6 6" /><P.Path d="M36 28l6 6M42 28l-6 6" /></P.G> },
]
export const MOUTHS: { name: string; draw: Draw }[] = [
  { name: 'smile', draw: (p, P) => <P.Path d="M27 39q5 5 10 0" fill="none" stroke={p.ink} strokeWidth="2.4" strokeLinecap="round" /> },
  { name: 'flat', draw: (p, P) => <P.Path d="M27 40h10" fill="none" stroke={p.ink} strokeWidth="2.4" strokeLinecap="round" /> },
  { name: 'oh', draw: (p, P) => <P.Ellipse cx="32" cy="40" rx="3.2" ry="3.8" fill={p.ink} /> },
  { name: 'grin', draw: (p, P) => <P.Path d="M26 38h12a6 6 0 0 1-12 0z" fill={p.ink} /> },
  { name: 'beak', draw: (p, P) => <P.Path d="M32 36l-4.5 5 4.5 4 4.5-4z" fill={p.accent} /> },
  { name: 'smirk', draw: (p, P) => <P.Path d="M27 40q6 3 9-2" fill="none" stroke={p.ink} strokeWidth="2.4" strokeLinecap="round" /> },
]

// ---------------------------------------------------------------- accessories
export const ACCESSORIES: { name: string; draw: Draw }[] = [
  { name: 'none', draw: (_p, P) => null },
  { name: 'cap', draw: (p, P) => <P.G><P.Path d="M15 18q17-12 34 0z" fill={p.accent} /><P.Rect x="13" y="17" width="38" height="4" rx="2" fill={p.accent} /></P.G> },
  { name: 'beanie', draw: (p, P) => <P.G><P.Path d="M16 20q16-14 32 0z" fill={p.body2} /><P.Rect x="15" y="19" width="34" height="5" rx="2.5" fill={p.accent} /></P.G> },
  { name: 'specs', draw: (p, P) => <P.G fill="none" stroke={p.accent} strokeWidth="2"><P.Circle cx="25" cy="31" r="7" /><P.Circle cx="39" cy="31" r="7" /><P.Path d="M32 31h0M18 30h-4M46 30h4" /></P.G> },
  { name: 'phones', draw: (p, P) => <P.G fill={p.accent}><P.Rect x="10" y="26" width="6" height="12" rx="3" /><P.Rect x="48" y="26" width="6" height="12" rx="3" /><P.Path d="M13 27a19 19 0 0 1 38 0" fill="none" stroke={p.accent} strokeWidth="3" /></P.G> },
  { name: 'scarf', draw: (p, P) => <P.G fill={p.accent}><P.Rect x="18" y="47" width="28" height="6" rx="3" /><P.Rect x="38" y="50" width="6" height="11" rx="3" /></P.G> },
  { name: 'leaf', draw: (p, P) => <P.Path d="M38 14q10-6 12 2-8 6-12-2z" fill={p.accent} /> },
  { name: 'bolt', draw: (p, P) => <P.Path d="M44 10l-8 11h6l-5 9 12-13h-7l6-7z" fill={p.accent} /> },
  // ---- earned
  { name: 'crown', draw: (p, P) => <P.Path d="M18 18l3-10 5 6 6-8 6 8 5-6 3 10z" fill="#e2c33a" stroke={p.ink} strokeWidth="1" /> },
  { name: 'halo', draw: (_p, P) => <P.Ellipse cx="32" cy="10" rx="13" ry="4.5" fill="none" stroke="#ffe993" strokeWidth="3" /> },
  { name: 'shield', draw: (p, P) => <P.Path d="M50 44l7-3v8q0 6-7 9-7-3-7-9v-8z" fill={p.accent} stroke={p.ink} strokeWidth="1" /> },
  { name: 'diamond', draw: (_p, P) => <P.Path d="M32 4l8 7-8 9-8-9z" fill="#7ce9f5" stroke="#042028" strokeWidth="1" /> },
]

/**
 * Layers that must be earned. The renderer draws them for anyone — a client
 * cannot be the gatekeeper — but a profile claiming one without the tag is
 * flagged, which is what `verifySpec` is for.
 */
export const GATED: { layer: keyof Spec; index: number; tag: string; why: string }[] = [
  { layer: 'a', index: 8, tag: 'size-whale', why: 'over $1m deposited, lifetime' },
  { layer: 'a', index: 9, tag: 'never-liquidated', why: 'never liquidated, on any position' },
  { layer: 'a', index: 10, tag: 'held-180d', why: 'a position held for 180 days' },
  { layer: 'a', index: 11, tag: 'early', why: 'among the first hundred into a market' },
  { layer: 'b', index: 11, tag: 'size-whale', why: 'over $1m deposited, lifetime' },
]

// ---------------------------------------------------------------- the spec
export interface Spec { b: number; c: number; e: number; m: number; a: number; p: number }
const SIZES: Record<keyof Spec, number> = { b: BACKDROPS.length, c: CREATURES.length, e: EYES.length, m: MOUTHS.length, a: ACCESSORIES.length, p: PALETTES.length }
export const LAYERS: { key: keyof Spec; label: string; names: string[] }[] = [
  { key: 'c', label: 'Creature', names: CREATURES.map((x) => x.name) },
  { key: 'e', label: 'Eyes', names: EYES.map((x) => x.name) },
  { key: 'm', label: 'Mouth', names: MOUTHS.map((x) => x.name) },
  { key: 'a', label: 'Accessory', names: ACCESSORIES.map((x) => x.name) },
  { key: 'p', label: 'Colour', names: PALETTES.map((x) => x.name) },
  { key: 'b', label: 'Backdrop', names: BACKDROPS.map((x) => x.name) },
]

/** How many options of a layer anyone may be given for free (the earned ones sit at the end). */
const free = (k: keyof Spec) => SIZES[k] - GATED.filter((g) => g.layer === k).length
/**
 * The default face of an address: six independent slices of the hash. Only
 * ungated layers are ever handed out, so a derived character never claims
 * something its wallet has not earned.
 */
export function specOf(addr: string): Spec {
  const a = addr.toLowerCase().replace(/^0x/, '').padEnd(40, '0')
  // hex keeps its historical slices so no EVM face changes; base58 slices
  // parse mostly to NaN→0 and barely vary, so a non-hex address hashes instead
  const hex = /^[0-9a-f]+$/.test(a)
  const n = hex
    ? (i: number) => parseInt(a.slice(i * 6, i * 6 + 6), 16) || 0
    : (i: number) => fnv1a(`${i}:${addr}`)
  return { c: n(0) % free('c'), e: n(1) % free('e'), m: n(2) % free('m'), a: n(3) % free('a'), p: n(4) % free('p'), b: n(5) % free('b') }
}
export const formatSpec = (s: Spec) => `yc1:b${s.b}.c${s.c}.e${s.e}.m${s.m}.a${s.a}.p${s.p}`
/** `yc1:…` → a spec, clamped into range; anything else (a real URL, an empty field) → null. */
export function parseSpec(v: string | null | undefined): Spec | null {
  if (!v || !v.startsWith('yc1:')) return null
  const out = {} as Spec
  for (const part of v.slice(4).split('.')) {
    const k = part[0] as keyof Spec
    if (!(k in SIZES)) continue
    const n = Number(part.slice(1))
    if (Number.isFinite(n)) out[k] = ((n % SIZES[k]) + SIZES[k]) % SIZES[k]
  }
  for (const k of Object.keys(SIZES) as (keyof Spec)[]) if (out[k] == null) out[k] = 0
  return out
}
/** Longest picture URL accepted; anything longer is not a link someone pasted. */
export const MAX_PICTURE_URL = 512
// ipfs.io's public gateway was sunset 2026-09-21; Filebase still serves arbitrary CIDs
const IPFS_GATEWAY = 'https://ipfs.filebase.io/ipfs/'
/**
 * A picture URL someone may point `avatarUrl` at → the URL to load, or null.
 * Only `https:` (no mixed content, no `data:` blobs in a signed message) and
 * `ipfs:`, which is rewritten to a public gateway.
 */
export function pictureUrl(v: string | null | undefined): string | null {
  if (!v || v.length > MAX_PICTURE_URL) return null
  const t = v.trim()
  if (t.startsWith('ipfs://')) {
    const path = t.slice(7).replace(/^ipfs\//, '')
    return path ? IPFS_GATEWAY + path : null
  }
  try {
    const u = new URL(t)
    return u.protocol === 'https:' && u.hostname ? u.href : null
  } catch { return null }
}
/** The spec a wallet actually shows: its signed one when it has one, else its derived one. */
export const specFor = (addr: string, avatarUrl?: string | null): Spec => parseSpec(avatarUrl) ?? specOf(addr)
/** Which claimed layers this wallet has not earned. Empty = the character is honest. */
export const unearned = (s: Spec, tags: string[] = []) =>
  GATED.filter((g) => s[g.layer] === g.index && !tags.includes(g.tag))

// ---------------------------------------------------------------- render
/**
 * The drawing itself, 64 units square, in the given primitives: the disc, then the clipped layers.
 * Each app wraps it in its own root (`<svg>` on the web, react-native-svg's `<Svg>` on the phone) and
 * shows a profile's picture instead when it has one (`pictureUrl`). `clipId` must be unique where
 * several faces share a document.
 */
export function CharacterArt({ s, P, clipId = 'chr-clip' }: { s: Spec; P: Prims; clipId?: string }) {
  const p = PALETTES[s.p], c = CREATURES[s.c]
  return (
    <>
      <P.Rect width="64" height="64" rx="32" fill={p.bg} />
      <P.Defs><P.ClipPath id={clipId}><P.Rect width="64" height="64" rx="32" /></P.ClipPath></P.Defs>
      <P.G clipPath={`url(#${clipId})`}>
        {BACKDROPS[s.b].draw(p, P)}
        {ears(c, p, P)}
        <P.Rect x={32 - c.w / 2} y={32 - c.h / 2} width={c.w} height={c.h} rx={c.r} fill={p.body} />
        {c.extra?.(p, P)}
        {EYES[s.e].draw(p, P)}
        {MOUTHS[s.m].draw(p, P)}
        {ACCESSORIES[s.a].draw(p, P)}
      </P.G>
    </>
  )
}
