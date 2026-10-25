import React from 'react'
import { unitOf } from '@yieldcircle/core/model/assets'
import { fromUnits, payRaw, unitsOf } from '@yieldcircle/core/model/amount'
import { exitTerms, type SimpleStrategy } from '@yieldcircle/core/model/strategies'
import type { Holding, Idle } from '@yieldcircle/core/model/positions'
import { earnDeposit } from '@yieldcircle/core/sdk/api'
import { isSvmChain } from '@yieldcircle/core/model/address'
import { isSavings } from '@yieldcircle/core/model/nature'
import { payOptions, paysNative, sameToken, type PayRole } from '@yieldcircle/core/model/ticket'
import { slippageFor, useSettings } from '../state/Settings'
import { useSticky, useStickyAmount } from '../sticky'
import { stepsFrom, useTicketLadder } from '../ladder'
import { useSession } from '../session'
import { depositPlan } from './paperPlans'
import { usePaperView } from './paper'

/**
 * A plain deposit's ticket, everything but the screen (the web's `SimpleTicket`, the phone's
 * deposit sheet): what it is paid with, how much, what it earns, and the ladder that builds and
 * signs it. `into`: the held position an Add tops up — its sub-account is named, or the deposit
 * lands in the venue's default (Euler 0) or a new Fluid / Jupiter Lend position.
 */
export function useSimpleTicket(s: SimpleStrategy, chainIdle: Idle[], allIdle: Idle[], into?: Holding | null) {
  const session = useSession()
  const account = session.account, isConnected = !!session.isConnected
  const actorOn = session.actorOn ?? (() => undefined)
  // who the API builds for: the VM's own signer — a Solana row is built for the Solana wallet
  const actor = actorOn(s.chainId)
  const [getOpen, setGetOpen] = React.useState(false)
  const opts = React.useMemo(() => payOptions(s), [s.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // the balance of the EXACT token: a wstETH row is not paid with the wallet's ETH, and WHYPE is not HYPE until the API is told so
  const balOf = (address: string) => chainIdle.find((i) => sameToken(i.address, address))
  const [role, setRole] = useSticky<PayRole | null>(`t:${s.id}:pay`, null)
  const chosen = opts.find((o) => o.role === role) ?? [...opts].sort((a, b) => (balOf(b.address)?.amount ?? 0) - (balOf(a.address)?.amount ?? 0))[0]
  const idle = balOf(chosen.address)
  // the token actually paid (WETH on Monad, where the gas coin is MON): the group's name ("ETH") is
  // not what the wallet sends. Dollars stay dollars — a stablecoin amount is entered 1:1 as $.
  const unit = unitOf(s.asset) === '$' ? '$' : chosen.symbol
  // the row rarely carries a price: any pay option's balance has it (the coin and its wrapper trade 1:1), else a same-asset balance as the estimate
  const price = s.priceUsd ?? opts.map((o) => balOf(o.address)?.price).find(Boolean) ?? allIdle.find((i) => i.asset === s.asset)?.price ?? (unit === '$' ? 1 : 0)
  const [amt, setAmt] = useStickyAmount(`t:${s.id}:amount`, () => fromUnits(unit === '$' ? 1000 : Math.min(idle?.amount ?? 1, 1)))
  const amount = unitsOf(amt)
  // what is sent: Max resolved on the exact balance, a typed amount parsed from its text and capped at it
  const sendRaw = payRaw(amt, chosen.decimals, idle)
  const amtUsd = amount * price
  const yearly = amtUsd * s.rate / 100
  // a PT is bought on its AMM: the API wants a bound on the fill, and a PT against its underlying is one money
  const st = useSettings().st
  const slip = s.booked ? slippageFor(st, isSavings(s.nature)) : undefined
  const key = [s.id, into?.accountId ?? '', sendRaw, chosen.role, actor ?? '', slip ?? ''].join('|')
  const paper = usePaperView()
  const ladder = useTicketLadder(key, s.chainId, async () => {
    const env = await earnDeposit({ earnUid: s.earnUid, amountRaw: sendRaw, operator: actor!, payAsset: chosen.role === 'native' ? chosen.address : undefined, slippageBp: slip, accountId: into?.accountId })
    if (chosen.role === 'native' && !paysNative(env.actions)) throw new Error(`${s.brand} does not take ${chosen.symbol} directly here. Pay with ${s.assetSymbol}.`)
    return stepsFrom(env.actions, s.via, s.chainId)
  }, [s.earnUid, s.marketUid], [chosen], depositPlan(s, { into, payToken: chosen.address, amount, price, feed: paper.price }),
    // the deposit's own build, unsigned — EVM only: Solana's builders simulate against the chain, where a paper address holds nothing
    !isSvmChain(s.chainId))
  const more = !!idle && amount > idle.amount
  // the exit line, said with this market's own numbers where it has them: a
  // pool that is 94 % lent out is not the "rare, short" case the generic
  // sentence describes, and the figure to check it against is right there
  const tight = s.utilization != null && s.utilization >= 0.9
  const exit = exitTerms(s)
  return { account, isConnected, actor, getOpen, setGetOpen, opts, balOf, role, setRole, chosen, idle, unit, price, amt, setAmt, amount, sendRaw, amtUsd, yearly, slip, key, ladder, more, tight, exit }
}
