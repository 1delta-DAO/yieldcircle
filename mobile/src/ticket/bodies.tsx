import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { fromUnits, heldRaw, portion } from '@yieldcircle/core/model/amount'
import { dropOf, offerFromHolding, type BorrowOffer } from '@yieldcircle/core/model/borrow'
import { debtWord, depositLines, leverTag, loopLines, moneyWord, bufferOfHealth } from '@yieldcircle/core/model/lite'
import { liqBuffer, netAprAtLeverage } from '@yieldcircle/core/model/leverage'
import { num, pct, usd, cents } from '@yieldcircle/core/model/format'
import type { LoopStrategy, SimpleStrategy } from '@yieldcircle/core/model/strategies'
import type { Holding, Idle } from '@yieldcircle/core/model/positions'
import { NO_ROUTE, floor6, getForms } from '@yieldcircle/core/model/ticket'
import { normAddr } from '@yieldcircle/core/model/address'
import { useSimpleTicket } from '@yieldcircle/app/tickets/simple'
import { useLoopTicket } from '@yieldcircle/app/tickets/loop'
import { useWithdrawTicket } from '@yieldcircle/app/tickets/withdraw'
import { useManageLoop } from '@yieldcircle/app/tickets/manageLoop'
import { useRepayTicket } from '@yieldcircle/app/tickets/repay'
import { C } from '../theme'
import { Sk } from '../ui/bits'
import { Txt } from '../ui/Txt'
import { Action, AmountBox, AmtSub, Cells, GetLine, Lbl, Lines, LossAck, Plain, Presets, Sec } from './parts'
import { GetSheet } from './get'

/**
 * Lite's ticket bodies, the web's `lite` branches of `SimpleTicket`, `LoopTicket`, `ManageTicket`
 * and `ManageLoop`, drawn natively. Every number and the ladder come from the same shared hooks the
 * web's ticket runs on (`@yieldcircle/app/tickets/*`).
 */

/** A deposit: how much, the three lines, one button. */
export function DepositBody({ s, idle, allIdle, into }: { s: SimpleStrategy; idle: Idle[]; allIdle: Idle[]; into: Holding | null }) {
  const t = useSimpleTicket(s, idle, allIdle, into)
  return (
    <>
      <Sec>
        <Lbl>How much</Lbl>
        <AmountBox unit={t.unit} value={t.amt} onChange={t.setAmt} onMax={t.idle ? () => t.setAmt(portion(t.idle!, 100, t.chosen.decimals)) : undefined} />
        {t.idle && t.idle.amount > 0 && <Presets onPick={(p) => t.setAmt(portion(t.idle!, p, t.chosen.decimals))} />}
        <AmtSub left={t.unit === '$' ? '' : `≈ ${usd(t.amtUsd)}`} right={t.account ? `You have ${t.idle ? `${num(t.idle.amount, 4)} ${t.idle.symbol}` : `no ${t.chosen.symbol}`} here` : ''} warn={t.more ? 'more than you have' : undefined} />
        <GetLine account={t.account} short={!t.idle || t.more} symbol={t.chosen.symbol} onOpen={() => t.setGetOpen(true)} />
        {t.getOpen && <GetSheet targets={t.opts.map((o) => ({ chainId: s.chainId, address: o.address, symbol: o.symbol, decimals: o.decimals, price: t.price, logo: o.role === 'token' ? s.logo : undefined, have: t.balOf(o.address)?.amount ?? 0 }))} want={t.amount} sources={allIdle}
          onTarget={(x) => t.setRole(t.opts.find((o) => o.address === x.address)?.role ?? null)} onClose={() => t.setGetOpen(false)} />}
      </Sec>
      <Lines l={depositLines({ rate: s.rate, amountUsd: t.amtUsd, exitWord: t.exit.word, exitWhen: t.exit.when, tight: t.tight, maturity: s.maturity, booked: !!s.booked, rewards: s.rewards })} />
      <Action ladder={t.ladder} label={`Put ${t.unit === '$' ? usd(t.amtUsd) : `${num(t.amount, 4)} ${t.chosen.symbol}`} to work`} account={t.account} isConnected={t.isConnected} disabled={!(t.amount > 0)} chainId={s.chainId} />
    </>
  )
}

/** A loop: how much, Lite's leverage (the copied wallet's, else Balanced), the three lines, one button. */
export function LoopBody({ s, idle, allIdle, holding, copyLev }: { s: LoopStrategy; idle: Idle[]; allIdle: Idle[]; holding: Holding | null; copyLev?: number }) {
  const t = useLoopTicket(s, idle, allIdle, holding, { lite: true, copyLev })
  const unit = t.chosen?.symbol ?? t.unit
  return (
    <>
      <Sec>
        <Lbl>How much</Lbl>
        {t.noPay && <Txt s={12.5} c={C.bad} style={{ marginBottom: 10 }}>{t.pay.data!.notes[0] ?? 'This venue takes no margin with the loop.'}</Txt>}
        <AmountBox unit={unit} value={t.amt} onChange={t.setAmt} onMax={t.bal && t.chosen ? () => t.setAmt(portion(t.bal!, 100, t.chosen!.decimals)) : undefined} />
        {t.bal && t.chosen && t.bal.amount > 0 && <Presets onPick={(p) => t.setAmt(portion(t.bal!, p, t.chosen!.decimals))} />}
        <AmtSub left={`≈ ${usd(t.E)}`} right={t.account ? `You have ${t.bal ? `${num(t.bal.amount, 4)} ${t.chosen?.symbol}` : `no ${t.chosen?.symbol ?? ''}`} here` : ''} warn={t.more ? 'more than you have' : undefined} />
        {t.chosen && <GetLine account={t.account} short={!t.bal || t.more} symbol={t.chosen.symbol} onOpen={() => t.setGetOpen(true)} />}
        {t.getOpen && t.chosen && <GetSheet targets={getForms(t.opts, t.chosen, s.chainId).map((o) => ({ chainId: s.chainId, address: o.address, symbol: o.symbol, decimals: o.decimals, price: o.price || t.price || 0, logo: o.logo, have: t.balOf(o.address, o.symbol)?.amount ?? 0 }))} want={t.amount} sources={allIdle}
          onTarget={(x) => t.setPayAddr(t.opts.find((o) => normAddr(o.address) === normAddr(x.address))?.address ?? null)} onClose={() => t.setGetOpen(false)} />}
        {t.short && <Txt s={12.5} c={C.warn} style={{ marginTop: 8 }}><Txt s={12.5} w={700} c={C.warn}>Too big for one lender.</Txt> {t.short.message}</Txt>}
      </Sec>
      <Lines l={loopLines({ net: t.net, amountUsd: t.E, lev: t.L, drop: t.drop, holds: moneyWord(s.asset, s.group), debt: debtWord(s), dollarDebt: s.group === 'USD', expiry: s.expiry, cost: t.econ ? t.cost : null, payback: t.payback, quoting: t.q.isFetching && t.amount > 0, staleHours: t.staleRef ? t.staleRef.ageHours ?? 0 : null })} />
      {t.econ && <View style={{ paddingHorizontal: 16 }}><LossAck v={t.vc} what="Opening this loop" advice="Lower the amount, or open Details for a lower leverage: the swap is sized on the whole position." /></View>}
      {t.noRoute && <Txt s={12.5} c={C.bad} style={{ marginHorizontal: 16, marginVertical: 10 }}>{NO_ROUTE}</Txt>}
      <Action ladder={t.ladder} label={`Open ${leverTag(t.L)} loop · ${usd(t.E)}`} account={t.account} isConnected={t.isConnected}
        disabled={!(t.amount > 0) || !t.chosen || t.noRoute || !!t.short || t.vc.blocked || !!t.paperRefuse} risky={t.vc.severe}
        blockedNote={t.noPay ? 'This venue takes no margin with the loop' : t.short ? 'Too big for one lender — lower the amount' : t.vc.blocked ? `Confirm the ${cents(-t.vc.diff)} loss above to continue` : t.paperRefuse ?? undefined} chainId={s.chainId} />
    </>
  )
}

/** Taking money out of a deposit: how much (all of it to start), what comes back and when. */
export function WithdrawBody({ s, h }: { s: SimpleStrategy | null; h: Holding }) {
  const t = useWithdrawTicket(s, h, 'reduce', { lite: true })
  return (
    <>
      {!t.all && <Sec>
        <Lbl>How much <Txt s={12} w={600} c={C.tx50}>· of {usd(h.valueUsd)}</Txt></Lbl>
        <AmountBox unit={h.symbol} value={t.amt} onChange={t.setAmt} />
        <Presets onPick={(p) => t.setAmt(portion(heldRaw(h), p, h.decimals))} />
        {t.amount > h.amount + 1e-9 && <AmtSub warn="more than you have" />}
      </Sec>}
      <Cells hero={{ k: 'You get back', v: usd(t.eff * t.price), s: `${num(t.eff, 4)} ${t.outSym} to your wallet` }} cells={t.exit ? [{ k: 'When', v: t.exit.word, s: t.exit.when }] : []} />
      <Action ladder={t.ladder} label={t.fullExit ? `Withdraw all · ${usd(t.eff * t.price)}` : `Withdraw ${usd(t.eff * t.price)}`} account={t.account} isConnected={t.isConnected} disabled={!(t.eff > 0) || !!t.paperRefuse} blockedNote={t.paperRefuse ?? undefined} chainId={h.chainId} />
    </>
  )
}

/** A held loop: "Lower risk" — one of three targets by distance from liquidation — or Close. */
export function ManageLoopBody({ s, h, close }: { s: LoopStrategy | null; h: Holding; close: boolean }) {
  const t = useManageLoop(s, h, close, { lite: true })
  if (!t.closing) {
    const bufNow = t.liqLtv != null ? liqBuffer(t.liqLtv, t.Lnow) : bufferOfHealth(h.health)
    return (
      <>
        <Sec>
          <Lbl>How much safer <Txt s={12} w={600} c={C.tx50}>· today {leverTag(t.Lnow)}{bufNow != null ? `, ${pct(bufNow * 100, 1)} from liquidation` : ''}</Txt></Lbl>
          {t.safer.length ? (
            <View style={{ gap: 6, marginTop: 6 }}>
              {t.safer.map((x) => {
                const n = s ? netAprAtLeverage(s.depSpot, t.borAt(t.E * (x.L - 1) - t.D), x.L) : null
                const on = Math.abs(t.L - x.L) < 0.02
                return (
                  <Pressable key={x.word} onPress={() => t.setL(x.L)} style={[st.safer, on && { borderColor: C.primary, backgroundColor: C.priBg }]}>
                    <View style={{ flex: 1 }}>
                      <Txt w={700}>{x.word}</Txt>
                      <Txt s={12} c={C.tx70}>{leverTag(x.L)} · {pct(x.buffer * 100, 0)} from liquidation</Txt>
                    </View>
                    {n != null && <Txt s={13} w={600} c={n >= 0 ? C.ok : C.bad}>earns {pct(n)}</Txt>}
                  </Pressable>
                )
              })}
            </View>
          ) : <Plain tone="dim">{t.liqLtv == null ? 'This venue reports no health for it here: lower it in Details.' : 'It is already well away from liquidation. Close it, or pick a leverage in Details.'}</Plain>}
          {!t.same && t.safer.length > 0 && <View style={{ marginTop: 10 }}><Plain>Sells about <Txt s={13} w={700}>{usd(t.sellUsd)}</Txt> of {t.holds} to pay back {t.debt}. Nothing comes out of your wallet.</Plain></View>}
        </Sec>
        <Cells hero={s && !t.loan ? { k: 'Earns after', v: t.net == null ? '—' : pct(t.net), s: `was ${pct(netAprAtLeverage(s.depSpot, s.borSpot, t.Lnow))}`, tone: t.net == null ? '' : t.net >= 3 ? 'ok' : t.net < 0 ? 'bad' : '' } : undefined} cells={[
          { k: 'From liquidation', v: t.drop == null ? '—' : pct(t.drop * 100, 1), s: bufNow != null ? `was ${pct(bufNow * 100, 1)}` : '', tone: t.drop == null ? '' : t.drop < 0.05 ? 'bad' : t.drop < 0.1 ? 'warn' : 'ok' },
          { k: 'Still yours', v: usd(t.E), s: "less the swap's cost" },
        ]} />
        <Action ladder={t.ladder} label={t.same || !t.safer.length ? 'Pick how much safer' : `Lower to ${leverTag(t.L)}`} account={t.account} isConnected={t.isConnected} disabled={t.same || !t.safer.length || !!t.closeBlock} chainId={h.chainId} />
      </>
    )
  }
  return (
    <>
      <Sec>
        <Plain tone={t.closeBlock && t.closeBlock !== 'short' ? 'dim' : undefined}>
          {t.closeBlock === 'pricing' ? 'Pricing the sale…'
            : t.closeBlock === 'no-route' ? 'No way to sell it right now. Try again shortly, or close it in Details.'
            : t.closeBlock ? 'The sale would not cover what you owe right now. Open Details to see why and what to do.'
            : `Everything is sold, the ${t.debt} you owe is repaid, and the rest comes back to your wallet.`}
        </Plain>
        {t.tight && !t.closeBlock && <View style={{ marginTop: 6 }}><Plain tone="warn">Tight: the close may revert at the worst fill (only gas is lost).</Plain></View>}
        {t.valued && <LossAck v={t.vc} what="Closing now" advice={`It can be worth waiting for ${t.holds} to trade closer to its price on the venue.`} />}
      </Sec>
      <Cells
        hero={{ k: 'You get back', v: t.cq.isPending ? <Sk w={60} h={14} /> : t.backUsd != null && t.backUsd > 0 ? usd(t.backUsd) : '—', tone: t.closeBlock === 'short' ? 'bad' : '', s: t.closeBlock ? '' : t.backDebt != null && !t.keep ? `≈ ${num(t.backDebt, 4)} ${t.debt}` : t.keep && t.backColl != null ? `≈ ${num(t.backColl, 4)} ${t.holds}` : '' }}
        cells={[{ k: 'Costs', v: t.sale?.exitCostUsd != null ? usd(t.sale.exitCostUsd) : '—', s: "the sale's slippage and fees" }]} />
      <Action ladder={t.ladder} label="Close and withdraw" account={t.account} isConnected={t.isConnected} disabled={t.same || !!t.closeBlock || t.vc.blocked} risky={t.vc.severe} blockedNote={t.vc.blocked ? `Confirm the ${cents(-t.vc.diff)} loss above to continue` : undefined} chainId={h.chainId} />
    </>
  )
}

/**
 * A loan (the web's `LiteLoanTicket`): Lite opens none, but a reader who holds one can end it — pay
 * it all back and take the collateral home, or pay part of it back to move away from liquidation.
 * Short of the coin it owes, the Get sheet buys it in place.
 */
export function LoanBody({ h, idle }: { h: Holding; idle: Idle[] }) {
  const o = React.useMemo(() => offerFromHolding(h), [h])
  const [pane, setPane] = React.useState<'all' | 'some'>((bufferOfHealth(h.health) ?? 1) < 0.1 ? 'some' : 'all')
  if (!o) return <Sec><Plain tone="warn">This loan can’t be read well enough to pay back here. Open it in Details.</Plain></Sec>
  return (
    <>
      <Sec>
        <View style={st.modes}>
          {(['all', 'some'] as const).map((x) => (
            <Pressable key={x} onPress={() => setPane(x)} style={[st.mode, pane === x && st.modeOn]}>
              <Txt s={13} c={pane === x ? C.primary : C.tx50}>{x === 'all' ? 'Pay back all' : 'Pay back some'}</Txt>
            </Pressable>
          ))}
        </View>
      </Sec>
      <RepayBody key={h.key + pane} o={o} h={h} idle={idle} lite={pane} />
    </>
  )
}

function RepayBody({ o, h, idle, lite }: { o: BorrowOffer; h: Holding; idle: Idle[]; lite: 'all' | 'some' }) {
  const t = useRepayTicket(o, h, idle, lite)
  const [getOpen, setGetOpen] = React.useState(false)
  return (
    <>
      <Sec>
        {lite === 'some' && <>
          <Lbl>How much to pay back <Txt s={12} w={600} c={C.tx50}>· of {usd(t.owedUsd - t.otherDebtUsd)}</Txt></Lbl>
          <AmountBox unit={o.debt.symbol} value={t.repayAmt} onChange={t.setRepay} onMax={() => t.setRepay(fromUnits(t.owed))} />
          <Presets onPick={(p) => t.setRepay(fromUnits(p === 100 ? t.owed : floor6(t.owed * p / 100)))} />
        </>}
        {lite === 'all' && <Plain>You pay back the {usd(t.owedUsd - t.otherDebtUsd)} you owe, interest to the block included, and your {num(t.held, 4)} {o.collateral.symbol} comes back to your wallet.</Plain>}
        {!!t.account && <AmtSub right={`You have ${num(t.debtBal?.amount ?? 0, 2)} ${o.debt.symbol}`} warn={t.shortDebt ? 'not enough' : undefined} />}
        {t.shortDebt && <GetLine account={t.account} short symbol={o.debt.symbol} onOpen={() => setGetOpen(true)} />}
        {getOpen && o.debt.address && <GetSheet targets={[{ chainId: o.chainId, address: o.debt.address, symbol: o.debt.symbol, decimals: o.debt.decimals, price: t.debtPrice, logo: o.debt.logo, have: t.debtBal?.amount ?? 0 }]}
          want={Math.max(0, t.r - (t.debtBal?.amount ?? 0))} sources={idle} onClose={() => setGetOpen(false)} />}
      </Sec>
      <Cells hero={lite === 'all'
        ? { k: 'Back to you', v: usd(t.w * t.price), s: `${num(t.w, 4)} ${o.collateral.symbol}` }
        : { k: 'Owed after', v: usd(t.debtAfter), s: t.debtAfter > 0 ? `${pct(dropOf(t.collAfter, t.debtAfter, t.liq) * 100, 0)} from liquidation after` : 'nothing owed' }} cells={[]} />
      <Action ladder={t.ladder} label={lite === 'all' ? `Pay back ${usd(t.r * t.debtPrice)} and take it home` : `Pay back ${usd(t.r * t.debtPrice)}`} account={t.account} isConnected={t.isConnected} disabled={!!t.liteBlocked} blockedNote={t.liteBlocked ?? undefined} chainId={o.chainId} />
    </>
  )
}

const st = StyleSheet.create({
  safer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.b300, borderWidth: 1, borderColor: 'transparent' },
  modes: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mode: { minHeight: 32, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', justifyContent: 'center' },
  modeOn: { borderColor: C.primary, backgroundColor: '#062830' },
})
