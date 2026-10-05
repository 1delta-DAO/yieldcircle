import React from 'react'
import { createPortal } from 'react-dom'
import { useModalChrome } from './useModalChrome'

/**
 * A panel that slides in from an edge of the screen: the profile sheet from
 * the left (the avatar is top-left), your positions from the right (the
 * balance is top-right). Full width on a phone.
 *
 * Any navigation closes it — a link inside it is the usual way out, and a
 * drawer left open over the page it just took you to is a drawer in the way.
 */
export function Drawer({ open, onClose, side, label, children, wide }: {
  open: boolean
  onClose: () => void
  side: 'left' | 'right'
  label: string
  children: React.ReactNode
  /** room for a chart (the position history) */
  wide?: boolean
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const latest = React.useRef(onClose)
  latest.current = onClose
  const close = React.useCallback(() => latest.current(), [])
  useModalChrome(ref, open, close)
  React.useEffect(() => {
    if (!open) return
    addEventListener('hashchange', close)
    return () => removeEventListener('hashchange', close)
  }, [open, close])
  if (!open) return null
  return createPortal(
    <>
      <div className="scrim drawer-scrim" onClick={close} />
      <div ref={ref} className={`drawer ${side}${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div className="drawer-h">
          <b>{label}</b>
          <button className="x" onClick={close} aria-label="Close">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="drawer-b">{children}</div>
      </div>
    </>,
    document.body,
  )
}
