import { describe, expect, it } from 'vitest'
import { destinationGasFor, gasFloorUsd, isGasAsk, type GasAsk } from './destGas'
import { gasTokenOf, starterRef } from './paper'

const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
const ETH_SUSDE = '0x9d39a5de30e57443bff2a8307a4256c8797a3497'
const ask = (g: ReturnType<typeof destinationGasFor>) => (isGasAsk(g) ? g : undefined) as GasAsk | undefined

describe('destination gas (tickets/0007 C)', () => {
  it('asks for gas only when the destination wallet has too little', () => {
    expect(ask(destinationGasFor('8453', BASE_USDC, 0, 100))?.amount).toMatch(/^0\.000\d+$/)
    expect(destinationGasFor('8453', BASE_USDC, gasFloorUsd('8453') - 0.001, 100)).toBeDefined()
    expect(destinationGasFor('8453', BASE_USDC, gasFloorUsd('8453'), 100)).toBeUndefined()
  })
  it('never when the bridged token is the gas coin, or the chain pays gas in its dollar', () => {
    expect(destinationGasFor('8453', gasTokenOf('8453'), 0, 100)).toBeUndefined()
    expect(destinationGasFor('988', '0x779ded0c9e1022225f8e0630b35a9b54be713736', 0, 100)).toBeUndefined()
  })
  it('auto on Solana', () => {
    expect(ask(destinationGasFor('solana', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 0, 100))?.amount).toBe('auto')
  })
  it('sizes to the trade: a $22 bridge to Ethereum asks ~$2, not the $12 it did on 2026-10-22', () => {
    const g = ask(destinationGasFor('1', ETH_SUSDE, 0, 22))!
    expect(g.usd).toBeLessThanOrEqual(2.2 * 1.05)
    expect(g.usd).toBeGreaterThan(1)
    const p = starterRef('1', gasTokenOf('1'))!
    expect(Number(g.amount) * p).toBeCloseTo(g.usd, 6)
    // a big bridge gets the full allowance (1.5 loop opens), never more
    expect(ask(destinationGasFor('1', ETH_SUSDE, 0, 10_000))!.usd).toBeLessThan(4)
  })
  it('a trade too small to carry one deposit of gas asks for none and says so', () => {
    expect(destinationGasFor('1', ETH_SUSDE, 0, 5)).toMatchObject({ skip: 'tooSmall' })
  })
  it('off means off; custom is taken as set', () => {
    expect(destinationGasFor('1', ETH_SUSDE, 0, 22, { mode: 'off' })).toBeUndefined()
    expect(ask(destinationGasFor('1', ETH_SUSDE, 0, 22, { mode: 'custom', usd: 5 }))!.usd).toBeCloseTo(5, 0)
  })
})
