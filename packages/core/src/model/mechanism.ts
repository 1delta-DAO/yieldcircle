/**
 * HOW a token earns — the word Lite puts in front of whose it is: `Basis trade via Ethena`,
 * `Lending via Sky`, `Looped private credit via Maple` (docs/lite-descriptors.md).
 *
 * The one source is token-lists' notes (`mechanism` on a note: curated by hand for a savings
 * dollar, read off props for an LST or a tokenized fund, and a live PT takes its underlying's).
 * `node scripts/notes.mjs` copies that field alone into `data/mechanisms.json`, keyed by the
 * index's asset GROUP — small enough for a list, where the notes themselves are a lazy chunk.
 * Per TOKEN, never per issuer: Sky's sUSDS and stUSDS earn differently, Midas runs a dozen funds.
 *
 * `DESK_DEFAULT` answers for a token the table does not hold yet (a new chain's group, a Solana
 * PT), and only for an issuer with ONE line of business. Nothing is inferred from a ticker.
 */
import MECHANISMS from '../data/mechanisms.json'
import MECHANISM_OF from '../data/mechanism-of.json'
import { canonGroup } from './assetGroup'
import type { GroupId } from './assets'

export const MECHANISM_IDS = ['lending', 'staking', 'restaking', 'basis-trade', 'treasuries', 'private-credit', 'reinsurance', 'dividends', 'hedged-trading', 'mixed'] as const
export type Mechanism = (typeof MECHANISM_IDS)[number]

/**
 * `word` opens a name (`Basis trade via Ethena`); `mid` sits inside one (`Looped basis trade via Ethena`).
 * Short on purpose: a phone's list row holds some thirty characters over two lines, and `Looped mixed
 * strategies via Reservoir` lost its issuer there (docs/lite-descriptors.md, "Fit on the phone").
 */
export const MECHANISM_WORDS: Record<Mechanism, { word: string; mid: string }> = {
  lending: { word: 'Lending', mid: 'lending' },
  staking: { word: 'Staking', mid: 'staking' },
  restaking: { word: 'Restaking', mid: 'restaking' },
  'basis-trade': { word: 'Basis trade', mid: 'basis trade' },
  treasuries: { word: 'US Treasuries', mid: 'US Treasuries' },
  'private-credit': { word: 'Private credit', mid: 'private credit' },
  reinsurance: { word: 'Reinsurance', mid: 'reinsurance' },
  dividends: { word: 'Dividends', mid: 'dividends' },
  'hedged-trading': { word: 'Hedged', mid: 'hedged' },
  mixed: { word: 'Mixed', mid: 'mixed' },
}

const TABLE = MECHANISMS as Record<string, string>
const known = (m: string | undefined): Mechanism | undefined => (m && m in MECHANISM_WORDS ? (m as Mechanism) : undefined)

/** The mechanism of an asset group, or undefined: an id this build has no word for is no answer. */
export const mechanismOfGroup = (group: string | null | undefined): Mechanism | undefined =>
  group ? known(TABLE[group] ?? TABLE[canonGroup(group)]) : undefined

const PAID_BY = MECHANISM_OF as Record<string, string>
/**
 * What pays a token's mechanism, where token-lists names ONE thing (`mechanismOf`): `STRC` for
 * Saturn's sUSDat, whose dividends are Strategy's preferred stock's. A basket (Apyx) has none.
 */
export const mechanismSubjectOfGroup = (group: string | null | undefined): string | undefined =>
  group ? PAID_BY[group] ?? PAID_BY[canonGroup(group)] : undefined
/** A mechanism's words with what pays it in front: `STRC dividends`, in a name's opening and inside it alike. */
export const mechanismWords = (m: Mechanism, subject?: string): { word: string; mid: string } =>
  subject ? { word: `${subject} ${MECHANISM_WORDS[m].mid}`, mid: `${subject} ${MECHANISM_WORDS[m].mid}` } : MECHANISM_WORDS[m]

/** Issuers with one line of business, by the money and the desk id (`model/desk.ts`). */
const DESK_DEFAULT: Partial<Record<GroupId, Record<string, Mechanism>>> = {
  USD: {
    ethena: 'basis-trade', resolv: 'basis-trade',
    maple: 'private-credit', '3jane': 'private-credit', usdai: 'private-credit',
    re: 'reinsurance', onre: 'reinsurance',
    sky: 'lending', curve: 'lending', inverse: 'lending', liquity: 'lending',
  },
  ETH: {
    lido: 'staking', rocketpool: 'staking', stakewise: 'staking', mantle: 'staking', stader: 'staking', coinbase: 'staking', binance: 'staking',
    etherfi: 'restaking', renzo: 'restaking', kelp: 'restaking', puffer: 'restaking',
  },
}
export const mechanismOfDesk = (group: GroupId, deskId: string | null | undefined): Mechanism | undefined =>
  deskId ? DESK_DEFAULT[group]?.[deskId] : undefined

/** Vault platforms whose vaults lend: the curator picks the markets, the borrowers pay the rate. */
const LENDING_VAULTS = /^vault\.(morpho|euler-earn|kamino-kvault|jupiter-lend|lista|loopscale|fluid|gearbox)\b/
export const isLendingVault = (protocolKey: string | null | undefined): boolean => !!protocolKey && LENDING_VAULTS.test(protocolKey)
