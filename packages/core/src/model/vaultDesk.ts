/**
 * Who runs a vault, read off its words — for its MARK, not its identity. A Kamino kvault arrives
 * with no curator (`brand` = the protocol) and no share logo, so nineteen USDC vaults wore one
 * coin or a letter placeholder; their names say whose they are (`Steakhouse USDC`, `Plume x Re7
 * USDC`, `MEV Capital SOL`). A row the name does not place (`RWA USDC`, RockawayX's by its admin
 * key) keeps its placeholder until the earn row carries the curator.
 *
 * Keys are the index's curator ids; the picture is the icon set's `lender/<id with _>.webp`, the
 * file `curatorIconUrls` already tries for a desk page, so one file serves both.
 */
const DESKS: [RegExp, string, string?][] = [
  [/\bsteakhouse\b/i, 'steakhouse-financial'], [/\ballez\b/i, 'allez-labs'], [/\belemental\b/i, 'elemental'],
  [/\bgalaxy\b/i, 'galaxy'], [/\bmev ?capital\b/i, 'mev-capital'], [/\bneutral ?trade\b/i, 'neutral-trade'],
  [/\bsentora\b/i, 'sentora'], [/\brockawayx\b/i, 'rockawayx'], [/\bre7\b/i, 're7-labs'], [/\bhyperithm\b/i, 'hyperithm'],
  [/\by10k\b/i, 'y10k-capital'], [/\bgauntlet\b/i, 'gauntlet'], [/\bk3 ?capital\b/i, 'k3-capital'], [/\bsolv\b/i, 'solv'], [/\blorenzo\b/i, 'lorenzo'],
  // a savings issuer's own product (`brand` on `vault.savings`): BNB's XGLD, vhUSDT, USDT.AAA had only letters
  [/^unitas$/i, 'unitas'], [/^usdd$/i, 'usdd'], [/^openeden$/i, 'openeden'], [/^venus$/i, 'venus'], [/^lista$/i, 'lista'],
  // the house curating its own product: the platform's mark is the curator's
  [/^kamino\b/i, 'kamino'], [/^loopscale\b/i, 'loopscale-asset-curation', 'loopscale'],
]

export const PROTOCOL_ICONS = 'https://raw.githubusercontent.com/1delta-DAO/protocol-icons/main/'

/** The first of `words` (the vault's name, then its curator or brand) that names a known desk. */
export function vaultDesk(...words: (string | null | undefined)[]): { id: string; logo: string } | undefined {
  for (const w of words) {
    const hit = w ? DESKS.find(([re]) => re.test(w)) : undefined
    if (hit) return { id: hit[1], logo: `${PROTOCOL_ICONS}lender/${hit[2] ?? hit[1].replace(/-/g, '_')}.webp` }
  }
}

/**
 * Any curator or issuer the icon set has a mark for, by its slugged name (`Mezzanine` →
 * `lender/mezzanine.webp`, `August Digital` → `lender/august_digital.webp`): the long tail the
 * table above does not name. Only names `scripts/brand-icons.mjs` found in the set, so a row
 * never asks for a file that is not there.
 */
import BRAND_ICONS from '../data/brand-icons.json'
const BRANDS = new Set<string>(BRAND_ICONS)
export function brandMark(...names: (string | null | undefined)[]): { id: string; logo: string } | undefined {
  for (const n of names) {
    const id = n?.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    if (id && BRANDS.has(id)) return { id, logo: `${PROTOCOL_ICONS}lender/${id}.webp` }
  }
}

/** Platforms whose uncurated vaults are the house's own: a Lista vault no curator is named for is Lista's, a Fluid fToken Fluid's, a yvUSDC Yearn's. */
const HOUSES: Record<string, string> = { 'vault.lista': 'lista', 'vault.fluid': 'fluid', 'vault.yearn': 'yearn', 'vault.termmax': 'termmax' }
export function houseDesk(venue: string): { id: string; logo: string } | undefined {
  const id = HOUSES[venue]
  return id ? { id, logo: `${PROTOCOL_ICONS}lender/${id}.webp` } : undefined
}
