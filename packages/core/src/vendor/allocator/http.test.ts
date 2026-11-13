import { describe, expect, it } from 'vitest'
import { apiUrl } from './http'

describe('apiUrl — a path never leaves the API (security review #13)', () => {
  it('builds paths on the base', () => {
    expect(apiUrl('/v1/actions/loop/leverage', { a: 1 })).toBe('https://allocator.api.1delta.io/v1/actions/loop/leverage?a=1')
    expect(apiUrl('v1/data/x')).toBe('https://allocator.api.1delta.io/v1/data/x')
  })
  it('refuses a protocol-relative, absolute or backslashed path', () => {
    for (const p of ['//evil.host/x', 'https://evil.host/x', '/\\evil.host/x', '\\\\evil.host/x', 'javascript:x']) expect(() => apiUrl(p)).toThrow(/off the API/)
  })
  it('keeps a URL inside the query', () => {
    expect(apiUrl('/v1/x?u=https://evil.host')).toBe('https://allocator.api.1delta.io/v1/x?u=https://evil.host')
  })
})
