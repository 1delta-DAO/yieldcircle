/**
 * A deposit already in a loop's collateral market, levered where it sits (tickets/0015).
 *
 * A lending account with supply and no debt is a plain deposit per leg (`holdingsFrom`). When that
 * leg is a loop's collateral market, the loop can start from it: borrow the debt, buy more
 * collateral, all into the same account — the `/loop/leverage` build with no margin, which is the
 * same step `ManageLoop` takes on a running loop. Borrowing does the same with `depositsAsLoans`.
 */
import { isSvmChain } from './address'
import type { Holding } from './positions'
import type { LoopStrategy } from './strategies'

const same = (a: string | undefined, b: string | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

/**
 * Lenders whose loop build switches the collateral on itself (Euler's EVC batch, Venus, Aave V4 in
 * the bundle), whose flags are fixed (Morpho, Lista), or that have no such flag. Everything else
 * with the flag off is an Aave-type pool, where a later supply never turns it on: the borrow would
 * revert, so the ticket asks `/lending/enable-collateral` first.
 */
const SWITCHES_ITSELF = /^(EULER|VENUS|AAVE_V4|MORPHO|LISTA|DOLOMITE|FLUID|SILO|INIT|GEARBOX|COMPOUND_V3|KAMINO|JUPITER|SAVE)/i
/** The deposit backs nothing yet and the loop build will not change that: switch it on first. */
export const needsCollateralOn = (h: Pick<Holding, 'collateralEnabled' | 'lender'>) => h.collateralEnabled === false && !!h.lender && !SWITCHES_ITSELF.test(h.lender)

/**
 * Why this deposit cannot be levered in place, in words, or null when it can. Each is a venue rule
 * the build follows (worker-api, checked 2026-10-21): not a guess about what might fail.
 */
export function cannotLeverInPlace(h: Holding): string | null {
  const lender = h.lender ?? ''
  if (h.subAccount?.unsupported) return h.subAccount.unsupported
  // a Solana lever adjusts an obligation or a position NFT to a target, and a lend-only deposit has neither yet
  if (isSvmChain(h.chainId)) return 'On Solana, YieldCircle cannot lever a deposit where it sits yet.'
  if (/^GEARBOX/i.test(lender)) return 'Gearbox credit accounts are not levered in place here yet.'
  if (/^(MORPHO|LISTA)/i.test(lender) && h.collateralEnabled === false) return 'This supply lends to borrowers; it is not collateral and cannot be borrowed against.'
  if (/^DOLOMITE/i.test(lender)) {
    const id = h.accountId ?? '0'
    if (id === '0') return 'Dolomite’s main account only lends: borrowing happens in a separate account.'
    const iso = id.startsWith('iso:') ? Number(id.split(':').pop()) : null
    if (iso != null && !(iso >= 100)) return 'This isolation account only lends: borrowing happens in a separate account.'
  }
  return null
}

/** The account's other deposits, which back a debt there too: the ticket's health counts the pair alone. */
function besideIn(h: Holding, holdings: Holding[]): NonNullable<Holding['others']> {
  if (!h.accountKey) return []
  return holdings.filter((x) => x.kind === 'simple' && x.key !== h.key && x.accountKey === h.accountKey && x.collateralEnabled !== false && x.valueUsd >= 0.5)
    .sort((a, b) => b.valueUsd - a.valueUsd)
    .map((x) => ({ side: 'collateral' as const, symbol: x.symbol, amount: x.amount, usd: x.valueUsd }))
}

/**
 * The wallet's deposits in this loop's collateral market, on its chain, with nothing borrowed —
 * matched on the market uid (which also fixes the lender; a Morpho market's collateral uid is never
 * its loan side's). `lever`: read as a 1× loop the ticket can push up (`putUp`), one per sub-account,
 * each keeping its `accountId`. `beside`: the ones a venue rule keeps out, with why, so the ticket
 * can say the new loop opens next to them. Paper deposits are left out: a paper loop opens from the bank.
 */
export function depositsAsLoops(s: LoopStrategy, holdings: Holding[]): { lever: Holding[]; beside: { h: Holding; why: string }[] } {
  const lever: Holding[] = [], beside: { h: Holding; why: string }[] = []
  for (const h of holdings) {
    if (h.kind !== 'simple' || h.paper || h.chainId !== s.chainId || !same(h.marketUid, s.marketLongUid) || h.valueUsd < 0.5) continue
    const why = cannotLeverInPlace(h)
    if (why) { beside.push({ h, why }); continue }
    const others = besideIn(h, holdings)
    lever.push({
      ...h, kind: 'loop', putUp: true, leverage: 1, health: null,
      label: `${h.symbol} / ${s.debt} loop`, collateralUid: h.marketUid, debtUid: s.marketShortUid, debtSymbol: s.debt, debtDecimals: s.decimalsShort, debtAmount: 0,
      collateralAddress: h.assetAddress ?? s.collateralAddress, debtAddress: s.debtAddress, collateralUsd: h.valueUsd,
      ...(others.length ? { others } : {}),
    })
  }
  return { lever, beside }
}
