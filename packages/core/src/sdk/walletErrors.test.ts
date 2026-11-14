import { describe, expect, it } from 'vitest'
import { isChainMismatch, isRejection, walletWhy } from './walletErrors'

/** viem's `UserRejectedRequestError` around what the wallet answered: its own code is 4001 whatever the cause's. */
const viemRejected = (cause: { code: number; message: string }) => ({ code: 4001, shortMessage: 'User rejected the request.', message: `User rejected the request.\n\nDetails: ${cause.message}\nVersion: viem@2`, details: cause.message, cause })

describe('isRejection', () => {
  it('a 4001, and a wallet that only says it in words', () => {
    expect(isRejection({ code: 4001, message: 'nope' })).toBe(true)
    expect(isRejection(viemRejected({ code: 4001, message: 'User denied transaction signature.' }))).toBe(true)
    expect(isRejection(new Error('User cancelled the request'))).toBe(true)
    expect(isRejection(new Error('execution reverted'))).toBe(false)
  })
  it('a WalletConnect 5000 only when its message says no: MetaMask Mobile answers 5000 for every failure', () => {
    expect(isRejection(viemRejected({ code: 5000, message: 'MetaMask Tx Signature: User denied transaction signature.' }))).toBe(true)
    expect(isRejection(viemRejected({ code: 5000, message: '{"code":4001,"message":"User rejected the request."}' }))).toBe(true)
    expect(isRejection(viemRejected({ code: 5000, message: '' }))).toBe(true)
    expect(isRejection(viemRejected({ code: 5000, message: '{"code":-32602,"message":"Chain ID must match the dApp selected network"}' }))).toBe(false)
    expect(isRejection(viemRejected({ code: 5000, message: 'Invalid parameters: must provide an Ethereum address.' }))).toBe(false)
  })
})

describe('walletWhy', () => {
  it('the wallet\'s own message, out of the JSON it was stringified into', () => {
    expect(walletWhy(viemRejected({ code: 5000, message: '{"code":-32602,"message":"Chain ID must match the dApp selected network"}' }))).toBe('Chain ID must match the dApp selected network')
    expect(walletWhy(viemRejected({ code: 5000, message: 'Request too large' }))).toBe('Request too large')
    expect(walletWhy(new Error('fetch failed'))).toBe('fetch failed')
  })
})

describe('isChainMismatch', () => {
  it('the wallet is on another chain, in each wallet\'s words', () => {
    expect(isChainMismatch(viemRejected({ code: 5000, message: 'Invalid parameters: active chainId is different than the one provided.' }))).toBe(true)
    expect(isChainMismatch({ code: -32602, message: 'Provided chainId "1" must match the active chainId "8453"' })).toBe(true)
    expect(isChainMismatch(viemRejected({ code: 5000, message: '{"code":-32602,"message":"Chain ID must match the dApp selected network"}' }))).toBe(true)
    expect(isChainMismatch(new Error('The current chain of the wallet (id: 8453) does not match the target chain for the transaction (id: 1 – Ethereum).'))).toBe(true)
    expect(isChainMismatch(new Error('execution reverted'))).toBe(false)
    expect(isChainMismatch(viemRejected({ code: 4001, message: 'User denied transaction signature.' }))).toBe(false)
  })
})
