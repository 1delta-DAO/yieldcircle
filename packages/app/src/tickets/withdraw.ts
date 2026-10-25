import { capRaw } from '@yieldcircle/core/model/leverage'
import { heldRaw, payRaw, portion, unitsOf } from '@yieldcircle/core/model/amount'
import { exitTerms, isBooked, type SimpleStrategy } from '@yieldcircle/core/model/strategies'
import { nativeDecimals, nativeSymbol, wrapsNative, type Holding } from '@yieldcircle/core/model/positions'
import { earnWithdraw, nativeAsset } from '@yieldcircle/core/sdk/api'
import { isSavings } from '@yieldcircle/core/model/nature'
import { usdShort } from '@yieldcircle/core/model/format'
import { NO_NATIVE_WITHDRAW, nativeMaxRounds, startsAny } from '@yieldcircle/core/model/ticket'
import { slippageFor, useSettings } from '../state/Settings'
import { useSticky, useStickyAmount } from '../sticky'
import { stepsFrom, useTicketLadder } from '../ladder'
import { useSession } from '../session'
import { withdrawPlan } from './paperPlans'
import { usePaperView } from './paper'

/**
 * Taking money out of a deposit the wallet holds, everything but the screen (the web's
 * `ManageTicket`, the phone's withdraw sheet): how much, in the token or the gas coin, a PT's
 * sale bound, and the ladder. `s` is null for a position the menu has no row for. Lite starts on
 * all of it and keeps its own amount apart from Pro's half.
 */
export function useWithdrawTicket(s: SimpleStrategy | null, h: Holding, mode: 'add' | 'reduce' | 'close' | 'manage', { lite }: { lite?: boolean } = {}) {
  const session = useSession()
  const account = session.account, isConnected = !!session.isConnected
  const actorOn = session.actorOn ?? (() => undefined)
  const actor = actorOn(h.chainId)
  const all = mode === 'close'
  // Lite starts on all of it, and keeps its own amount apart from Pro's half
  const [amt, setAmt] = useStickyAmount(`t:${h.key}:withdraw${lite ? ':lite' : ''}`, () => portion(heldRaw(h), lite ? 100 : 50, h.decimals))
  const amount = unitsOf(amt)
  const eff = all ? h.amount : Math.min(amount, h.amount)
  const share = h.amount > 0 ? eff / h.amount : 0
  // out of a wrapped-native row the gas coin is one tap away (`receiveAsset` = `nativeAsset`, unwrapped in the
  // same bundle). Not the default: the unwrap goes through a gateway, the composer or Morpho's
  // adapter, which costs an approve or an authorization the plain withdraw does not
  const venueKey = s?.venueKey ?? h.earnUid ?? h.lender ?? ''
  const canNative = s?.nativeOut ?? (wrapsNative(h.chainId, h.assetAddress ?? s?.assetAddress) && !startsAny(venueKey, NO_NATIVE_WITHDRAW))
  const fullExit = all || share > 0.999
  // a native full exit through a rounding gateway reverts every time — the coin stays offered for a partial exit
  const maxRounds = canNative && fullExit && nativeMaxRounds(venueKey, h.chainId)
  const coin = nativeSymbol(h.chainId)
  const [asNative, setAsNative] = useSticky<boolean>(`t:${h.key}:receive-native`, false)
  const native = canNative && asNative && !maxRounds
  const outSym = native ? coin : h.symbol
  const rate = s?.rate ?? h.apr
  // a PT is SOLD on its AMM before maturity: a bound on the fill is required, and `isAll` is refused (the raw amount is exact anyway)
  const booked = s?.booked ?? isBooked(h.earnUid ?? '')
  const st = useSettings().st
  const slip = booked ? slippageFor(st, s ? isSavings(s.nature) : true) : undefined
  // Max and 100 % are the exact holding; a typed amount is parsed from its text and capped at it
  const sendRaw = (all || (booked && fullExit)) && h.amountRaw ? h.amountRaw : all ? capRaw(eff, h.decimals, heldRaw(h)) : payRaw(amt, h.decimals, heldRaw(h))
  const key = [s?.id ?? h.key, h.accountId ?? '', mode, sendRaw, native ? 'native' : 'token', actor ?? '', slip ?? ''].join('|')
  const paper = usePaperView()
  // on paper (tickets/0006): an instant exit pays out only what can leave the market now; a queued
  // one (a cooldown, a request) lands after the venue's wait — a week where it publishes none
  const px = h.amount > 0 ? h.valueUsd / h.amount : 0
  const instant = !s || !!s.maturity || ['instant', 'instant-capped', 'market-sale', 'instant-or-queued'].includes(s.exitMode)
  const queueSecs = instant ? 0 : s?.exitSecs ?? 7 * 86_400
  const queueWord = instant || !s ? undefined : s.exitMode === 'fixed-cooldown' ? 'cooldown' : 'exit queue'
  const paperRefuse = !paper.active || !instant || !s || s.liquidityUsd == null || eff * px <= s.liquidityUsd ? null
    : `Only ${usdShort(s.liquidityUsd)} can leave this market right now — withdraw less, or wait for borrowers to repay.`
  const ladder = useTicketLadder(key, h.chainId, async () => {
    const env = await earnWithdraw({ earnUid: s?.earnUid ?? h.earnUid!, amountRaw: sendRaw, operator: actor!, isAll: fullExit && !booked, receiveAsset: native ? nativeAsset(h.chainId) : undefined, slippageBp: slip, accountId: h.accountId })
    return stepsFrom(env.actions, 'Withdraw', h.chainId)
  }, [s?.earnUid, h.earnUid], [native ? { address: nativeAsset(h.chainId), symbol: coin } : { address: h.assetAddress ?? s?.assetAddress, symbol: h.symbol }],
    withdrawPlan({ ledger: paper.ledger, h, units: eff, all: fullExit, receiveToken: native ? nativeAsset(h.chainId) : (h.assetAddress ?? s?.assetAddress ?? ''), feed: paper.price, receiveName: native ? { symbol: coin, decimals: nativeDecimals(h.chainId) } : { symbol: h.symbol, decimals: h.decimals }, refuse: paperRefuse, queueSecs, queue: queueWord }))
    // no dry-run on an exit: where the API cannot build one (Lido's queue, say) a real user leaves on
    // the venue's own site — a paper account has nowhere else to go, so it is never locked in
  const price = h.amount > 0 ? h.valueUsd / h.amount : 0
  const exit = s && exitTerms(s)
  return { account, isConnected, actor, all, amt, setAmt, amount, eff, share, venueKey, canNative, fullExit, maxRounds, coin, asNative, setAsNative, native, outSym, rate, booked, st, slip, sendRaw, key, paper, px, instant, queueSecs, queueWord, paperRefuse, ladder, price, exit }
}
