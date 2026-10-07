/**
 * #/join — where a visitor WITHOUT beta access lands (`functions/_middleware.ts`
 * marks their HTML with `window.ycGated` and ships the gate overlay hidden).
 * One button in the middle, the join flow is the overlay's own card, and the
 * field behind it is real farmers: the showcase positions (`src/data/showcase.json`,
 * rendered by `video/scripts/showcase.sh` — hover one and its PnL plays) plus the
 * live board's top earners (`useEarners`) drifting further back, blurred.
 * A visitor who is IN (whitelisted, or the gate is off) sees the same page at
 * `#/join` with a banner instead of the waitlist — the gate lands them here
 * after the signature — and an access-code holder gets the nudge to join.
 */
import React from 'react'
import showcase from '../data/showcase.json'
import { Logo } from './Logo'
import { Character } from '../identity/character'
import { useEarners } from '../index/queries'
import { chainLabel } from '../sdk/queries'
import { readTouch, useViewport } from './useViewport'
import { WAITLIST_HREF, onAccessCode } from '../wallet/gate'
import { Socials } from './Socials'

declare global { interface Window { ycGated?: boolean } }
export const gated = () => window.ycGated === true

type Pick = (typeof showcase)[number]
/** where the showcase orbs sit (% of the viewport), clear of the middle column; the card opens below a top orb, above a bottom one, never over the hero */
const SLOTS = [{ x: 15, y: 24 }, { x: 83, y: 20 }, { x: 11, y: 70 }, { x: 86, y: 68 }, { x: 32, y: 88 }, { x: 68, y: 90 }, { x: 30, y: 10 }]
/** on a phone the hero fills the middle: the showcase sits in a band above and one below it, and the back row is left out */
const PHONE_SLOTS = [{ x: 24, y: 24 }, { x: 50, y: 17 }, { x: 78, y: 24 }, { x: 25, y: 86 }, { x: 75, y: 86 }, { x: 50, y: 90 }, { x: 50, y: 12 }]
/** the back row: smaller, blurred, no card — the board fills them */
const BACK = [{ x: 6, y: 44 }, { x: 94, y: 42 }, { x: 24, y: 88 }, { x: 74, y: 10 }, { x: 40, y: 8 }, { x: 60, y: 7 }, { x: 4, y: 86 }, { x: 95, y: 86 }, { x: 44, y: 90 }, { x: 58, y: 88 }, { x: 20, y: 50 }, { x: 80, y: 50 }]

/** a tour card holds its finished number this long after the clip ends, then closes; the next opens after the gap */
const ENDED_MS = 1500
const GAP_MS = 700
/** a tour card that never reports its end (the clip did not load) is moved on from */
const STUCK_MS = 15_000
/** no hover or tap for this long and the tour resumes */
const IDLE_MS = 20_000

const usd = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString('en-US')}`

/** The gate's card, shipped hidden by the middleware; absent in a build without the gate. */
function openGate(): boolean {
  const el = document.getElementById('yc-gate')
  if (!el) return false
  el.style.display = ''
  el.querySelector<HTMLButtonElement>('#yc-go')?.focus()
  return true
}

export function Join() {
  const [open, setOpen] = React.useState<string | null>(null)
  // under 1280px there is no room beside the hero for a card: it is a sheet in the corner instead (full width on a phone)
  const wide = useWide()
  const phone = useViewport() === 'phone'
  /**
   * The tour: left alone, the page plays one farmer's clip after another, a
   * random one each time, so the proof moves before anyone hovers. The first
   * hover or tap ends it; it comes back after a while without one. Not on a
   * touch screen: there the card is a sheet over the page, which is in the way.
   * Each clip plays ONCE and holds its last frame — the finished number; the
   * tour's card then closes and the next one opens, a hovered one stays.
   */
  const touched = React.useRef(0)
  /** the tour's own card: its name and when it opened (0 = none up); a hovered card is never the tour's */
  const tour = React.useRef<{ name: string; at: number } | null>(null)
  const pick = React.useCallback((name: string | null) => {
    touched.current = Date.now()
    tour.current = null
    setOpen(name)
  }, [])
  const lastShown = React.useRef<string | null>(null)
  const next = React.useCallback(() => {
    if (Date.now() - touched.current < IDLE_MS) return
    const rest = showcase.filter((p) => p.name !== lastShown.current)
    const name = rest[Math.floor(Math.random() * rest.length)].name
    lastShown.current = name
    tour.current = { name, at: Date.now() }
    setOpen(name)
  }, [])
  // the clip freezes on its last frame; the tour's card then goes away after a beat, and the next opens after a gap
  const ended = React.useCallback((name: string) => {
    if (tour.current?.name !== name) return
    setTimeout(() => { if (tour.current?.name === name) { tour.current = null; setOpen(null) } }, ENDED_MS)
    setTimeout(() => { if (!tour.current) next() }, ENDED_MS + GAP_MS)
  }, [next])
  React.useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(hover: none)').matches || showcase.length < 2) return
    const t0 = setTimeout(next, 1800)
    // the watchdog: resumes after the visitor has left the page alone, and moves on from a clip that never ended (failed to load)
    const t = setInterval(() => {
      const t = tour.current
      if (t ? Date.now() - t.at > STUCK_MS : Date.now() - touched.current >= IDLE_MS) next()
    }, 3000)
    return () => { clearTimeout(t0); clearInterval(t) }
  }, [next])
  const board = useEarners({ by: 'position', sort: 'perDay', people: true, limit: 40 })
  // the board's wallets that are not already in the showcase, one per wallet, loops first
  const back = React.useMemo(() => {
    const have = new Set(showcase.map((p) => p.account.toLowerCase()))
    const rows = board.data?.by === 'position' ? board.data.rows : []
    const out: { account: string; pair: string; apr: number | null }[] = []
    for (const r of [...rows].sort((a, b) => b.legs.length - a.legs.length)) {
      const a = r.account.toLowerCase()
      if (have.has(a) || out.length >= BACK.length) continue
      have.add(a)
      out.push({ account: r.account, pair: r.legs.map((l) => l.symbol ?? '?').join(' / '), apr: r.apr24hPct })
    }
    return out
  }, [board.data])

  const join = (e: React.MouseEvent) => { if (openGate()) e.preventDefault() }
  const inside = !gated()
  const pass = inside && onAccessCode()

  return (
    <div className={`join${inside ? ' has-banner' : ''}`} onClick={() => pick(null)}>
      <div className="join-glow" aria-hidden="true" />
      <header className="join-top"><Logo height={30} href="#/join" /><Socials className="join-social" label="Telegram" /></header>
      {inside && (
        <div className="join-banner">
          {pass
            ? <><b>You're in on an access code.</b> It isn't yours to keep — <a href={WAITLIST_HREF} target="_blank" rel="noopener">join the waitlist</a> to hold a place of your own.</>
            : <><b>You're in.</b> The beta is open to this wallet — everything you see is live.</>}
        </div>
      )}

      <div className="join-field" aria-hidden={open ? undefined : true}>
        {back.map((b, i) => (
          <div key={b.account} className="join-orb back" style={{ '--x': `${BACK[i].x}%`, '--y': `${BACK[i].y}%`, animationDelay: `${-i * 1.7}s`, animationDuration: `${9 + (i % 4) * 2}s` } as React.CSSProperties} title={`${b.pair} · ${b.apr?.toFixed(1) ?? '—'}% APR`}>
            <Character addr={b.account} size={44} title="" />
            <span className="join-tag"><b>{b.pair}</b>{b.apr != null && <i>{b.apr.toFixed(1)}%</i>}</span>
          </div>
        ))}
        {showcase.map((p, i) => <Orb key={p.name} p={p} slot={SLOTS[i % SLOTS.length]} phoneSlot={PHONE_SLOTS[i % PHONE_SLOTS.length]} i={i} open={open === p.name} inline={wide} setOpen={pick} onEnded={ended} />)}
      </div>

      <main className="join-hero">
        {inside && <span className="join-pill">{pass ? 'Access code' : 'Welcome to the beta'}</span>}
        <h1>Everything you hold, <span className="land-grad">earning.</span></h1>
        <p>See what real yield farmers actually make — the PnL the chain can prove, not the APR on the poster — and copy them in one tap.</p>
        {inside ? <>
          <a className="join-cta" href="#/">Open the app</a>
          <a className="join-in" href="#/board">See the leaderboard</a>
        </> : <>
          <a className="join-cta" href="#/" onClick={join}>Join the waitlist</a>
          <a className="join-in" href="#/" onClick={join}>Already on the list? Sign in</a>
        </>}
      </main>

      {!wide && open && <div className={`join-sheet${phone ? '' : ' corner'}`}><Card p={showcase.find((p) => p.name === open)!} onEnded={ended} /></div>}
      <footer className="join-foot">Realized PnL from on-chain records as of {showcase[0]?.at} · {readTouch() ? 'tap' : 'hover'} a farmer</footer>
    </div>
  )
}

const WIDE = '(min-width: 1280px)'
function useWide() {
  const [wide, setWide] = React.useState(() => matchMedia(WIDE).matches)
  React.useEffect(() => {
    const q = matchMedia(WIDE)
    const f = () => setWide(q.matches)
    q.addEventListener('change', f)
    return () => q.removeEventListener('change', f)
  }, [])
  return wide
}

function Orb({ p, slot, phoneSlot, i, open, inline, setOpen, onEnded }: { p: Pick; slot: { x: number; y: number }; phoneSlot: { x: number; y: number }; i: number; onEnded: (name: string) => void; open: boolean; inline: boolean; setOpen: (n: string | null) => void }) {
  const pair = p.legs.map((l) => l.symbol).join(' / ')
  const side = `${slot.y > 50 ? 'u' : 'd'} ${slot.x > 50 ? 'r' : 'l'}`
  return (
    <div className={`join-orb${open ? ' open' : ''} ${side}`} style={{ '--x': `${slot.x}%`, '--y': `${slot.y}%`, '--xv': `${slot.x}vw`, '--xp': `${phoneSlot.x}%`, '--yp': `${phoneSlot.y}%`, animationDelay: `${-i * 2.3}s`, animationDuration: `${11 + (i % 3) * 2}s` } as React.CSSProperties}
      // hover is a MOUSE thing: a finger lifting fires a leave too, which would shut what the tap just opened
      onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(p.name)} onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(null)}
      onClick={(e) => { e.stopPropagation(); setOpen(p.name) }}>
      <Character addr={p.account} size={64} title="" />
      <span className="join-tag"><b className="up">{usd(p.pnl)}</b><i>{pair}</i></span>
      {open && inline && <Card p={p} onEnded={onEnded} />}
    </div>
  )
}

/** The clip (video/scripts/showcase.sh) and one line under it. It plays once and holds its last frame — the finished number. */
function Card({ p, onEnded }: { p: Pick; onEnded: (name: string) => void }) {
  return (
    <div className="join-card" onClick={(e) => e.stopPropagation()}>
      <video src={`/pnl/${p.name}.mp4`} poster={`/pnl/${p.name}.jpg`} autoPlay muted playsInline preload="none" onEnded={() => onEnded(p.name)} />
      <div className="join-card-f">
        <span>{p.lender} · {chainLabel(p.chainId)}</span>
        <span>{p.aprPct != null && <b>{p.aprPct}% APR</b>} · {p.days} days</span>
      </div>
    </div>
  )
}
