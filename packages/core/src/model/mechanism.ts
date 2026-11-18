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

export const MECHANISM_IDS = ['lending', 'staking', 'restaking', 'basis-trade', 'treasuries', 'private-credit', 'reinsurance', 'dividends', 'hedged-trading', 'perp-lp', 'mixed'] as const
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
  // the id is token-lists'; `Hedged via Tori` said too little — what these desks run is market-neutral trading
  'hedged-trading': { word: 'Market-neutral', mid: 'market-neutral' },
  'perp-lp': { word: 'Perp LP', mid: 'perp LP' },
  mixed: { word: 'Mixed', mid: 'mixed' },
}

/**
 * The short words spelled out, for where there is room (the ticket): `Market-neutral via Tori` names a row
 * and explains nothing. `name` is the word in full, `how` what pays the rate, `risk` what can take
 * it away. About the MECHANISM, never one issuer: a product's own facts are its note's.
 */
export const MECHANISM_DETAIL: Record<Mechanism, { name: string; how: string; risk: string }> = {
  lending: { name: 'Lending', how: 'Lent out to borrowers, who pay interest on it.', risk: 'The rate moves with the demand to borrow, and a loan whose collateral cannot be sold in time is a loss.' },
  staking: { name: 'Staking', how: 'Staked to help run the network, which pays rewards for it.', risk: 'A validator that misbehaves is fined, and the staked token can trade under the coin it stands for.' },
  restaking: { name: 'Restaking', how: 'Staked, then pledged again to secure other services, which pay on top of the staking rewards.', risk: 'Every service it secures can fine it, on top of what staking itself risks.' },
  'basis-trade': { name: 'Basis trade', how: 'Holds a coin and bets against it with futures in the same size, so its price cancels out. What is left is the fee futures traders pay to stay in their bets.', risk: 'That fee can turn negative, and the trade leans on the exchanges that hold the futures.' },
  treasuries: { name: 'US Treasuries', how: 'Holds short-term US government debt and passes its interest on.', risk: 'The rate follows US interest rates, and the fund and its custodian sit off-chain.' },
  'private-credit': { name: 'Private credit', how: 'Lent off-chain to companies or consumers, who pay interest on it.', risk: 'A borrower can default, and getting the money back out can take time.' },
  reinsurance: { name: 'Reinsurance', how: 'Backs insurance contracts and earns the premiums insurers pay for that.', risk: 'A year of large claims is a loss, and the money is tied up while a contract runs.' },
  dividends: { name: 'Stock dividends', how: 'Holds preferred shares and passes their dividends on.', risk: 'The shares can fall in price, and a dividend can be cut or skipped.' },
  'hedged-trading': { name: 'Market-neutral trading', how: 'A trading desk runs several trades that each pair a buy with an equal sell, such as futures against the coin, the same coin on two exchanges, or two lending rates. It keeps the gap between the two sides, so the rate does not need prices to rise.', risk: 'The gaps can close or turn into losses when markets move fast, and the desk holds the money on exchanges: its results are its own to report, not readable on-chain.' },
  'perp-lp': { name: 'Perp exchange liquidity pool', how: 'The pool is the other side of every bet on a perpetual-futures exchange (Jupiter’s JLP, Hyperliquid’s HLP). It earns the exchange’s trading fees and what traders lose.', risk: 'It pays out what traders win, so a run of winning traders is a loss, and a pool that holds coins moves with their prices.' },
  mixed: { name: 'Mixed strategies', how: 'The issuer spreads the money over several sources, such as lending, government debt and trading.', risk: 'The issuer can change the mix, and each part carries its own risk.' },
}
/** A mechanism spelled out, with what pays it in the name where the token names one thing (`STRC dividends`). */
export const mechanismDetail = (m: Mechanism, subject?: string): { name: string; how: string; risk: string } =>
  subject ? { ...MECHANISM_DETAIL[m], name: mechanismWords(m, subject).word } : MECHANISM_DETAIL[m]

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
