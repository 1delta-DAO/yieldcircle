import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { MIN_HEALTH, ZONES, bordersFor, collateralFor, collateralOf, defaultBorrow, dropOf, healthOf, liquidationPrice, maxBorrowUsd, monthlyCost, offerFromHolding, owedOf, zoneAmounts, zoneOf, type BorrowOffer, type Zone } from '@yieldcircle/core/model/borrow'
import { borrowAtSize, toRaw } from '@yieldcircle/core/model/leverage'
import { fromUnits, payRaw, portion, unitsOf, type Amount } from '@yieldcircle/core/model/amount'
import { nativeDecimals, nativeSymbol, wrapsNative, type Holding, type Idle } from '@yieldcircle/core/model/positions'
import { isSvmChain, normAddr } from '@yieldcircle/core/model/address'
import { denomOf } from '@yieldcircle/core/model/assets'
import type { LoopStrategy } from '@yieldcircle/core/model/strategies'
import { lendingAction, lendingDepositAndBorrow, lendingRange, nativeAsset } from '@yieldcircle/core/sdk/api'
import { clampRate, rateToWad, recommendedOf, userSetOfBook } from '@yieldcircle/core/model/userSetRate'
import { num, usd } from '@yieldcircle/core/model/format'
import { ceil6, sameToken } from '@yieldcircle/core/model/ticket'
import { useIrm, useLendingBooks } from '../sdk/queries'
import { useSticky, useStickyAmount } from '../sticky'
import { stepsFrom, useTicketLadder } from '../ladder'
import { useSession } from '../session'
import { borrowPlan } from './paperPlans'
import { usePaperView } from './paper'
import { collateralOnFirst } from './collateral'

export const ZONE_ORDER: Zone[] = ['safe', 'watch', 'spicy']
/** a coin amount or a price in another coin, to four significant figures (0.03124 BTC, 1,240 USDC) */
export const sig4 = (x: number) => (x >= 1000 ? num(x, 0) : String(+x.toPrecision(4)))
const useDebounced = <T,>(v: T, ms = 400): T => { const [d, setD] = React.useState(v); React.useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms]); return d }

/**
 * A held loop as a loan (the web's `LoopLoanPanes`, the phone's loop loan body): the offer read off
 * the holding, with the loop strategy's limits and rate laid over it (`offerFromHolding` knows no
 * limit). Null when the holding cannot be read as one.
 */
export function loopLoanOffer(s: LoopStrategy | null, h: Holding): BorrowOffer | null {
  const b0 = offerFromHolding(h)
  if (!b0) return null
  // its own id: what the panes remember (`useSticky`) and ask (`useQuery`) is this loop's, not the Borrow page's for the pair
  const b = { ...b0, id: `loop:${h.key}` }
  if (!s) return b
  // dollars against dollars: only a depeg liquidates it, and the ticket says so
  const pegged = b.out === 'USD' && denomOf(s.asset) === 'usd'
  // the threshold: the account's own, read off its health (its e-mode, its own factors), when it has one; else the market's
  const liqLtv = h.health && owedOf(h) > 0 && collateralOf(h) > 0 ? b.liqLtv : s.liqLtv > 0 ? s.liqLtv : b.liqLtv
  return {
    ...b, maxLtv: s.maxLev > 1 ? 1 - 1 / s.maxLev : 0, liqLtv,
    borrowApr: s.borSpot, rewards: s.rewardsShort, liquidityUsd: s.borrowLiquidityUsd, pegged,
    collateral: { ...b.collateral, price: b.collateral.price || s.priceLong }, debt: { ...b.debt, logo: s.logoShort, price: b.debt.price || s.priceShort || 1 },
  } satisfies BorrowOffer
}

/** Pay with the collateral token or — into a market of the chain's wrapped coin — the coin itself. */
function payOpts(o: BorrowOffer) {
  const token = { role: 'token' as const, address: normAddr(o.collateral.address), symbol: o.collateral.symbol, decimals: o.collateral.decimals }
  return wrapsNative(o.chainId, o.collateral.address) ? [{ role: 'native' as const, address: nativeAsset(o.chainId), symbol: nativeSymbol(o.chainId), decimals: nativeDecimals(o.chainId) }, token] : [token]
}

/**
 * Putting up and borrowing, everything but the screen (the web's `BorrowPane`, the phone's loop
 * loan body): what goes in, how much comes out (three zone chips, a slider, or a typed sum in either
 * unit), what it costs and where the line is, and the ladder — `deposit-and-borrow`, or a single leg.
 * `h`: the account it adds to (a running loan, a loop, or collateral put up with nothing owed).
 * `loop`: a held loop's own account — nothing is borrowed unless asked for.
 */
export function useBorrowTicket(o: BorrowOffer, h: Holding | null, idle: Idle[], { loop }: { loop?: boolean } = {}) {
  const session = useSession()
  const account = session.account, isConnected = !!session.isConnected
  const actor = (session.actorOn ?? (() => undefined))(o.chainId)
  const paper = usePaperView()
  const opts = React.useMemo(() => payOpts(o), [o.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const balOf = (address: string) => idle.find((i) => i.chainId === o.chainId && sameToken(i.address, address))
  const [role, setRole] = useSticky<'native' | 'token' | null>(`b:${o.id}:pay`, null)
  const chosen = opts.find((x) => x.role === role) ?? [...opts].sort((a, b) => (balOf(b.address)?.amount ?? 0) - (balOf(a.address)?.amount ?? 0))[0]
  const bal = balOf(chosen.address)
  const price = o.collateral.price || bal?.price || (h && h.amount > 0 && h.collateralUsd ? h.collateralUsd / h.amount : 0)
  const debtPrice = o.debt.price || 1
  // a loan running already — or collateral put up with nothing owed — what it holds and owes, which
  // the new numbers are added to. Every collateral leg counts: an account with ETH and wstETH up
  // was read as its ETH alone, which understated both what it holds and what it owes
  const heldUnits = h?.amount ?? 0
  const otherUsd = h ? collateralOf(h) - (h.collateralUsd ?? 0) : 0
  const mixed = otherUsd > 0.5
  const heldUsd = h ? (h.collateralUsd ?? heldUnits * price) + otherUsd : 0
  const owedUsd = h ? Math.max(0, heldUsd - h.valueUsd) : 0
  const owedUnits = h?.debtAmount ?? owedUsd / debtPrice
  const [putAmt, setPut0] = useStickyAmount(`b:${o.id}:put`, () => (h ? fromUnits(0) : bal ? portion(bal, 100, chosen.decimals) : fromUnits(price > 0 ? +(1000 / price).toPrecision(2) : 1)))
  const put = unitsOf(putAmt)
  // what is put up, as sent: Max is the exact balance, a typed amount its text capped at it (tickets/0014)
  const putRaw = payRaw(putAmt, chosen.decimals, bal)
  // the reader set the Put up box themselves: "by amount" stops filling it
  const [putSet, setPutSet] = useSticky<boolean>(`b:${o.id}:putset`, false)
  const setPut = (a: Amount) => { setPut0(a); setPutSet(true) }
  const putUsd = put * price
  const collUsd = heldUsd + putUsd
  const borders = bordersFor(o)
  const z = zoneAmounts(o, borders, collUsd, owedUsd)
  // the venue's own limit for this deposit (its e-mode, its borrow factor), where a real wallet can
  // be read. Only for a FRESH loan: the GET route does not read the account it is given (measured
  // 2026-10-14 — a wallet with $121m of WETH on Aave and one with $36m against $17m owed got the
  // same answer, the new deposit's alone, and 0 for a deposit of 0), so on an account that already
  // holds something it understates what is in and ignores what is owed. There the model, over every
  // leg the positions route reports, is the better number
  const dPut = useDebounced(put)
  const range = useQuery({
    enabled: !!actor && !paper.active && dPut > 0 && !h && o.maxLtv > 0,
    queryKey: ['borrow-range', o.id, actor, dPut, h?.accountId ?? ''],
    queryFn: () => lendingRange('deposit-borrow', { collateralMarketUid: o.collateral.uid, debtMarketUid: o.debt.uid, account: actor!, depositRaw: toRaw(dPut, o.collateral.decimals), modeId: o.modeId, accountId: h?.accountId }),
    staleTime: 20_000, retry: false,
  })
  const capModel = maxBorrowUsd(o, collUsd, owedUsd)
  const rangeCap = range.data?.maxBorrow?.amountUSD
  const cap = rangeCap != null ? Math.min(capModel, rangeCap) : capModel
  // how much to take: `null` = the chips' default (Safe, held under the cap); else what the reader
  // picked — a chip or the slider in dollars, or a number typed in either unit (`typed`). A typed
  // token amount is kept as typed, so "500 USDC" sends 500 USDC, not $500 at today's price
  const [pick, setPick] = useSticky<{ by: 'usd' | 'tok'; v: number; typed?: boolean } | null>(`b:${o.id}:amt`, null)
  // (a loop is opened to be made safer as often as to borrow more: it starts at nothing, never at Safe)
  const take = Math.max(0, pick == null ? (loop ? 0 : Math.min(defaultBorrow(z), cap)) : pick.by === 'usd' ? pick.v : pick.v * debtPrice)
  const debtUnits = pick?.by === 'tok' ? Math.max(0, pick.v) : take / debtPrice
  const setTake = (v: number) => setPick({ by: 'usd', v })
  const over = take > cap + 0.005
  const usdOut = o.out === 'USD'
  const [unit, setUnit] = useSticky<'usd' | 'tok'>(`b:${o.id}:unit`, 'tok')
  const boxValue = pick?.typed && pick.by === unit ? pick.v : unit === 'usd' ? +take.toFixed(2) : +debtUnits.toPrecision(8)
  // by amount: what the Put up box should hold for this sum — the model's Safe start, never under the venue's floor
  const typed = !!pick?.typed && take > 0
  const dTake = useDebounced(typed ? debtUnits : 0)
  // (fresh loans only, for the same reason as `range`: it cannot count what an account already holds)
  const floor = useQuery({
    enabled: !!actor && !paper.active && dTake > 0 && !h && o.maxLtv > 0,
    queryKey: ['borrow-min', o.id, actor, dTake, h?.accountId ?? ''],
    queryFn: () => lendingRange('deposit-borrow', { collateralMarketUid: o.collateral.uid, debtMarketUid: o.debt.uid, account: actor!, borrowRaw: toRaw(dTake, o.debt.decimals), modeId: o.modeId, accountId: h?.accountId }),
    staleTime: 20_000, retry: false,
  })
  const floorUnits = floor.data?.minDeposit ? Math.max(0, parseFloat(floor.data.minDeposit.amount) || 0) : 0
  const safeUnits = price > 0 ? collateralFor(o, borders, take, heldUsd, owedUsd) / price : 0
  const wantUnits = typed ? ceil6(Math.max(safeUnits, floorUnits * 1.001)) : 0
  React.useEffect(() => {
    // the Put up box follows a typed sum until the reader sets it; a running loan adds only what is missing
    if (typed && !putSet && price > 0 && Math.abs(wantUnits - put) > 1e-6) setPut0(fromUnits(wantUnits))
  }, [typed, putSet, wantUnits]) // eslint-disable-line react-hooks/exhaustive-deps
  const totalDebt = owedUsd + take
  const drop = dropOf(collUsd, totalDebt, o.liqLtv), zone = zoneOf(drop, borders), hf = healthOf(collUsd, totalDebt, o.liqLtv)
  // A rate the borrower sets (Liquity family, Flex): a NEW loan picks it here, off the live
  // redemption queue; a running trove keeps its own. No curve: the rate does not move with size.
  const picksRate = !!o.userSet && !h
  const [queueQ] = useLendingBooks(picksRate ? [o.debt.uid] : [], 'borrow')
  const queueBook = queueQ?.book ?? null
  const u = picksRate ? userSetOfBook(queueBook) ?? o.userSet! : null
  const suggested = recommendedOf(u)?.apr
  const [rate0, setRate] = React.useState<number | null>(null)
  const rate = u ? clampRate(u, rate0 ?? suggested ?? o.borrowApr) : null
  // the rate at THIS size, off the market's own curve: it visibly climbs as more is taken
  const irm = useIrm(o.userSet ? '' : o.debt.uid)
  const apr = rate != null ? rate : o.userSet ? o.borrowApr : irm.isPending ? o.borrowApr : borrowAtSize(o.borrowApr, o.borrowApr, take, irm.data)
  const monthly = monthlyCost(totalDebt, apr)
  const collUnits = heldUnits + put
  const liqPx = liquidationPrice(totalDebt, collUnits, o.liqLtv) * debtPrice
  // a loan in a coin: the line is a price IN that coin — both legs move, and only their ratio matters
  const liqRatio = collUnits > 0 && o.liqLtv > 0 ? (owedUnits + debtUnits) / (collUnits * o.liqLtv) : 0
  const ratioNow = price > 0 && debtPrice > 0 ? price / debtPrice : 0
  // the real build, asked for its simulation only: the health the venue itself computes
  const build = (simulate: boolean) => {
    const base = { operator: actor!, accountId: h?.accountId, simulate }
    const pay = chosen.role === 'native' ? chosen.address : undefined
    if (put > 0 && take > 0) return lendingDepositAndBorrow({ ...base, collateralMarketUid: o.collateral.uid, debtMarketUid: o.debt.uid, collateralRaw: putRaw, borrowRaw: toRaw(debtUnits, o.debt.decimals), payAsset: pay, modeId: o.modeId, ...(rate != null ? { interestRate: rateToWad(rate) } : {}) })
    if (put > 0) return lendingAction('deposit', { ...base, marketUid: o.collateral.uid, amountRaw: putRaw, payAsset: pay })
    return lendingAction('borrow', { ...base, marketUid: o.debt.uid, amountRaw: toRaw(debtUnits, o.debt.decimals) })
  }
  const simKey = [o.id, putRaw, Math.round(take * 100), chosen.role, actor ?? '', h?.accountId ?? '', rate ?? ''].join('|')
  const dKey = useDebounced(simKey, 500)
  const sim = useQuery({
    enabled: !!actor && isConnected && !paper.active && (put > 0 || take > 0) && dKey === simKey,
    queryKey: ['borrow-sim', dKey],
    queryFn: () => build(true),
    staleTime: 20_000, retry: false,
  })
  // the venue's own figure — unless it simulated a FRESH account: when the route cannot read the
  // existing position it simulates from zero (measured 2026-10-14: an Aave loan at health 20.7 came
  // back as 2.03 for a $244 top-up), so with a loan running it counts only if its `pre` is that loan
  const simPre = sim.data?.data?.simulation?.pre?.healthFactor
  // (collateral in with nothing owed has no health to compare: the venue read it if it saw any borrowing room)
  const pre = sim.data?.data?.simulation?.pre
  const simTrusted = !h || (owedUsd > 0.005
    ? h.health != null && simPre != null && Number.isFinite(simPre) && Math.abs(simPre / h.health - 1) < 0.25
    : (pre?.borrowCapacity ?? 0) > 0 || (pre?.balanceData?.collateral ?? 0) > 0)
  const simHf = simTrusted ? sim.data?.data?.simulation?.post?.healthFactor ?? undefined : undefined
  const effHf = simHf != null && simHf > 0 ? simHf : hf
  const key = [o.id, h?.accountId ?? '', putRaw, Math.round(take * 100), chosen.role, actor ?? '', rate ?? ''].join('|')
  // (a borrow on collateral already in whose flag is off switches it on first, or the borrow reverts: tickets/0015)
  const ladder = useTicketLadder(key, o.chainId, async () => [...(take > 0 ? await collateralOnFirst(h, actor!) : []), ...stepsFrom((await build(false)).actions, put > 0 && take > 0 ? 'Put up and borrow' : put > 0 ? 'Add collateral' : 'Borrow', o.chainId)],
    [o.collateral.uid, o.debt.uid], [{ address: chosen.address, symbol: chosen.symbol }, { address: o.debt.address, symbol: o.debt.symbol }],
    borrowPlan({ offer: o, into: h, payToken: chosen.address, collUnits: put, debtUnits, borrowApr: apr }),
    // the build, unsigned, before a paper loan: what the API would refuse, paper refuses
    !isSvmChain(o.chainId))
  // what stops the button, in words
  const short = !!account && (!bal || put > bal.amount + 1e-9) && put > 0
  const [ack, setAck] = React.useState(false)
  const outAmt = (usdV: number) => (usdOut ? usd(usdV) : `${sig4(usdV / debtPrice)} ${o.debt.symbol}`)
  const blocked = !(put > 0 || take > 0) ? (loop ? 'Put some collateral in or borrow something' : 'Put something up or take something out')
    : paper.active && o.assetClass ? `Paper loans against ${o.ticker ?? 'stocks'} open once their prices can be trusted`
    : short ? `You have ${num(bal?.amount ?? 0, 4)} ${chosen.symbol}`
    : over && take > 0 ? (cap > 0 ? `The most you can take here is ${outAmt(cap)}` : `Put something up to take ${usdOut ? 'dollars' : o.debt.symbol} out`)
    : take > 0 && effHf < MIN_HEALTH ? 'Too close to liquidation — take less'
    : o.maxLtv <= 0 && take > 0 ? 'Borrow more on this loan at the venue'
    : zone === 'spicy' && take > 0 && !ack ? 'Tick the box above to take this much'
    : null
  const takeWord = pick?.by === 'tok' || !usdOut ? `${sig4(debtUnits)} ${o.debt.symbol}` : usd(take)
  const label = take > 0 ? `Borrow ${takeWord}` : `Add ${num(put, 4)} ${chosen.symbol}`
  // the slider's zone bar: how much of it lands in each zone
  const zbar = cap > 0 ? ZONE_ORDER.map((k) => { const at = (d: number) => Math.min(cap, Math.max(0, collUsd * o.liqLtv * (1 - d) - owedUsd)); const lo = k === 'safe' ? 0 : at(k === 'watch' ? borders.safe : borders.watch), hi = k === 'safe' ? at(borders.safe) : k === 'watch' ? at(borders.watch) : cap; return { k, w: Math.max(0, hi - lo) / cap } }) : []
  return { account, isConnected, actor, paper, opts, balOf, role, setRole, chosen, bal, price, debtPrice, heldUnits, otherUsd, mixed, heldUsd, owedUsd, owedUnits, putAmt, put, putRaw, setPut, putUsd, collUsd, borders, z, range, cap, pick, setPick, take, debtUnits, setTake, over, usdOut, unit, setUnit, boxValue, typed, floorUnits, wantUnits, totalDebt, drop, zone, hf, picksRate, queueBook, u, rate, setRate, apr, monthly, collUnits, liqPx, liqRatio, ratioNow, simHf, effHf, key, ladder, short, ack, setAck, blocked, takeWord, label, zbar, zoneWord: ZONES[zone].word }
}

/**
 * Collateral in on a held loop and nothing borrowed (the web's `TopUpPane`): a term, a tenor or a
 * maturity whose debt the lending routes cannot add to, or a position off the menu with no limit to
 * borrow under. One `deposit` on the loop's own account; the debt stays as it is.
 */
export function useTopUpTicket(o: BorrowOffer, h: Holding, idle: Idle[]) {
  const session = useSession()
  const account = session.account, isConnected = !!session.isConnected
  const actor = (session.actorOn ?? (() => undefined))(o.chainId)
  const opts = React.useMemo(() => payOpts(o), [o.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const balOf = (address: string) => idle.find((i) => i.chainId === o.chainId && sameToken(i.address, address))
  const chosen = [...opts].sort((a, b) => (balOf(b.address)?.amount ?? 0) - (balOf(a.address)?.amount ?? 0))[0]
  const bal = balOf(chosen.address)
  const [amt, setAmt] = useStickyAmount(`b:${h.key}:topup`, () => fromUnits(0))
  const put = unitsOf(amt)
  // as sent: Max is the exact balance, a typed amount its text capped at it (tickets/0014)
  const putRaw = payRaw(amt, chosen.decimals, bal)
  const price = h.amount > 0 && h.collateralUsd ? h.collateralUsd / h.amount : o.collateral.price ?? bal?.price ?? 0
  const heldUsd = collateralOf(h), owedUsd = owedOf(h)
  const liq = h.health && owedUsd > 0 && heldUsd > 0 ? (h.health * owedUsd) / heldUsd : o.liqLtv
  const collAfter = heldUsd + put * price
  const levOf = (c: number) => (c - owedUsd > 0 ? c / (c - owedUsd) : 0)
  const short = !!account && put > 0 && (!bal || bal.amount < put - 1e-9)
  const blocked = !(put > 0) ? `Put some ${chosen.symbol} in` : short ? `You have ${num(bal?.amount ?? 0, 4)} ${chosen.symbol}` : null
  const build = async () => {
    const env = await lendingAction('deposit', { operator: actor!, accountId: h.accountId, marketUid: o.collateral.uid, amountRaw: putRaw, payAsset: chosen.role === 'native' ? chosen.address : undefined })
    return stepsFrom(env.actions, 'Add collateral', o.chainId)
  }
  const key = [h.key, 'topup', putRaw, chosen.role, actor ?? ''].join('|')
  const ladder = useTicketLadder(key, o.chainId, build, [o.collateral.uid], [{ address: chosen.address, symbol: chosen.symbol }])
  return { account, isConnected, chosen, bal, amt, setAmt, put, price, heldUsd, owedUsd, liq, collAfter, levOf, short, blocked, ladder }
}
