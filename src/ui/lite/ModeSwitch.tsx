import React from 'react'
import { goMode, useRoute } from '../../state/AppState'

/**
 * Lite or Pro, switched for good (`goMode` saves it). In the profile sheet on every page, and at
 * the foot of Lite's You page. The page being read opens in the other mode where it has one.
 */
export function ModeSwitch({ hint = true }: { hint?: boolean }) {
  const r = useRoute()
  // the frame is the mode the reader is in (a Lite reader on a wallet page is still in Lite)
  const lite = r.shell === 'lite'
  const pick = (m: 'lite' | 'pro') => { if ((m === 'lite') !== lite) goMode(m) }
  return (
    <section className="ps-sec mode-sw">
      <div className="seg" role="radiogroup" aria-label="Lite or Pro">
        <button role="radio" aria-checked={lite} aria-pressed={lite} onClick={() => pick('lite')}>Lite</button>
        <button role="radio" aria-checked={!lite} aria-pressed={!lite} onClick={() => pick('pro')}>Pro</button>
      </div>
      {hint && <span className="t50 mode-sw-h">{lite ? 'The best rates in plain words. Pro has every venue, chain, tier and borrowing.' : 'Pro: every venue, chain, leverage tier and loan. Lite keeps the best of it, in plain words.'}</span>}
    </section>
  )
}
