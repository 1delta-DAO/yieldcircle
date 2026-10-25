/**
 * What an amount box holds (tickets/0014): the text the reader typed, or a REFERENCE to a raw value
 * the app already has — Max is 100 % of the balance, a percent button is `pct` of it. Never a float:
 * a float round-trip lost 166,624 wei on a Max margin and the loop reverted.
 *
 * The float (`unitsOf`) is for display and the maths that only produce display numbers (health, APR,
 * dollars). What is SENT is `payRaw`: the reference resolved on the exact raw at build time, or the
 * typed text parsed digit by digit, then capped at what is held.
 */
export interface Amount {
  /** what the box shows, canonical (dot decimal, no grouping) */
  text: string
  /** a share of `have` in percent (100 = Max), resolved on its raw value when sent; dropped by a keystroke */
  pct?: number
}

/** a balance or a position: the float for display, the exact base units where known */
export interface Have { amount: number; raw?: string }

/** A position as the cap {@link payRaw} takes: its float `amount` and its exact `amountRaw`. */
export const heldRaw = (h: { amount: number; amountRaw?: string }): Have => ({ amount: h.amount, raw: h.amountRaw })

/** `text` → base units, digit by digit: excess decimals are cut, never rounded up. Not a number → 0. */
export function parseUnits(text: string, decimals: number): bigint {
  const m = /^\s*(\d*)(?:\.(\d*))?\s*$/.exec(text)
  if (!m || (!m[1] && !m[2])) return 0n
  return BigInt(m[1] || '0') * 10n ** BigInt(decimals) + BigInt(((m[2] ?? '') + '0'.repeat(decimals)).slice(0, decimals) || '0')
}

/** base units → text, at most `maxDp` decimals, cut (so a shown Max never reads above the balance), trailing zeros dropped */
export function formatUnits(raw: bigint | string, decimals: number, maxDp = decimals): string {
  const r = BigInt(raw), d = 10n ** BigInt(decimals)
  const f = (r % d).toString().padStart(decimals, '0').slice(0, Math.min(decimals, maxDp)).replace(/0+$/, '')
  return (r / d).toString() + (f ? '.' + f : '')
}

/** a plain number as box text (a programmatic set: a suggestion, a sum the ticket worked out) */
export function fromUnits(x: number): Amount {
  if (!Number.isFinite(x) || x <= 0) return { text: '0' }
  // toFixed beyond ~15 significant digits invents noise; 8 places is what the box has always shown
  // no exponent (`String(1e-7)` is "1e-7", which no digit parser reads)
  return { text: x.toFixed(8).replace(/\.?0+$/, '') }
}

/** `p` % of what is held, as the box shows it and as a reference resolved on the raw when sent */
export function portion(have: Have | null | undefined, p: number, decimals: number): Amount {
  if (!have) return { text: '0' }
  const text = have.raw ? formatUnits((BigInt(have.raw) * BigInt(p)) / 100n, decimals, 8) : fromUnits(Math.floor(have.amount * p * 1e6 / 100) / 1e6).text
  return { text, pct: p }
}

/** the float for display and display-only maths */
export const unitsOf = (a: Amount): number => { const v = parseFloat(a.text); return Number.isFinite(v) && v > 0 ? v : 0 }

/** sticky state written before 0014 is a bare number — read it as typed text */
export const asAmount = (v: unknown): Amount => (typeof v === 'number' ? fromUnits(v) : v && typeof v === 'object' && typeof (v as Amount).text === 'string' ? (v as Amount) : { text: '0' })

/**
 * The raw amount to send out of `have` (a wallet balance, or a position via {@link heldRaw}):
 * - a reference (Max, a percent) is resolved on `have.raw`, rounding down;
 * - typed text is parsed digit by digit and capped at `have.raw`;
 * - with no raw to go on (a holding the API sent without one), the parsed text as it stands.
 */
export function payRaw(a: Amount, decimals: number, have?: Have | null): string {
  const cap = have?.raw != null ? BigInt(have.raw) : null
  if (cap != null && a.pct != null) return ((cap * BigInt(Math.round(a.pct))) / 100n).toString()
  const r = parseUnits(a.text, decimals)
  return (cap != null && r > cap ? cap : r).toString()
}

/**
 * A decimal input that accepts what people type: a comma or a dot as the decimal mark (both become a
 * dot), thousands separators dropped, one decimal point, no letters. The text stays as typed while
 * editing ("1." and "0,0" are fine), and only follows `value` when it changes from outside (Max).
 */
export function normaliseDecimal(raw: string): string {
  let t = raw.replace(/\s/g, '')
  // "1,234.5" / "1.234,5": the LAST separator is the decimal mark, the others are grouping
  const lastComma = t.lastIndexOf(','), lastDot = t.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) { const dec = Math.max(lastComma, lastDot); t = t.slice(0, dec).replace(/[.,]/g, '') + '.' + t.slice(dec + 1).replace(/[.,]/g, '') }
  else t = t.replace(/,/g, '.')
  t = t.replace(/[^0-9.]/g, '')
  const i = t.indexOf('.')
  if (i >= 0) t = t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, '')
  if (t.startsWith('.')) t = '0' + t
  return t
}
