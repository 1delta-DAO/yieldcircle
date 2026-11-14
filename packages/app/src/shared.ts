import { useRef } from 'react'
import { replaceEqualDeep } from '@tanstack/react-query'

/**
 * One answer for every component that asks with the same inputs.
 *
 * `useMemo` is per component: `useBook` and `useLiteMenu` run in the header, in every tab and in
 * every sheet over them, and each copy derived the catalogue, the menu and its ranking for itself
 * from the same cached answers — eight times over on the phone, where a tab switch then took a
 * second (docs/mobile-perf.md). A cache made here is shared by all of them: the first to ask
 * with a set of inputs computes, the rest are handed the same object, so what hangs off it
 * (`useMemo`s keyed on it, other shared caches) holds still too.
 *
 * Inputs are compared like `useMemo`'s deps (`Object.is`, in order). The last few are kept, so
 * two callers with different inputs (a page reading other chains) do not evict each other.
 * One cache per call site: it holds whatever that site's `make` returns.
 */
export function sharedCache(keep = 4) {
  const held: { k: readonly unknown[]; v: unknown }[] = []
  return <T>(k: readonly unknown[], make: () => T): T => {
    const i = held.findIndex((e) => e.k.length === k.length && e.k.every((x, j) => Object.is(x, k[j])))
    if (i >= 0) {
      const e = held[i]
      if (i > 0) { held.splice(i, 1); held.unshift(e) }
      return e.v as T
    }
    const v = make()
    held.unshift({ k, v })
    if (held.length > keep) held.length = keep
    return v
  }
}

/**
 * The value as it was last render, while it still says the same: a list rebuilt on every render
 * (balances per chain, a query's errors) keeps its identity until its content changes, so what is
 * derived from it is not derived again. React Query's own structural sharing, for a value that
 * was put together after the cache. For small values: the comparison walks all of it.
 */
export function useSame<T>(v: T): T {
  const ref = useRef(v)
  return (ref.current = replaceEqualDeep(ref.current, v))
}
