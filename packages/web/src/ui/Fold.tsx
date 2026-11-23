import React from 'react'

const KEY = 'yc.fold.'

/**
 * A page section that folds to its heading: the body slides shut (`.sfold-x`, a grid row going to
 * 0fr) and stays mounted, so it keeps what it loaded. For a screenshot of a page's head with only
 * the part worth showing under it. The choice is kept per section (`id`), across wallets.
 * `head` is what sits beside the heading (the sub line, a switch); it leaves with the body.
 */
export function FoldSec({ id, title, head, className, children }: { id: string; title: React.ReactNode; head?: React.ReactNode; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(() => { try { return localStorage.getItem(KEY + id) !== '1' } catch { return true } })
  // while it slides the body is clipped; at rest and open it is not, so a menu inside may hang over the edge
  const [moving, setMoving] = React.useState(false)
  const t = React.useRef<number | undefined>(undefined)
  React.useEffect(() => () => window.clearTimeout(t.current), [])
  const toggle = () => {
    try { open ? localStorage.setItem(KEY + id, '1') : localStorage.removeItem(KEY + id) } catch { /* private mode */ }
    setOpen(!open); setMoving(true)
    window.clearTimeout(t.current); t.current = window.setTimeout(() => setMoving(false), 360)
  }
  return (
    <section className={`sec sfold${className ? ` ${className}` : ''}${open ? '' : ' sfolded'}${moving ? ' smoving' : ''}`}>
      <div className="sec-h">
        <h2>
          <button type="button" className="secfold" aria-expanded={open} title={open ? 'Fold this section' : 'Unfold this section'} onClick={toggle}>
            {title}
            <svg className="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </h2>
        {head}
      </div>
      <div className="sfold-x"><div className="sfold-xi">{children}</div></div>
    </section>
  )
}
