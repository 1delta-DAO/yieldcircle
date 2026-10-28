import React from 'react'
import { useSignTypedData } from 'wagmi'
import { DEFAULT_TIER, capRaw, healthAt, liqBuffer, netAprAtLeverage, toRaw } from '@yieldcircle/core/model/leverage'
import { heldRaw } from '@yieldcircle/core/model/amount'
import { isLoopscale, type LoopStrategy } from '@yieldcircle/core/model/strategies'
import type { Holding } from '@yieldcircle/core/model/positions'
import { loopClose, loopOpen } from '@yieldcircle/core/sdk/api'
import { isSavings } from '@yieldcircle/core/model/nature'
import { withSignature } from '@yieldcircle/core/sdk/signedAction'
import { num, usdShort } from '@yieldcircle/core/model/format'
import { liteLeverTargets, saferTargets } from '@yieldcircle/core/model/lite'
import { CLOSE_INTEREST_PAD, NO_ROUTE, closeKeepPad, hasRoute } from '@yieldcircle/core/model/ticket'
import { quoteClose, useCloseQuote } from '../sdk/queries'
import { slippageFor, useSettings } from '../state/Settings'
import { useSticky } from '../sticky'
import { stepsFrom, useTicketLadder } from '../ladder'
import { useSession } from '../session'
import { collateralOnFirst } from './collateral'
import { leverPlan, reducePlan } from './paperPlans'
import { usePaperView } from './paper'
import { useValueCheck } from './valueCheck'
import { useBorrowAt } from './loop'

/**
 * A held loop's ticket, everything but the screen (the web's `ManageLoop`, the phone's): the
 * leverage to move to (Lite: a close, one of three targets by distance from liquidation, or in its
 * "More choices" any of its own leverages, `targets`), what
 * that sells or borrows, a full close sized off what the sale fetches on the market, and the ladder.
 * `s` is null for a position the menu has no row for.
 */
export function useManageLoop(s: LoopStrategy | null, h: Holding, closeFirst?: boolean, { lite }: { lite?: boolean } = {}) {
  const session = useSession()
  const account = session.account, isConnected = !!session.isConnected
  const actorOn = session.actorOn ?? (() => undefined)
  // Lite: a close, or "Lower risk" — one of three targets by distance from liquidation (More choices: `targets`), never a slider
  const slip = slippageFor(useSettings().st, s ? isSavings(s.nature) : !h.directional)
  const actor = actorOn(h.chainId)
  const holds = s?.holds ?? h.symbol, debt = s?.debt ?? h.debtSymbol ?? 'debt'
  // the book as the API reports it: equity and leverage from the position, prices only to size the legs in tokens
  const E = Math.max(h.valueUsd, 0.01)
  // a deposit with nothing borrowed (`depositsAsLoops`, tickets/0015): 1× by definition, only up from there
  const putUp = !!h.putUp && !!s
  const Lnow = putUp ? 1 : Math.max(1, h.leverage && h.leverage > 1 ? h.leverage : s?.priceLong ? (h.amount * s.priceLong) / E : 1)
  const C = E * Lnow, D = C - E
  // off the menu the price is read back from the position — from the loop's OWN collateral leg: the
  // account's total counts every collateral, and a second one would inflate it
  const pC = s?.priceLong ?? (h.amount > 0 ? (h.collateralUsd ?? C) / h.amount : 0)
  const pD = s?.priceShort ?? 0
  // off the menu, the threshold is read back from the health the position reports: HF = L · lt / (L − 1)
  const liqLtv = s?.liqLtv ?? (h.health != null && Lnow > 1 ? (h.health * (Lnow - 1)) / Lnow : null)
  // a fixed-rate loop is a set of broker loans, and one close repays ONE of them (`loanId`): the slider
  // stops where that loan is paid off, and "Close" is there only when it is the whole debt. Adding
  // borrows a new term, which is the Add tab's job — here the slider only goes down.
  const loans = h.loans ?? []
  const [loanId, setLoanId] = React.useState<string | undefined>(loans[0]?.id)
  const loan = loans.find((x) => x.id === loanId) ?? loans[0]
  const rest = loan ? Math.max(0, D - loan.debtUsd) : 0
  const minL = loan && rest > D * 0.01 ? Math.ceil((1 + rest / E) * 100) / 100 : 1
  const maxL = loan ? Lnow : s ? Math.max(Lnow, Math.floor(s.maxLev * 100) / 100) : Lnow
  // ...and it starts on the tier the open ticket would: "Now" is a plain deposit, which is not what was asked for
  const safer = lite && !closeFirst ? saferTargets(Lnow, liqLtv, minL) : []
  // Lite's "More choices": any of its own leverages for this loop, up as well as down (`liteLeverTargets`)
  const targets = lite ? liteLeverTargets({ Lnow, liqLtv, minL, maxL, tiers: putUp ? null : s?.tiers }) : []
  const [L0, setL] = React.useState<number>(() => (closeFirst && !putUp ? 1 : putUp ? Math.min(maxL, s!.tiers[isSavings(s!.nature) ? DEFAULT_TIER : 'defensive']) : +Lnow.toFixed(2)))
  const L = Math.max(minL, L0)
  const same = Math.abs(L - Lnow) < 0.02
  // nothing to close on a deposit: taking it out is the deposit's own Withdraw
  const closing = !putUp && L <= 1.001
  const down = L < Lnow
  // target book
  const C2 = closing ? 0 : E * L, D2 = closing ? 0 : E * (L - 1)
  const sellUsd = down ? C - C2 : 0, borrowUsd = !down ? D2 - D : 0
  const sellTok = pC ? sellUsd / pC : 0, borrowTok = pD ? borrowUsd / pD : 0
  // the existing debt is already in the market's utilisation: spot is the rate now, and a step walks the curve by its own size
  const borAt = useBorrowAt(s)
  const net = closing || !s ? null : netAprAtLeverage(s.depSpot, borAt(D2 - D), L)
  const drop = closing ? 1 : liqLtv != null ? liqBuffer(liqLtv, L) : null
  const hf = closing ? Infinity : liqLtv != null ? healthAt(liqLtv, L) : null
  // A full close pays out in the debt token (sell everything, repay, the rest comes back) or in the
  // collateral (sell only what repays the debt, keep the rest). Both are the same call: `isAll`
  // withdraws ALL the collateral, the swap takes the `amount` it is given, and what the swap and the
  // repay leave over is swept to the wallet — so keeping the collateral is only a smaller `amount`.
  // Both are sized off what the sale fetches on the MARKET, never off the position's own value: that
  // is the lender's oracle, and an LST priced at its redemption rate sells for less than it says.
  const collUid = h.collateralUid ?? s?.marketLongUid ?? '', debtUid = h.debtUid ?? s?.marketShortUid ?? ''
  // (a deposit's neighbours in its account are not in its own value: nothing to take off the hold cell)
  const otherColl = putUp ? [] : (h.others ?? []).filter((o) => o.side === 'collateral'), otherUsd = otherColl.reduce((t, o) => t + o.usd, 0)
  const sameToken = holds === debt
  const [recvPro, setRecvPro] = useSticky<'debt' | 'collateral'>(`t:${h.key}:recv`, 'debt')
  // Lite asks afresh each time (its "More choices"): Pro's remembered choice never carries over unseen
  const [recvLite, setRecvLite] = React.useState<'debt' | 'collateral'>('debt')
  const recv = lite ? recvLite : recvPro, setRecv = lite ? setRecvLite : setRecvPro
  // Loopscale's full close has no "sell everything": the venue repays the loan (accrued to now plus a
  // margin), sells only the collateral that takes and hands the rest back (`isAll` drops `amount`).
  // So it always pays out in the collateral — the debt-token option would promise what it cannot do
  const venueKeeps = isLoopscale(h.lender ?? s?.lender)
  const keep = closing && !sameToken && (venueKeeps || recv === 'collateral')
  const owed = loan ? loan.debt : h.debtAmount ?? (pD ? D / pD : 0)
  const pDebt = pD || (owed > 0 ? D / owed : 0)
  // the exact balance: a float-sized amount can overshoot it by a few wei and the swap reverts
  const allRaw = h.amountRaw ?? toRaw(h.amount, h.decimals)
  const cq = useCloseQuote(closing && collUid && debtUid ? { collateralMarketUid: collUid, debtMarketUid: debtUid, amountRaw: allRaw, accountId: h.accountId, loanId: loan?.id } : null, slip)
  const sale = cq.data ?? null
  const rate = sale ? sale.output / sale.input : null
  const covers = sale ? sale.output >= owed * (1 + CLOSE_INTEREST_PAD) : null
  const tight = !!sale && covers && sale.output * (1 - slip / 10_000) < owed
  const backDebt = sale ? sale.output - owed : null
  const keepPad = closeKeepPad(slip)
  const sellKeep = rate ? (owed * (1 + keepPad)) / rate : null
  const keepOk = sellKeep != null && sellKeep < h.amount
  const backColl = keepOk ? h.amount - sellKeep! : null
  const leftover = owed * keepPad
  const backUsd = !sale ? null : keep ? (keepOk ? (backColl! * rate! + leftover) * pDebt : null) : backDebt! * pDebt
  const closeBlock = !closing ? null : cq.isPending ? 'pricing' : !sale ? 'no-route' : !covers ? 'short' : keep && !keepOk ? 'keep-short' : null
  const key = [s?.id ?? h.key, h.accountId ?? '', 'manage', L, keep ? 'keep' : 'sell', actor ?? '', slip].join('|')
  // a full close at market prices against the equity the venue's oracle says it holds: the sale's
  // slippage and fees, and any gap between the oracle and the market (`ValueCheck.tsx`). Only for the
  // loop's own pair — other legs stay where they are, so the account's equity is not what comes back.
  const valued = closing && !closeBlock && !h.others?.length && h.valueUsd > 0 && backUsd != null && backUsd > 0
  const vc = useValueCheck(valued ? h.valueUsd : 0, valued ? backUsd! : 0, `${key}|${backUsd}`)
  const paper = usePaperView()
  const { signTypedDataAsync } = useSignTypedData()
  // Inverse's loop answers a signature request first; paper asks, never signs
  const paperSign = paper.active ? null : (td: unknown) => signTypedDataAsync(td as never)
  // on paper: a deleverage costs what the slippage allows, a close what the sale quote says, a step up what the open quote says
  // on paper every step needs what the real one needs (tickets/0006): a close its sale quote (the
  // button already waits for it), a deleverage a quote for the part it sells, a step up a quote with
  // a route and the market's free liquidity — no estimate stands in for a missing quote
  const paperPlan = !h.paper ? undefined : closing
    ? reducePlan({ ledger: paper.ledger, h, closing, keep, sellUsd, costUsd: sale?.exitCostUsd != null ? sale.exitCostUsd * (keep && keepOk ? sellKeep! / h.amount : 1) : C * slip / 10_000, feed: paper.price })
    : down || !s
    ? async () => {
      const q = await quoteClose({ collateralMarketUid: collUid, debtMarketUid: debtUid, amountRaw: capRaw(sellTok, h.decimals, heldRaw(h)), accountId: h.accountId, loanId: loan?.id }, slip, false).catch(() => null)
      if (!q) throw new Error(NO_ROUTE)
      // what the sale loses against the position's own valuation, at the quote's fill
      const cost = q.exitCostUsd != null && q.exitCostUsd > 0 ? q.exitCostUsd : Math.max(0, sellUsd - q.output * pDebt)
      return reducePlan({ ledger: paper.ledger, h, closing: false, keep: false, sellUsd, costUsd: cost, feed: paper.price })()
    }
    : async () => {
      if (s.borrowLiquidityUsd > 0 && borrowUsd > s.borrowLiquidityUsd) throw new Error(`The market has only ${usdShort(s.borrowLiquidityUsd)} of ${debt} free to borrow — pick a lower leverage.`)
      const q = await loopOpen({ collateralMarketUid: s.marketLongUid, debtMarketUid: s.marketShortUid, debtAmountRaw: toRaw(borrowTok, s.decimalsShort), slippageBp: slip, leverage: L, account: actor })
      if (!hasRoute(q.data)) throw new Error(NO_ROUTE)
      return leverPlan({ ledger: paper.ledger, h, borrowUsd, costUsd: Math.max(0, (q.data?.economics?.entryCostUsd.total ?? 0) - (q.data?.economics?.entryCostUsd.gas ?? 0)), feed: paper.price })()
    }
  const ladder = useTicketLadder(key, h.chainId, async () => {
    if (down || !s) {
      const amountRaw = closing && !keep ? allRaw : capRaw(closing ? sellKeep! : sellTok, h.decimals, heldRaw(h))
      const closeParams = { collateralMarketUid: collUid, debtMarketUid: debtUid, amountRaw, slippageBp: slip, isAll: closing, account: actor!, accountId: h.accountId, loanId: loan?.id }
      const env = await withSignature(await loopClose(closeParams), paperSign)
      if (!hasRoute(env.data)) throw new Error(NO_ROUTE)
      return stepsFrom(env.actions, closing ? `Close the loop · receive ${keep ? holds : debt}` : `Deleverage to ${num(L, 2)}×`, h.chainId)
    }
    // a pure leverage step: borrow more against what is there, no new margin
    const upParams = { collateralMarketUid: s.marketLongUid, debtMarketUid: s.marketShortUid, debtAmountRaw: toRaw(borrowTok, s.decimalsShort), slippageBp: slip, leverage: L, account: actor!, accountId: h.accountId, simulate: true }
    const pre = await collateralOnFirst(h, actor!)
    const env = await withSignature(await loopOpen(upParams), paperSign)
    if (!hasRoute(env.data)) throw new Error(NO_ROUTE)
    return [...pre, ...stepsFrom(env.actions, putUp ? `Lever to ${num(L, 2)}×` : `Increase to ${num(L, 2)}×`, h.chainId)]
  }, [h.collateralUid ?? s?.marketLongUid, h.debtUid ?? s?.marketShortUid], [{ address: h.collateralAddress ?? s?.collateralAddress, symbol: holds }, { address: h.debtAddress ?? s?.debtAddress, symbol: debt }], paperPlan)
  return { account, isConnected, slip, actor, holds, debt, E, putUp, Lnow, C, D, pC, pD, liqLtv, loans, loanId, setLoanId, loan, rest, minL, maxL, safer, targets, L0, setL, L, same, closing, down, C2, D2, sellUsd, borrowUsd, sellTok, borrowTok, borAt, net, drop, hf, collUid, debtUid, otherColl, otherUsd, sameToken, recv, setRecv, venueKeeps, keep, owed, pDebt, allRaw, cq, sale, rate, covers, tight, backDebt, keepPad, sellKeep, keepOk, backColl, leftover, backUsd, closeBlock, key, valued, vc, paper, signTypedDataAsync, paperSign, paperPlan, ladder }
}
