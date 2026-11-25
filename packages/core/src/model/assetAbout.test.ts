import { describe, expect, it } from 'vitest'
import { assetFacts, issuerCard, issuerNameOf, issuerProfile, linkLabel, similarAssets, strategyAbout } from './assetAbout'
import type { AssetNote } from './assetNotes'
import type { LoopStrategy, SimpleStrategy, Strategy } from './strategies'

const NOTES: Record<string, AssetNote> = {
  'Hastra PRIME::PRIME': { what: 'Hastra staked wYLDS · Figure HELOC lending yield', backing: 'HELOC loans via Figure Democratized Prime', yieldSource: 'interest on HELOC warehouse lending', redemption: 'Unstake to wYLDS any time', issuer: 'Hastra', mechanism: 'private-credit', links: ['https://help.hastra.io/prime/what-is-prime-(staked-wylds)', 'https://hastra.io/proof-of-reserves'], updated: '2026-10-01', source: 'curated' },
  '3Jane Staked USD3::sUSD3': { what: '3Jane junior tranche', issuer: '3Jane', yieldSource: 'levered credit interest', mechanism: 'private-credit', source: 'curated' },
  'Wrapped Ether::WETH': { what: 'Ether as a token', yieldSource: null, source: 'curated' },
}

const base = { chainId: '1', venue: 'Kamino', venueKey: 'KAMINO', nature: 'savings' as const, riskLabel: 'low', rated: true, riskScore: 2, risk: 1 as const, tvlUsd: 10_000_000, rate: 9 }
const dep = (more: Partial<SimpleStrategy>): Strategy => ({ ...base, id: 's:x', kind: 'simple', group: 'USD', asset: 'USDC', holds: 'USDC', source: 'lending', via: 'Kamino', assetSymbol: 'USDC', ...more } as unknown as SimpleStrategy)
const loop = (more: Partial<LoopStrategy>): Strategy => ({
  ...base, id: 'l:x', kind: 'loop', group: 'USD', asset: 'PRIME', holds: 'PRIME', debt: 'USDC', assetGroup: 'Hastra PRIME::PRIME', debtGroup: 'USD Coin::USDC', desk: 'hastra',
  borSpot: 6.1, borrowLiquidityUsd: 3_000_000, tiers: { defensive: 2, balanced: 3, aggressive: 4 }, liqLtv: 0.9, ...more,
} as unknown as LoopStrategy)

describe('issuers', () => {
  it('cuts a note’s free text down to the name', () => {
    expect(issuerNameOf('Hastra / Figure (YLDS)')).toBe('Hastra')
    expect(issuerNameOf('Yuzu Money (YUZU FINTECH LLC)')).toBe('Yuzu Money')
    expect(issuerNameOf('3Jane')).toBe('3Jane')
  })
  it('finds a profile by id or by name', () => {
    expect(issuerProfile({ id: 'hastra' })?.p.entity).toBe('Signum Ltd.')
    expect(issuerProfile({ name: 'Hastra (incubated by Figure and the Provenance Blockchain Foundation)' })?.id).toBe('hastra')
    expect(issuerProfile({ name: 'Nobody' })).toBeUndefined()
  })
  it('draws a profiled card with its legal rows, and a bare one with the name alone', () => {
    const c = issuerCard({ id: 'hastra' })!
    expect(c.profiled).toBe(true)
    expect(c.sub).toBe('Signum Ltd. · Cayman Islands company limited by shares')
    expect(c.facts.map((f) => f.k)).toEqual(['Legal entity', 'Legal structure', 'Country', 'Platform'])
    const bare = issuerCard({ name: '3Jane', kind: 'protocol' })!
    expect(bare).toMatchObject({ name: '3Jane', profiled: false, facts: [{ k: 'Kind' }] })
    expect(issuerCard({})).toBeNull()
  })
})

describe('assetFacts', () => {
  it('reads the note, the issuer and the mechanism, with the issuer’s links not repeated', () => {
    const f = assetFacts(NOTES, 'Hastra PRIME::PRIME', 'PRIME')
    expect(f.facts.map((x) => x.k)).toEqual(['Backed by', 'Yield comes from', 'Way out'])
    expect(f.issuer?.name).toBe('Hastra')
    expect(f.earns?.id).toBe('private-credit')
    expect(f.links.map((l) => l.url)).toEqual(['https://help.hastra.io/prime/what-is-prime-(staked-wylds)'].filter((u) => !f.issuer!.links.some((l) => l.url === u)))
    expect(f.links.some((l) => /proof-of-reserves/.test(l.url))).toBe(false)
  })
  it('says a token that earns nothing does, and leaves out what nobody wrote', () => {
    expect(assetFacts(NOTES, 'Wrapped Ether::WETH', 'WETH').facts).toEqual([{ k: 'Yield comes from', v: 'nothing: it earns nothing itself', icon: 'yield' }])
    expect(assetFacts(NOTES, 'Nothing::NONE', 'NONE')).toMatchObject({ facts: [], issuer: null, what: undefined })
  })
})

describe('linkLabel', () => {
  it('names a reserves page, else the host, else the page where hosts repeat', () => {
    expect(linkLabel('https://hastra.io/proof-of-reserves')).toBe('Transparency and proof of reserves')
    expect(linkLabel('https://docs.3jane.xyz/usd3')).toBe('docs.3jane.xyz')
    const two = ['https://help.hastra.io/auto/what-is-auto', 'https://help.hastra.io/x/claim']
    expect(linkLabel(two[0], two)).toBe('what is auto')
  })
})

describe('strategyAbout', () => {
  it('a loop: the collateral with its issuer, the debt and its cost, then how it earns', () => {
    const p = strategyAbout(loop({}), NOTES)
    expect(p.map((x) => x.role)).toEqual(['holds', 'borrows', 'how'])
    expect(p[0].facts?.issuer?.sub).toContain('Signum')
    expect(p[1].lines[0]).toContain('6.10%')
    expect(p[1].lines[1]).toContain('rate you pay')
    expect(p[2].title).toBe('How it earns · Private credit')
  })
  it('a vault: what it hands you, then what goes in', () => {
    const p = strategyAbout(dep({ source: 'vault', holds: 'sUSD3', shareGroup: '3Jane Staked USD3::sUSD3', assetGroup: 'Hastra PRIME::PRIME', assetSymbol: 'PRIME' }), NOTES)
    expect(p.slice(0, 2).map((x) => [x.role, x.symbol])).toEqual([['holds', 'sUSD3'], ['deposit', 'PRIME']])
  })
})

describe('similarAssets', () => {
  it('lists other assets that earn the same way, largest first, never itself', () => {
    const rows = [
      loop({}),
      dep({ id: 's:a', assetGroup: '3Jane Staked USD3::sUSD3', assetSymbol: 'sUSD3', tvlUsd: 40e6 }),
      dep({ id: 's:b', assetGroup: '3Jane Staked USD3::sUSD3', assetSymbol: 'sUSD3', tvlUsd: 90e6 }),
      dep({ id: 's:c', assetGroup: 'Wrapped Ether::WETH', assetSymbol: 'WETH' }),
    ]
    expect(similarAssets('Hastra PRIME::PRIME', rows, NOTES)).toEqual([
      { group: '3Jane Staked USD3::sUSD3', symbol: 'sUSD3', logo: undefined, issuer: '3Jane', largestUsd: 90e6, mechanism: 'private-credit', word: 'Private credit' },
    ])
    expect(similarAssets('Wrapped Ether::WETH', rows, NOTES)).toEqual([])
  })
})
