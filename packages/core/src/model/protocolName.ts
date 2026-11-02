/** What a protocol key reads as, for people: the index's keys are for machines. */
/**
 * Names that beat the index's. `MetaMorpho` is a contract, not a product anyone
 * shops for, and beside a bare `Morpho` it does not say "vaults, not markets".
 */
export const PROTOCOL_NAMES: Record<string, string> = {
  MORPHO_BLUE: 'Morpho Markets', 'vault.morpho': 'Morpho Vaults', 'vault.morpho_blue': 'Morpho Vaults',
  MORPHO_MIDNIGHT: 'Morpho Midnight', COMPOUND_V3: 'Compound V3', LODESTAR: 'Lodestar', COOLER: 'Cooler',
}
/** `CAPY_FI` → `Capy Fi`, for the few keys no lender listing names. */
export function prettyProtocol(key: string): string {
  if (PROTOCOL_NAMES[key]) return PROTOCOL_NAMES[key]
  if (key.startsWith('vault.')) {
    const p = key.slice(6).replace(/[-_]/g, ' ')
    return p.replace(/\b\w/g, (c) => c.toUpperCase()) + ' vaults'
  }
  return key
    .replace(/_V(\d)$/, ' v$1')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
