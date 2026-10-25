/** The design tokens (packages/design/tokens.css) the phone uses, as values: one look on both. */
export const C = {
  bg: '#000',
  b200: '#0e0e11',
  b300: '#17171c',
  b400: '#212128',
  line: '#232329',
  line2: '#34343c',
  tx: '#e8e8e8',
  tx70: 'rgba(232,232,232,.7)',
  tx50: 'rgba(232,232,232,.5)',
  tx40: 'rgba(232,232,232,.4)',
  primary: '#2fd3e8',
  primaryInk: '#042028',
  ok: '#3fbf7f',
  warn: '#e2a33a',
  bad: '#e5534b',
  violet: '#c084fc',
  okBg: 'rgba(63,191,127,.13)',
  warnBg: 'rgba(226,163,58,.14)',
  priBg: 'rgba(47,211,232,.12)',
} as const

/** Pro's risk word as a colour: 1 low, 2 medium, 3 high. */
export const RISK = { 1: C.ok, 2: C.warn, 3: C.bad } as const

const rgb = (hex: string) => { const h = hex.replace('#', ''); const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] }
/** `hex` at an opacity: the web's `color-mix(... transparent)` / `#rrggbb66`. */
export const alpha = (hex: string, a: number) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})` }
/** `hex` laid at `a` over `base` (the web's `color-mix(in srgb, hex a, base)`), as an opaque colour. */
export const mix = (hex: string, a: number, base: string = C.b200) => {
  const [r, g, b] = rgb(hex), [R, G, B] = rgb(base)
  return `rgb(${Math.round(r * a + R * (1 - a))},${Math.round(g * a + G * (1 - a))},${Math.round(b * a + B * (1 - a))})`
}
