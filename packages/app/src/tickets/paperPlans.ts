/**
 * What each ticket does on paper (tickets/0006 §C): the op a confirm applies, built from the same
 * row, amounts and quotes the real build uses. Kept apart so a ticket body changes by one argument.
 */
import { isSavings } from '@yieldcircle/core/model/nature'
import { nativeSymbol, type Holding } from '@yieldcircle/core/model/positions'
import { normAddr } from '@yieldcircle/core/model/address'
import { legPrices, nativeOf, paperId, valueOf, type PaperLedger, type PaperOp, type PaperPosition, type PaperRate, type PaperSnap, type PriceFn } from '@yieldcircle/core/model/paper'
import type { LoopStrategy, SimpleStrategy } from '@yieldcircle/core/model/strategies'
import type { BorrowOffer } from '@yieldcircle/core/model/borrow'
import type { PaperBuilt } from '../ladder'

const leg = (symbol: string, decimals: number, address: string, priceUsd: number, logo?: string) => ({ symbol, decimals, address: normAddr(address), priceUsd, logo })

/** A deposit's snapshot: priced at the open, moved by its money where it has one (ETH by the chain's ether). */
export function simpleSnap(s: SimpleStrategy, price: number, feed: PriceFn): PaperSnap {
  const peg = isSavings(s.nature)
  const nat = nativeOf(s.chainId), natPrice = feed(s.chainId, nat)
  const money = peg && s.group === 'ETH' && nativeSymbol(s.chainId) === 'ETH' && natPrice ? leg('ETH', 18, nat, natPrice) : undefined
  return {
    asset: s.asset, group: s.group, label: `${s.vaultName ?? s.holds} · ${s.brand}`, venue: s.venue, logo: s.logo,
    earnUid: s.earnUid, marketUid: s.marketUid, held: leg(s.assetSymbol, s.decimals, s.assetAddress, price, s.tokenLogo),
    mode: peg ? 'peg' : 'live', ...(money ? { money } : {}), nature: s.nature, maturity: s.maturity, ...(s.book ? { rateKind: 'fixed' as const } : {}),
  }
}
/** A saving earns its whole rate; a position priced live earns it without its token's own yield (the price carries that). */
export function simpleRate(s: SimpleStrategy): PaperRate {
  const peg = isSavings(s.nature)
  // the token's own yield is kept either way: a saving's server re-rate falls back on it where no index carries one (tickets/0006 review)
  return { supply: peg ? s.rate : s.rate - (s.intrinsic ?? 0), borrow: 0, supplyRewards: s.rewards || undefined, intrinsic: s.intrinsic }
}
export function depositPlan(s: SimpleStrategy, o: { into?: Holding | null; payToken: string; amount: number; price: number; feed: PriceFn; payName?: { symbol: string; decimals: number } }): () => Promise<PaperBuilt> {
  return async () => {
    if (!(o.price > 0)) throw new Error(`No price for ${s.assetSymbol} right now, so a paper deposit cannot be valued.`)
    return { op: { t: 'open', id: paperId(), ...(o.into?.paper ? { into: o.into.key.slice('paper:'.length) } : {}), chainId: s.chainId, kind: 'simple', strategyId: s.id, snap: simpleSnap(s, o.price, o.feed), pay: { token: o.payToken, units: o.amount }, units: o.amount, debtUnits: 0, rate: simpleRate(s), entryCostUsd: 0 } }
  }
}

export function loopSnap(s: LoopStrategy, liqLtv: number): PaperSnap {
  return {
    asset: s.asset, group: s.group, label: `${s.holds} / ${s.debt} loop`, venue: s.venue, logo: s.logoLong,
    marketUid: s.marketLongUid, debtUid: s.marketShortUid, lender: s.lender,
    held: leg(s.holds, s.decimalsLong, s.collateralAddress, s.priceLong ?? 0, s.logoLong), debt: leg(s.debt, s.decimalsShort, s.debtAddress, s.priceShort ?? 0, s.logoShort),
    liqLtv, mode: isSavings(s.nature) ? 'peg' : 'live', nature: s.nature, maturity: s.expiry ?? s.dueAt,
  }
}
export function loopRate(s: LoopStrategy, dep: number, bor: number): PaperRate {
  const peg = isSavings(s.nature)
  return { supply: peg ? dep : dep - (s.intrinsicLong ?? 0), borrow: bor, supplyRewards: s.rewardsLong || undefined, borrowRewards: s.rewardsShort || undefined, intrinsic: s.intrinsicLong }
}
/** Open (or add to) a loop: the margin in, `L`× held, the borrowed part owed, the quote's entry cost taken off the held side. */
export function loopPlan(s: LoopStrategy, o: { into?: Holding | null; payToken: string; amount: number; equityUsd: number; L: number; dep: number; bor: number; liqLtv: number; entryCostUsd: number | null; quoting: boolean; refuse?: string | null }): () => Promise<PaperBuilt> {
  return async () => {
    if (o.refuse) throw new Error(o.refuse)
    if (!s.priceLong || !s.priceShort) throw new Error('No price for one of the loop’s tokens right now, so a paper loop cannot be valued.')
    if (o.entryCostUsd == null && o.quoting) throw new Error('Still quoting the entry cost — try again in a second.')
    const cost = o.entryCostUsd ?? 0
    const E = o.equityUsd, L = o.L
    const units = (E * L - cost) / s.priceLong, debtUnits = (E * (L - 1)) / s.priceShort
    if (!(units > 0) || !(debtUnits > 0)) throw new Error('Pick an amount and a leverage above 1×.')
    return { op: { t: 'open', id: paperId(), ...(o.into?.paper ? { into: o.into.key.slice('paper:'.length) } : {}), chainId: s.chainId, kind: 'loop', strategyId: s.id, snap: loopSnap(s, o.liqLtv), pay: { token: o.payToken, units: o.amount }, units, debtUnits, rate: loopRate(s, o.dep, o.bor), entryCostUsd: cost } }
  }
}

export const paperPos = (l: PaperLedger | null, h: Holding): PaperPosition | undefined => l?.positions.find((p) => `paper:${p.id}` === h.key)
const posOf = (l: PaperLedger | null, h: Holding) => { const p = paperPos(l, h); if (!p) throw new Error('This paper position is not in the book any more. Reload.'); return p }
/** Units of `token` worth `units` of the position's held side at today's feed — a saving's held units are at its open price. */
function payout(p: PaperPosition, units: number, token: string, feed: PriceFn): number {
  const { pHeld } = legPrices(p, feed)
  const pr = feed(p.chainId, token)
  return pr && pr > 0 && pHeld > 0 ? (units * pHeld) / pr : units
}
/**
 * Out of a deposit. `refuse`: what the market cannot pay out right now. `queueSecs`: a queued exit
 * (a cooldown, a withdrawal request) — the payout lands that much later, in the tray like a bridge.
 */
export function withdrawPlan(o: { ledger: PaperLedger | null; h: Holding; units: number; all: boolean; receiveToken: string; feed: PriceFn; receiveName: { symbol: string; decimals: number }; refuse?: string | null; queueSecs?: number; queue?: string }): () => Promise<PaperBuilt> {
  return async () => {
    if (o.refuse) throw new Error(o.refuse)
    const p = posOf(o.ledger, o.h)
    const units = o.all ? valueOf(p, Date.now(), o.feed).units : o.units
    const arrivesAt = o.queueSecs ? Date.now() + o.queueSecs * 1000 : undefined
    return {
      op: { t: 'withdraw', id: p.id, units, all: o.all, receive: { token: o.receiveToken, units: payout(p, units, o.receiveToken, o.feed) }, ...(arrivesAt ? { arrivesAt, queue: o.queue ?? 'exit queue' } : {}) },
      names: [{ chainId: p.chainId, address: o.receiveToken, ...o.receiveName }],
      ...(arrivesAt ? { bridge: { name: o.queue ?? 'exit queue', toChainId: p.chainId }, arrivesAt } : {}),
    }
  }
}
/** A loop up: borrow `borrowUsd` more of the debt and hold what it buys, less the step's cost. */
export function leverPlan(o: { ledger: PaperLedger | null; h: Holding; borrowUsd: number; costUsd: number; feed: PriceFn }): () => Promise<PaperBuilt> {
  return async () => {
    const p = posOf(o.ledger, o.h)
    const { pHeld, pDebt } = legPrices(p, o.feed)
    if (!(pHeld > 0) || !(pDebt > 0)) throw new Error('No price for this loop right now.')
    const op: PaperOp = { t: 'lever', id: p.id, addUnits: Math.max(0, o.borrowUsd - o.costUsd) / pHeld, addDebt: o.borrowUsd / pDebt, costUsd: o.costUsd }
    return { op }
  }
}
/**
 * A loop down. A deleverage sells `sellUsd` of collateral and repays what it fetches, less the cost.
 * A close sells all of it into the debt token (or, `keep`, only what repays the debt) and pays the
 * rest back — the same two payouts the real close offers.
 */
export function reducePlan(o: { ledger: PaperLedger | null; h: Holding; closing: boolean; keep: boolean; sellUsd: number; costUsd: number; feed: PriceFn }): () => Promise<PaperBuilt> {
  return async () => {
    const p = posOf(o.ledger, o.h)
    const v = valueOf(p, Date.now(), o.feed)
    const { pHeld, pDebt } = legPrices(p, o.feed)
    const d = p.snap.debt!
    if (!(pHeld > 0) || !(pDebt > 0)) throw new Error('No price for this loop right now.')
    if (!o.closing) {
      const units = o.sellUsd / pHeld, repay = Math.max(0, o.sellUsd - o.costUsd) / pDebt
      return { op: { t: 'reduce', id: p.id, units, debtUnits: Math.min(repay, v.debtUnits), receive: [], costUsd: o.costUsd } }
    }
    const left = v.heldUsd - v.debtUsd - o.costUsd
    if (!(left > 0)) throw new Error('This loop has no equity left to pay back.')
    const pColl = o.feed(p.chainId, p.snap.held.address) ?? pHeld
    const receive = o.keep ? [{ token: p.snap.held.address, units: left / pColl }] : [{ token: d.address, units: left / pDebt }]
    return {
      op: { t: 'reduce', id: p.id, units: v.units, debtUnits: v.debtUnits, all: true, receive, costUsd: o.costUsd },
      names: [{ chainId: p.chainId, address: d.address, symbol: d.symbol, decimals: d.decimals, logo: d.logo }, { chainId: p.chainId, address: p.snap.held.address, symbol: p.snap.held.symbol, decimals: p.snap.held.decimals, logo: p.snap.held.logo }],
    }
  }
}

/** A loan's snapshot: both legs marked to market, the market's two limits kept to refuse past them. */
export function borrowSnap(o: BorrowOffer): PaperSnap {
  return {
    asset: o.asset, group: o.group, label: `${o.collateral.symbol} → ${o.debt.symbol} loan`, venue: o.venue, logo: o.collateral.logo,
    marketUid: o.collateral.uid, debtUid: o.debt.uid, lender: o.lender,
    held: leg(o.collateral.symbol, o.collateral.decimals, o.collateral.address, o.collateral.price ?? 0, o.collateral.logo),
    debt: leg(o.debt.symbol, o.debt.decimals, o.debt.address, o.debt.price ?? 1, o.debt.logo),
    liqLtv: o.liqLtv, maxLtv: o.maxLtv, mode: 'live', nature: o.assetClass ?? 'savings',
  }
}
/**
 * A loan, or more of one (tickets/0008): `collUnits` of the collateral out of the bank (paid as
 * `payToken`, the gas coin into its wrapper's market included), `debtUnits` of the debt into it.
 * Not against a stock yet: the price this app has for tokenized stocks is not to be trusted
 * (tickets/0009 risk 3), and a paper loan is marked to it.
 */
export function borrowPlan(o: { offer: BorrowOffer; into?: Holding | null; payToken: string; collUnits: number; debtUnits: number; borrowApr: number }): () => Promise<PaperBuilt> {
  return async () => {
    if (o.offer.assetClass) throw new Error(`Paper loans against ${o.offer.ticker ?? 'stocks'} open once the app has a price for tokenized stocks it can trust. Borrow against crypto on paper meanwhile.`)
    if (!(o.collUnits > 0) && !(o.debtUnits > 0)) throw new Error('Put something up or borrow something.')
    const into = o.into?.paper ? o.into.key.slice('paper:'.length) : undefined
    return {
      op: { t: 'borrow', id: paperId(), ...(into ? { into } : {}), chainId: o.offer.chainId, strategyId: o.offer.id, snap: borrowSnap(o.offer), collateral: { token: o.payToken, units: o.collUnits }, debtUnits: o.debtUnits, rate: { supply: 0, borrow: o.borrowApr } },
      names: [{ chainId: o.offer.chainId, address: o.offer.debt.address, symbol: o.offer.debt.symbol, decimals: o.offer.debt.decimals, logo: o.offer.debt.logo }],
    }
  }
}
/** A loan down: pay `repayUnits` back (or all of it) and take `withdrawUnits` of the collateral out (or all of it). */
export function repayPlan(o: { ledger: PaperLedger | null; h: Holding; repayUnits: number; repayAll: boolean; withdrawUnits: number; withdrawAll: boolean }): () => Promise<PaperBuilt> {
  return async () => {
    const p = posOf(o.ledger, o.h)
    const d = p.snap.debt!
    return {
      op: { t: 'repay', id: p.id, debtUnits: o.repayUnits, ...(o.repayAll ? { repayAll: true } : {}), withdraw: o.withdrawUnits, ...(o.withdrawAll ? { withdrawAll: true } : {}) },
      names: [{ chainId: p.chainId, address: p.snap.held.address, symbol: p.snap.held.symbol, decimals: p.snap.held.decimals, logo: p.snap.held.logo }, { chainId: p.chainId, address: d.address, symbol: d.symbol, decimals: d.decimals, logo: d.logo }],
    }
  }
}
