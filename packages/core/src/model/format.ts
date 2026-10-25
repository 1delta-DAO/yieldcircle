/**
 * Numbers in words the reader can take in at a glance — every app's one formatting, so a rate or a
 * balance reads the same on the web and on the phone.
 */

export const pct = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (x < 0 ? '−' : '') + Math.abs(x).toFixed(d) + '%')
/** One decimal while the figure is a single digit (9.44 → "9.4", 5.02 → "5"), whole from 10 on (9.97 → "10"). */
const oneDecimal = (v: number) => (v < 9.95 ? v.toFixed(1).replace(/\.0$/, '') : Math.round(v).toLocaleString('en-US'))
export const usd = (x: number | null | undefined) => {
  if (x == null || !Number.isFinite(x)) return '—'
  // under a dollar keeps its cents (1 MON is $0.03, not "$0"), a single digit keeps one decimal ($9.4 of equity,
  // not "$9"); the sign goes before the currency and a zero has none
  const a = Math.abs(x), body = a > 0 && a < 1 ? `$${a.toFixed(2)}` : a < 10 ? `$${oneDecimal(a)}` : '$' + Math.round(a).toLocaleString('en-US')
  return x < 0 && body !== '$0' && body !== '$0.00' ? `−${body}` : body.replace('$0.00', '$0')
}
/**
 * A headline dollar figure: exact to the dollar under $10m, in millions from
 * there ($1,099.5m) — ten digits of a billion-dollar wallet do not fit a phone,
 * and the last six say nothing. Show `usd(x)` beside it where the exact one matters.
 */
export const usdBig = (x: number | null | undefined) => {
  if (x == null || !Number.isFinite(x) || Math.abs(x) < 1e7) return usd(x)
  const body = '$' + (Math.abs(x) / 1e6).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'm'
  return x < 0 ? `−${body}` : body
}
export const usdShort = (x: number | null | undefined) => {
  if (x == null || !Number.isFinite(x)) return '—'
  const a = Math.abs(x)
  // under a dollar keeps its cents, as `usd` does: a $0.41 liquidation is not "$0"
  // and a single leading digit keeps one decimal at every scale: $7.4m, $8.2k, $3.2 — "$8m" hides a fifth of it
  const body = a >= 1e9 ? `$${(a / 1e9).toFixed(1)}b` : a >= 1e6 ? `$${oneDecimal(a / 1e6)}m` : a >= 1e3 ? `$${oneDecimal(a / 1e3)}k` : a >= 1 ? `$${oneDecimal(a)}` : a > 0 ? `$${a.toFixed(2)}`.replace('$0.00', '$0') : '$0'
  // the sign goes before the currency, and a figure that rounds to nothing has
  // no sign worth showing — a rebalance's net was reading as "$-0"
  return x < 0 && body !== '$0' ? `−${body}` : body
}
export const num = (x: number, d = 4) => x.toLocaleString('en-US', { maximumFractionDigits: d })

/** A logo URL worth trying: IPFS gateways time out more often than they answer. */
const DEAD_LOGO = /^(ipfs:|https?:\/\/([^/]*\.)?(ipfs\.io|dweb\.link|cloudflare-ipfs\.com|cf-ipfs\.com|nftstorage\.link|w3s\.link|4everland\.io)\/)/i
export const liveLogo = (u: string | null | undefined): u is string => !!u && !DEAD_LOGO.test(u)

/** Dollars to the cent, `$1,234.56` — what a loss to confirm is said in. */
export const cents = (x: number) => '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** A share, unsigned, in a percent: a 3.1 % loss reads 3.1 %, not −3.1 %. */
export const pctAbs = (x: number) => { const a = Math.abs(x); return `${(a * 100).toFixed(a < 0.1 ? 2 : 1)}%` }
