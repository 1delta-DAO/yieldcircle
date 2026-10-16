import { describe, expect, it } from 'vitest'
import type { EarnMarket } from '../sdk/types'
import { classifyEarn } from './strategies'

// an Exponent row as `/v1/data/earn` serves it (2026-10-16), made depositable
const row = (ref: string, name: string, asset: { address: string; symbol: string; decimals: number }): EarnMarket => ({
  earnUid: `vault.exponent:solana:${ref}`, chainId: 'solana', venue: 'vault.exponent', venueKind: 'vault', brand: 'exponent',
  protocol: { key: 'vault.exponent', name: 'Exponent' }, name, ref, asset,
  rate: { total: 11.8, base: 11.8 }, tvl: { usd: 1e6 }, exit: { mode: 'market-sale' },
  maturity: { kind: 'fixed-date', maturity: 1799575200 }, availability: { canDeposit: true, canWithdraw: true },
  risk: { score: 2 }, capabilities: [{ action: 'deposit', requires: ['slippage'] }, { action: 'withdraw', requires: ['slippage'] }],
} as unknown as EarnMarket)

describe('Exponent PT earn rows', () => {
  it('files a PT quoted in a synthetic unit by the PT, not the unit', () => {
    const { s, hide } = classifyEarn(row('HH7FiYbEfDwQoK2ZJpkMz1T6wG6TqPsWcxWCtEVgigrZ', 'PT ONyc (USD) Solana · 10 Jan 2027', { address: 'USD1111111111111111111111111111111111111119', symbol: 'USD', decimals: 9 }))
    expect(hide).toBeNull()
    expect(s).toMatchObject({ group: 'USD', holds: 'PT ONyc', source: 'fixed', booked: true, via: 'Fixed on Exponent · 10 Jan 2027' })
  })
  it('reads the bracketed base of a PT over an LST', () => {
    const { s } = classifyEarn(row('8aUSDnpp5kjCuWtJqaAahNGtvC8HSgFQpUR731CNwMVd', 'PT hyloSOL+ (SOL) Solana · 12 Dec 2026', { address: 'So11111111111111111111111111111111111111112', symbol: 'wSOL', decimals: 9 }))
    expect(s).toMatchObject({ asset: 'SOL', holds: 'PT hyloSOL+', source: 'fixed' })
  })
})
