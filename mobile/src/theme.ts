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
