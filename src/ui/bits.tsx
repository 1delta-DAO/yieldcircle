import React from 'react'
import { createPortal } from 'react-dom'
import { assetLogo, colorOf, short, unitOf } from '../model/assets'
import { chainInfo, txUrl } from './ChainMark'
import type { Risk } from '../model/strategies'

export const pct = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? '—' : (x < 0 ? '−' : '') + Math.abs(x).toFixed(d) + '%')
export const usd = (x: number | null | undefined) => {
  if (x == null || !Number.isFinite(x)) return '—'
  // under a dollar keeps its cents (1 MON is $0.03, not "$0"); the sign goes before the currency and a zero has none
  const a = Math.abs(x), body = a > 0 && a < 1 ? `$${a.toFixed(2)}` : '$' + Math.round(a).toLocaleString('en-US')
  return x < 0 && body !== '$0' && body !== '$0.00' ? `−${body}` : body.replace('$0.00', '$0')
}
export const usdShort = (x: number | null | undefined) => {
  if (x == null || !Number.isFinite(x)) return '—'
  const a = Math.abs(x)
  const body = a >= 1e9 ? `$${(a / 1e9).toFixed(1)}b` : a >= 1e6 ? `$${(a / 1e6).toFixed(0)}m` : a >= 1e3 ? `$${(a / 1e3).toFixed(0)}k` : `$${a.toFixed(0)}`
  // the sign goes before the currency, and a figure that rounds to nothing has
  // no sign worth showing — a rebalance's net was reading as "$-0"
  return x < 0 && body !== '$0' ? `−${body}` : body
}
export const num = (x: number, d = 4) => x.toLocaleString('en-US', { maximumFractionDigits: d })
/** Amount of a base asset in its natural unit: dollars for the USD group, the token otherwise. */
export const amt = (asset: string, x: number, usdValue?: number) => (unitOf(asset) === '$' ? usd(usdValue ?? x) : `${num(x, x >= 100 ? 2 : 4)} ${asset}`)

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
export function DecimalInput({ value, onChange, style, ariaLabel, autoFocus }: { value: number; onChange: (v: number) => void; style?: React.CSSProperties; ariaLabel?: string; autoFocus?: boolean }) {
  const [text, setText] = React.useState(() => fmtIn(value))
  const emitted = React.useRef(value)
  React.useEffect(() => { if (value !== emitted.current) { emitted.current = value; setText(fmtIn(value)) } }, [value])
  // While typing, keep the separators as typed (so "1,234.5" can still resolve as thousands + decimal once the
  // dot arrives) and only drop letters; the value is parsed through the normaliser on every keystroke. On blur the
  // text is rewritten in canonical form with a dot.
  return <input inputMode="decimal" autoComplete="off" value={text} aria-label={ariaLabel} autoFocus={autoFocus} style={style}
    onChange={(e) => { const raw = e.target.value.replace(/[^0-9.,\s]/g, ''); setText(raw); const t = normaliseDecimal(raw); const v = t === '' || t === '.' ? 0 : parseFloat(t); if (Number.isFinite(v)) { emitted.current = v; onChange(v) } }}
    onBlur={() => { const t = normaliseDecimal(text); setText(t === '' || t === '.' ? '0' : t.endsWith('.') ? t.slice(0, -1) : t) }} />
}
const fmtIn = (v: number) => (Number.isFinite(v) ? String(+v.toFixed(8)) : '')

/**
 * A small floating layer anchored under (or above) an element: closes on outside click, Escape and
 * scroll. Used for the ⓘ explanations and the route picker, so nothing pushes the content around.
 */
export function Popover({ anchor, open, onClose, children, width = 300, align = 'left', near }: { anchor: React.RefObject<HTMLElement | null>; open: boolean; onClose: () => void; children: React.ReactNode; width?: number; align?: 'left' | 'right' | 'stretch'; /** the element to sit under (defaults to the anchor); the anchor then only sets the width */ near?: React.RefObject<HTMLElement | null> }) {
  const box = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState<{ top: number; left: number; width: number; up: boolean } | null>(null)
  React.useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const place = () => {
      const a = anchor.current; if (!a) return
      const r = a.getBoundingClientRect(); const vw = window.innerWidth, vh = window.innerHeight
      const n = near?.current?.getBoundingClientRect() ?? r
      const w = align === 'stretch' ? Math.min(r.width, vw - 16) : Math.min(width, vw - 16)
      let left = align === 'right' ? r.right - w : r.left
      left = Math.max(8, Math.min(left, vw - w - 8))
      const h = box.current?.offsetHeight ?? 200
      const up = n.bottom + 6 + h > vh - 8 && n.top - 6 - h > 8
      setPos({ top: up ? n.top - 6 - h : n.bottom + 6, left, width: w, up })
    }
    place()
    const t = setTimeout(place, 0)   // once rendered, measure the real height
    const trig = near?.current ?? anchor.current
    const off = (e: MouseEvent) => { const t = e.target as Node; if (box.current && !box.current.contains(t) && trig && !trig.contains(t)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', off); document.addEventListener('keydown', key)
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', off); document.removeEventListener('keydown', key); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, anchor, width, align, near])
  if (!open) return null
  return createPortal(<div ref={box} className="pop" style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width ?? width }} role="dialog">{children}</div>, document.body)
}
/** ⓘ — the explanation lives here, not in the layout. Tap or hover. */
export function Info({ children, label = 'What is this?' }: { children: React.ReactNode; label?: string }) {
  const ref = React.useRef<HTMLButtonElement>(null)
  const [open, setOpen] = React.useState(false)
  const hover = React.useRef<number | undefined>(undefined)
  return (
    <>
      <button ref={ref} type="button" className="info" aria-label={label} aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        onMouseEnter={() => { hover.current = window.setTimeout(() => setOpen(true), 250) }} onMouseLeave={() => { clearTimeout(hover.current); }}>i</button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={300}><div className="pop-text" onMouseLeave={() => setOpen(false)}>{children}</div></Popover>
    </>
  )
}

/** Token mark: the icon when we have one, else a coloured disc with the first letters. */
export function Tok({ sym, logo, size = 22 }: { sym: string; logo?: string; size?: number }) {
  const [bad, setBad] = React.useState(false)
  // a strategy passes its own picture (the vault, the LST, the venue token); a bare symbol gets the base-asset mark from the token list
  logo = logo ?? assetLogo(sym)
  if (logo && !bad) return <img className="tok" src={logo} alt="" width={size} height={size} style={{ width: size, height: size, background: '#111' }} onError={() => setBad(true)} title={sym} />
  return <i className="tok" style={{ background: colorOf(sym), width: size, height: size }} title={sym}>{short(sym)}</i>
}
const ICON_BASE = 'https://raw.githubusercontent.com/1delta-DAO/protocol-icons/main/lender/'
const FAMILY: [RegExp, string][] = [
  [/^AAVE_V3_HORIZON/i, 'aave_v3_horizon'], [/^AAVE_V3_PRIME|^AAVE_V3_LIDO/i, 'aave_v3_prime'], [/^AAVE_V3/i, 'aave_v3'], [/^AAVE_V4/i, 'aave_v4'], [/^AAVE_V2/i, 'aave_v2'],
  [/^MORPHO_BLUE|^vault\.morpho$/i, 'morpho_blue'], [/^MORPHO_MIDNIGHT/i, 'morpho_blue'], [/^FLUID|^vault\.fluid$/i, 'fluid'], [/^LLAMALEND/i, 'llamalend'],
  [/^COMPOUND_V3/i, 'compound_v3'], [/^COMPOUND_V2/i, 'compound_v2'], [/^EULER|^vault\.euler-earn$/i, 'euler_v2'], [/^DOLOMITE/i, 'dolomite'], [/^SPARK/i, 'spark'],
  [/^LISTA/i, 'lista'], [/^VENUS/i, 'venus'], [/^SILO/i, 'silo'], [/^GEARBOX/i, 'gearbox_v3'], [/^RESUPPLY/i, 'resupply'], [/^FRAXLEND/i, 'fraxlend'], [/^INVERSE/i, 'inverse'],
  [/^CURVANCE/i, 'curvance'], [/^FLYING_TULIP/i, 'flying_tulip'], [/^FRANKENCOIN/i, 'frankencoin'], [/^CAPY_FI/i, 'capy_fi'], [/^AVALON/i, 'avalon'], [/^EXACTLY/i, 'exactly'], [/^XLEND/i, 'xlend'],
]
/** Candidate venue icons, most specific first; the badge walks them on load error and gives up quietly. */
export function venueIconUrls(key: string): string[] {
  const f = FAMILY.find(([re]) => re.test(key))?.[1]
  const base = key.toLowerCase().replace(/(_[0-9a-f]{40,64}|_\d+)+$/, '')
  return [...new Set([f, base.startsWith('vault.') ? undefined : base].filter((n): n is string => !!n))].map((n) => ICON_BASE + n + '.webp')
}
/** A small venue badge on the corner of a mark: the lender's icon where the icon set has one, else the brand's first letters. */
export function VenueBadge({ venueKey, brand }: { venueKey: string; brand: string }) {
  const urls = React.useMemo(() => venueIconUrls(venueKey), [venueKey])
  const [i, setI] = React.useState(0)
  React.useEffect(() => setI(0), [venueKey])
  if (i < urls.length) return <img className="badge" src={urls[i]} alt="" aria-hidden onError={() => setI((n) => n + 1)} title={brand} />
  return <i className="badge txt" style={{ background: colorOf(brand) }} title={brand} aria-hidden>{brand.replace(/[^A-Za-z0-9]/g, '').slice(0, 2)}</i>
}
/** The mark of a plain-deposit strategy: the token you end up holding, with the venue in the corner. */
export function StratMark({ sym, logo, venueKey, brand, size = 22 }: { sym: string; logo?: string; venueKey: string; brand: string; size?: number }) {
  return <span className="mark" style={{ width: size, height: size }}><Tok sym={sym} logo={logo} size={size} /><VenueBadge venueKey={venueKey} brand={brand} /></span>
}
export function Toks({ a, b, logoA, logoB }: { a: string; b?: string; logoA?: string; logoB?: string }) {
  return <span className="toks"><Tok sym={a} logo={logoA} />{b && <Tok sym={b} logo={logoB} />}</span>
}
export function RiskDot({ r, label, dotOnly }: { r: Risk; label?: string; dotOnly?: boolean }) {
  return <span className={`risk r${r}`} title={label ? `${label} risk` : undefined}><i />{!dotOnly && (label ?? ['', 'Low', 'Medium', 'High'][r])}</span>
}
export function KindPill({ kind, source }: { kind: 'simple' | 'loop'; source?: string }) {
  if (kind === 'loop') return <span className="pill loop">Loop</span>
  if (source === 'fixed') return <span className="pill pt">Fixed</span>
  return <span className="pill dep">Deposit</span>
}
/**
 * The transaction behind a row, on the chain's own explorer. Every number in
 * this app is derived from one log of one transaction, and this is how anyone
 * can check it — so the icon is on the card, not in a tooltip. A chain
 * `ChainMark.tsx` has no explorer for renders nothing rather than a dead link.
 */
export function TxLink({ chainId, hash, label }: { chainId: string | undefined; hash: string | undefined; label?: string }) {
  const href = txUrl(chainId, hash)
  if (!href) return null
  const where = chainInfo(chainId)?.explorerName ?? 'the block explorer'
  return (
    <a className="txlink" href={href} target="_blank" rel="noreferrer" title={`${hash} · open on ${where}`}
      aria-label={`Open the transaction on ${where}`} onClick={(e) => e.stopPropagation()}>
      {label && <span className="mono">{label}</span>}
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10" />
      </svg>
    </a>
  )
}
export function Sk({ w = 80, h = 12 }: { w?: number | string; h?: number }) { return <span className="sk" style={{ width: w, height: h }} aria-hidden /> }
export function GroupIcon({ id, color, size = 20 }: { id: string; color: string; size?: number }) {
  return <i className="ic" style={{ background: color, width: size, height: size, fontSize: size * 0.47 }}>{id === 'MORE' ? '+' : id[0]}</i>
}
