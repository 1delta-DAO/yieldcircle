import React from 'react'
import { canShare, shareOf } from '@yieldcircle/core/model/lite'
import type { Holding } from '@yieldcircle/core/model/positions'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { useSession } from '@yieldcircle/app/session'

/**
 * Sharing a position (the head of its Lite ticket): a Copy link — whoever opens it lands on the same
 * strategy, with this wallet as the one copied. What may be shared and what the text says are core's
 * (`canShare`, `shareOf`), the phone's too; here, the system share sheet where there is one, else the
 * clipboard (`shared` for a moment).
 */
export function useSharePosition(s: Strategy | null, h: Holding | null) {
  const { account } = useSession()
  const [shared, setShared] = React.useState(false)
  const can = canShare(s, h, account)
  const share = async () => {
    if (!can) return
    const { text, url } = shareOf(s!, h!, account!, `${location.origin}${location.pathname}`.replace(/\/$/, ''))
    try {
      if (navigator.share) await navigator.share({ title: 'YieldCircle', text, url })
      else { await navigator.clipboard.writeText(`${text} ${url}`); setShared(true); setTimeout(() => setShared(false), 1800) }
    } catch { /* the reader closed the sheet */ }
  }
  return { can, share, shared }
}
