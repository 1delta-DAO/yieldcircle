/**
 * A token's OWN risk score — "if I hold this, what am I holding?" — as risk-data
 * scores it (`asset-risks.json`, docs/RISK_CATEGORIES.md §2) and the token list
 * carries it on every asset as `props.risk`. 1–5, lower is safer; 6 is
 * `compromised` (backing gone). It is one of the five categories folded into a
 * loop's `risk.breakdown` (`tokenLong`, `tokenShort`) and is NOT the market's
 * score: USDC is a 1 wherever it sits, a market that lends it can still be a 4.
 *
 * The app reads it off the optimizer's legs (`AssetRef.props.risk`); the earn
 * listing's asset carries no props, and the token list is 14k rows a chain, so
 * an asset no loop prices stays unrated here.
 */
import type { LoopStrategy, Strategy } from './strategies'

export interface AssetRisk { score: number; category?: string; source?: string }

export const assetRiskOf = (r: { score?: number; category?: string; source?: string } | undefined): AssetRisk | null =>
  r?.score ? { score: r.score, category: r.category, source: r.source } : null

/** risk-data's categories, in words a holder reads */
const CATEGORY: Record<string, string> = {
  STABLECOIN: 'stablecoin',
  YIELD_STABLE: 'yield-bearing dollar',
  YIELD_TOKEN: 'yield-bearing token',
  PRINCIPAL_TOKEN: 'fixed-yield principal token',
  LST: 'liquid staking token',
  LRT: 'liquid restaking token',
  NATIVE: 'the chain’s own coin',
  BLUE_CHIP: 'blue chip',
  ESTABLISHED_DEFI: 'established DeFi token',
  TOKENIZED_EQUITY: 'tokenized stock',
  BRIDGED: 'bridged representation',
  COMPROMISED: 'compromised',
  DISCONTINUED: 'discontinued',
  UNKNOWN_ISSUER: 'unknown issuer',
  OTHER: 'other',
}
export const categoryWord = (c: string | undefined) => (c ? CATEGORY[c] ?? c.toLowerCase().replace(/_/g, ' ') : null)

/** how the score was reached — `source` in the file */
export function sourceWord(s: string | undefined): string {
  if (!s) return ''
  if (s === 'stablecoin') return 'scored on peg history, market cap and mechanism'
  if (s === 'whitelist') return 'reviewed by hand'
  if (s === 'default') return 'not reviewed yet — the conservative default'
  if (s === 'pendle_inherit') return 'inherits from the token the PT redeems into'
  if (s === 'savings_inherit') return 'inherits from the token it saves'
  if (s === 'vault_inherit') return 'inherits from the vault’s own rating'
  if (s === 'issuer_inherit') return 'inherits from the issuer’s home deployment'
  if (s.endsWith('_inherit')) return 'inherits from what it holds'
  return s.replace(/_/g, ' ')
}

/** the 1–6 scale in the app's three words (+ compromised) — mirrors `riskOf` in strategies.ts */
export const scoreWord = (score: number) => (score >= 6 ? 'Compromised' : score <= 2 ? 'Low' : score <= 4 ? 'Medium' : 'High')

/**
 * One asset's score from the loops that price it: as collateral where it is the
 * group, as debt where it is the debt. The WORST across chains (a bridged copy
 * can score above the home one), with how many chains agree.
 */
export function assetRiskAcross(rows: Strategy[], group: string): { risk: AssetRisk; chains: number; spread: boolean } | null {
  const seen = new Map<string, AssetRisk>()
  for (const s of rows) {
    if (s.kind !== 'loop' || !s.tokenRisk) continue
    const l = s as LoopStrategy
    const r = l.assetGroup === group ? l.tokenRisk!.long : l.debtGroup === group ? l.tokenRisk!.short : null
    if (r && !seen.has(l.chainId)) seen.set(l.chainId, r)
  }
  if (!seen.size) return null
  const all = [...seen.values()]
  const worst = all.reduce((a, b) => (b.score > a.score ? b : a))
  return { risk: worst, chains: seen.size, spread: all.some((r) => r.score !== worst.score) }
}
