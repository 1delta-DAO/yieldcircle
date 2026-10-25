import React from 'react'
import { liteEligible, moneyWord } from '@yieldcircle/core/model/lite'
import { pct } from '@yieldcircle/core/model/format'
import type { Holding } from '@yieldcircle/core/model/positions'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { useSession } from '@yieldcircle/app/session'
import { liteHref } from '../../state/AppState'

/**
 * Sharing a position (the head of its Lite ticket): a Copy link — whoever opens it lands on the same
 * strategy, with this wallet as the one copied. Only a Lite strategy held as itself: not a loan, not
 * a price bet. The system share sheet where there is one, else the clipboard (`shared` for a moment).
 */
export function useSharePosition(s: Strategy | null, h: Holding | null) {
  const { account } = useSession()
  const [shared, setShared] = React.useState(false)
  const can = !!s && !!h && !!account && liteEligible(s) && h.kind !== 'borrow' && !h.directional && !h.key.startsWith('paper:')
  const share = async () => {
    if (!can) return
    const url = `${location.origin}${location.pathname}${liteHref(`${s!.group}?s=${encodeURIComponent(s!.id)}&k=${s!.kind}&copy=${account}`)}`
    const word = moneyWord(h!.asset, h!.group)
    const text = `Earning ${pct(h!.apr ?? s!.rate)} on ${word.startsWith('Dollars') ? 'dollars' : word} with YieldCircle`
    try {
      if (navigator.share) await navigator.share({ title: 'YieldCircle', text, url })
      else { await navigator.clipboard.writeText(`${text} ${url}`); setShared(true); setTimeout(() => setShared(false), 1800) }
    } catch { /* the reader closed the sheet */ }
  }
  return { can, share, shared }
}
