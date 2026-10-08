/**
 * What a token IS — the sentence an asset page (`ui/TokenPage.tsx`) opens
 * with. Neither index nor the 1delta API carries a description, so they are
 * researched and written here, keyed by the index's asset GROUP (case-
 * significant, `model/assetGroup.ts`). The backlog of what still needs one is
 * docs/asset-research-backlog.md.
 *
 * Rules: say what backs the token and where its yield comes from in plain
 * words, no marketing; every line traceable to a source in `links`; a fact
 * only one aggregator states is left out. `checked` is the day it was last
 * verified — redemption terms and holdings change.
 */
import { baseInfo } from './assets'

export interface AssetNote {
  /** two or three sentences: what it is and what it holds */
  what: string
  /** one sentence: where the token's own yield comes from */
  yieldFrom?: string
  /** short facts a holder should know: exit, eligibility, NAV, chains */
  facts?: string[]
  links?: { label: string; url: string }[]
  /** ISO day */
  checked: string
}

const NOTES: Record<string, AssetNote> = {
  'Nest BlackOpal LiquidStone II Vault::nOPAL': {
    what:
      'A Nest vault share (Plume). The vault takes USDC and holds BlackOpal’s LiquidStone II fund, which buys short-dated Brazilian credit-card receivables and hedges the currency back to the dollar. Interest builds up in the token’s price; nothing is paid out.',
    yieldFrom:
      'The discount at which card receivables are bought, collected at face value as Visa / Mastercard payments settle. BlackOpal targets about 12 % in USD.',
    facts: [
      'Holdings: about 96 % LiquidStone receivables, the rest a Nest treasury vault and cash (Nest’s vault directory).',
      'Exit: redeemed through Nest — instantly from a small liquid buffer for a fee, otherwise through a queue (Nest lists T+1 for this vault).',
      'Price: the NAV is reported by the issuer and pushed on chain by Nest, so it moves in steps, not with a market.',
      'Not available to US persons; Nest blocks minting from 46 jurisdictions.',
      'Moves between EVM chains as one LayerZero token (burned on one chain, minted on the other); Nest also issues it on Solana.',
    ],
    links: [
      { label: 'Nest vault', url: 'https://app.nest.credit/vaults/nest-opal-vault' },
      { label: 'BlackOpal', url: 'https://blackopal.finance' },
      { label: 'Nest vault directory', url: 'https://docs.nest.credit/about/available-vaults' },
      { label: 'rwa.xyz', url: 'https://app.rwa.xyz/assets/nOPAL' },
    ],
    checked: '2026-10-08',
  },
}

/** the researched note, else the one-line `what` of a base asset the menu already knows (USDC: "Circle stablecoin") */
export function noteOf(group: string, symbol: string | null | undefined): AssetNote | { what: string; checked?: undefined } | undefined {
  const n = NOTES[group]
  if (n) return n
  const base = baseInfo(symbol ?? group)
  return base && base.sym.toUpperCase() === (symbol ?? group).toUpperCase() ? { what: base.what } : undefined
}
