import { describe, expect, it } from 'vitest'
import { liteHash, liteUrl, parseLiteHash, proUrl, type LiteDest } from './liteLinks'

const A = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'

describe('the Lite route map', () => {
  it('writes the web’s hashes', () => {
    expect(liteHash({ to: 'home' })).toBe('#/lite/')
    expect(liteHash({ to: 'earn' })).toBe('#/lite/earn')
    expect(liteHash({ to: 'earn', group: 'ETH' })).toBe('#/lite/ETH')
    expect(liteHash({ to: 'strategy', s: { id: 'a:b', kind: 'simple', group: 'USD' } })).toBe('#/lite/USD?s=a%3Ab')
    expect(liteHash({ to: 'strategy', s: { id: 'x', kind: 'loop', group: 'USD' }, copy: A, lev: '4.50' })).toBe(`#/lite/USD?s=x&k=loop&copy=${A}&lev=4.50`)
    expect(liteHash({ to: 'board', by: 'strategy', x: 'eth' })).toBe('#/lite/board?by=strategy&x=eth')
    expect(liteHash({ to: 'wallet', account: A.toUpperCase().replace('0X', '0x') })).toBe(`#/lite/w/${A}`)
    expect(liteUrl({ to: 'search', q: 'eth' })).toBe('https://app.yieldcircle.io/#/lite/search?q=eth')
    expect(proUrl('#/lite/USD?s=x')).toBe('https://app.yieldcircle.io/#/pro/USD?s=x')
  })
  it('reads back every place it writes', () => {
    const all: LiteDest[] = [
      { to: 'home' }, { to: 'earn' }, { to: 'earn', group: 'BTC' },
      { to: 'strategy', s: { id: 'morpho:1:abc', kind: 'loop', group: 'USD' }, copy: A, lev: '3.20', h: 'k1', m: 'close' },
      { to: 'you', h: 'k1', m: 'reduce' }, { to: 'board', by: 'wallet', t: 'perDay', x: 'usd' }, { to: 'search', q: 'apyx' }, { to: 'wallet', account: A },
    ]
    for (const d of all) {
      const back = parseLiteHash(liteUrl(d)) as Record<string, unknown> | null
      // what was left unsaid reads back as unset
      expect(JSON.parse(JSON.stringify(back))).toEqual(JSON.parse(JSON.stringify(d)))
    }
  })
  it('reads an address with no mode, and refuses what Lite does not have', () => {
    expect(parseLiteHash('#/USD?s=x&k=simple')).toEqual({ to: 'strategy', s: { id: 'x', kind: 'simple', group: 'USD' }, copy: undefined, lev: undefined, h: undefined, m: undefined })
    expect(parseLiteHash('yieldcircle://lite/board?by=strategy')).toMatchObject({ to: 'board', by: 'strategy' })
    expect(parseLiteHash('#/pro/USD')).toBeNull()
    expect(parseLiteHash('#/STOCKS')).toBeNull()
    expect(parseLiteHash('#/m/abc')).toBeNull()
  })
})
