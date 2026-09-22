import { useId } from 'react'
import { MARK_D, MARK_VIEWBOX, YIELD_D, CIRCLE_D, CIRCLE_BOX, LOCKUP_VIEWBOX } from './brand.generated'

/** Gradient stops follow the theme: --brand-a / --brand-b are set in app.css next to the palette. */
function Grad({ id, box }: { id: string; box?: { x: number; w: number; top: number; base: number } }) {
  const c = box ? { x1: box.x, y1: box.base, x2: box.x + box.w, y2: box.top } : { x1: 16, y1: 88, x2: 86, y2: 14 }
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" {...c}>
      <stop offset="0" stopColor="var(--brand-b)" />
      <stop offset="1" stopColor="var(--brand-a)" />
    </linearGradient>
  )
}

/** The mark alone: one open turn of yield around a solid centre. `mono` fills with currentColor. */
export function Mark({ size = 20, mono = false, className = '' }: { size?: number; mono?: boolean; className?: string }) {
  const id = useId()
  return (
    <svg viewBox={MARK_VIEWBOX} width={size} height={size} className={className} aria-hidden="true">
      {!mono && <defs><Grad id={id} /></defs>}
      <path d={MARK_D} fillRule="evenodd" fill={mono ? 'currentColor' : `url(#${id})`} />
    </svg>
  )
}

/** Mark · YIELD · CIRCLE (paths from brand/gen.py). YIELD takes currentColor, CIRCLE the gradient. */
export function Logo({ height = 32, href = '/' }: { height?: number; href?: string }) {
  const id = useId()
  const [, , vw, vh] = LOCKUP_VIEWBOX.split(' ').map(Number)
  return (
    <a href={href} className="logo" aria-label="YieldCircle">
      <svg viewBox={LOCKUP_VIEWBOX} height={height} width={(height * vw) / vh} aria-hidden="true">
        <defs><Grad id={id + 'm'} /><Grad id={id + 'c'} box={CIRCLE_BOX} /></defs>
        <path d={MARK_D} fillRule="evenodd" fill={`url(#${id}m)`} />
        <path d={YIELD_D} fill="currentColor" />
        <path d={CIRCLE_D} fill={`url(#${id}c)`} />
      </svg>
    </a>
  )
}
