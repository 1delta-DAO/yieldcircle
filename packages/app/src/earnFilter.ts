import { EARN_FILTER, earnActive, type EarnFilter } from '@yieldcircle/core/model/earnFilter'
import { useSticky } from './sticky'

/** An Earn list's search, sort and filters (core's `earnFilter`), kept for this session per list (`useSticky`). */
export function useEarnFilter(key: string) {
  const [f, setF] = useSticky<EarnFilter>(`earnf:${key}`, EARN_FILTER)
  // an older shape in the scratchpad: the defaults fill what it lacks
  const cur = { ...EARN_FILTER, ...f }
  return { f: cur, set: (p: Partial<EarnFilter>) => setF({ ...cur, ...p }), reset: () => setF(EARN_FILTER), active: earnActive(cur) }
}
export type EarnFilterState = ReturnType<typeof useEarnFilter>
