/**
 * The field of real farmers behind a hero: the showcase positions
 * (`src/data/showcase.json`, rendered by `video/scripts/showcase.sh` — hover
 * one and its PnL plays) plus the live board's top earners (`useEarners`)
 * drifting further back, blurred. The join page (`Join.tsx`) and the landing
 * (`Landing.tsx`) both put their hero in the middle of it: `children` render
 * over the field, and a click on the ground closes an open card.
 */
import React from 'react'
import showcase from '../data/showcase.json'
import { Character } from '../identity/character'
import { useEarners } from '../index/queries'
import { chainLabel } from '../sdk/queries'
import { readTouch, useViewport } from './useViewport'

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

/** The showcase as numbers: what the farmers on the field have realized between them. */
export const SHOWCASE_PNL = showcase.reduce((s, p) => s + p.pnl, 0)
export const SHOWCASE_N = showcase.length
export const SHOWCASE_AT = showcase[0]?.at

export function Showcase({ className = '', children }: { className?: string; children: React.ReactNode }) {
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

  return (
    <div className={`join ${className}`.trim()} onClick={() => pick(null)}>
      <div className="join-glow" aria-hidden="true" />
      <div className="join-field" aria-hidden={open ? undefined : true}>
        {back.map((b, i) => (
          <div key={b.account} className="join-orb back" style={{ '--x': `${BACK[i].x}%`, '--y': `${BACK[i].y}%`, animationDelay: `${-i * 1.7}s`, animationDuration: `${9 + (i % 4) * 2}s` } as React.CSSProperties} title={`${b.pair} · ${b.apr?.toFixed(1) ?? '—'}% APR`}>
            <Character addr={b.account} size={44} title="" />
            <span className="join-tag"><b>{b.pair}</b>{b.apr != null && <i>{b.apr.toFixed(1)}%</i>}</span>
          </div>
        ))}
        {showcase.map((p, i) => <Orb key={p.name} p={p} slot={SLOTS[i % SLOTS.length]} phoneSlot={PHONE_SLOTS[i % PHONE_SLOTS.length]} i={i} open={open === p.name} inline={wide} setOpen={pick} onEnded={ended} />)}
      </div>
      {children}
      {!wide && open && <div className={`join-sheet${phone ? '' : ' corner'}`}><Card p={showcase.find((p) => p.name === open)!} onEnded={ended} /></div>}
      <footer className="join-foot">Realized PnL from on-chain records as of {SHOWCASE_AT} · {readTouch() ? 'tap' : 'hover'} a farmer</footer>
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
