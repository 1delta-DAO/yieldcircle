import React from 'react'
import { AccessibilityInfo } from 'react-native'

/** The system's Reduce Motion: no particles, no shake, the end state at once and the same words. */
export function useReduceMotion() {
  const [on, setOn] = React.useState(false)
  React.useEffect(() => {
    let live = true
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => { if (live) setOn(v) })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOn)
    return () => { live = false; sub.remove() }
  }, [])
  return on
}

/** A number counting up to `to` once `on` (an ease-out, `ms` long) — straight to it under Reduce Motion. */
export function useCountUp(to: number, on: boolean, still: boolean, ms = 900) {
  const [v, setV] = React.useState(on && !still ? 0 : to)
  React.useEffect(() => {
    if (!on || still) { setV(to); return }
    const t0 = Date.now()
    let raf = 0
    const tick = () => {
      const k = Math.min(1, (Date.now() - t0) / ms)
      setV(to * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, on, still, ms])
  return v
}

/**
 * Traces whose success was already celebrated on this run: a ticket that remounts (the new position
 * changes its key) or a receipt opened again shows the end state, not a second burst.
 */
const cheered = new Set<string>()
export const firstCheer = (id: string) => { if (cheered.has(id)) return false; cheered.add(id); return true }
