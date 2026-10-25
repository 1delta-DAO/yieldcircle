/**
 * A ticket's rules that are not screens: what a deposit can be paid with, which venues take the gas
 * coin, whether a quote has a route, how safe a leverage is in a word, the term and tenor a fixed
 * loop opens on. Shared by the web's ticket and the phone's (`@yieldcircle/app/tickets`).
 */
import { isNativeAddress, nativeDecimals, nativeSymbol, wrapsNative } from './positions'
import { normAddr } from './address'
import { nativeAsset } from '../sdk/api'
import { isSvmTx, type LoopActions } from '../sdk/types'
import type { LoopTenor, LoopTerm, SimpleStrategy } from './strategies'

/**
 * What a plain deposit can be paid with: the market's own token, and — into a row whose token is
 * the chain's wrapped gas coin — the gas coin itself, which the API wraps inside the deposit when
 * asked with `payAsset` = {@link nativeAsset}. Leaving `payAsset` out asks for the ERC-20: an approve of
 * WHYPE and a deposit that reverts for a wallet holding HYPE. Native first, so a wallet holding
 * neither is offered the coin it is likelier to get.
 */
/**
 * An idle row against a pay option. The option spells the gas coin as the API takes it ({@link nativeAsset}),
 * a balance row may use another alias (`0xEeee…`, `native`) — so the coin read 0 in the chips.
 */
export const sameToken = (held: string, want: string) => held === want || (isNativeAddress(held) && isNativeAddress(want))
export type PayRole = 'native' | 'token'
export interface PayOption { role: PayRole; address: string; symbol: string; decimals: number }
export function payOptions(s: SimpleStrategy): PayOption[] {
  const token: PayOption = { role: 'token', address: normAddr(s.assetAddress), symbol: s.assetSymbol, decimals: s.decimals }
  const native = s.nativeIn ?? (wrapsNative(s.chainId, s.assetAddress) && !startsAny(s.venueKey, NO_NATIVE_DEPOSIT))
  return native ? [{ role: 'native', address: nativeAsset(s.chainId), symbol: nativeSymbol(s.chainId), decimals: nativeDecimals(s.chainId) }, token] : [token]
}
/**
 * The API answers "can the coin go in / come out here" itself (`acceptsNative`, read into
 * `s.nativeIn` / `s.nativeOut`). These lists are only for the window before the flag reaches the
 * listing (docs/native-routes.md): what the worker serves without it. Every venue with no payable
 * entry now takes the coin as a wrap step, so what is left is structural — the Liquity family needs
 * a `troveId` an earn request never carries, and Fluid lists the coin as its own token, never the
 * wrapper. The exits refuse more: TermMax and Term price theirs at execution, and the single-token
 * vaults (the savings registry, Lagoon) pay their token only.
 */
export const LIQUITY_FAMILY = ['LIQUITY', 'FELIX', 'NERITE', 'QUILL', 'EBISU', 'SONETA', 'ENOSYS_LOANS']
export const NO_NATIVE_DEPOSIT = [...LIQUITY_FAMILY, 'FLUID']
export const NO_NATIVE_WITHDRAW = [...NO_NATIVE_DEPOSIT, 'TERMMAX', 'TERM_FINANCE', 'vault.savings', 'vault.lagoon']
/**
 * Aave forks whose native gateway withdraws `max` from an aToken transfer that rounds 1 wei short,
 * so a native FULL exit reverts every time (fork-checked 2026-09-28, docs/native-routes.md).
 * `lender prefix → chains`. The ERC-20 exit works there; the coin is withheld for a full exit only.
 */
export const NATIVE_MAX_ROUNDS: Record<string, string[]> = {
  XLEND: ['10', '8453'], GRANARY: ['1'], VALAS: ['56'], RADIANT_V2: ['1'], PRIME_FI: ['50'], PLOUTOS: ['43111'],
  RMM: ['100'], ZEROLEND: ['169'], MOLEND: ['34443'], MERIDIAN: ['167000'],
}
export const startsAny = (key: string, prefixes: string[]) => prefixes.some((v) => key.startsWith(v))
export const nativeMaxRounds = (key: string, chainId: string) => Object.entries(NATIVE_MAX_ROUNDS).some(([v, cs]) => key.startsWith(v) && cs.includes(chainId))
/**
 * Asked to pay in the gas coin, a bundle that moves none of it is a bundle for the ERC-20 — the
 * approve-then-revert this whole choice exists to avoid. Some leg must carry `value` (a gateway
 * deposit, a bundler call, or Gearbox's wrap step).
 */
export function paysNative(a: LoopActions | null | undefined): boolean {
  // an svm step has no `value` and resolves its lamport transfers inside the message: trust it
  return [...(a?.permissions ?? []), ...(a?.transactions ?? []), ...(a?.alternatives ?? []).slice(0, 1)].some((t) => { if (isSvmTx(t)) return true; try { return BigInt(t.value || '0') > 0n } catch { return false } })
}
/**
 * A loop answer with no quote has no swap route: `quotes: []`, no transactions, and still the
 * lender's permissions (Lista's borrow approval), which on their own only cost the user gas.
 */
export const hasRoute = (d: { quotes?: unknown[] } | null | undefined) => !!d?.quotes?.length
export const NO_ROUTE = 'No swap route at this size right now, so there is nothing to sign. Try another amount or leverage, or come back later.'

/**
 * How far from the line, in a word — the same bands as the tier cards' colours (red under 5 %,
 * amber under 10 %), so the hero and the card it came from never disagree.
 */
export const safetyOf = (drop: number): { word: string; cls: 'bad' | 'warn' | 'ok' } =>
  drop < 0.05 ? { word: 'Tight', cls: 'bad' } : drop < 0.1 ? { word: 'Narrow', cls: 'warn' } : drop < 0.2 ? { word: 'Comfortable', cls: 'ok' } : { word: 'Wide', cls: 'ok' }

/**
 * The term a fixed-rate loop opens with before anyone picks: the cheapest, and the longest of equals —
 * slisBNB/WBNB charges 0.5 % for 7, 14 and 30 days alike, and a shorter lock of the same rate only
 * moves the day the debt drops to the variable rate closer.
 */
export const defaultTerm = (ts: LoopTerm[]) => [...ts].sort((a, b) => a.apr - b.apr || b.days - a.days)[0]

/** The tenor a Loopscale loop opens with before anyone picks: the cheapest quoted, the longest of equals; the shortest while nothing has answered. */
export const defaultTenor = <T extends { tenor: LoopTenor; offer: { apr: number } | null }>(qs: T[]) =>
  [...qs].filter((q) => q.offer).sort((a, b) => a.offer!.apr - b.offer!.apr || b.tenor.days - a.tenor.days)[0] ?? qs[0]

/** A payback in words: hours under a day, then whole days (rounded up — it is not earned back before). */
export const daysWord = (d: number) => (d <= 0 ? 'at once' : d < 1 ? `${Math.max(1, Math.ceil(d * 24))} h` : `${Math.ceil(d)} day${Math.ceil(d) === 1 ? '' : 's'}`)

export const tenorWord = (t: LoopTenor) => (t.days === 1 ? '1 day' : t.days === 7 ? '1 week' : t.days === 30 ? '1 month' : `${t.days / 30} months`)

export const dayOf = (days: number) => new Date(Date.now() + days * 86400_000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export const DAY_S = 86_400

/** `25 Dec` — a picker's date, the year said elsewhere */
export const dayMonth = (t: number) => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/**
 * A full close is sized off a market quote taken seconds before the block. INTEREST: the debt grows
 * and the price moves in between, so a sale that only just covers it is refused. KEEP: keeping the
 * collateral sells what repays the debt plus a margin of twice the slippage (never under 0.4 %, the
 * interest pad's double), and the surplus comes back in the debt token.
 */
export const CLOSE_INTEREST_PAD = 0.002

export const closeKeepPad = (slipBp: number) => Math.max((2 * slipBp) / 10_000, 2 * CLOSE_INTEREST_PAD)

/**
 * What "Get" buys for a loop: the chosen margin token — and, when it is the gas coin or its wrapper
 * and the venue takes the coin, both of them, the coin first (no approval to pay it in).
 */
export function getForms<T extends { role: string; address: string; symbol: string }>(opts: T[], chosen: T, chainId: string): T[] {
  const coin = opts.find((o) => o.role === 'native')
  const wrapped = opts.find((o) => o.role !== 'native' && wrapsNative(chainId, o.address))
  return coin && wrapped && (chosen === coin || chosen === wrapped) ? [coin, wrapped] : [chosen]
}
