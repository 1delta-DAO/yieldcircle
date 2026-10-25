import { MIN_HEALTH, bordersFor, collateralOf, dropOf, healthOf, owedOf, zoneOf, type BorrowOffer } from '@yieldcircle/core/model/borrow'
import { capRaw } from '@yieldcircle/core/model/leverage'
import { fromUnits, heldRaw, payRaw, portion, unitsOf } from '@yieldcircle/core/model/amount'
import { nativeSymbol, wrapsNative, type Holding, type Idle } from '@yieldcircle/core/model/positions'
import { normAddr } from '@yieldcircle/core/model/address'
import { lendingAction, lendingWithdrawAndRepay, nativeAsset } from '@yieldcircle/core/sdk/api'
import { num } from '@yieldcircle/core/model/format'
import { floor6, sameToken } from '@yieldcircle/core/model/ticket'
import { useSticky, useStickyAmount } from '../sticky'
import { stepsFrom, useTicketLadder } from '../ladder'
import { useSession } from '../session'
import { paperPos, repayPlan } from './paperPlans'
import { usePaperView } from './paper'

/**
 * Paying a loan back, everything but the screen (the web's `RepayPane`, the phone's loan sheet):
 * how much of the debt, how much collateral comes out, what is owed and how safe it is after, and
 * the ladder — one lending action (`withdraw-and-repay`, or a single leg). `lite`: all of it back
 * and the collateral home, or part of the debt only.
 */
export function useRepayTicket(o: BorrowOffer, h: Holding, idle: Idle[], lite?: 'all' | 'some') {
  const session = useSession()
  const account = session.account, isConnected = !!session.isConnected
  const actorOn = session.actorOn ?? (() => undefined)
  const actor = actorOn(o.chainId)
  const paper = usePaperView()
  const owed = h.debtAmount ?? 0
  const held = h.amount
  const collUsd = h.collateralUsd ?? 0
  const price = held > 0 && collUsd > 0 ? collUsd / held : o.collateral.price ?? 0
  // a second collateral stays in whatever this pane does: it backs the debt that is left
  const otherUsd = collateralOf(h) - collUsd
  const owedUsd = owedOf(h)
  // a second debt (GHO beside USDT) is not paid back here and still counts against the collateral
  const otherDebtUsd = (h.others ?? []).reduce((a, x) => a + (x.side === 'debt' ? x.usd : 0), 0)
  const debtPrice = owed > 0 && owedUsd - otherDebtUsd > 0 ? (owedUsd - otherDebtUsd) / owed : o.debt.price || 1
  const debtBal = idle.find((i) => i.chainId === o.chainId && sameToken(i.address, normAddr(o.debt.address)))
  const [repayAmt0, setRepay] = useStickyAmount(`b:${h.key}:repay${lite ? ':lite' : ''}`, () => fromUnits(lite === 'some' ? floor6(owed / 2) : owed))
  const [outAmt0, setOut] = useStickyAmount(`b:${h.key}:out`, () => fromUnits(0))
  const repayAmt = lite === 'all' ? fromUnits(owed) : repayAmt0
  const outAmt = lite === 'all' ? portion(heldRaw(h), 100, o.collateral.decimals) : lite ? fromUnits(0) : outAmt0
  const repay = unitsOf(repayAmt), out = unitsOf(outAmt)
  const repayAll = owed > 0 && repay >= owed * 0.9999
  const outAll = held > 0 && out >= held * 0.9999
  const r = Math.min(repay, owed), w = Math.min(out, held)
  // as sent (tickets/0014): a repay never pulls more than the wallet holds, a withdrawal never asks more than is put up.
  // All of the debt is sized on chain (`isAll` / `repayMax`), so only its float is capped
  const repayRaw = repayAll ? capRaw(r, o.debt.decimals, debtBal) : payRaw(repayAmt, o.debt.decimals, debtBal)
  const outRaw = outAll ? h.amountRaw ?? capRaw(w, o.collateral.decimals, heldRaw(h)) : payRaw(outAmt, o.collateral.decimals, heldRaw(h))
  const debtAfter = (repayAll ? 0 : (owed - r) * debtPrice) + otherDebtUsd
  const collAfter = (outAll ? 0 : (held - w) * price) + otherUsd
  const liq = h.health && owedUsd > 0 && collUsd + otherUsd > 0 ? (h.health * owedUsd) / (collUsd + otherUsd) : o.liqLtv
  const hfAfter = healthOf(collAfter, debtAfter, liq)
  // the most that can come out with what is still owed after this repay (the other collateral helps hold it)
  const maxOut = debtAfter > 0 ? Math.max(0, held - Math.max(0, (debtAfter * MIN_HEALTH) / liq - otherUsd) / Math.max(price, 1e-12)) : held
  const canNative = wrapsNative(o.chainId, o.collateral.address)
  const [asNative, setAsNative] = useSticky<boolean>(`b:${h.key}:native`, false)
  const native = canNative && asNative
  const coin = nativeSymbol(o.chainId)
  const build = async () => {
    const base = { operator: actor!, accountId: h.accountId }
    const receiveAsset = native ? nativeAsset(o.chainId) : undefined
    const env = r > 0 && w > 0
      ? await lendingWithdrawAndRepay({ ...base, collateralMarketUid: o.collateral.uid, debtMarketUid: o.debt.uid, repayRaw, withdrawRaw: outRaw, repayMax: repayAll, withdrawMax: repayAll && outAll, receiveAsset })
      : r > 0 ? await lendingAction('repay', { ...base, marketUid: o.debt.uid, amountRaw: repayRaw, isAll: repayAll })
      : await lendingAction('withdraw', { ...base, marketUid: o.collateral.uid, amountRaw: outRaw, isAll: outAll, receiveAsset })
    return stepsFrom(env.actions, r > 0 && w > 0 ? 'Pay back and take out' : r > 0 ? 'Pay back' : 'Take collateral out', o.chainId)
  }
  const key = [h.key, repayRaw, outRaw, native ? 'n' : 't', actor ?? ''].join('|')
  const ladder = useTicketLadder(key, o.chainId, build, [o.collateral.uid, o.debt.uid],
    [{ address: o.debt.address, symbol: o.debt.symbol }, native ? { address: nativeAsset(o.chainId), symbol: coin } : { address: o.collateral.address, symbol: o.collateral.symbol }],
    repayPlan({ ledger: paper.ledger, h, repayUnits: r, repayAll, withdrawUnits: w, withdrawAll: outAll }))
  const shortDebt = !!account && r > 0 && (!debtBal || debtBal.amount < r - 1e-9)
  const blocked = !(r > 0 || w > 0) ? 'Pay something back or take something out'
    : h.paper && !paperPos(paper.ledger, h) ? 'This paper loan is not in the book any more'
    : outAll && (!repayAll || otherDebtUsd > 0.5) ? (repayAll ? 'Another debt on this account still needs the collateral' : 'The collateral comes back once the loan is repaid')
    : shortDebt ? `You have ${num(debtBal?.amount ?? 0, 2)} ${o.debt.symbol}`
    : debtAfter > 0 && hfAfter < MIN_HEALTH ? 'Too close to liquidation — take less out'
    : null
  const zone = debtAfter > 0 ? zoneOf(dropOf(collAfter, debtAfter, liq), bordersFor(o)) : 'safe'
  // all of it back takes the collateral with it only when nothing else on the account still needs it
  const liteBlocked = lite === 'all' && otherDebtUsd > 0.5 ? 'Another debt on this account still needs the collateral — pay part back here, the rest in Details' : blocked
  return { account, isConnected, actor, paper, owed, held, collUsd, price, otherUsd, owedUsd, otherDebtUsd, debtPrice, debtBal, repayAmt0, setRepay, outAmt0, setOut, repayAmt, outAmt, repay, out, repayAll, outAll, r, w, repayRaw, outRaw, debtAfter, collAfter, liq, hfAfter, maxOut, canNative, asNative, setAsNative, native, coin, build, key, ladder, shortDebt, blocked, zone, liteBlocked }
}
