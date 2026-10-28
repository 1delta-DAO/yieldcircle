import React from 'react'
import { useSignTypedData } from 'wagmi'
import { unitOf } from '@yieldcircle/core/model/assets'
import { DEFAULT_TIER, TIERS, borrowAtSize, curveRateNow, customRange, healthAt, liqBuffer, netAprAtLeverage, toRaw, type TierId } from '@yieldcircle/core/model/leverage'
import { fromUnits, payRaw, portion, unitsOf } from '@yieldcircle/core/model/amount'
import { shownDp } from '@yieldcircle/core/model/lite'
import { loopRewards, type LoopStrategy, type LoopTerm } from '@yieldcircle/core/model/strategies'
import type { LoopPayAsset } from '@yieldcircle/core/sdk/types'
import type { Holding, Idle } from '@yieldcircle/core/model/positions'
import { loopOpen, nativeAsset } from '@yieldcircle/core/sdk/api'
import { isSvmChain, normAddr } from '@yieldcircle/core/model/address'
import { isSavings } from '@yieldcircle/core/model/nature'
import { clampRate, rateToWad, recommendedOf, userSetOfBook } from '@yieldcircle/core/model/userSetRate'
import { withSignature } from '@yieldcircle/core/sdk/signedAction'
import { num, usd, usdShort } from '@yieldcircle/core/model/format'
import { NO_ROUTE, dayOf, defaultTenor, defaultTerm, hasRoute, paysNative, safetyOf, sameToken, tenorWord } from '@yieldcircle/core/model/ticket'
import { bookAprAt, useIrm, useLendingBooks, useLoopPayAssets, useLoopQuote, useTenorQuotes } from '../sdk/queries'
import { slippageFor, useSettings } from '../state/Settings'
import { useSticky, useStickyAmount } from '../sticky'
import { stepsFrom, useTicketLadder } from '../ladder'
import { useSession } from '../session'
import { collateralOnFirst } from './collateral'
import { loopPlan } from './paperPlans'
import { usePaperView } from './paper'
import { useValueCheck } from './valueCheck'

/**
 * The borrow rate at THIS ticket's size, off the debt market's own curve. The
 * list quotes every loop at $10k, and on a thin market that one quote can be
 * the whole free liquidity — shMON/WMON on Euler read 35 % against a 6 % spot.
 * While the curve loads the spot rate stands in; a market with no curve keeps
 * the $10k quote.
 */
export function useBorrowAt(s: LoopStrategy | null, term?: LoopTerm, bookApr?: number) {
  // an order book has no curve: its rate is what the size fills at (a Loopscale tenor's offer, a Midnight book's levels)
  const books = !!s && (!!s.tenors || !!s.dueAt)
  const irm = useIrm(s?.marketShortUid, !!s && !books)
  // a fixed term costs its card rate at any size: the curve is where the debt goes AFTER the term
  return (extraDebtUsd: number) => (!s ? 0 : term ? term.apr : books ? bookApr ?? s.borSpot : s.terms ? s.borSpot : irm.isPending ? s.borSpot : borrowAtSize(s.borSpot, s.bor, extraDebtUsd, irm.data))
}

/**
 * A loop's ticket, everything but the screen (the web's `LoopTicket`, the phone's loop sheet): what
 * the margin is paid with, the leverage (a tier, the copied wallet's, or one's own), the term or
 * tenor a fixed loop borrows for, the quote and its route, the entry cost and its payback, and the
 * ladder that builds and signs the open. `lite`: Lite picks the leverage for the reader.
 */
export function useLoopTicket(s0: LoopStrategy, idle: Idle[], allIdle: Idle[], holding: Holding | null, { lite, copyLev }: { lite?: boolean; copyLev?: number } = {}) {
  const session = useSession()
  const account = session.account, isConnected = !!session.isConnected
  const actorOn = session.actorOn ?? (() => undefined)
  // a dated pair (Midnight) is one row with a date per maturity, each its own market: the picked date
  // IS the strategy from here on — its lender, its market uids, its top of book
  const dates = s0.dates
  const [dateId, setDateId] = useSticky<string | null>(`t:${s0.id}:date`, null)
  const s = dates?.find((d) => d.id === dateId) ?? s0
  // every loop on the menu is a carry (one money); an exposure loop (JLP against dollars) is not
  const slip = slippageFor(useSettings().st, isSavings(s.nature))
  const actor = actorOn(s.chainId)
  const [getOpen, setGetOpen] = React.useState(false)
  const unit = unitOf(s.asset)
  // pay with the collateral or the debt token, whichever the venue accepts and the wallet holds more of
  const pay = useLoopPayAssets(s)
  const opts = React.useMemo(() => {
    const coll = { role: 'collateral' as const, symbol: s.holds, address: s.collateralAddress, decimals: s.decimalsLong, price: s.priceLong ?? 0, logo: s.logoLong }
    const debt = { role: 'debt' as const, symbol: s.debt, address: s.debtAddress, decimals: s.decimalsShort, price: s.priceShort ?? 0, logo: s.logoShort }
    // A role can carry MORE than one token (Alchemix: the MYT share AND its underlying USDC both fund
    // the collateral), so a row whose address is not the market's own token takes the server's metadata
    // — copying the side's symbol / decimals onto it showed USDC as "mixUSDC" and scaled it by 1e12.
    const own = (side: typeof coll | typeof debt, a: LoopPayAsset) => !a.address || normAddr(side.address) === normAddr(a.address) ? { ...side, address: a.address || side.address } : { ...side, address: a.address, symbol: a.symbol ?? side.symbol, decimals: a.decimals ?? side.decimals, price: 0, logo: a.logoURI }
    const list = pay.data ? pay.data.payAssets.map((a) => a.role === 'collateral' ? own(coll, a) : a.role === 'debt' ? own(debt, a) : { ...(a.wrapsRole === 'debt' ? debt : coll), role: 'native' as const, address: nativeAsset(s.chainId), symbol: a.symbol || 'ETH', logo: a.logoURI }) : [coll, debt]
    return list
  }, [pay.data, s.id])
  // a venue that takes no margin with the open (the server lists none): say so rather than a dead button
  const noPay = !!pay.data && pay.data.payAssets.length === 0
  // the pay-with chips read the exact token: native is the zero address in the balances (and the API), wrapped is its own entry
  const balOf = (address: string, _symbol: string) => idle.find((i) => sameToken(i.address, normAddr(address)))
  // chosen by ADDRESS: two pay rows can share a role (see `own` above)
  const [payAddr, setPayAddr] = useSticky<string | null>(`t:${s0.id}:payaddr`, null)
  // with nothing held, Lite asks for the plain money (the debt: dollars, ether), never a PT's or a share's name
  const liteTicket = !!lite
  const chosen = opts.find((o) => !!payAddr && normAddr(o.address) === normAddr(payAddr)) ?? [...opts].sort((a, b) => (balOf(b.address, b.symbol)?.usd ?? 0) - (balOf(a.address, a.symbol)?.usd ?? 0) || (liteTicket ? Number(b.role === 'debt') - Number(a.role === 'debt') : 0))[0]
  const bal = chosen ? balOf(chosen.address, chosen.symbol) : undefined
  const price = chosen?.price || bal?.price || (unit === '$' ? 1 : 0)
  // Lite with a wallet starts from what the wallet holds (all of it up to $1,000), never on "more than
  // you have"; without one, $1,000 shows what the rate means in dollars
  const liteSeed = !!lite && !!session.account
  const [amt, setAmt] = useStickyAmount(`t:${s0.id}:amount`, () => liteSeed ? { text: '0' } : fromUnits(unit === '$' ? 1000 : 1))
  const seeded = React.useRef(false)
  React.useEffect(() => {
    if (!liteSeed || seeded.current || !bal || !chosen || unitsOf(amt) > 0) return
    seeded.current = true
    const usdHeld = bal.amount * (price || 0)
    if (!(bal.amount > 0)) return
    const dollar = unit === '$' || (price > 0.9 && price < 1.1)
    setAmt(price > 0 && usdHeld > 1000 ? fromUnits(Number((1000 / price).toFixed(shownDp(dollar)))) : portion(bal, 100, chosen.decimals, shownDp(dollar)))
  }, [liteSeed, bal?.amount, chosen?.address, price]) // eslint-disable-line react-hooks/exhaustive-deps
  const amount = unitsOf(amt)
  // the margin as sent: Max is the exact balance (a float Max overshot it by 166,624 wei and the loop reverted, tickets/0014)
  const marginRaw = chosen && amount > 0 ? payRaw(amt, chosen.decimals, bal) : undefined
  const [tier, setTier] = useSticky<TierId>(`t:${s0.id}:tier`, isSavings(s.nature) ? DEFAULT_TIER : 'defensive')
  // a number of your own is behind the slider icon, never the default: the tiers are the advice,
  // the slider is for someone who already knows the number they want. `null` = on the tiers
  const [custom, setCustom] = useSticky<number | null>(`t:${s0.id}:lev`, null)
  const [lo, hi] = customRange(s.maxLev), canCustom = hi > lo + 0.05
  // a copy opens on the copied wallet's own leverage, held inside what this venue lets a new loop take;
  // any tier or the slider leaves it, and its tile brings it back
  const copyL = copyLev && copyLev > 1.05 ? Math.round(Math.min(hi, Math.max(lo, copyLev)) * 100) / 100 : null
  const [onCopy, setOnCopy] = React.useState(copyL != null)
  const pickTier = (t: TierId) => { setOnCopy(false); setCustom(null); setTier(t) }
  // Lite picks for the reader: the copied leverage on a copy, the Balanced tier otherwise — and
  // leaves the tier it used behind, so Details opens Pro's ticket on the same number
  React.useEffect(() => { if (lite) { setCustom(null); setTier(DEFAULT_TIER) } }, [lite]) // eslint-disable-line react-hooks/exhaustive-deps
  // adding to a running loop keeps its own shape — its leverage, never above Balanced — so one Add
  // cannot quietly push a ×2.4 position to ×5.6
  const heldL = holding?.leverage && holding.leverage > 1.05 ? Math.round(Math.min(hi, Math.max(lo, Math.min(holding.leverage, s.tiers[DEFAULT_TIER]))) * 100) / 100 : null
  // Lite's "More choices": a tier the reader picked there, in Lite's words (`liteTiers`); none = Lite's own pick
  const [liteTier, setLiteTier] = React.useState<TierId | null>(null)
  const pickLiteTier = (t: TierId | null) => { setLiteTier(t); setTier(t ?? DEFAULT_TIER) }
  const L = lite ? heldL ?? (liteTier ? s.tiers[liteTier] : copyL ?? s.tiers[DEFAULT_TIER]) : onCopy && copyL != null ? copyL : custom != null && canCustom ? Math.min(hi, Math.max(lo, custom)) : s.tiers[tier]
  const E = amount * price, C = E * L, D = E * (L - 1)
  // a fixed-rate loop borrows for one term off the broker's card; `undefined` on a float loop
  const [termId, setTermId] = useSticky<string | null>(`t:${s0.id}:term`, null)
  const term = s.terms ? s.terms.find((t) => t.id === termId) ?? defaultTerm(s.terms) : undefined
  // a Loopscale loop borrows for one tenor, each its own order book: every tenor is quoted at this size
  const tenorQs = useTenorQuotes(s, E, L, actor, slip)
  const [tenorId, setTenorId] = useSticky<string | null>(`t:${s0.id}:tenor`, null)
  // the pick holds while it is quoting; a tenor nobody offers at this size falls back to the default
  const picked = tenorQs.find((x) => x.tenor.id === tenorId)
  const tq = s.tenors ? (picked && (picked.offer || picked.pending) ? picked : defaultTenor(tenorQs)) : undefined
  const tenor = tq?.tenor, offer = tq?.offer ?? null
  // each tenor's lenders set their own liquidation threshold (JLP/USDC: 95 % for a day, 90 % for longer)
  const liqLtv = offer?.lqt || s.liqLtv
  // a rate the borrower sets (Liquity family, Flex): a NEW trove picks it here, off the live
  // redemption queue (model/userSetRate.ts); a running trove keeps its own. The feed's `bor` is the
  // queue's suggested pick, so a different pick shifts the borrow leg by the difference.
  const picksRate = !!s.userSet && !holding
  const [queueQ] = useLendingBooks(picksRate ? [s.marketShortUid] : [])
  const queueBook = queueQ?.book ?? null
  const urate = picksRate ? userSetOfBook(queueBook) ?? s.userSet! : null
  const suggested = recommendedOf(urate)?.apr
  const [rate0, setRate] = useSticky<number | null>(`t:${s0.id}:rate`, null)
  const rate = urate ? clampRate(urate, rate0 ?? suggested ?? s.borSpot) : null
  const rateShift = rate != null && suggested != null ? rate - suggested : 0
  // a dated book prices the debt at size: the levels this loan walks, for every maturity on offer
  const books = useLendingBooks(dates ? dates.map((d) => d.marketShortUid) : [])
  const debtTok = s.priceShort ? (E * (L - 1)) / s.priceShort : 0
  const bookOf = (d: LoopStrategy) => books.find((b) => b.uid === d.marketShortUid)
  const bookApr = s.dueAt ? bookAprAt(bookOf(s)?.book ?? null, debtTok) : null
  const bookShort = !!s.dueAt && !!bookOf(s)?.book && bookApr == null
  const due = s.dueAt ? new Date(s.dueAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  const dueDays = s.dueAt ? Math.max(0, Math.round((s.dueAt * 1000 - Date.now()) / 86400_000)) : 0
  const borAt0 = useBorrowAt(s, term, offer?.apr ?? bookApr ?? undefined)
  const borAt = (d: number) => borAt0(d) + rateShift
  const dep = s.depSpot, bor = borAt(D)
  const net = netAprAtLeverage(dep, bor, L), drop = liqBuffer(liqLtv, L), hf = healthAt(liqLtv, L)
  const netWorst = netAprAtLeverage(dep, bor + 2, L)
  // when the term ends the debt is not due: it moves to the market's variable rate until it is fixed again
  const irm = useIrm(s.marketShortUid, !!term)
  const after = term ? curveRateNow(irm.data) : null
  const netAfter = after != null ? netAprAtLeverage(dep, after, L) : null
  const ends = term ? dayOf(term.days) : ''
  const overLiquidity = s.borrowLiquidityUsd > 0 && D > s.borrowLiquidityUsd
  // adding to a loop the wallet already runs: the new debt lands in the same book, so the number that
  // matters is the whole position after — the existing debt is already in the curve's utilisation
  const Eh = holding && holding.valueUsd > 0 ? holding.valueUsd : 0, Lh = holding?.leverage && holding.leverage > 1 ? holding.leverage : 1
  const Lc = Eh > 0 ? (Eh * Lh + E * L) / (Eh + E) : L
  const netC = netAprAtLeverage(dep, bor, Lc), hfC = healthAt(liqLtv, Lc)
  // the VM's own signer, as the build below: a Solana loop quoted for the EVM address is quoted for nobody
  // the margin rides the preview too: a lender that checks health up front (Alchemix) cannot price a
  // loop with no collateral of its own, and every other lender's preview is more accurate with it
  const { q: q0, settling } = useLoopQuote(s, E, L, actor, slip, term?.id, tenor, chosen && marginRaw ? { asset: chosen.address, raw: marginRaw } : undefined)
  // while the slider or the amount is ahead of the debounce, the answer in hand is the last size's: it reads as quoting
  const q = { data: settling ? undefined : q0.data, error: settling ? null : q0.error, isFetching: q0.isFetching || settling }
  // the swap routes the API found for the leverage leg, best first; another is picked by its aggregator's
  // name, so the build (a fresh call) runs the same one wherever it lands in that answer's order
  const routes = q.data?.data?.quotes ?? []
  const [routeName, setRouteName] = React.useState<string | null>(null)
  const routeSel = Math.max(0, routes.findIndex((r) => r.deltas?.aggregator === routeName))
  const econ = (routeSel > 0 ? routes[routeSel]?.economics : null) ?? q.data?.data?.economics ?? routes[0]?.economics ?? null
  // Break-even: the entry cost over what the loop earns a day. The API's own where it prices the
  // carry (EVM). Its Solana quote leaves the carry null (worker-api `svmEconomics`, 2026-10-06), and
  // on a broker term it prices the debt at the market's variable rate, not the term's (2026-09-29):
  // there the payback is this ticket's own, off the net it shows. Null = never (no positive carry).
  const cost = econ?.entryCostUsd.total ?? 0
  const ownPayback = !econ ? null : cost <= 0 ? 0 : net > 0 && E > 0 ? cost / (E * net / 100 / 365) : null
  const payback = !econ ? null : term ? ownPayback : econ.breakEvenDays.total ?? ownPayback
  // the clock the payback runs against: the fixed debt's term, its due date, the PT's expiry
  const clockDays = term?.days ?? tenor?.days ?? (s.dueAt ? (s.dueAt * 1000 - Date.now()) / 86400_000 : s.expiry ? (s.expiry * 1000 - Date.now()) / 86400_000 : null)
  const clockWord = term ? `the ${term.days}-day term` : tenor ? `the ${tenorWord(tenor)} term` : s.dueAt ? `the loan's due date` : s.expiry ? 'maturity' : ''
  const simHf = q.data?.data?.simulation?.post?.healthFactor
  // answered, but with no route: the build would come back with nothing but an approval
  const noRoute = !!q.data && !hasRoute(q.data.data)
  // a Loopscale loan draws on ONE lender: too big for the deepest on this tenor, nothing opens. The API
  // says so in words and hands back the margin (USD, re-read in the pay token) and leverage that fit
  const short = tq?.short ?? null
  const fitAmount = short?.fit.margin?.usd && price > 0 ? short.fit.margin.usd / price : 0
  const fitLev = short?.fit.leverage ?? 0
  const fitTier = fitLev ? [...TIERS].reverse().find((t) => s.tiers[t.id] <= fitLev) : undefined
  const yearly = E * net / 100
  const key = [s.id, holding?.accountId ?? '', marginRaw ?? '', L, term?.id ?? '', tenor?.id ?? '', chosen?.address ?? '', actor ?? '', slip, routeName ?? '', rate ?? ''].join('|')
  const paper = usePaperView()
  const { signTypedDataAsync } = useSignTypedData()
  // on paper, what the chain would refuse is refused too (tickets/0006): a quote with a route, the
  // market's free liquidity, a dated book deep enough for the size
  const paperRefuse = !paper.active ? null
    : overLiquidity ? `The market has only ${usdShort(s.borrowLiquidityUsd)} of ${s.debt} free to borrow — lower the amount or the leverage.`
    : bookShort ? `The book does not hold ${usd(D)} of ${s.debt} at this date — borrow less or pick another date.`
    : q.isFetching && !q.data ? 'Quoting the route…'
    : !q.data || !hasRoute(q.data.data) ? 'No quote with a route at this size right now, so nothing can be opened — try another amount or leverage.'
    : null
  const ladder = useTicketLadder(key, s.chainId, async () => {
    const debtTokens = s.priceShort ? D / s.priceShort : 0
    const openParams = {
      collateralMarketUid: s.marketLongUid, debtMarketUid: s.marketShortUid, debtAmountRaw: toRaw(debtTokens, s.decimalsShort), slippageBp: slip, leverage: L, account: actor!,
      payAsset: chosen?.address, payAmountRaw: marginRaw, termId: term?.id, tenor,
      // a new user-set-rate trove opens at the picked rate (absent → the API's suggested pick)
      ...(rate != null ? { interestRate: rateToWad(rate) } : {}),
      // into the position the after-figures below are computed for, not a fresh account beside it
      accountId: holding?.accountId, simulate: !!holding,
    }
    const pre = await collateralOnFirst(holding, actor!)
    // a venue may answer a sign step first (`actions.signs`: Inverse's ALE borrows on a per-action permit); paper asks, never signs
    const env = await withSignature(await loopOpen(openParams), paper.active ? null : (td) => signTypedDataAsync(td as never))
    if (!hasRoute(env.data)) throw new Error(NO_ROUTE)
    if (chosen?.role === 'native' && !paysNative(env.actions)) throw new Error(`This loop does not take ${chosen.symbol} directly. Pay with another asset.`)
    const route = Math.max(0, (env.data?.quotes ?? []).findIndex((r) => r.deltas?.aggregator === routeName))
    return [...pre, ...stepsFrom(env.actions, `Open ${num(L, 2)}× loop${term ? ` · ${term.days}-day fixed` : tenor ? ` · ${tenorWord(tenor)} term` : s.dueAt ? ` · due ${due}` : ''}`, s.chainId, route)]
    // the swap's leftover lands in the wallet as either leg's token (Jupiter's exact-in fill on Solana)
  }, [s.marketLongUid, s.marketShortUid], [{ address: chosen?.address, symbol: chosen?.symbol }, { address: s.collateralAddress, symbol: s.holds }, { address: s.debtAddress, symbol: s.debt }],
    // on paper: the same margin, leverage and rates, and the quote's entry cost (a Solana quote prices none: 0)
    loopPlan(s, { into: holding, payToken: chosen?.address ?? '', amount, equityUsd: E, L, dep, bor, liqLtv, entryCostUsd: econ ? Math.max(0, cost - (econ.entryCostUsd.gas ?? 0)) : isSvmChain(s.chainId) && q.data ? 0 : null, quoting: q.isFetching, refuse: paperRefuse }),
    // the open's own build, unsigned, on either chain: the same call the quote makes
    true)
  // the open at market prices: your equity right after it is what you put in less the entry cost (`ValueCheck.tsx`)
  // …unless the prices the API measured it against are stale: then the swap is UNPRICED (the API left
  // its slippage out of `cost`), so the check reads 'unk' rather than a loss or a free entry
  const staleRef = econ?.referencePrices?.stale ? econ.referencePrices : null
  const vc = useValueCheck(staleRef ? 0 : E, econ && E > 0 && !staleRef ? E - cost : 0, `${key}|${cost}`)
  const more = !!bal && amount > bal.amount
  // the hero's two answers: the net, and how far from the line — in a word, the distance and the health factor
  const hfShown = simHf ?? hf, safe = safetyOf(drop)
  const rewardsNow = loopRewards(s, L)
  const fixedNote = term ? `fixed to ${ends}` : tenor ? `fixed for ${tenorWord(tenor)}` : s.dueAt ? `fixed to ${due}` : ''
  return { liteTier, pickLiteTier, account, isConnected, dates, dateId, setDateId, s, slip, actor, getOpen, setGetOpen, unit, pay, opts, noPay, balOf, payAddr, setPayAddr, liteTicket, chosen, bal, price, amt, setAmt, amount, marginRaw, tier, setTier, custom, setCustom, lo, hi, canCustom, copyL, onCopy, setOnCopy, pickTier, heldL, L, E, C, D, termId, setTermId, term, tenorQs, tenorId, setTenorId, picked, tq, tenor, offer, liqLtv, picksRate, queueQ, queueBook, urate, suggested, rate0, setRate, rate, rateShift, books, debtTok, bookOf, bookApr, bookShort, due, dueDays, borAt0, borAt, dep, bor, net, drop, hf, netWorst, irm, after, netAfter, ends, overLiquidity, Eh, Lh, Lc, netC, hfC, q0, settling, q, routes, routeName, setRouteName, routeSel, econ, cost, ownPayback, payback, clockDays, clockWord, simHf, noRoute, short, fitAmount, fitLev, fitTier, yearly, key, paper, signTypedDataAsync, paperRefuse, ladder, vc, staleRef, more, hfShown, safe, rewardsNow, fixedNote }
}
