import { describe, expect, it } from 'vitest'
import { isDust, liteMoves } from './moves'
import type { TxBundle, TxLeg } from '../index/types'
import type { LiteRow } from './lite'
import type { Strategy } from './strategies'

const leg = (marketUid: string, amountUsd: number, side = 'supply'): TxLeg => ({ marketUid, amountUsd, side } as unknown as TxLeg)
const tx = (hash: string, account: string, legs: TxLeg[]): TxBundle =>
  ({ chainId: '1', txHash: hash, blockNumber: 1, blockTs: '2026-11-01T00:00:00Z', accounts: [account], lenders: [], kinds: { 'supply/deposit': 1 }, legs, nRows: legs.length, netUsd: null, volumeUsd: legs.reduce((a, l) => a + (l.amountUsd ?? 0), 0), unpriced: 0 })
// a deposit row on AAVE_V3 USDC, matched by its market uid
const row = { s: { id: 'usdc', kind: 'simple', earnUid: 'AAVE_V3:1:0xusdc', chainId: '1', risk: 1 } as unknown as Strategy, title: 'Dollars on Aave', sub: '' } as LiteRow

describe('isDust', () => {
  it('is a move under $10, never one with an unpriced leg', () => {
    expect(isDust(tx('a', '0x1', [leg('m', 3)]))).toBe(true)
    expect(isDust(tx('b', '0x1', [leg('m', 300)]))).toBe(false)
    expect(isDust({ ...tx('c', '0x1', [leg('m', 3)]), unpriced: 1 })).toBe(false)
  })
})

describe('liteMoves', () => {
  const copyable = tx('1', '0xa', [leg('AAVE_V3:1:0xusdc', 500)])
  const again = tx('2', '0xa', [leg('AAVE_V3:1:0xusdc', 900)])
  const dust = tx('3', '0xb', [leg('AAVE_V3:1:0xusdc', 2)])
  const other = tx('4', '0xc', [leg('MORPHO:1:0xodd', 800)])
  it('Everyone keeps only what can be copied, no dust, one per wallet and strategy', () => {
    expect(liteMoves([copyable, again, dust, other], [row], 'everyone', 10).map((x) => x.t.txHash)).toEqual(['1'])
  })
  it('Following keeps everything the people you chose did', () => {
    expect(liteMoves([copyable, dust, other], [row], 'following', 10).map((x) => x.t.txHash)).toEqual(['1', '3', '4'])
  })
})
