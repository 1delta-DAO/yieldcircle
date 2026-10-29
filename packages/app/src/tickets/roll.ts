import { useMemo } from 'react'
import { lendRollTargets, loanRollTargets, rollKindOf } from '@yieldcircle/core/model/roll'
import type { Holding } from '@yieldcircle/core/model/positions'
import type { LoopStrategy, SimpleStrategy, Strategy } from '@yieldcircle/core/model/strategies'
import { useCatalog, useFixedRateCatalog } from '../sdk/queries'
import { useSession } from '../session'

/**
 * Where a held fixed-term position can roll to (`model/roll.ts`). The rows come from the screens'
 * own requests (the same keys `useBook` asks, so nothing new is fetched): a lend's later dates from
 * the Fixed rate shelf, a Midnight loan's from the loop catalogue — every date of it, including the
 * ones a floor hides from the menu (Midnight books are thin) — and a Lista loan's terms from its row.
 *
 * `src`: the held lend's own row, read by its earn uid (the ticket's `s` may be another date of the
 * book). `dueAt`: the held loan's date, from the holding (`useBook` joins it).
 */
export function useRollTargets(s: Strategy | null, h: Holding | null) {
  const { chainIds } = useSession()
  const kind = h ? rollKindOf(h, s) : null
  const fixed = useFixedRateCatalog(kind === 'lend' ? chainIds : [])
  const cat = useCatalog(kind === 'midnight-loan' ? chainIds : [])
  return useMemo(() => {
    if (kind === 'lend') {
      const src = fixed.all.find((r) => r.earnUid.toLowerCase() === h!.earnUid?.toLowerCase()) ?? (s?.kind === 'simple' && s.book ? s : null)
      return { kind, src, lend: src ? lendRollTargets(src, fixed.all) : [], loan: [] as LoopStrategy[], loading: fixed.isLoading }
    }
    if (kind === 'midnight-loan') {
      const loops = [...cat.loops, ...cat.overflow, ...cat.hidden].flatMap((r) => (r.kind === 'loop' ? [r, ...(r.dates ?? [])] : []))
      return { kind, src: null, lend: [] as SimpleStrategy[], loan: loanRollTargets(h!, loops), loading: cat.isLoading }
    }
    return { kind, src: null, lend: [] as SimpleStrategy[], loan: [] as LoopStrategy[], loading: false }
  }, [kind, fixed.all, fixed.isLoading, cat.loops, cat.overflow, cat.hidden, cat.isLoading, h, s])
}
