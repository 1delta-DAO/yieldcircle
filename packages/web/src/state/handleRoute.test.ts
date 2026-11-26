import { describe, expect, it } from 'vitest'
import { parseRoute } from './AppState'

describe('@name links', () => {
  it('reads #/@alice, #/w/@alice and #/lite/@Alice as a handle, not an address', () => {
    expect(parseRoute('#/@alice')).toMatchObject({ view: 'wallet', handle: 'alice' })
    expect(parseRoute('#/@alice').addr).toBeUndefined()
    expect(parseRoute('#/w/@alice')).toMatchObject({ view: 'wallet', handle: 'alice' })
    expect(parseRoute('#/lite/@Alice')).toMatchObject({ view: 'wallet', handle: 'alice', lite: true, asked: 'lite' })
  })
  it('leaves a bare @ and an address alone', () => {
    expect(parseRoute('#/@').view).toBe('home')
    expect(parseRoute('#/w/0x' + 'a'.repeat(40)).handle).toBeUndefined()
  })
})
