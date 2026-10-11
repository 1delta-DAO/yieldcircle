import { describe, expect, it } from 'vitest'
import { destinationGasFor, gasFloorUsd } from './destGas'
import { gasTokenOf } from './paper'

const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
describe('destination gas (tickets/0007 C)', () => {
  it('asks for gas only when the destination wallet has too little', () => {
    expect(destinationGasFor('8453', BASE_USDC, 0)).toMatch(/^0\.000\d+$/)
    expect(destinationGasFor('8453', BASE_USDC, gasFloorUsd('8453') - 0.001)).toBeDefined()
    expect(destinationGasFor('8453', BASE_USDC, gasFloorUsd('8453'))).toBeUndefined()
  })
  it('never when the bridged token is the gas coin, or the chain pays gas in its dollar', () => {
    expect(destinationGasFor('8453', gasTokenOf('8453'), 0)).toBeUndefined()
    expect(destinationGasFor('988', '0x779ded0c9e1022225f8e0630b35a9b54be713736', 0)).toBeUndefined()
  })
  it('auto on Solana; Ethereum sized to a few loops there', () => {
    expect(destinationGasFor('solana', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 0)).toBe('auto')
    expect(Number(destinationGasFor('1', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 0)) * 2500).toBeGreaterThan(10)
  })
})
