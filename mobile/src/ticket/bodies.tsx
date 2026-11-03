import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { fromUnits, heldRaw, portion, unitsOf, type Amount } from '@yieldcircle/core/model/amount'
import { ZONES, collateralOf, dropOf, offerFromHolding, owedOf, type BorrowOffer } from '@yieldcircle/core/model/borrow'
import { brandOf, closeLines, debtWord, depositLines, leverTag, liteTiers, loopLines, moneyWord, overLtv, bufferOfHealth, plainName, riskWord, saferLines, shownDp, withdrawLines } from '@yieldcircle/core/model/lite'
import { DEFAULT_TIER, liqBuffer, netAprAtLeverage, type TierId } from '@yieldcircle/core/model/leverage'
import { num, pct, usd, usdShort, cents } from '@yieldcircle/core/model/format'
import { dayMonth, daysWord } from '@yieldcircle/core/model/ticket'
import { chainLabel } from '@yieldcircle/app/sdk/queries'
import type { LoopStrategy, SimpleStrategy } from '@yieldcircle/core/model/strategies'
import type { Holding, Idle } from '@yieldcircle/core/model/positions'
import { NO_ROUTE, floor6, getForms } from '@yieldcircle/core/model/ticket'
import { normAddr } from '@yieldcircle/core/model/address'
import { useSimpleTicket } from '@yieldcircle/app/tickets/simple'
import { useLoopTicket } from '@yieldcircle/app/tickets/loop'
import { useWithdrawTicket } from '@yieldcircle/app/tickets/withdraw'
import { useManageLoop } from '@yieldcircle/app/tickets/manageLoop'
import { useRepayTicket } from '@yieldcircle/app/tickets/repay'
import { ZONE_ORDER, loopLoanOffer, sig4, useBorrowTicket, useTopUpTicket } from '@yieldcircle/app/tickets/borrow'
import { C } from '../theme'
import { Txt } from '../ui/Txt'
import { Action, AmountBox, AmtLine, AmtSub, Cells, Choices, GetLine, Lbl, Lines, LossAck, MoreNote, MoreSheet, Numbers, Plain, Presets, Sec } from './parts'
import { GetSheet } from './get'

/**
 * Lite's ticket bodies, the web's `lite` branches of `SimpleTicket`, `LoopTicket`, `ManageTicket`
 * and `ManageLoop`, drawn natively. Every number and the ladder come from the same shared hooks the
 * web's ticket runs on (`@yieldcircle/app/tickets/*`). Each draws its own "More choices" (`MoreSheet`).
 */
const whereOf = (venue: string, chainId: string | number): [string, string] => ['Where', `${venue.split(' · ')[0]} · ${chainLabel(chainId as never)}`]

/** A deposit: how much, the three lines, one button. */
export function DepositBody({ s, idle, allIdle, into }: { s: SimpleStrategy; idle: Idle[]; allIdle: Idle[]; into: Holding | null }) {
  const t = useSimpleTicket(s, idle, allIdle, into, { lite: true })
  const dp = shownDp(t.dollar)
  return (
    <>
      <Sec>
        <Lbl>How much</Lbl>
        <AmountBox unit={t.unit} value={t.amt} onChange={t.setAmt} onMax={t.idle ? () => t.setAmt(portion(t.idle!, 100, t.chosen.decimals, dp)) : undefined} />
        {t.idle && t.idle.amount > 0 && <Presets onPick={(p) => t.setAmt(portion(t.idle!, p, t.chosen.decimals, dp))} />}
        <AmtLine account={t.account} have={t.idle && t.idle.amount > 0 ? `${num(t.idle.amount, dp)} ${t.idle.symbol}` : null} usdOf={t.dollar ? undefined : `≈ ${usd(t.amtUsd)}`} more={t.more} />
        <GetLine account={t.account} short={!t.idle || t.more} symbol={t.chosen.symbol} onOpen={() => t.setGetOpen(true)} />
        {t.getOpen && <GetSheet targets={t.opts.map((o) => ({ chainId: s.chainId, address: o.address, symbol: o.symbol, decimals: o.decimals, price: t.price, logo: o.role === 'token' ? s.logo : undefined, have: t.balOf(o.address)?.amount ?? 0 }))} want={t.amount} sources={allIdle}
          onTarget={(x) => t.setRole(t.opts.find((o) => o.address === x.address)?.role ?? null)} onClose={() => t.setGetOpen(false)} />}
      </Sec>
      <Lines l={depositLines({ rate: s.rate, amountUsd: t.amtUsd, exitWord: t.exit.word, exitWhen: t.exit.when, tight: t.tight, maturity: s.maturity, booked: !!s.booked, rewards: s.rewards })} />
      <Action ladder={t.ladder} label={`Put ${t.dollar ? usd(t.amtUsd) : `${num(t.amount, 4)} ${t.chosen.symbol}`} to work`} account={t.account} isConnected={t.isConnected} disabled={!(t.amount > 0)} chainId={s.chainId} />
      <MoreSheet>
        {t.opts.length > 1 && <Choices label="Pay with" items={t.opts.map((o) => ({ id: o.role, word: o.symbol, line: o.role === 'native' ? `wrapped into ${s.assetSymbol} for you` : 'as it is', side: t.account ? `you have ${num(t.balOf(o.address)?.amount ?? 0, dp)}` : undefined }))} on={t.chosen.role} onPick={(r) => t.setRole(r)} />}
        <Numbers rows={[
          ['Rate now', `${pct(s.rate)} a year`],
          ...(s.rewards > 0.05 ? [['Of which rewards', `${pct(s.rewards)} · can stop without notice`] as [string, string]] : []),
          ['Way out', `${t.exit.word} · ${t.exit.when}`],
          ['In it', usdShort(s.tvlUsd)],
          ...(s.utilization != null ? [['Lent out', `${Math.round(s.utilization * 100)}%${t.tight ? ' · a big exit waits' : ''}`] as [string, string]] : []),
          ['Risk', riskWord(s.risk)],
          ['Where', `${brandOf(s)} · ${chainLabel(s.chainId)}`],
        ]} />
      </MoreSheet>
    </>
  )
}

/** A loop: how much, Lite's leverage (the copied wallet's, else Balanced), the three lines, one button. */
export function LoopBody({ s, idle, allIdle, holding, copyLev }: { s: LoopStrategy; idle: Idle[]; allIdle: Idle[]; holding: Holding | null; copyLev?: number }) {
  const t = useLoopTicket(s, idle, allIdle, holding, { lite: true, copyLev })
  const unit = t.chosen?.symbol ?? t.unit
  const dollar = t.unit === '$' || (t.price > 0.9 && t.price < 1.1), dp = shownDp(dollar)
  // what the loop holds, in Lite's words: never a PT's or a share's ticker
  const holdsWord = plainName(s).title
  // Edit on the Earn line (web's `levEdit`): − and + in tenths, inside Lite's range; a venue refusing the size (max LTV) opens it
  const ltvRefused = t.overCap || overLtv(t.ladder.err) || overLtv((t.q.error as Error | null)?.message)
  const [editLev, setEditLev] = React.useState(false)
  React.useEffect(() => { if (ltvRefused) setEditLev(true) }, [ltvRefused])
  const step = (d: number) => t.setLiteLev(Math.round((t.L + d) * 10) / 10)
  const levEdit = t.heldL == null && t.liteHi > t.liteLo + 0.05 ? {
    open: editLev, onToggle: () => setEditLev(!editLev), label: 'Set the leverage',
    body: <>
      {ltvRefused && <Txt s={12.5} c={C.warn}>{brandOf(s)} will not lend this much against the collateral{t.overCap && t.ltvQ != null ? ` once the swap is paid (${pct(t.ltvQ * 100, 1)} borrowed of the ${pct(t.capLtv * 100, 0)} it allows)` : ''}: lower the leverage.</Txt>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Less leverage" disabled={t.L <= t.liteLo} onPress={() => step(-0.1)} style={stepSt}><Txt s={18} w={700}>−</Txt></Pressable>
        <Txt s={18} w={600} c={t.drop < 0.05 ? C.bad : t.drop < 0.1 ? C.warn : C.tx} style={{ minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{num(t.L, 2)}×</Txt>
        <Pressable accessibilityRole="button" accessibilityLabel="More leverage" disabled={t.L >= t.liteHi} onPress={() => step(0.1)} style={stepSt}><Txt s={18} w={700}>+</Txt></Pressable>
        {t.liteLev != null && <Pressable onPress={() => t.pickLiteTier(t.liteTier)} hitSlop={8}><Txt s={12.5} c={C.primary}>Back to {t.liteTier ? 'the tier' : 'Lite’s pick'}</Txt></Pressable>}
      </View>
      <Txt s={12} c={C.tx50}>Lower earns less and sits further from liquidation.</Txt>
    </>,
  } : undefined
  return (
    <>
      <Sec>
        <Lbl>How much</Lbl>
        {t.noPay && <Txt s={12.5} c={C.bad} style={{ marginBottom: 10 }}>{t.pay.data!.notes[0] ?? 'This venue takes no margin with the loop.'}</Txt>}
        <AmountBox unit={unit} value={t.amt} onChange={t.setAmt} onMax={t.bal && t.chosen ? () => t.setAmt(portion(t.bal!, 100, t.chosen!.decimals, dp)) : undefined} />
        {t.bal && t.chosen && t.bal.amount > 0 && <Presets onPick={(p) => t.setAmt(portion(t.bal!, p, t.chosen!.decimals, dp))} />}
        <AmtLine account={t.account} have={t.bal && t.bal.amount > 0 ? `${num(t.bal.amount, dp)} ${t.chosen?.symbol ?? ''}` : null} usdOf={dollar ? undefined : `≈ ${usd(t.E)}`} more={t.more} />
        {t.chosen && <GetLine account={t.account} short={!t.bal || t.more} symbol={t.chosen.symbol} onOpen={() => t.setGetOpen(true)} />}
        {t.getOpen && t.chosen && <GetSheet targets={getForms(t.opts, t.chosen, s.chainId).map((o) => ({ chainId: s.chainId, address: o.address, symbol: o.symbol, decimals: o.decimals, price: o.price || t.price || 0, logo: o.logo, have: t.balOf(o.address, o.symbol)?.amount ?? 0 }))} want={t.amount} sources={allIdle}
          onTarget={(x) => t.setPayAddr(t.opts.find((o) => normAddr(o.address) === normAddr(x.address))?.address ?? null)} onClose={() => t.setGetOpen(false)} />}
        {t.short && <Txt s={12.5} c={C.warn} style={{ marginTop: 8 }}><Txt s={12.5} w={700} c={C.warn}>Too big for one lender.</Txt> {t.short.message}</Txt>}
      </Sec>
      <Lines edit={levEdit} l={loopLines({ net: t.net, amountUsd: t.E, lev: t.L, drop: t.drop, holds: moneyWord(s.asset, s.group), debt: debtWord(s), dollarDebt: s.group === 'USD', expiry: s.expiry, cost: t.econ ? t.cost : null, payback: t.payback, quoting: t.q.isFetching && t.amount > 0, staleHours: t.staleRef ? t.staleRef.ageHours ?? 0 : null })} />
      {t.econ && <View style={{ paddingHorizontal: 16 }}><LossAck v={t.vc} what="Opening this loop" advice="Lower the amount, or pick a lower leverage in More choices: the swap is sized on the whole position." /></View>}
      {t.noRoute && <Txt s={12.5} c={C.bad} style={{ marginHorizontal: 16, marginVertical: 10 }}>{NO_ROUTE}</Txt>}
      <Action ladder={t.ladder} label={`Open ${leverTag(t.L)} loop · ${usd(t.E)}`} account={t.account} isConnected={t.isConnected}
        disabled={!(t.amount > 0) || !t.chosen || t.noRoute || !!t.short || t.vc.blocked || !!t.paperRefuse} risky={t.vc.severe}
        blockedNote={t.noPay ? 'This venue takes no margin with the loop' : t.short ? 'Too big for one lender — lower the amount' : t.vc.blocked ? `Confirm the ${cents(-t.vc.diff)} loss above to continue` : t.paperRefuse ?? undefined} chainId={s.chainId} />
      <MoreSheet>
        {t.heldL != null
          ? <MoreNote label="How hard to push it">Adding keeps your loop’s own leverage, {leverTag(t.heldL)}: one Add never pushes a running loop harder. Make it safer from its own ticket.</MoreNote>
          : <Choices<'copy' | TierId> label="How hard to push it" on={t.liteLev != null ? null : t.liteTier ?? (t.copyL != null ? 'copy' : DEFAULT_TIER)} onPick={(id) => t.pickLiteTier(id === 'copy' ? null : id)}
            items={[
              ...(t.copyL != null ? [{ id: 'copy' as const, word: 'Theirs', line: `${leverTag(t.copyL)} · ${pct(liqBuffer(t.liqLtv, t.copyL) * 100, 1)} from liquidation`, side: `earns ${pct(netAprAtLeverage(t.dep, t.borAt(t.E * (t.copyL - 1)), t.copyL))}` }] : []),
              ...liteTiers(s.tiers, t.liqLtv, (l) => netAprAtLeverage(t.dep, t.borAt(t.E * (l - 1)), l)).map((x) => ({ id: x.id as TierId, word: x.word, line: `${leverTag(x.lev)} · ${pct(x.buffer * 100, 1)} from liquidation`, side: `earns ${pct(x.net)}`, tone: x.net >= 3 ? 'ok' : x.net < 0 ? 'bad' : '' })),
            ]} />}
        {t.opts.length > 1 && <Choices label="Pay with" items={t.opts.map((o) => ({ id: o.address, word: o.role === 'collateral' ? holdsWord : o.symbol, line: o.role === 'debt' ? `swapped into ${holdsWord.toLowerCase().startsWith('dollars') ? 'it' : holdsWord} in the same step` : o.role === 'native' ? 'wrapped for you' : 'what the loop holds, if you have it', side: t.account ? `you have ${num(t.balOf(o.address, o.symbol)?.amount ?? 0, dp)}` : undefined }))} on={t.chosen?.address ?? null} onPick={(a) => t.setPayAddr(a)} />}
        <Numbers rows={[
          ['Earns', `${pct(t.net)} a year at ${leverTag(t.L)}`],
          [`${holdsWord} pays`, `${pct(t.dep)} a year`],
          [`Borrowing ${debtWord(s)} costs`, `${pct(t.bor)} a year`],
          ['From liquidation', pct(t.drop * 100, 1)],
          ...(t.econ ? [['Entry cost', `${usd(t.cost)} · ${t.payback == null ? 'never earned back' : `earned back in ${daysWord(t.payback)}`}`] as [string, string]] : []),
          ...(s.expiry ? [['Ends', dayMonth(s.expiry)] as [string, string]] : []),
          ['In it', usdShort(s.tvlUsd)],
          ['Risk', riskWord(s.risk)],
          ['Where', `${brandOf(s)} · ${chainLabel(s.chainId)}`],
        ]} />
      </MoreSheet>
    </>
  )
}

/** Taking money out of a deposit: how much (all of it to start), what comes back and when. */
export function WithdrawBody({ s, h }: { s: SimpleStrategy | null; h: Holding }) {
  const t = useWithdrawTicket(s, h, 'reduce', { lite: true })
  const wdp = shownDp(h.group === 'USD')
  return (
    <>
      {!t.all && <Sec>
        <Lbl>How much <Txt s={12} w={600} c={C.tx50}>· of {usd(h.valueUsd)}</Txt></Lbl>
        <AmountBox unit={h.symbol} value={t.amt} onChange={t.setAmt} />
        <Presets onPick={(p) => t.setAmt(portion(heldRaw(h), p, h.decimals, wdp))} />
        {t.amount > h.amount + 1e-9 && <AmtSub warn="more than you have" />}
      </Sec>}
      <Lines l={withdrawLines({ backUsd: t.eff * t.price, back: `${num(t.eff, wdp)} ${t.outSym}`, exitWord: t.exit?.word, exitWhen: t.exit?.when, leftUsd: Math.max(0, h.amount - t.eff) * t.price, rate: t.rate ?? null })} />
      <Action ladder={t.ladder} label={t.fullExit ? `Withdraw all · ${usd(t.eff * t.price)}` : `Withdraw ${usd(t.eff * t.price)}`} account={t.account} isConnected={t.isConnected} disabled={!(t.eff > 0) || !!t.paperRefuse} blockedNote={t.paperRefuse ?? undefined} chainId={h.chainId} />
      <MoreSheet>
        {t.canNative && <Choices<'token' | 'coin'> label="Paid out as" on={t.native ? 'coin' : 'token'} onPick={(x) => t.setAsNative(x === 'coin')}
          note={t.maxRounds ? `This venue’s ${t.coin} exit fails on a full withdrawal: take ${h.symbol}, or leave a little in.` : undefined}
          items={[
            { id: 'token', word: h.symbol, line: 'as it sits in the venue' },
            { id: 'coin', word: t.coin, line: 'unwrapped for you · one more signature', off: t.maxRounds },
          ]} />}
        <Numbers rows={[
          ['Yours', `${usd(h.valueUsd)} · ${num(h.amount, wdp)} ${h.symbol}`],
          ...(t.rate != null ? [['Earns', `${pct(t.rate)} a year`] as [string, string]] : []),
          ...(t.exit ? [['Way out', `${t.exit.word} · ${t.exit.when}`] as [string, string]] : []),
          whereOf(h.venue, h.chainId),
        ]} />
      </MoreSheet>
    </>
  )
}

/** A held loop: "Lower risk" — one of three targets by distance from liquidation — or Close. */
export function ManageLoopBody({ s, h, close }: { s: LoopStrategy | null; h: Holding; close: boolean }) {
  const t = useManageLoop(s, h, close, { lite: true })
  // what the loop holds, in Lite's words (never a PT's ticker)
  const holdsWord = s ? plainName(s).title : moneyWord(h.asset, h.group)
  if (!t.closing) {
    const bufNow = t.liqLtv != null ? liqBuffer(t.liqLtv, t.Lnow) : bufferOfHealth(h.health)
    const netAt = (l: number) => (s ? netAprAtLeverage(s.depSpot, t.borAt(t.E * (l - 1) - t.D), l) : null)
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
          ) : <Plain tone="dim">{t.liqLtv == null ? 'This venue reports no health for it here: change it in Pro.' : 'It is already well away from liquidation. Close it, or pick a leverage in More choices.'}</Plain>}
          {!t.same && <View style={{ marginTop: 10 }}>{t.down
            ? <Plain>Sells about <Txt s={13} w={700}>{usd(t.sellUsd)}</Txt> of {holdsWord} to pay back {t.debt}. Nothing comes out of your wallet.</Plain>
            : <Plain>Borrows about <Txt s={13} w={700}>{usd(t.borrowUsd)}</Txt> more {t.debt} to buy more {holdsWord}. Nothing comes out of your wallet, and it moves closer to liquidation.</Plain>}</View>}
        </Sec>
        <Lines l={saferLines({ net: s && !t.loan ? t.net ?? null : null, netBefore: s && !t.loan ? netAprAtLeverage(s.depSpot, s.borSpot, t.Lnow) : null, buffer: t.drop ?? null, bufferBefore: bufNow ?? null, equityUsd: t.E })} />
        <Action ladder={t.ladder} label={t.same ? (t.safer.length ? 'Pick how much safer' : 'Pick a leverage') : `${t.down ? 'Lower' : 'Raise'} to ${leverTag(t.L)}`} account={t.account} isConnected={t.isConnected} disabled={t.same || !!t.closeBlock} chainId={h.chainId} />
        <MoreSheet>
          {t.loans.length > 1 && <Choices label="Which loan" note="Each fixed-rate loan is paid back on its own." items={t.loans.map((x) => ({ id: x.id, word: `Loan ${x.id}`, line: `${usdShort(x.debtUsd)} owed` }))} on={t.loan?.id ?? null} onPick={(id) => { t.setLoanId(id); t.setL(t.Lnow) }} />}
          {t.targets.length
            ? <Choices label="How hard to push it" note={`Today ${leverTag(t.Lnow)}${bufNow != null ? `, ${pct(bufNow * 100, 1)} from liquidation` : ''}. Higher borrows more and earns more; lower sells some to pay back.`}
              items={[{ L: +t.Lnow.toFixed(2), buffer: bufNow ?? 0, word: 'As it is', up: false }, ...t.targets].sort((a, b) => b.L - a.L).map((x) => { const n = netAt(x.L); return { id: x.L.toFixed(2), word: x.word, line: `${leverTag(x.L)}${bufNow != null || x.word !== 'As it is' ? ` · ${pct(x.buffer * 100, 1)} from liquidation` : ''}${x.up ? ' · borrows more' : ''}`, side: n != null ? `earns ${pct(n)}` : undefined, tone: n == null ? '' : n >= 3 ? 'ok' : n < 0 ? 'bad' : '' } })}
              on={(t.same ? +t.Lnow.toFixed(2) : t.L).toFixed(2)} onPick={(id) => t.setL(Number(id))} />
            : <MoreNote label="How hard to push it">{t.liqLtv == null ? 'This venue reports no health for it here, so Lite offers no leverage for it: Pro does.' : 'Lite offers no other leverage for this loop.'}</MoreNote>}
          <Numbers rows={[
            ['Yours', usd(t.E)],
            ['Holds', `${usd(t.C)} of ${holdsWord}`],
            ['Owes', `${usd(t.D)} of ${t.debt}`],
            ...(s ? [[`${holdsWord} pays`, `${pct(s.depSpot)} a year`] as [string, string], [`Borrowing ${t.debt} costs`, `${pct(s.borSpot)} a year`] as [string, string]] : []),
            whereOf(h.venue, h.chainId),
          ]} />
        </MoreSheet>
      </>
    )
  }
  return (
    <>
      <Sec>
        <Plain tone={t.closeBlock && t.closeBlock !== 'short' ? 'dim' : undefined}>
          {t.closeBlock === 'pricing' ? 'Pricing the sale…'
            : t.closeBlock === 'no-route' ? 'No way to sell it right now. Try again shortly, or close it in Details.'
            : t.closeBlock === 'keep-short' ? `Keeping ${holdsWord} leaves too little to repay the ${t.debt} right now. Get it all back in ${t.debt} instead, in More choices.`
            : t.closeBlock ? 'The sale would not cover what you owe right now. Open it in Pro to see why and what to do.'
            : t.keep ? `Only what repays the ${t.debt} you owe is sold. The rest comes back to your wallet as ${holdsWord}.`
            : `Everything is sold, the ${t.debt} you owe is repaid, and the rest comes back to your wallet.`}
        </Plain>
        {t.tight && !t.closeBlock && <View style={{ marginTop: 6 }}><Plain tone="warn">Tight: the close may revert at the worst fill (only gas is lost).</Plain></View>}
        {t.valued && <LossAck v={t.vc} what="Closing now" advice={`It can be worth waiting for ${t.holds} to trade closer to its price on the venue.`} />}
      </Sec>
      <Lines l={closeLines({ backUsd: t.cq.isPending ? null : t.backUsd ?? null, back: t.cq.isPending ? 'pricing the sale…' : t.closeBlock ? '' : t.backDebt != null && !t.keep ? `≈ ${num(t.backDebt, 4)} ${t.debt}` : t.keep && t.backColl != null ? `≈ ${num(t.backColl, 4)} ${t.holds}` : '', costUsd: t.sale?.exitCostUsd ?? null, short: t.closeBlock === 'short' })} />
      <Action ladder={t.ladder} label="Close and withdraw" account={t.account} isConnected={t.isConnected} disabled={t.same || !!t.closeBlock || t.vc.blocked} risky={t.vc.severe} blockedNote={t.vc.blocked ? `Confirm the ${cents(-t.vc.diff)} loss above to continue` : undefined} chainId={h.chainId} />
      <MoreSheet>
        {t.sameToken ? null : t.venueKeeps
          ? <MoreNote label="What you get it back in">{h.venue.split(' · ')[0]} always hands back what the loop holds: only what repays the {t.debt} is sold.</MoreNote>
          : <Choices<'debt' | 'collateral'> label="What you get it back in" on={t.recv} onPick={t.setRecv} items={[
            { id: 'debt', word: `All in ${t.debt}`, line: 'everything is sold, the loan repaid, the rest back to you' },
            { id: 'collateral', word: `Keep ${holdsWord}`, line: `only what repays the ${t.debt} is sold` },
          ]} />}
        <Numbers rows={[
          ['Yours', usd(h.valueUsd)],
          ['Owes', `${num(t.owed, t.pDebt > 0.9 && t.pDebt < 1.1 ? 2 : 4)} ${t.debt}`],
          ['Costs', t.sale?.exitCostUsd != null ? `${usd(t.sale.exitCostUsd)} · the sale’s slippage and fees` : '—'],
          whereOf(h.venue, h.chainId),
        ]} />
      </MoreSheet>
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
  const b = bufferOfHealth(h.health)
  const more = (
    <MoreSheet>
      <MoreNote label="Borrow more, or take collateral out">Lite only ends loans. Both are in Pro, from the link below.</MoreNote>
      <Numbers rows={[
        ['Owes', usd(owedOf(h))],
        ['Put up', `${usd(collateralOf(h))} · ${num(h.amount, 4)} ${h.symbol}`],
        ...(b != null ? [['From liquidation', pct(b * 100, 1)] as [string, string]] : []),
        whereOf(h.venue, h.chainId),
      ]} />
    </MoreSheet>
  )
  if (!o) return <><Sec><Plain tone="warn">This loan can’t be read well enough to pay back here. Open it in Pro.</Plain></Sec>{more}</>
  return (
    <>
      {more}
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

// ----------------------------------------------------------------- a loop as a loan
/**
 * A held loop worked as a loan, with no swap (the web's `LoopLoanPanes` with Lite's `pane`):
 * "Deposit & borrow" — collateral in and, where it is a plain loan, more borrowed to the wallet —
 * or "Repay & withdraw" — debt paid from the wallet and, if you like, collateral out. Both second
 * legs start at nothing, so the one-tap move is the safer one. `canBorrow` false (a term, a tenor, a
 * maturity, or a position off the menu) keeps the first side to the collateral leg.
 */
export function LoopLoanBody({ s, h, idle, canBorrow, pane }: { s: LoopStrategy | null; h: Holding; idle: Idle[]; canBorrow: boolean; pane: 'borrow' | 'repay' }) {
  const o = React.useMemo(() => loopLoanOffer(s, h), [h, s])
  const borrows = canBorrow && !!s
  if (!o) return <Sec><Plain tone="warn">This position can’t be read well enough to change here. Open it in Pro.</Plain></Sec>
  return (
    <>
      <Sec><Txt s={12} c={C.tx50} lh={17}>{pane === 'repay' ? 'Pay debt back from your wallet and, if you like, take collateral out. No swap: nothing is sold, whatever the market pays.'
        : borrows ? 'Put more collateral in to make it safer and, if you like, borrow against it to your wallet. No swap: nothing is bought, whatever the market pays.'
        : 'Put more collateral in from your wallet to move it away from liquidation. No swap: nothing is bought, whatever the market pays.'}</Txt></Sec>
      {pane === 'repay' ? <RepayWithdrawBody key={h.key + ':repay'} o={o} h={h} idle={idle} />
        : borrows ? <DepositBorrowBody key={h.key + ':borrow'} o={o} h={h} idle={idle} />
        : <CollateralInBody key={h.key + ':topup'} o={o} h={h} idle={idle} />}
    </>
  )
}

const ZTONE = { ok: C.ok, warn: C.warn, bad: C.bad } as const
function DepositBorrowBody({ o, h, idle }: { o: BorrowOffer; h: Holding; idle: Idle[] }) {
  const t = useBorrowTicket(o, h, idle, { loop: true })
  const [getOpen, setGetOpen] = React.useState(false)
  // the borrow box keeps what was typed ("1." stays "1."); a chip shows its own sum
  const [typedAmt, setTypedAmt] = React.useState<Amount | null>(null)
  const shown = t.pick?.typed && t.pick.by === t.unit && typedAmt ? typedAmt : fromUnits(t.boxValue)
  const zt = ZONES[t.zone]
  const owesSomething = t.totalDebt > 0
  return (
    <>
      <Sec>
        {t.opts.length > 1 && <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>{t.opts.map((x) => (
          <Pressable key={x.role} onPress={() => t.setRole(x.role)} style={[st.mode, t.chosen.role === x.role && st.modeOn]}>
            <Txt s={13} c={t.chosen.role === x.role ? C.primary : C.tx50}>{x.symbol}{t.account ? ` · ${num(t.balOf(x.address)?.amount ?? 0, 3)}` : ''}</Txt>
          </Pressable>))}</View>}
        <Lbl>Add collateral · {t.chosen.symbol} · optional</Lbl>
        <AmountBox unit={t.chosen.symbol} value={t.putAmt} onChange={t.setPut} onMax={t.bal ? () => t.setPut(portion(t.bal!, 100, t.chosen.decimals)) : undefined} />
        <AmtSub left={t.price > 0 ? `≈ ${usd(t.putUsd)} · ${num(t.heldUnits, 4)} in already` : 'no price for it right now'} right={t.account ? `You have ${num(t.bal?.amount ?? 0, 4)} ${t.chosen.symbol}` : undefined} warn={t.short ? 'not enough' : undefined} />
        <GetLine account={t.account} short={t.short} symbol={t.chosen.symbol} onOpen={() => setGetOpen(true)} />
        {getOpen && <GetSheet targets={t.opts.map((x) => ({ chainId: o.chainId, address: x.address, symbol: x.symbol, decimals: x.decimals, price: t.price, logo: x.role === 'token' ? o.collateral.logo : undefined, have: t.balOf(x.address)?.amount ?? 0 }))} want={t.put} sources={idle}
          onTarget={(x) => t.setRole(t.opts.find((y) => y.address === x.address)?.role ?? null)} onClose={() => setGetOpen(false)} />}
      </Sec>
      <Sec>
        <Lbl>Borrow · {o.debt.symbol} · optional</Lbl>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
          {ZONE_ORDER.map((k) => {
            const v = t.z[k], on = v != null && Math.abs(t.take - v) < 0.01
            return (
              <Pressable key={k} disabled={v == null} onPress={() => { if (v != null) { setTypedAmt(null); t.setTake(v) } }} style={[st.zone, on && { borderColor: ZTONE[ZONES[k].cls] }, v == null && { opacity: 0.5 }]}>
                <Txt s={12} w={600} c={ZTONE[ZONES[k].cls]}>{ZONES[k].word}</Txt>
                <Txt s={15} mono c={C.tx}>{v == null ? '—' : usdShort(v)}</Txt>
                <Txt s={10.5} mono c={C.tx50}>{v == null ? 'out of reach' : `room −${pct(dropOf(t.collUsd, t.owedUsd + v, o.liqLtv) * 100, 0)}`}</Txt>
              </Pressable>
            )
          })}
        </View>
        <AmountBox unit={t.unit === 'usd' ? '$' : o.debt.symbol} value={shown} onChange={(a) => { setTypedAmt(a); t.setPick({ by: t.unit, v: unitsOf(a), typed: true }) }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Txt s={12} mono c={C.tx50}>{t.unit === 'usd' ? `= ${sig4(t.debtUnits)} ${o.debt.symbol}` : `≈ ${usd(t.take)}`}</Txt>
          <Pressable onPress={() => { setTypedAmt(null); t.setUnit(t.unit === 'usd' ? 'tok' : 'usd') }} hitSlop={6}><Txt s={12} c={C.primary}>type it in {t.unit === 'usd' ? o.debt.symbol : 'dollars'}</Txt></Pressable>
        </View>
        {t.over && t.take > 0 && <Txt s={12} c={C.warn} style={{ marginTop: 4 }}>{t.cap > 0 ? `most here: ${t.usdOut ? usd(t.cap) : `${sig4(t.cap / t.debtPrice)} ${o.debt.symbol}`}` : 'put something up first'}</Txt>}
      </Sec>
      <Sec>
        <Txt s={13} c={C.tx70} lh={19}><Txt s={13} w={600} c={ZTONE[zt.cls]}>{zt.word}</Txt> · {t.owedUsd > 0.005 ? 'the whole loan costs' : 'costs'} about <Txt s={13} w={600} c={C.tx}>{usd(t.monthly)}</Txt> a month ({pct(t.apr)} APR)</Txt>
        {owesSomething && <Txt s={13} c={C.tx70} lh={19} style={{ marginTop: 6 }}>{o.pegged
          ? `Both sides are dollars: only ${o.collateral.symbol} losing its peg by ${pct(t.drop * 100, 1)} can liquidate this.`
          : t.mixed ? `If what you have put up loses ${pct(t.drop * 100, 0)} of its value, the lender sells some of it to repay.`
          : !t.usdOut ? `If ${o.collateral.symbol} falls below ${sig4(t.liqRatio)} ${o.debt.symbol} (−${pct(t.drop * 100, 0)}), the lender sells it to repay.`
          : `If ${o.collateral.symbol} falls below ${usd(t.liqPx)} (−${pct(t.drop * 100, 0)}), the lender sells it to repay.`}</Txt>}
        {t.zone === 'spicy' && t.take > 0 && (
          <Pressable onPress={() => t.setAck(!t.ack)} style={{ flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'flex-start' }}>
            <View style={[st.box, t.ack && { backgroundColor: C.warn, borderColor: C.warn }]} />
            <Txt s={12.5} c={C.tx70} lh={18} style={{ flex: 1 }}>Spicy: an ordinary move can liquidate this, and liquidation costs a penalty on top. I have a plan to add collateral or pay back fast.</Txt>
          </Pressable>
        )}
      </Sec>
      <Action ladder={t.ladder} label={t.label} account={t.account} isConnected={t.isConnected} disabled={!!t.blocked} blockedNote={t.blocked ?? undefined} risky={t.zone === 'spicy'} chainId={o.chainId} />
    </>
  )
}

function CollateralInBody({ o, h, idle }: { o: BorrowOffer; h: Holding; idle: Idle[] }) {
  const t = useTopUpTicket(o, h, idle)
  return (
    <>
      <Sec>
        <Lbl>How much {t.chosen.symbol} to put in · {num(h.amount, 4)} in it now</Lbl>
        <AmountBox unit={t.chosen.symbol} value={t.amt} onChange={t.setAmt} onMax={t.bal ? () => t.setAmt(portion(t.bal!, 100, t.chosen.decimals)) : undefined} />
        <Presets onPick={(p) => t.bal && t.setAmt(portion(t.bal, p, t.chosen.decimals))} />
        <AmtSub left={`≈ ${usd(t.put * t.price)}`} right={t.account ? `You have ${num(t.bal?.amount ?? 0, 4)} ${t.chosen.symbol}` : undefined} warn={t.short ? 'not enough' : undefined} />
      </Sec>
      <Cells hero={{ k: 'From liquidation after', v: t.owedUsd > 0 ? pct(dropOf(t.collAfter, t.owedUsd, t.liq) * 100, 1) : '—', s: t.owedUsd > 0 ? `was ${pct(dropOf(t.heldUsd, t.owedUsd, t.liq) * 100, 1)}` : 'nothing owed' }}
        cells={[{ k: 'Leverage after', v: `×${num(t.levOf(t.collAfter), 1)}`, s: `was ×${num(t.levOf(t.heldUsd), 1)}` }]} />
      <Action ladder={t.ladder} label={t.put > 0 ? `Put in ${num(t.put, 4)} ${t.chosen.symbol}` : 'Add collateral'} account={t.account} isConnected={t.isConnected} disabled={!!t.blocked} blockedNote={t.blocked ?? undefined} chainId={o.chainId} />
    </>
  )
}

/** Both legs (the web's `RepayPane` on a loop): debt paid from the wallet, and collateral out if you like. */
function RepayWithdrawBody({ o, h, idle }: { o: BorrowOffer; h: Holding; idle: Idle[] }) {
  const t = useRepayTicket(o, h, idle)
  const [getOpen, setGetOpen] = React.useState(false)
  return (
    <>
      <Sec>
        <Lbl>Repay · {o.debt.symbol} (of {num(t.owed, 2)} owed)</Lbl>
        <AmountBox unit={o.debt.symbol} value={t.repayAmt} onChange={t.setRepay} onMax={() => t.setRepay(fromUnits(t.owed))} />
        <Presets onPick={(p) => t.setRepay(fromUnits(p === 100 ? t.owed : floor6(t.owed * p / 100)))} />
        <AmtSub left={`≈ ${usd(t.r * t.debtPrice)}`} right={t.account ? `You have ${num(t.debtBal?.amount ?? 0, 2)} ${o.debt.symbol}` : undefined} warn={t.shortDebt ? 'not enough' : undefined} />
        {t.shortDebt && <GetLine account={t.account} short symbol={o.debt.symbol} onOpen={() => setGetOpen(true)} />}
        {getOpen && o.debt.address && <GetSheet targets={[{ chainId: o.chainId, address: o.debt.address, symbol: o.debt.symbol, decimals: o.debt.decimals, price: t.debtPrice, logo: o.debt.logo, have: t.debtBal?.amount ?? 0 }]}
          want={Math.max(0, t.r - (t.debtBal?.amount ?? 0))} sources={idle} onClose={() => setGetOpen(false)} />}
      </Sec>
      <Sec>
        <Lbl>Withdraw · {o.collateral.symbol} (of {num(t.held, 4)} in it) · optional</Lbl>
        <AmountBox unit={o.collateral.symbol} value={t.outAmt} onChange={t.setOut} onMax={() => t.setOut(t.repayAll && t.otherDebtUsd <= 0.5 ? portion(heldRaw(h), 100, o.collateral.decimals) : fromUnits(floor6(t.maxOut)))} />
        <AmtSub left={`≈ ${usd(t.w * t.price)}`} right={t.debtAfter > 0 ? `at most ${num(t.maxOut, 4)} while ${usd(t.debtAfter)} is owed` : 'all of it, once repaid'} />
      </Sec>
      <Cells hero={{ k: 'Owed after', v: usd(t.debtAfter), s: t.debtAfter > 0 ? `${pct(dropOf(t.collAfter, t.debtAfter, t.liq) * 100, 0)} from liquidation after` : 'the loan is paid off' }}
        cells={[{ k: 'Back to you', v: usd(t.w * t.price), s: `${num(t.w, 4)} ${o.collateral.symbol}` }]} />
      <Action ladder={t.ladder} label={t.r > 0 && t.w > 0 ? `Repay ${usd(t.r * t.debtPrice)} · withdraw ${num(t.w, 4)} ${o.collateral.symbol}` : t.r > 0 ? `Repay ${usd(t.r * t.debtPrice)}` : `Withdraw ${num(t.w, 4)} ${o.collateral.symbol}`} account={t.account} isConnected={t.isConnected} disabled={!!t.blocked} blockedNote={t.blocked ?? undefined} chainId={o.chainId} />
    </>
  )
}

const st = StyleSheet.create({
  safer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.b300, borderWidth: 1, borderColor: 'transparent' },
  modes: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mode: { minHeight: 32, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', justifyContent: 'center' },
  modeOn: { borderColor: C.primary, backgroundColor: '#062830' },
  zone: { flex: 1, gap: 2, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, borderColor: C.b300, backgroundColor: '#0d0d0d' },
  box: { width: 16, height: 16, marginTop: 1, borderRadius: 4, borderWidth: 1.5, borderColor: C.tx50 },
})

const stepSt = { width: 40, height: 40, borderRadius: 999, backgroundColor: C.b300, alignItems: 'center', justifyContent: 'center' } as const
