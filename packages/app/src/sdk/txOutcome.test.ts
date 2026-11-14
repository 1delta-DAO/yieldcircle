import { describe, expect, it } from 'vitest'
import type { Holding } from '@yieldcircle/core/model/positions'
import { holdingFor, outcomeOf } from './txOutcome'
import type { Trace } from './txTrace'

const base: Trace = { id: '0x1', hash: '0x1', chainId: '8453', account: '0xme', title: 'Put $250 to work', label: 'Deposit', moves: 'positions', phase: 'settled', at: 0, doneAt: 1, need: 1, receipt: { kind: 'deposit', amount: '$250.00', usd: 250 } }
const t = (p: Partial<Trace>): Trace => ({ ...base, ...p })

describe('how an action ended (docs/tx-feedback-plan.md §3.2)', () => {
  it('flying: the action, and where it is', () => {
    const o = outcomeOf(t({ phase: 'pending', at: 0 }), { now: 14_000 })
    expect(o).toMatchObject({ state: 'flying', head: 'Put $250 to work', detail: 'Waiting for a block · sent 14s ago' })
  })
  it('won: the headline per kind, paper said as paper', () => {
    expect(outcomeOf(t({})).head).toBe('Deposit complete')
    expect(outcomeOf(t({ receipt: { kind: 'open' } })).head).toBe('Your loop is open')
    expect(outcomeOf(t({ receipt: { kind: 'close' }, received: [{ symbol: 'USDC', amount: '10.12' }] }))).toMatchObject({ head: 'Back in your wallet', detail: '+10.12 USDC in your wallet' })
    expect(outcomeOf(t({ paper: true })).detail).toMatch(/On paper/)
  })
  it('soft: landed, the positions not showing it yet — Check again, never confetti', () => {
    expect(outcomeOf(t({ note: 'Final on chain, but the positions have not picked it up yet.' }))).toMatchObject({ state: 'soft', tone: 'warn', next: ['check', 'done'] })
  })
  it('lost: where the money is, per ending', () => {
    expect(outcomeOf(t({ phase: 'reverted' })).money).toBe('Nothing moved. Only the network fee was spent.')
    expect(outcomeOf(t({ phase: 'reverted' }), { onFail: 'The unwrap reverted. The funds are in your wallet as WETH.' })).toMatchObject({ head: 'Almost', tone: 'warn' })
    expect(outcomeOf(t({ id: 'batch:w1', phase: 'reverted' })).money).toMatch(/batch reverted/)
    expect(outcomeOf(t({ phase: 'dropped', err: 'Cancelled in the wallet.' })).head).toBe('Cancelled')
    expect(outcomeOf(t({ chainId: 'solana', phase: 'dropped', err: 'It expired before it landed' })).head).toBe('It expired')
    expect(outcomeOf(t({ phase: 'dropped', err: 'Never made it into a block.' })).money).toBe('Nothing left your wallet.')
    expect(outcomeOf(t({ phase: 'failed', err: 'Lost track of it (timeout).' })).next).toEqual(['check', 'view'])
    expect(outcomeOf(t({ phase: 'reverted' }), { partial: true }).head).toBe('Half done')
  })
})

describe('the position an action made', () => {
  const h = (p: Partial<Holding>) => ({ key: 'k', chainId: '8453', valueUsd: 1, ...p }) as Holding
  it('the one named, else the one whose markets it touched — both legs first', () => {
    const hs = [h({ key: 'dep', earnUid: 'AAVE_V3:8453:0xa' }), h({ key: 'loop', collateralUid: 'AAVE_V3:8453:0xa', debtUid: 'AAVE_V3:8453:0xb' }), h({ key: 'other', chainId: '1', earnUid: 'AAVE_V3:8453:0xa' })]
    expect(holdingFor(hs, { chainId: '8453', touches: ['AAVE_V3:8453:0xa', 'AAVE_V3:8453:0xb'] })?.key).toBe('loop')
    expect(holdingFor(hs, { chainId: '8453', touches: ['AAVE_V3:8453:0xa'] })?.key).toBe('dep')
    expect(holdingFor(hs, { chainId: '8453', touches: [], receipt: { kind: 'deposit', holdingKey: 'other' } })?.key).toBe('other')
    expect(holdingFor(hs, { chainId: '8453', touches: ['X:8453:0xz'] })).toBeUndefined()
  })
})
