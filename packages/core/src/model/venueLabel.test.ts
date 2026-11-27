import { describe, expect, it } from 'vitest'
import { venueLabel } from './strategies'

describe('venueLabel', () => {
  it('names a Kamino market by the desk that runs it, like a Morpho one', () => {
    expect(venueLabel('KAMINO_F4uLsGZT4YnHDcemtoYDz2LBZKLmwTB1wzkwS6oqygvy', 'Nysa')).toBe('Kamino · Nysa')
    expect(venueLabel('KAMINO_F4uLsGZT4YnHDcemtoYDz2LBZKLmwTB1wzkwS6oqygvy')).toBe('Kamino')
    expect(venueLabel('MORPHO_BLUE_0B35', 'Gauntlet')).toBe('Morpho · Gauntlet')
  })
})
