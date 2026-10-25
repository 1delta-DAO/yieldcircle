import { describe, expect, it } from 'vitest'
import { CHAINS } from '@yieldcircle/app/sdk/queries'
import { chainsParam, readBoardChains, readLinkChains } from './feedLink'

const eth = CHAINS.find((c) => c.label === 'Ethereum')!.id
const base = CHAINS.find((c) => c.label === 'Base')!.id

describe('board chain links', () => {
  it('reads `c=` on the board, by label or id', () => {
    expect(readBoardChains('#/board?c=ethereum,base&by=wallet')?.sort()).toEqual([eth, base].sort())
    expect(readBoardChains(`#/board?by=paper&c=${eth}`)).toEqual([eth])
  })
  it('`c=all` is every chain; no `c`, or one naming nothing, sets none', () => {
    expect(readBoardChains('#/board?c=all')).toEqual([])
    expect(readBoardChains('#/board?by=wallet')).toBeNull()
    expect(readBoardChains('#/board?c=nowhere')).toBeNull()
    expect(readBoardChains('#/feed?c=ethereum')).toBeNull()
  })
  it('a feed link still sets them', () => {
    expect(readLinkChains('#/feed?c=base')).toEqual([base])
  })
  it('writes what it reads', () => {
    expect(readBoardChains(`#/board?c=${chainsParam([base, eth])}`)?.sort()).toEqual([eth, base].sort())
    expect(chainsParam([])).toBeUndefined()
  })
})
