import React from 'react'

/**
 * Layout mode (plan 05 §3). Chosen in JS, not only CSS, because the modes swap component
 * trees (table ↔ cards, column ↔ sheet) and because DaisyUI's `:root:has(.modal-open)` scroll
 * lock fires on CSS-hidden modals too.
 *   desk    ≥ 1080  two columns, rail beside the book
 *   narrow  768–1079 book full width, rail as a right sheet
 *   phone   < 768   the stack: book → detail → review
 */
export type Viewport = 'desk' | 'narrow' | 'phone'
const PHONE = '(max-width: 767.98px)', NARROW = '(max-width: 1079.98px)'
/** Non-React read — for the reducer, which pushes history entries only when the rail is a screen or a sheet. */
export const readViewport = (): Viewport => read()
const read = (): Viewport => (typeof window === 'undefined' ? 'desk' : window.matchMedia(PHONE).matches ? 'phone' : window.matchMedia(NARROW).matches ? 'narrow' : 'desk')
export function useViewport(): Viewport {
  const [v, setV] = React.useState<Viewport>(read)
  React.useEffect(() => {
    const qs = [window.matchMedia(PHONE), window.matchMedia(NARROW)]
    const update = () => setV(read())
    qs.forEach((q) => q.addEventListener('change', update))
    update()
    return () => qs.forEach((q) => q.removeEventListener('change', update))
  }, [])
  return v
}
/**
 * Touch-first device: no hover, so `title` tooltips never show and hover cards need a tap path.
 * `(hover: none)` is the honest signal; a touch screen below desk width counts too (some
 * emulators and convertibles report hover while the finger is the pointer).
 */
const isTouch = () => typeof window !== 'undefined' && (window.matchMedia('(hover: none)').matches || (navigator.maxTouchPoints > 0 && window.matchMedia(NARROW).matches))
export function useTouch(): boolean {
  const [t, setT] = React.useState(isTouch)
  React.useEffect(() => {
    const qs = [window.matchMedia('(hover: none)'), window.matchMedia(NARROW)]
    const h = () => setT(isTouch())
    qs.forEach((q) => q.addEventListener('change', h))
    return () => qs.forEach((q) => q.removeEventListener('change', h))
  }, [])
  return t
}
