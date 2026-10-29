import { normAddr } from './address'
import { bookKey, bookOpen, type LoopStrategy, type SimpleStrategy, type Strategy } from './strategies'
import type { Holding } from './positions'

/**
 * Rolling a fixed-term position into a later term of the same market, so the money keeps its
 * rate past the date instead of falling out of it. Three shapes, each built differently:
 *
 * - `lend`: a fixed-rate deposit on a book (Midnight, Term — tickets/0013). No roll endpoint: the
 *   ticket builds the exit (a sale to the book before the date, a redemption after it) and a lend to
 *   a later date of the same book, as one ladder — one signature where the wallet batches. Term has
 *   no exit before its date, so it rolls only once the date has passed.
 * - `midnight-loan`: a loop whose debt falls due on a date (Morpho Midnight). One transaction
 *   (`loopMigrate`): a flash repays the old date, the collateral moves over, the later date's
 *   lenders fund the new loan. Same collateral, same loan token — no swap.
 * - `lista-loan`: a Lista broker loan re-fixed into a new term (`loopRefinance`), one transaction,
 *   from a running fixed loan or from the variable part a lapsed term left.
 */
export type RollKind = 'lend' | 'midnight-loan' | 'lista-loan'

const DAY = 86_400, YEAR = 365 * DAY
/** what a lend roll keeps back from the sale's estimate, so the new lend never asks for more than the sale paid — the sale's own bound */
export const ROLL_HEADROOM = 0.005
/** ...and from a redeemed face: exact, but a book lend's boundary fill rounds its units UP and can pull a hair over the amount asked */
export const REDEEM_HEADROOM = 0.001
/** the address a `LENDER:chainId:address` uid ends in */
const tail = (uid: string | undefined) => normAddr(uid?.split(':').pop() ?? '')
export const isMidnightUid = (uid: string | undefined) => !!uid?.startsWith('MORPHO_MIDNIGHT_')

/** How a held position rolls, if it does at all. Paper keeps no roll op, and a sub-account the API cannot build for has nothing to roll. */
export function rollKindOf(h: Holding, s: Strategy | null): RollKind | null {
  if (h.paper || h.subAccount?.unsupported) return null
  if (h.kind === 'simple') return h.bookLoan || (s?.kind === 'simple' && !!s.book) ? 'lend' : null
  if (isMidnightUid(h.debtUid) && isMidnightUid(h.collateralUid)) return 'midnight-loan'
  if (s?.kind === 'loop' && s.terms?.length && h.debtUid) return 'lista-loan'
  return null
}

/** The later maturities of the book a held lend sits in that take a deposit now, soonest first. */
export function lendRollTargets(src: SimpleStrategy, rows: SimpleStrategy[], now = Date.now() / 1000): SimpleStrategy[] {
  if (!src.book || !src.maturity) return []
  const k = bookKey(src), seen = new Set<string>()
  return rows.filter((r) => {
    if (seen.has(r.earnUid) || r.earnUid === src.earnUid || !r.book || !r.maturity || r.maturity <= src.maturity! || bookKey(r) !== k || !bookOpen(r, now)) return false
    seen.add(r.earnUid); return true
  }).sort((a, b) => a.maturity! - b.maturity!)
}

/**
 * The later dates a held Midnight loan can roll into: the same pair (collateral token and loan
 * token) on the same chain, a market of its own, due after the held one and more than a day out.
 * The catalogue lists a date only while lenders offer on it (`classifyPair`), so each is fundable
 * as of its last read — the build still takes the book as it stands.
 */
export function loanRollTargets(h: Holding, loops: LoopStrategy[], now = Date.now() / 1000): LoopStrategy[] {
  if (!h.debtUid || !h.collateralUid) return []
  const coll = tail(h.collateralUid), debt = tail(h.debtUid), held = h.debtUid.toLowerCase(), seen = new Set<string>()
  return loops.filter((l) => {
    const k = l.marketShortUid.toLowerCase()
    if (seen.has(k) || k === held || l.chainId !== h.chainId || !l.dueAt || !isMidnightUid(l.marketShortUid)) return false
    if (tail(l.marketLongUid) !== coll || tail(l.marketShortUid) !== debt || l.dueAt <= Math.max(now + DAY, h.dueAt ?? 0)) return false
    seen.add(k); return true
  }).sort((a, b) => a.dueAt! - b.dueAt!)
}

/**
 * What a Lista loop can re-fix: each fixed loan on its own (`id` = its loanId), and the variable
 * part — what the account owes beyond its fixed loans, which is where a term's debt lands when it
 * ends. The market's unbound leg already counts every loan (`Holding.loans`), so it is the total.
 */
export function listaRollSources(h: Holding): { id?: string; debt: number; debtUsd: number }[] {
  const loans = h.loans ?? []
  const fixed = loans.reduce((a, l) => a + l.debt, 0)
  const total = h.debtAmount ?? 0
  // the debt token's price: off a loan where there is one, else the account's collateral less its equity
  const priced = loans.find((l) => l.debt > 0)
  const px = priced ? priced.debtUsd / priced.debt : total > 0 && h.collateralUsd != null ? Math.max(0, h.collateralUsd - h.valueUsd) / total : 0
  const variable = total - fixed
  return [...loans.map((l) => ({ id: l.id, debt: l.debt, debtUsd: l.debtUsd })), ...(variable > total * 0.001 && variable * px > 1 ? [{ debt: variable, debtUsd: variable * px }] : [])]
}

/**
 * A lend roll in numbers. Before the date the face is SOLD at the lenders' rate for the days left
 * (`sellApr`, the borrow side of the held book), and `ROLL_HEADROOM` of the estimate stays in the
 * wallet; after it the face is redeemed whole and all but `REDEEM_HEADROOM` of it is lent. The new face is what was lent plus
 * the later book's rate to its date. `null`s while the sale is not priced.
 */
export function lendRoll(o: { face: number; now: number; from: number; to: number; sellApr: number | null; lendApr: number | null }) {
  const matured = o.now >= o.from
  const proceeds = matured ? o.face : o.sellApr == null ? null : o.face / (1 + (o.sellApr / 100) * ((o.from - o.now) / YEAR))
  const lend = proceeds == null ? null : proceeds * (1 - (matured ? REDEEM_HEADROOM : ROLL_HEADROOM))
  const newFace = lend == null || o.lendApr == null ? null : lend * (1 + (o.lendApr / 100) * ((o.to - o.now) / YEAR))
  return { matured, proceeds, lend, left: proceeds != null && lend != null ? proceeds - lend : null, newFace }
}

/**
 * A Midnight loan rolled: what it owes now (the face, fixed when it was taken) is borrowed again
 * on the later date's book, so the new face is that plus the new book's rate from today to its date.
 * Rolled early the old interest is not refunded — a zero-coupon face is repaid whole.
 */
export const loanRoll = (o: { owed: number; now: number; to: number; borApr: number }) => o.owed * (1 + (o.borApr / 100) * ((o.to - o.now) / YEAR))
