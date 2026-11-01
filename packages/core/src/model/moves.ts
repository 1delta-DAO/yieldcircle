/**
 * A move on the feed, in words: what one transaction did (`describeBundle`), the leg it is about
 * (`primaryLeg`), the size it headlines (`headlineUsd`), and the Lite row it is about, which is
 * what a Copy on it opens (`rowOfTx`). Shared by the web's feed and Lite, and the phone.
 */
import type { TxBundle, TxLeg } from '../index/types'
import type { LiteRow } from './lite'
import { canonUid, protocolKeyOf, uidOf } from './uid'

/**
 * What one transaction DID, in one phrase.
 *
 * The index labels a bundle's legs `<side>/<kind>` (`supply/deposit`,
 * `borrow/borrow`), or just `transfer`. A loop arrives as a deposit AND a
 * borrow in the same transaction, and calling that "opened a loop" rather than
 * listing both is the difference between a feed and a log.
 */
/**
 * What happened, in a word. `desk` re-words it for a curated vault acting on
 * its depositors' behalf: a vault that moves money between two markets is
 * reallocating, and calling that "rebalanced" reads as a trader's decision
 * when it is an allocation decision made for other people's money.
 */
export function describeTx(kinds: Record<string, number>, desk?: boolean): { verb: string; cls: string } {
  if (desk) {
    const d = describeTx(kinds)
    const DESK: Record<string, string> = { rebalanced: 'reallocated', deposited: 'allocated', withdrew: 'pulled out', moved: 'moved funds' }
    return { ...d, verb: DESK[d.verb] ?? d.verb }
  }
  return plainVerb(kinds)
}
/**
 * {@link describeTx} for a whole bundle: a swap the index found (a venue
 * wrapping one lending receipt and unwrapping another, or a wallet's
 * collateral swap) reads as one, and a token issuer's reserve reads as the
 * token being minted or redeemed rather than as a wallet depositing.
 */
export function describeBundle(t: Pick<TxBundle, 'kinds' | 'subject' | 'swap'>): { verb: string; cls: string } {
  const side = (x: { symbol: string | null; assetGroup: string | null }[]) => x.map((s) => s.symbol ?? s.assetGroup ?? '?').join(' + ')
  if (t.swap) return { verb: `swapped ${side(t.swap.from)} → ${side(t.swap.to)}`, cls: 'k-move' }
  if (t.subject?.reason === 'wrapper') {
    const d = plainVerb(t.kinds)
    const W: Record<string, string> = { deposited: 'backed a mint', withdrew: 'paid a redemption' }
    return { ...d, verb: W[d.verb] ?? d.verb }
  }
  return describeTx(t.kinds, t.subject?.reason === 'desk')
}
function plainVerb(kinds: Record<string, number>): { verb: string; cls: string } {
  const bare = new Set<string>()
  for (const k of Object.keys(kinds)) bare.add(k.includes('/') ? k.slice(k.indexOf('/') + 1) : k)
  const has = (...ks: string[]) => ks.some((k) => bare.has(k))
  if (has('liquidated', 'liquidate')) return { verb: 'was liquidated', cls: 'k-liq' }
  const inSide = has('deposit', 'supply', 'mint')
  const outSide = has('withdraw', 'redeem', 'redeemed', 'burn')
  if (inSide && has('borrow')) return { verb: 'opened a loop', cls: 'k-borrow' }
  if (outSide && has('repay')) return { verb: 'closed a loop', cls: 'k-repay' }
  if (has('borrow')) return { verb: 'borrowed', cls: 'k-borrow' }
  if (has('repay')) return { verb: 'repaid', cls: 'k-repay' }
  if (inSide && outSide) return { verb: 'rebalanced', cls: 'k-move' }
  if (inSide) return { verb: 'deposited', cls: 'k-in' }
  if (outSide) return { verb: 'withdrew', cls: 'k-out' }
  if (has('transfer', 'transfer_in', 'transfer_out')) return { verb: 'moved', cls: 'k-move' }
  if (has('accrual')) return { verb: 'accrued', cls: 'k-move' }
  return { verb: [...bare][0] ?? 'moved', cls: 'k-move' }
}

/**
 * The leg a card is ABOUT: the biggest supply-side leg, else the biggest leg.
 *
 * `only` is the active protocol filter. A bundle is a whole TRANSACTION, and
 * the index keeps every leg of one that matched — so a six-leg transaction
 * that touched Morpho and Spark is returned in full when Morpho is picked.
 * Without this the card could headline the Spark leg and read as though the
 * filter had leaked. Preferring a leg the filter chose makes the card explain
 * why it is there, while the other legs stay in the bundle where they belong.
 */
export function primaryLeg(t: TxBundle, only?: string[]): TxLeg | undefined {
  const size = (l: TxLeg) => Math.abs(l.amountUsd ?? 0)
  const wanted = only?.length
    ? t.legs.filter((l) => only.includes(protocolKeyOf(l.lenderKey)))
    : []
  const pool = wanted.length ? wanted : t.legs
  const supply = pool.filter((l) => l.side !== 'borrow')
  const pick = (supply.length ? supply : pool)
    .slice()
    .sort((a, b) => size(b) - size(a))[0]
  return pick ?? t.legs[0]
}
/**
 * The size a row headlines. `volumeUsd` adds every leg, and on a loop that
 * counts the borrowed money twice: it is borrowed AND posted as collateral in
 * the same transaction, so a $50k collateral / $50k debt loop read '$100k' and
 * five loops on one wallet looked like five duplicates of a bigger trade. When
 * a bundle carries a debt leg beside a supply-side leg, the headline is the
 * supply side (the position's size) and the debt is stated beside it, never
 * added. A bundle with no debt leg, or whose supply side is unpriced, keeps
 * `volumeUsd`.
 */
export function headlineUsd(t: TxBundle): { usd: number | null; debtUsd: number | null; debtWord: string } {
  const legs = t.legs.filter((l) => !l.passthrough && l.kind !== 'accrual')
  const debt = legs.filter((l) => l.side === 'borrow')
  const held = legs.filter((l) => l.side !== 'borrow')
  const sum = (xs: TxLeg[]) => xs.reduce<number | null>((a, l) => (l.amountUsd == null ? a : (a ?? 0) + Math.abs(l.amountUsd)), null)
  const heldUsd = sum(held)
  if (!debt.length || heldUsd == null) return { usd: t.volumeUsd, debtUsd: null, debtWord: '' }
  const debtWord = debt.some((l) => l.kind === 'borrow') ? 'borrowed' : 'repaid'
  return { usd: heldUsd, debtUsd: sum(debt), debtWord }
}

/**
 * The Lite row a feed move is about, when Lite carries it: a loop by its two markets, a deposit by
 * its market — what a Copy on the move opens.
 */
export function rowOfTx(t: TxBundle, rows: LiteRow[]): LiteRow | null {
  const uid = (u?: string | null) => (u ? canonUid(u)?.toLowerCase() ?? u.toLowerCase() : '')
  const supply = t.legs.filter((l) => l.side !== 'borrow' && l.side !== 'debt').map((l) => uid(l.marketUid))
  const debt = t.legs.filter((l) => l.side === 'borrow' || l.side === 'debt').map((l) => uid(l.marketUid))
  for (const r of rows) {
    const s = r.s
    if (s.kind === 'loop' ? supply.includes(uid(s.marketLongUid)) && debt.includes(uid(s.marketShortUid)) : !debt.length && supply.includes(uid(uidOf(s)))) return r
  }
  return null
}
