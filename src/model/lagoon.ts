/**
 * What a Lagoon vault's manager says it does — the strategy text the market page shows
 * (`ui/Market.tsx`), since Lagoon publishes no allocation and the 1delta API carries none.
 *
 * The one source is `data/lagoon.json`, a snapshot of Lagoon's own (undocumented) web-app API
 * built by `node scripts/lagoon.mjs`. It is the manager's description, never a reading of where
 * the money is: the page labels it as theirs, and "Whose credit" stays what the index knows.
 *
 * ~73 kB (~20 kB gzipped), so it is a lazy chunk: only a Lagoon market page loads it.
 */
import { parseUid } from './uid'

export interface LagoonVault {
  name: string
  /** Lagoon's strategy tag: market_neutral_crypto | directional | fixed_income | private_credit | diversified */
  category: string | null
  categoryLabel: string | null
  curators: { name: string; url: string | null }[]
  /** the manager's one-paragraph summary */
  short: string | null
  /** the manager's full description, paragraphs split by blank lines */
  description: string | null
  transparencyUrl: string | null
  /** unix seconds */
  inception: number | null
  insurance?: { name: string; link: string; note?: string }[]
}
interface LagoonFile { at: string; vaults: Record<string, LagoonVault> }

let pending: Promise<LagoonFile> | undefined
export const loadLagoon = () =>
  (pending ??= import('../data/lagoon.json').then((m) => m.default as unknown as LagoonFile))

/** `vault.lagoon:1:0x60a2…` → `1:0x60a2…`, or null for any other venue. */
export function lagoonKey(uid: string): string | null {
  const p = parseUid(uid)
  return p && p.lender === 'vault.lagoon' && p.ref ? `${p.chainId}:${p.ref.toLowerCase()}` : null
}
