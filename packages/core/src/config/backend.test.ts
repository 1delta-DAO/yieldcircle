import { describe, expect, it } from 'vitest'
import { safeBase } from './backend'

describe('safeBase — service URLs are https', () => {
  it('takes https anywhere and http on loopback or a private LAN', () => {
    for (const u of ['https://allocator.api.1delta.io', 'http://localhost:8787', 'http://127.0.0.1:3000', 'http://192.168.1.20:8787', 'http://10.0.0.5']) expect(safeBase(u)).toBe(u)
  })
  it('refuses plain http on a public host', () => {
    expect(() => safeBase('http://allocator.api.1delta.io')).toThrow(/https/)
    expect(() => safeBase('http://192.168.evil.com')).toThrow(/https/)
  })
})
