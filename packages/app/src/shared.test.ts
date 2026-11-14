import { describe, expect, it } from 'vitest'
import { sharedCache } from './shared'

describe('sharedCache: one answer for every caller with the same inputs', () => {
  it('computes once per set of inputs, compared by identity and in order', () => {
    const of = sharedCache()
    const rows = [1, 2], other = [1, 2]
    let made = 0
    const make = () => ({ n: ++made })
    const a = of([rows, 'x'], make)
    expect(of([rows, 'x'], make)).toBe(a)
    // the same content in another array is another input, as for useMemo
    expect(of([other, 'x'], make)).not.toBe(a)
    expect(of(['x', rows], make)).not.toBe(a)
    expect(of([rows], make)).not.toBe(a)
    expect(made).toBe(4)
  })

  it('keeps the last few, so two callers with different inputs do not evict each other', () => {
    const of = sharedCache(2)
    let made = 0
    const make = () => ++made
    expect(of(['a'], make)).toBe(1)
    expect(of(['b'], make)).toBe(2)
    expect(of(['a'], make)).toBe(1)
    expect(of(['b'], make)).toBe(2)
    // a third pushes out the one asked for longest ago
    expect(of(['c'], make)).toBe(3)
    expect(of(['b'], make)).toBe(2)
    expect(of(['a'], make)).toBe(4)
  })
})
