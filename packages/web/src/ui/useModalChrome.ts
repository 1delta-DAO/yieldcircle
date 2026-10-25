import React from 'react'

/**
 * The three things every overlay in this app was missing: Escape, a focus trap,
 * and a page that does not scroll underneath it.
 *
 * Extracted rather than written inline because the ticket sheet, the wallet
 * dialog and the thread drawer all need the same behaviour — this is the half
 * of `ui/Sheet.tsx` that does not depend on how the thing is drawn.
 */

/**
 * Ref-counted, because two overlays can overlap (the route picker opens over
 * the ticket sheet) and the inner one closing must not unlock the page.
 * `overflow:hidden` alone does not stop iOS rubber-banding, so the body is
 * pinned and the scroll position restored on release.
 */
let locks = 0
let savedY = 0
function lock() {
  if (locks++ > 0) return
  savedY = window.scrollY
  const b = document.body.style
  b.position = 'fixed'
  b.top = `-${savedY}px`
  b.left = '0'
  b.right = '0'
  b.width = '100%'
}
function unlock() {
  if (--locks > 0) return
  locks = 0
  const b = document.body.style
  b.position = b.top = b.left = b.right = b.width = ''
  window.scrollTo(0, savedY)
}

export function useScrollLock(active: boolean) {
  React.useEffect(() => {
    if (!active) return
    lock()
    return unlock
  }, [active])
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Focus into the overlay, cycle Tab inside it, and give focus back on close. */
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean) {
  React.useEffect(() => {
    if (!active) return
    const box = ref.current
    const before = document.activeElement as HTMLElement | null
    box?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !box) return
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); before?.focus?.({ preventScroll: true }) }
  }, [ref, active])
}

export function useEscape(active: boolean, onClose: () => void) {
  React.useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [active, onClose])
}

/** All three at once, for an overlay that owns the screen. */
export function useModalChrome(ref: React.RefObject<HTMLElement | null>, active: boolean, onClose: () => void) {
  useScrollLock(active)
  useFocusTrap(ref, active)
  useEscape(active, onClose)
}
