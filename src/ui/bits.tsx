import React from 'react'
import { createPortal } from 'react-dom'
import { isEvmChain, isSolAddr, isSvmChain } from '../model/address'
import { assetLogo, colorOf, short, unitOf } from '../model/assets'
import { ChainMark, addressUrl, chainInfo, txUrl } from './ChainMark'
import { maturityClock, termClock, type Risk } from '../model/strategies'

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
/**
 * A short explanation on hover (or tap) over something small — a tag, a pill.
 * The popover stays open while the pointer crosses from the trigger onto it.
 */
export function Tip({ tip, children, className, width = 240 }: { tip: React.ReactNode; children: React.ReactNode; className?: string; width?: number }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const [open, setOpen] = React.useState(false)
  const t = React.useRef<number | undefined>(undefined)
  const later = (v: boolean, ms: number) => { clearTimeout(t.current); t.current = window.setTimeout(() => setOpen(v), ms) }
  React.useEffect(() => () => clearTimeout(t.current), [])
  return (
    <>
      <span ref={ref} className={'tip' + (className ? ' ' + className : '')} tabIndex={0}
        onMouseEnter={() => later(true, 200)} onMouseLeave={() => later(false, 150)}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); clearTimeout(t.current); setOpen((o) => !o) }}>
        {children}
      </span>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={width}>
        <div className="pop-text" onMouseEnter={() => clearTimeout(t.current)} onMouseLeave={() => later(false, 150)}>{tip}</div>
      </Popover>
    </>
  )
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
  // a strategy passes its own picture (the vault, the LST, the venue token); a bare symbol gets the base-asset mark
  // from the token list — and so does a passed picture that fails to load (the index's ipfs.io gateway answers 429)
  const urls = React.useMemo(() => [...new Set([logo, assetLogo(sym)].filter((u): u is string => !!u))], [logo, sym])
  const [i, setI] = React.useState(0)
  React.useEffect(() => setI(0), [urls.join()])
  if (i < urls.length) return <img className="tok" src={urls[i]} alt="" width={size} height={size} style={{ width: size, height: size }} onError={() => setI((n) => n + 1)} title={sym} />
  return <i className="tok" style={{ background: colorOf(sym), width: size, height: size }} title={sym}>{short(sym)}</i>
}
const ICON_ROOT = 'https://raw.githubusercontent.com/1delta-DAO/protocol-icons/main/'
/** `aave_v3` → `lender/aave_v3.webp`; a value with a slash or an extension is a path of its own. */
const iconUrl = (n: string) => ICON_ROOT + (n.includes('/') ? n : 'lender/' + n) + (/\.\w+$/.test(n) ? '' : '.webp')
// family → the GENERIC mark. The index hands each protocol the logo of one of its
// instances (a Compound USDC comet, one Morpho market pair, one Aave V4 spoke), which
// is the wrong face for the protocol as a whole. Vaults and markets of the same house
// get different marks on purpose: Morpho Vaults (the bare butterfly) are not Morpho
// Markets (the blue disc), nor Midnight (the black one).
const FAMILY: [RegExp, string][] = [
  [/^AAVE_V3_HORIZON/i, 'aave_v3_horizon'], [/^AAVE_V3_PRIME|^AAVE_V3_LIDO/i, 'aave_v3_prime'], [/^AAVE_V3/i, 'aave_v3'], [/^AAVE_V4/i, 'aave_v4'], [/^AAVE_V2/i, 'aave_v2'],
  [/^vault\.morpho(_blue)?$/i, 'morpho.svg'], [/^MORPHO_BLUE/i, 'morpho_blue'], [/^MORPHO_MIDNIGHT/i, 'morpho_midnight'], [/^FLUID|^vault\.fluid$/i, 'fluid'], [/^LLAMALEND/i, 'llamalend'],
  [/^COMPOUND_V3/i, 'compound_v3'], [/^COMPOUND_V2/i, 'compound_v2'], [/^EULER|^vault\.euler-earn$/i, 'euler_v2'], [/^DOLOMITE/i, 'dolomite'], [/^SPARK/i, 'spark'],
  [/^LISTA|^vault\.lista/i, 'lista'], [/^VENUS/i, 'venus'], [/^SILO|^vault\.silo$/i, 'silo'], [/^GEARBOX|^vault\.gearbox$/i, 'gearbox_v3'], [/^RESUPPLY/i, 'resupply'], [/^FRAXLEND/i, 'fraxlend'], [/^INVERSE/i, 'inverse'],
  [/^LIQUITY_V2/i, 'liquity_v2'], [/^vault\.pendle$/i, 'aggregator/pendle'],
  // Solana: the lending families and their vault products. PROJECT_0's `_0` is part of the
  // name, which the instance-tail strip below would eat (→ `project.webp`, which does not exist).
  [/^KAMINO|^vault\.kamino/i, 'kamino'], [/^JUPITER_LEND|^vault\.jupiter-lend$/i, 'jupiter_lend'], [/^LOOPSCALE|^vault\.loopscale$/i, 'loopscale'],
  [/^PROJECT_0/i, 'project_0'], [/^SAVE(_|$)/i, 'save'], [/^vault\.exponent$/i, 'exponent'],
  // vault platforms: the platform's mark, not the curator's (a Lagoon vault run by 9Summits is still a Lagoon vault)
  [/^vault\.lagoon$/i, 'lagoon'], [/^vault\.upshift$/i, 'upshift'], [/^vault\.gmx$/i, 'gmx'], [/^vault\.hypercore$/i, 'hyperliquid'], [/^vault\.spectra$/i, 'spectra'],
  [/^CURVANCE/i, 'curvance'], [/^FLYING_TULIP/i, 'flying_tulip'], [/^FRANKENCOIN/i, 'frankencoin'], [/^CAPY_FI/i, 'capy_fi'], [/^AVALON/i, 'avalon'], [/^EXACTLY/i, 'exactly'], [/^XLEND/i, 'xlend'],
]
/**
 * `vault.savings` / `vault.lst` are categories, not platforms: each row is its issuer's own
 * product (Spark's sUSDS, Lido's stETH), so the issuer — the row's brand, slugged: `Rocket Pool`
 * → `lender/rocket_pool.webp` — is the mark to try.
 */
const BY_BRAND = /^vault\.(savings|lst)$/i
/** Candidate venue icons, most specific first; the badge walks them on load error and gives up quietly. */
export function venueIconUrls(key: string, brand?: string): string[] {
  const f = FAMILY.find(([re]) => re.test(key))?.[1]
  // the instance tail: 40–64 hex on EVM, a 32–44 char base58 pubkey (here already lower-cased) on Solana, a bare number
  const base = key.toLowerCase().replace(/(_[0-9a-f]{40,64}|_[a-z0-9]{32,44}|_\d+)+$/, '').replace(/_main$/, '')
  // `Native` is the token held as itself (USDC, an Ondo stock): no issuer behind a product, no mark
  const issuer = brand && brand !== 'Native' && BY_BRAND.test(key) ? brand.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') : undefined
  return [...new Set([f, issuer, base.startsWith('vault.') ? undefined : base].filter((n): n is string => !!n))].map(iconUrl)
}
/** A PROTOCOL's mark (a filter chip, not a row): the generic family icon first, the index's instance logo only after it. */
export function protocolIconUrls(key: string, logoUri?: string | null): string[] {
  return [...new Set([...venueIconUrls(key), ...(logoUri ? [logoUri] : [])])]
}
/**
 * A curator's mark: the index's logo first, then the icon set under the desk's slug. The Solana
 * index has no logos for its desks (Jupiter, Jito, Huma), but the icon set carries them as lenders.
 */
export function curatorIconUrls(id: string, logoUri?: string | null): string[] {
  const slug = id.replace(/^desk:/, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  return [...new Set([logoUri, slug && iconUrl(slug), slug && iconUrl(slug + '_lend')].filter((u): u is string => !!u))]
}
/** The first of `urls` that loads; the name's first letter when none does. */
export function ProtocolLogo({ urls, name }: { urls: string[]; name: string }) {
  const [i, setI] = React.useState(0)
  React.useEffect(() => setI(0), [urls.join()])
  if (i < urls.length) return <img src={urls[i]} alt="" width={15} height={15} loading="lazy" onError={() => setI((n) => n + 1)} />
  return <i className="plogo">{name.slice(0, 1)}</i>
}
/** A small venue badge on the corner of a mark: the lender's icon where the icon set has one, else the brand's first letters. */
export function VenueBadge({ venueKey, brand }: { venueKey: string; brand: string }) {
  const urls = React.useMemo(() => venueIconUrls(venueKey, brand), [venueKey, brand])
  const [i, setI] = React.useState(0)
  React.useEffect(() => setI(0), [venueKey, brand])
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
/**
 * A loop account with more legs than the one pair the tickets build on: `+1 collateral`, `+1 debt`.
 * The title names each leg, so the list says it before a close does.
 */
export function LegsPill({ others }: { others?: { side: 'collateral' | 'debt'; symbol: string; usd: number }[] }) {
  if (!others?.length) return null
  const n = (side: 'collateral' | 'debt') => others.filter((o) => o.side === side).length
  const words = (['collateral', 'debt'] as const).filter((k) => n(k)).map((k) => `+${n(k)} ${k}${n(k) > 1 ? 's' : ''}`).join(' ')
  return <span className="pill legs" title={`Also in this account: ${others.map((o) => `${o.symbol} ${usd(o.usd)} (${o.side})`).join(', ')}. The ticket manages one collateral against one debt; the rest is left as it is.`}>{words}</span>
}
/** Which isolated account a position sits in — shown only when the wallet runs more than one on that venue */
export function SubAccountPill({ sub, venue }: { sub?: { label: string; count: number; unsupported?: string }; venue: string }) {
  if (!sub || (sub.count < 2 && !sub.unsupported)) return null
  const v = venue.split(' · ')[0]
  const why = sub.unsupported ? ` YieldCircle cannot build for this account yet: manage it on ${v}.` : ''
  return <span className={`pill sub${sub.unsupported ? ' legs' : ''}`} title={`${sub.count > 1 ? `You run ${sub.count} separate accounts on ${v}. Each is its own position with its own health: collateral in one does not back debt in another, and adding, withdrawing or closing acts on this one only.` : `A separate account on ${v}.`}${why}`}>{sub.label}{sub.unsupported ? ` · manage on ${v}` : ''}</span>
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
/** Copy a string (an address) to the clipboard, with a moment of "copied" to say it worked. */
export function CopyButton({ text, label = 'Copy address' }: { text: string; label?: string }) {
  const [done, setDone] = React.useState(false)
  React.useEffect(() => { if (!done) return; const t = setTimeout(() => setDone(false), 1400); return () => clearTimeout(t) }, [done])
  return (
    <button type="button" className={'copybtn' + (done ? ' ok' : '')} title={done ? 'Copied' : label} aria-label={label}
      onClick={(e) => { e.stopPropagation(); void navigator.clipboard?.writeText(text).then(() => setDone(true)) }}>
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {done ? <path d="M5 12.5 10 17.5 19 7" /> : <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15" /></>}
      </svg>
    </button>
  )
}
/**
 * An address on each chain's own explorer — one mark per chain, since an
 * address is the same on every EVM chain but its history is not. Chains this
 * app has no explorer for are left out rather than linked to a guess.
 */
/** `seen`, when given, dims every chain outside it — an explorer link for a chain the index has no activity on. */
export function AddrExplorers({ addr, chainIds, seen }: { addr: string; chainIds: string[]; seen?: Set<string> }) {
  // "the same address on every EVM chain" holds only inside one VM: a base58
  // address exists on Solana alone, and a 0x one never does
  const fits = (id: string) => (isSolAddr(addr) ? isSvmChain(id) : isEvmChain(id))
  const ids = [...new Set(chainIds)].filter((id) => fits(id) && addressUrl(id, addr))
  if (!ids.length) return null
  return (
    <span className="addrx">
      {ids.map((id) => {
        const where = chainInfo(id)!.explorerName
        return (
          <a key={id} className={seen && !seen.has(id) ? 'quiet' : undefined} href={addressUrl(id, addr)} target="_blank" rel="noreferrer" title={`Open on ${where}`} aria-label={`Open the address on ${where}`}>
            <ChainMark chainId={id} size={16} title={where} />
          </a>
        )
      })}
    </span>
  )
}
export function Sk({ w = 80, h = 12 }: { w?: number | string; h?: number }) { return <span className="sk" style={{ width: w, height: h }} aria-hidden /> }
/** A group's mark: a quiet outlined glyph ($ Ξ ₿ +) in the group's colour, deliberately unlike any token logo so a
 *  group never reads as one of its assets (the old USDC logo made "US Dollar" look like the USDC row). */
const GROUP_GLYPH: Record<string, string> = { USD: '$', ETH: 'Ξ', BTC: '₿', MORE: '+' }
export function GroupIcon({ id, color, size = 20 }: { id: string; color: string; size?: number }) {
  return <i className="ic gic" style={{ width: size, height: size, fontSize: size * 0.56, color, borderColor: `${color}66`, background: `linear-gradient(${color}1a, ${color}1a), #0b0b0b` }} aria-hidden>{GROUP_GLYPH[id] ?? id[0]}</i>
}

/** ` · matures 17 Dec 2026 · 75d` on a held PT's meta line; amber once it is due or past (it then earns nothing). */
/**
 * A loop's health factor as a word first and the number second: `healthy 1.82`,
 * `watch 1.12`, `at risk 1.04`. Liquidation is at 1.00; the bands match the
 * asset page's colours (amber under 1.25, red under 1.10).
 */
export function HealthPill({ h }: { h: number }) {
  const cls = h < 1.1 ? 'bad' : h < 1.25 ? 'warn' : 'ok'
  const word = cls === 'bad' ? 'at risk' : cls === 'warn' ? 'watch' : 'healthy'
  return <span className={`hp ${cls}`} title={`Health factor ${h.toFixed(2)} — liquidation at 1.00`}>{word} <b>{h.toFixed(2)}</b></span>
}

export function MaturityNote({ t }: { t: number }) {
  const c = maturityClock(t)
  return <> · <span className={c.due ? 'warn' : undefined} title={c.title}>{c.text}</span></>
}
/** ` · 1-day term · rolls daily · next 9 Oct 00:20 UTC` (or `· 1-week term · fixed to …`) on a fixed-rate loan's meta line; amber while a passed term awaits its roll. */
export function TermNote({ end, days }: { end: number; days?: number | null }) {
  const c = termClock(end, days)
  return <> · <span className={c.due ? 'warn' : undefined} title={c.title}>{c.text}</span></>
}
