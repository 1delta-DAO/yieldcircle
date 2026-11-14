import { describe, expect, it } from 'vitest'
import { bridgeTracker } from './bridgeLinks'

describe("a bridge's tracker", () => {
  it('by the source hash, for the bridges that key their pages on it', () => {
    expect(bridgeTracker('Stargate V2', '0xab')?.url).toBe('https://layerzeroscan.com/tx/0xab')
    expect(bridgeTracker('squid', '0xab')?.url).toBe('https://axelarscan.io/gmp/0xab')
    expect(bridgeTracker('Relay', '0xab')?.url).toBe('https://relay.link/transaction/0xab')
  })
  it('none for an unknown bridge, a paper op or a batch not yet known', () => {
    expect(bridgeTracker('Across', '0xab')).toBeUndefined()
    expect(bridgeTracker('relay', 'paper:1')).toBeUndefined()
    expect(bridgeTracker('relay', 'batch:w1')).toBeUndefined()
    expect(bridgeTracker(undefined, '0xab')).toBeUndefined()
  })
})
