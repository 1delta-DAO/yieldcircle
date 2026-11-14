import { describe, expect, it } from 'vitest'
import type { Holding } from '@yieldcircle/core/model/positions'
import { earnedSince, holdingFor, outcomeOf, pillLine, receiptRows } from './txOutcome'
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

describe('the order, in rows (docs/tx-feedback-plan.md §4.3)', () => {
  const chain = (c: string) => ({ '8453': 'Base', '42161': 'Arbitrum' } as Record<string, string>)[c] ?? c
  const h = (p: Partial<Holding>) => ({ key: 'k', chainId: '8453', valueUsd: 100, venue: 'Aave V3 · Base', kind: 'loop', ...p }) as Holding
  const rows = (tr: Trace, hh?: Holding) => Object.fromEntries(receiptRows(tr, hh, { chain }).map((r) => [r.k, r]))
  it('a change says before → after, from the synced position once it is there', () => {
    const tr = t({ receipt: { kind: 'delever', leverage: 4, before: { leverage: 7.7, buffer: 0.053 }, holdingKey: 'k' } })
    const r = rows(tr, h({ leverage: 4.02, health: 1.14 }))
    expect(r.Leverage.v).toBe('×7.7 → ×4.0')
    expect(r.Liquidation.v).toBe('5.3% → 12.3% from liquidation')
  })
  it('a repay says what is still owed — or that the loan is closed', () => {
    expect(rows(t({ receipt: { kind: 'repay', usd: 40, before: { owedUsd: 100 } } }))['Still owed'].v).toBe('$60')
    expect(rows(t({ receipt: { kind: 'repay', usd: 100, all: true, before: { owedUsd: 100 } } }))['Still owed'].v).toBe('Nothing — the loan is closed')
  })
  it('the way out says what it made', () => {
    expect(rows(t({ receipt: { kind: 'close', made: 0.12 } }))['It made']).toMatchObject({ v: '+$0.12 since you opened it', tone: 'ok' })
  })
  it('a bridge: what arrived, the gas it brought, where it landed', () => {
    const r = rows(t({ receipt: { kind: 'bridge', amount: '250 USDC', out: '249.8 USDC', gas: '0.0004 ETH' }, chainId: '42161', received: [{ symbol: 'USDC', amount: '249.81' }], bridge: { name: 'relay', toChainId: '8453', toHash: '0xdead00000000beef' } }))
    expect(r.Received.v).toBe('+249.81 USDC')
    expect(r['Gas brought'].v).toBe('+0.0004 ETH')
    expect(r.Route.v).toBe('Arbitrum → Base · relay')
    expect(r.Arrival.tx).toEqual({ chainId: '8453', hash: '0xdead00000000beef' })
  })
  it('the pill as it ends, and the ticker', () => {
    const tr = t({ receipt: { kind: 'open', amount: '$10.00', apr: 15.34 } })
    expect(pillLine(tr, outcomeOf(tr))).toBe('Your loop is open · $10.00 at 15.3%')
    expect(earnedSince({ ...base, doneAt: 0 }, undefined, 365 * 86_400_000)).toBeNull()
    expect(earnedSince({ ...base, doneAt: 1, receipt: { kind: 'deposit', usd: 1000, apr: 10 } }, undefined, 1 + 365 * 86_400_000)).toBeCloseTo(100, 6)
  })
})
