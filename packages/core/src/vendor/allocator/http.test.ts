import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetchEnvelope, apiUrl } from './http'

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

describe('retries — a request that got no answer is sent again', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
  const ok = () => new Response(JSON.stringify({ success: true, data: 1 }), { status: 200 })
  const lost = () => new TypeError('fetch failed: The network connection was lost.')
  it('re-sends after a lost connection, up to `retries` times', async () => {
    vi.useFakeTimers()
    const f = vi.fn().mockRejectedValueOnce(lost()).mockRejectedValueOnce(lost()).mockResolvedValueOnce(ok())
    vi.stubGlobal('fetch', f)
    const p = apiFetchEnvelope('/v1/x', { retries: 3 })
    await vi.runAllTimersAsync()
    expect((await p).data).toBe(1)
    expect(f).toHaveBeenCalledTimes(3)
  })
  it('gives up after them, and never re-sends unasked or on an answer', async () => {
    vi.useFakeTimers()
    const f = vi.fn().mockRejectedValue(lost())
    vi.stubGlobal('fetch', f)
    const p = apiFetchEnvelope('/v1/x', { retries: 1 }).catch((e: Error) => e.message)
    await vi.runAllTimersAsync()
    expect(await p).toMatch(/connection was lost/)
    expect(f).toHaveBeenCalledTimes(2)
    f.mockClear()
    await expect(apiFetchEnvelope('/v1/x')).rejects.toThrow(/connection was lost/)
    expect(f).toHaveBeenCalledTimes(1)
    f.mockReset().mockResolvedValue(new Response(JSON.stringify({ success: false, error: { code: 'BUILD_FAILED', message: 'no' } }), { status: 400 }))
    await expect(apiFetchEnvelope('/v1/x', { retries: 3 })).rejects.toThrow('no')
    expect(f).toHaveBeenCalledTimes(1)
  })
})
