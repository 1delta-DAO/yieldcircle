import { describe, expect, it } from 'vitest'
import type { EarnMarket } from '../sdk/types'
import { classifyEarn } from './strategies'

// a Kamino kvault as `/v1/data/earn` serves it (2026-10-19): no curator, brand = protocol
const row = (name: string): EarnMarket => ({
  earnUid: 'vault.kamino-kvault:solana:HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E', chainId: 'solana', venue: 'vault.kamino-kvault', venueKind: 'vault', brand: 'Kamino Kvault',
  protocol: { key: 'vault.kamino-kvault', name: 'Kamino Kvault' }, name, ref: 'HDsayqAsDWy3QvANGqh2yNraqcD8Fnjgh73Mhb3WRS5E',
  asset: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6, denomination: 'USD' },
  rate: { total: 4.4, base: 4.4 }, tvl: { usd: 1e6 }, exit: { mode: 'instant-capped' },
  availability: { canDeposit: true, canWithdraw: true }, risk: { score: 2 },
  capabilities: [{ action: 'deposit' }, { action: 'withdraw', requires: ['isShares'] }],
} as unknown as EarnMarket)

describe('Kamino kvault earn rows', () => {
  it('names the vault first, then the venue, like a curated Morpho vault', () => {
    expect(classifyEarn(row('Steakhouse USDC')).s).toMatchObject({ via: 'Steakhouse vault · Kamino Kvault', market: 'Steakhouse', vaultName: 'Steakhouse USDC' })
    expect(classifyEarn(row('Kamino Private Credit USDC')).s?.via).toBe('Private Credit vault · Kamino Kvault')
    expect(classifyEarn(row('USDC Prime')).s?.via).toBe('Prime vault · Kamino Kvault')
  })
  it('falls back to the venue alone when the name only repeats the asset', () => {
    expect(classifyEarn(row('USDC')).s?.via).toBe('Kamino Kvault vault')
  })
  it("wears its curator's mark when the name places it, and no stand-in when it does not", () => {
    expect(classifyEarn(row('Steakhouse USDC')).s?.logo).toMatch(/lender\/steakhouse_financial\.webp$/)
    expect(classifyEarn(row('Plume x Re7 USDC')).s?.logo).toMatch(/lender\/re7_labs\.webp$/)
    expect(classifyEarn(row('Kamino Private Credit USDC')).s?.logo).toMatch(/lender\/kamino\.webp$/)
    expect(classifyEarn(row('RWA USDC')).s?.logo).toBeUndefined()
  })
})
