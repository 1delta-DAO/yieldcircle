/**
 * The borrow ticket (tickets/0008): put something up, take dollars out — and pay them back.
 *
 * It reads like a sentence, not a lending form:
 *
 *   Put up [2.0 TSLAx] · take out [$400 USDC]
 *   ● Safe · costs about $2.40 a month (7.3 % APR)
 *   If TSLA falls below $214 (−31 %), the lender sells your TSLAx to repay.
 *   [Borrow $400]
 *
 * How much to take is three chips (Safe · Watch · Spicy, `model/borrow.ts`), each a dollar amount
 * that lands in its zone, with a slider under them for a number of one's own — the Loop ticket's
 * tiers, for a loan. The zones are read off how far the collateral's price can fall before the
 * lender sells it, never off a fraction of the limit. Health factor and LTV are in the `Info`.
 *
 * Two tabs on the ticket's own mode row once a loan is running: Borrow (more collateral, more
 * debt, or both) and Pay back (some or all of it, and the collateral out). Every build is one of
 * the API's lending actions (`deposit-and-borrow`, `withdraw-and-repay`, or a single leg where the
 * other is zero), through the same ladder, paper path and trace as every other ticket.
 */
import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { nameOf } from '../model/assets'
import { CRYPTO_BORDERS, MIN_HEALTH, ZONES, bordersFor, defaultBorrow, dropOf, healthOf, liquidationPrice, maxBorrowUsd, monthlyCost, usMarket, zoneAmounts, zoneOf, type BorrowOffer, type Zone } from '../model/borrow'
import { borrowAtSize, toRaw } from '../model/leverage'
import { isNativeAddress, nativeDecimals, nativeSymbol, wrapsNative, type Holding, type Idle } from '../model/positions'
import { isSvmChain, normAddr } from '../model/address'
import { keyOfToken } from '../model/desk'
import { groupOf } from '../model/assets'
import { canonUid, pairKey, type ThreadRef } from '../model/uid'
import { lendingAction, lendingDepositAndBorrow, lendingRange, lendingWithdrawAndRepay, nativeAsset } from '../sdk/api'
import { chainLabel, useIrm } from '../sdk/queries'
import { useStrategyProofs } from '../index/queries'
import { useProfiles } from '../social/queries'
import { go, useApp, type Mode } from '../state/AppState'
import { usePaper } from '../state/Paper'
import { useSticky } from '../state/sticky'
import { Action, AmountBox, GetLine, TicketCtx, sameToken } from './Ticket'
import { GetAsset } from './GetAsset'
import { IrmLink } from './Irm'
import { Thread } from './Thread'
import { Who } from './social-bits'
import { Info, KindPill, RiskDot, SubAccountPill, Tok, Toks, num, pct, usd, usdShort } from './bits'
import { stepsFrom, useTicketLadder } from './useLadder'
import { borrowPlan, paperPos, repayPlan } from './paperPlans'

/** a balance as an amount to send: rounded DOWN, never a hair over what is held */
const floor6 = (x: number) => Math.floor(x * 1e6) / 1e6
const useDebounced = <T,>(v: T, ms = 400): T => { const [d, setD] = React.useState(v); React.useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms]); return d }
const ZONE_ORDER: Zone[] = ['safe', 'watch', 'spicy']
/** The thing whose price moves: a stock's ticker, a coin's row, else the token. */
const whatOf = (o: BorrowOffer) => o.ticker ?? (o.asset.includes(':') ? o.collateral.symbol : nameOf(o.asset) === o.asset ? o.asset : o.collateral.symbol)

/**
 * `holdings`: the loans the wallet runs on this pair (one per isolated account), `pick` the one to
 * start on. `alternatives`: the other offers for the same collateral on the same chain — the
 * "cheaper elsewhere" nudge. `offMenu`: why the offer list does not carry this one.
 */
/**
 * `choices`: every place that lends against this asset, best first (tickets/0010): the ticket opens on
 * one — the app's pick — and `onPick` moves it to another. The reader chooses an asset and an
 * amount; which lender is a detail they may open, not a list they must read first.
 */
export function BorrowTicket({ o, holdings, idle, pick, mode: mode0, alternatives, choices, onPick, offMenu, onClose }: { o: BorrowOffer; holdings: Holding[]; idle: Idle[]; pick?: string; mode?: Mode; alternatives?: BorrowOffer[]; choices?: BorrowOffer[]; onPick?: (o: BorrowOffer) => void; offMenu?: string; onClose: () => void }) {
  const [hk, setHk] = React.useState(pick)
  const holding = holdings.find((h) => h.key === hk) ?? holdings[0] ?? null
  const into = holding && !holding.subAccount?.unsupported ? holding : null
  const [pane, setPane] = React.useState<'borrow' | 'repay'>(holding && mode0 && mode0 !== 'add' ? 'repay' : 'borrow')
  const uid = canonUid(o.collateral.uid)
  const thread: ThreadRef | null = uid ? { kind: 'market', key: uid } : null
  const owedUsd = holding ? Math.max(0, (holding.collateralUsd ?? 0) - holding.valueUsd) : 0
  return (
    <TicketCtx.Provider value={{ uid, thread }}>
    <div className="ticket borrowt">
      <div className="grab" />
      <div className="th"><Toks a={o.collateral.symbol} b={o.debt.symbol} logoA={o.collateral.logo} logoB={o.debt.logo} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="n">Borrow {o.debt.symbol} against {o.collateral.symbol} <Info label="How a loan works">
            You put <b>{o.collateral.symbol}</b> up as collateral and take <b>{o.debt.symbol}</b> out. Nothing is sold: you keep everything {o.collateral.symbol} does, and you pay interest on what you took. If {whatOf(o)} falls far enough that the loan is worth more than {pct(o.liqLtv * 100, 0)} of the collateral, the lender sells some of it to repay — that is liquidation, and it costs a penalty on top.
            <p style={{ margin: '8px 0 0' }}>{o.venue} lends up to {pct(o.maxLtv * 100, 0)} of the collateral's value here and liquidates at {pct(o.liqLtv * 100, 0)}. This ticket never goes past a health factor of {MIN_HEALTH.toFixed(2)} (liquidation is at 1.00).</p>
          </Info></div>
          <div className="s">{o.ticker ? `${o.ticker} · ` : ''}{o.venue} · {chainLabel(o.chainId)} · <RiskDot r={o.risk} label={o.rated ? `${o.riskLabel.toLowerCase()} risk` : 'unrated'} /></div>
        </div>
        <KindPill kind="borrow" /><button className="x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      {holdings.length > 1 && (
        <div className="tsec">
          <span className="lbl">Which loan</span>
          <div className="seg" role="radiogroup" aria-label="Which loan">{holdings.map((h) => <button key={h.key} role="radio" aria-checked={h.key === holding!.key} aria-pressed={h.key === holding!.key} onClick={() => setHk(h.key)}>{h.subAccount?.label ?? 'Main account'}<span className="c" style={{ marginLeft: 6 }}>{usdShort(h.valueUsd)}</span></button>)}</div>
        </div>
      )}
      {holding && (
        <div className="tsec"><div className="modes" role="tablist" aria-label="Manage">
          <button role="tab" aria-selected={pane === 'borrow'} onClick={() => setPane('borrow')}>Borrow</button>
          <button role="tab" aria-selected={pane === 'repay'} onClick={() => setPane('repay')}>Pay back</button>
          <span className="sp" /><span className="sum">owes {usd(owedUsd)}{holding.health != null ? ` · health ${holding.health.toFixed(2)}` : ''}</span>
          {holdings.length < 2 && <SubAccountPill sub={holding.subAccount} venue={holding.venue} />}
        </div></div>
      )}
      {!holding && choices && onPick && <WhereLine o={o} choices={choices} idle={idle} onPick={onPick} />}
      {offMenu && <div className="tsec offmenu" role="note"><b>Not in the list.</b> {offMenu}</div>}
      {holding && pane === 'repay'
        ? <RepayPane key={holding.key} o={o} h={holding} idle={idle} />
        : <BorrowPane key={into?.key ?? 'new'} o={o} h={into} idle={idle} alternatives={alternatives ?? []} />}
      <BorrowSocial o={o} thread={thread} />
    </div>
    </TicketCtx.Provider>
  )
}

/**
 * Where the loan is taken, said in one line — `Kamino · Solana · 0.76 % · 3 other places ▾` — with
 * the other places folded under it. Each says what differs: the rate, how far it lends, the chain,
 * and whether the wallet holds the asset there.
 */
function WhereLine({ o, choices, idle, onPick }: { o: BorrowOffer; choices: BorrowOffer[]; idle: Idle[]; onPick: (o: BorrowOffer) => void }) {
  const [open, setOpen] = React.useState(false)
  const others = choices.filter((x) => x.id !== o.id)
  const holds = (x: BorrowOffer) => idle.some((i) => i.asset === x.asset && i.chainId === x.chainId && i.usd >= 1)
  return (
    <div className="tsec bwhere">
      <div className="bw-row">
        <span className="t50">From</span> <b>{o.venue}</b><span className="t50"> · {chainLabel(o.chainId)} · </span><b>{pct(o.borrowApr)}</b><span className="t50"> · lends {Math.round(o.maxLtv * 100)}%</span>
        <span className="sp" />
        {others.length > 0 && <button type="button" className="bw-more" aria-expanded={open} onClick={() => setOpen(!open)}>{others.length} other place{others.length === 1 ? '' : 's'} <span aria-hidden>{open ? '▴' : '▾'}</span></button>}
      </div>
      {open && <div className="bw-list" role="listbox" aria-label="Other places to borrow">{others.slice(0, 12).map((x) => (
        <button key={x.id} type="button" role="option" aria-selected={false} className="bw-opt" onClick={() => { setOpen(false); onPick(x) }}>
          <Toks a={x.collateral.symbol} b={x.debt.symbol} logoA={x.collateral.logo} logoB={x.debt.logo} />
          <span className="bw-t"><span><b>{x.venue}</b> <span className="t50">· {chainLabel(x.chainId)} · {x.collateral.symbol} → {x.debt.symbol}</span></span>
            <small>lends {Math.round(x.maxLtv * 100)}% · {usdShort(x.liquidityUsd)} free{holds(x) ? ' · you hold it here' : ''}</small></span>
          <span className={`bw-r ${x.borrowApr < o.borrowApr ? 'ok' : ''}`}>{pct(x.borrowApr)}</span>
        </button>))}{others.length > 12 && <div className="foot" style={{ padding: '6px 4px 0' }}>{others.length - 12} more on the asset’s Borrow list.</div>}</div>}
    </div>
  )
}

// ----------------------------------------------------------------- Borrow
function BorrowPane({ o, h, idle, alternatives }: { o: BorrowOffer; h: Holding | null; idle: Idle[]; alternatives: BorrowOffer[] }) {
  const { account, isConnected, solSigner } = useApp()
  const actor = isSvmChain(o.chainId) ? solSigner : account
  const paper = usePaper()
  // pay with the collateral token or — into a market of the chain's wrapped coin — the coin itself
  const opts = React.useMemo(() => {
    const token = { role: 'token' as const, address: normAddr(o.collateral.address), symbol: o.collateral.symbol, decimals: o.collateral.decimals }
    return wrapsNative(o.chainId, o.collateral.address) ? [{ role: 'native' as const, address: nativeAsset(o.chainId), symbol: nativeSymbol(o.chainId), decimals: nativeDecimals(o.chainId) }, token] : [token]
  }, [o.id])
  const balOf = (address: string) => idle.find((i) => i.chainId === o.chainId && sameToken(i.address, address))
  const [role, setRole] = useSticky<'native' | 'token' | null>(`b:${o.id}:pay`, null)
  const chosen = opts.find((x) => x.role === role) ?? [...opts].sort((a, b) => (balOf(b.address)?.amount ?? 0) - (balOf(a.address)?.amount ?? 0))[0]
  const bal = balOf(chosen.address)
  const price = o.collateral.price || bal?.price || (h && h.amount > 0 && h.collateralUsd ? h.collateralUsd / h.amount : 0)
  const debtPrice = o.debt.price || 1
  const [getOpen, setGetOpen] = React.useState(false)
  // a loan running already: what it holds and owes, which the new numbers are added to
  const heldUnits = h?.amount ?? 0
  const heldUsd = h ? h.collateralUsd ?? heldUnits * price : 0
  const owedUsd = h ? Math.max(0, heldUsd - h.valueUsd) : 0
  const [put, setPut] = useSticky<number>(`b:${o.id}:put`, () => (h ? 0 : bal ? floor6(bal.amount) : price > 0 ? +(1000 / price).toPrecision(2) : 1))
  const putUsd = put * price
  const collUsd = heldUsd + putUsd
  const borders = bordersFor(o)
  const z = zoneAmounts(o, borders, collUsd, owedUsd)
  // the venue's own limit for THIS account (its e-mode, what it already holds), where a real wallet can be read
  const dPut = useDebounced(put)
  const range = useQuery({
    enabled: !!actor && !paper.active && dPut > 0 && o.maxLtv > 0,
    queryKey: ['borrow-range', o.id, actor, dPut, h?.accountId ?? ''],
    queryFn: () => lendingRange('deposit-borrow', { collateralMarketUid: o.collateral.uid, debtMarketUid: o.debt.uid, account: actor!, depositRaw: toRaw(dPut, o.collateral.decimals), modeId: o.modeId, accountId: h?.accountId }),
    staleTime: 20_000, retry: false,
  })
  const capModel = maxBorrowUsd(o, collUsd, owedUsd)
  const cap = range.data?.maxBorrow ? Math.min(capModel, range.data.maxBorrow.amountUSD) : capModel
  // `null` = on the chips' default (Safe); a number = what the reader picked, in dollars
  const [take0, setTake] = useSticky<number | null>(`b:${o.id}:take`, null)
  const take = Math.max(0, Math.min(take0 ?? defaultBorrow(z), cap))
  const debtUnits = take / debtPrice
  const totalDebt = owedUsd + take
  const drop = dropOf(collUsd, totalDebt, o.liqLtv), zone = zoneOf(drop, borders), hf = healthOf(collUsd, totalDebt, o.liqLtv)
  // the rate at THIS size, off the market's own curve: it visibly climbs as more is taken
  const irm = useIrm(o.debt.uid)
  const apr = irm.isPending ? o.borrowApr : borrowAtSize(o.borrowApr, o.borrowApr, take, irm.data)
  const monthly = monthlyCost(totalDebt, apr)
  const collUnits = heldUnits + put
  const liqPx = liquidationPrice(totalDebt, collUnits, o.liqLtv) * debtPrice
  // the real build, asked for its simulation only: the health the venue itself computes
  const build = (simulate: boolean) => {
    const base = { operator: actor!, accountId: h?.accountId, simulate }
    const pay = chosen.role === 'native' ? chosen.address : undefined
    if (put > 0 && take > 0) return lendingDepositAndBorrow({ ...base, collateralMarketUid: o.collateral.uid, debtMarketUid: o.debt.uid, collateralRaw: toRaw(put, chosen.decimals), borrowRaw: toRaw(debtUnits, o.debt.decimals), payAsset: pay, modeId: o.modeId })
    if (put > 0) return lendingAction('deposit', { ...base, marketUid: o.collateral.uid, amountRaw: toRaw(put, chosen.decimals), payAsset: pay })
    return lendingAction('borrow', { ...base, marketUid: o.debt.uid, amountRaw: toRaw(debtUnits, o.debt.decimals) })
  }
  const dKey = useDebounced([o.id, put, Math.round(take * 100), chosen.role, actor ?? '', h?.accountId ?? ''].join('|'), 500)
  const sim = useQuery({
    enabled: !!actor && isConnected && !paper.active && (put > 0 || take > 0) && dKey === [o.id, put, Math.round(take * 100), chosen.role, actor ?? '', h?.accountId ?? ''].join('|'),
    queryKey: ['borrow-sim', dKey],
    queryFn: () => build(true),
    staleTime: 20_000, retry: false,
  })
  // the venue's own figure — unless it simulated a FRESH account: when the route cannot read the
  // existing position it simulates from zero (measured 2026-10-14: an Aave loan at health 20.7 came
  // back as 2.03 for a $244 top-up), so with a loan running it counts only if its `pre` is that loan
  const simPre = sim.data?.data?.simulation?.pre?.healthFactor
  const simTrusted = !h || (h.health != null && simPre != null && Number.isFinite(simPre) && Math.abs(simPre / h.health - 1) < 0.25)
  const simHf = simTrusted ? sim.data?.data?.simulation?.post?.healthFactor ?? undefined : undefined
  const effHf = simHf != null && simHf > 0 ? simHf : hf
  const key = [o.id, h?.accountId ?? '', put, Math.round(take * 100), chosen.role, actor ?? ''].join('|')
  const debtKey = keyOfToken({ chainId: o.chainId, address: o.debt.address, symbol: o.debt.symbol }) ?? o.debt.symbol
  const ladder = useTicketLadder(key, o.chainId, async () => stepsFrom((await build(false)).actions, put > 0 && take > 0 ? 'Put up and borrow' : put > 0 ? 'Add collateral' : 'Borrow', o.chainId),
    [o.collateral.uid, o.debt.uid], [{ address: chosen.address, symbol: chosen.symbol }, { address: o.debt.address, symbol: o.debt.symbol }],
    borrowPlan({ offer: o, into: h, payToken: chosen.address, collUnits: put, debtUnits, borrowApr: apr }),
    // the build, unsigned, before a paper loan: what the API would refuse, paper refuses
    !isSvmChain(o.chainId))
  // what stops the button, in words
  const short = !!account && (!bal || put > bal.amount + 1e-9) && put > 0
  const [ack, setAck] = React.useState(false)
  const blocked = !(put > 0 || take > 0) ? 'Put something up or take something out'
    : paper.active && o.assetClass ? `Paper loans against ${o.ticker ?? 'stocks'} open once their prices can be trusted`
    : short ? `You have ${num(bal?.amount ?? 0, 4)} ${chosen.symbol}`
    : take > 0 && effHf < MIN_HEALTH ? 'Too close to liquidation — take less'
    : o.maxLtv <= 0 && take > 0 ? 'Borrow more on this loan at the venue'
    : zone === 'spicy' && take > 0 && !ack ? 'Tick the box above to take this much'
    : null
  // a stock does not trade at night or at weekends: Monday's open can jump past the line
  const mkt = o.assetClass ? usMarket() : null
  const cheaper = alternatives.filter((a) => a.id !== o.id && a.liquidityUsd >= Math.max(take, 1000) && a.borrowApr <= apr - 0.5 && a.maxLtv > 0).sort((a, b) => a.borrowApr - b.borrowApr)[0]
  const [details, setDetails] = React.useState(false)
  const label = take > 0 ? `Borrow ${usd(take)}` : `Add ${num(put, 4)} ${chosen.symbol}`
  const zbar = cap > 0 ? ZONE_ORDER.map((k) => { const at = (d: number) => Math.min(cap, Math.max(0, collUsd * o.liqLtv * (1 - d) - owedUsd)); const lo = k === 'safe' ? 0 : at(k === 'watch' ? borders.safe : borders.watch), hi = k === 'safe' ? at(borders.safe) : k === 'watch' ? at(borders.watch) : cap; return { k, w: Math.max(0, hi - lo) / cap } }) : []
  return (
    <>
      <div className="tsec">
        {opts.length > 1 && <>
          <span className="lbl">You put up</span>
          <div className="seg" style={{ marginBottom: 10 }}>{opts.map((x) => <button key={x.role} aria-pressed={chosen.role === x.role} onClick={() => setRole(x.role)}><Tok sym={x.symbol} logo={x.role === 'token' ? o.collateral.logo : undefined} size={16} /> {x.symbol}<span className="c" style={{ marginLeft: 6 }}>{account ? num(balOf(x.address)?.amount ?? 0, 3) : ''}</span></button>)}</div>
        </>}
        <span className="lbl">{h ? 'Add collateral' : 'Put up'} <span className="t50">· {chosen.symbol}</span></span>
        <AmountBox unit={chosen.symbol} value={put} onChange={setPut} onMax={bal ? () => setPut(floor6(bal.amount)) : undefined} />
        <div className="amt-sub"><span>{price > 0 ? `≈ ${usd(putUsd)}` : 'no price for it right now'}{h ? <> · {num(heldUnits, 4)} {h.symbol} in already</> : null}</span><span>{account ? <>In your wallet: {bal ? `${num(bal.amount, 4)} ${bal.symbol}` : `0 ${chosen.symbol}`}{short && <span className="warn"> · not enough</span>}</> : 'connect to see your balance'}</span></div>
        <GetLine account={account} short={short} symbol={chosen.symbol} open={getOpen} onOpen={() => setGetOpen(true)} />
        {getOpen && <GetAsset targets={opts.map((x) => ({ chainId: o.chainId, address: x.address, symbol: x.symbol, decimals: x.decimals, price, logo: x.role === 'token' ? o.collateral.logo : undefined, have: balOf(x.address)?.amount ?? 0 }))} want={put} sources={idle} onTarget={(t) => setRole(opts.find((x) => x.address === t.address)?.role ?? null)} onClose={() => setGetOpen(false)} />}

        <span className="lbl" style={{ marginTop: 14 }}>Take out <span className="t50">· {o.debt.symbol}</span> <Info label="The three zones">
          {ZONE_ORDER.map((k) => <p key={k} style={{ margin: '0 0 6px' }}><b>{ZONES[k].word}</b> · {k === 'safe' ? `${whatOf(o)} can fall ${pct(borders.safe * 100, 0)} or more before liquidation.` : k === 'watch' ? `between ${pct(borders.watch * 100, 0)} and ${pct(borders.safe * 100, 0)}.` : `less than ${pct(borders.watch * 100, 0)}.`} {ZONES[k].why}</p>)}
          {o.assetClass && borders !== CRYPTO_BORDERS && <p style={{ margin: '0 0 6px' }}>A stock asks for more room than a coin: it does not trade at night or at weekends, and the next open can jump straight past the line.</p>}
          <p style={{ margin: 0 }}>Health factor {Number.isFinite(effHf) ? effHf.toFixed(2) : '∞'}{simHf != null ? ' (simulated by the venue)' : ''} · loan to value {collUsd > 0 ? pct(totalDebt / collUsd * 100, 1) : '—'} of {pct(o.maxLtv * 100, 0)} allowed · liquidation at {pct(o.liqLtv * 100, 0)}.</p>
        </Info></span>
        <div className="tiers zones" role="radiogroup" aria-label="How much to take">{ZONE_ORDER.map((k) => { const v = z[k]; const on = v != null && Math.abs(take - v) < 0.01; return (
          <button key={k} type="button" role="radio" aria-checked={on} className={`tier z-${k}`} disabled={v == null} onClick={() => v != null && setTake(v)}>
            <span className="tn">{ZONES[k].word}</span>
            <span className="tr">{v == null ? '—' : usdShort(v)}</span>
            <span className="tl">{v == null ? 'out of reach' : `room −${pct(dropOf(collUsd, owedUsd + v, o.liqLtv) * 100, 0)}`}</span>
          </button>) })}</div>
        <div className="levr zrange">
          <div className="zwrap">
            {zbar.length > 0 && <div className="zbar" aria-hidden>{zbar.map((s) => <i key={s.k} className={`z-${s.k}`} style={{ flexGrow: s.w }} />)}</div>}
            <input type="range" min={0} max={Math.max(cap, 0.01)} step={Math.max(0.01, cap / 400)} value={take} onChange={(e) => setTake(parseFloat(e.target.value))} aria-label="Amount to borrow" disabled={!(cap > 0)} />
          </div>
          <span className={`v ${ZONES[zone].cls}`}>{usd(take)}</span>
        </div>
      </div>

      {/* the sentence: the zone, what it costs in money, and the line in the asset's own price */}
      <div className="tsec bsum">
        <div className="bline"><span className={`zdot ${ZONES[zone].cls}`} aria-hidden /><b className={ZONES[zone].cls}>{ZONES[zone].word}</b>
          <span className="t70"> · {h ? 'the whole loan costs' : 'costs'} about <b>{usd(monthly)}</b> a month</span> <span className="t50">({pct(apr)} APR{Math.abs(apr - o.borrowApr) >= 0.05 ? ` at this size, ${pct(o.borrowApr)} now` : ''})</span>
          <IrmLink uid={o.debt.uid} side="borrow" label="rate curve" /></div>
        {totalDebt > 0 && (o.pegged
          ? <div className="bline t70">Both sides are dollars: only {o.collateral.symbol} losing its peg by {pct(drop * 100, 1)} can liquidate this.</div>
          : liqPx > 0 && <div className="bline t70">If <b>{whatOf(o)}</b> falls below <b>{usd(liqPx)}</b> (−{pct(drop * 100, 0)}{price > 0 ? ` from ${usd(price)}` : ''}), the lender sells your {o.collateral.symbol} to repay.</div>)}
        {mkt && !mkt.open && totalDebt > 0 && <div className="bline warn">{o.ticker ?? whatOf(o)} trades again {mkt.next} — until then its price holds still, and the open can jump past your line in one step.</div>}
        {cheaper && <button type="button" className="bline nudge" onClick={() => go(cheaper.group, { u: cheaper.asset, k: 'borrow', s: cheaper.id })}><b>{pct(cheaper.borrowApr)}</b> at {cheaper.venue} — {pct(apr - cheaper.borrowApr, 1).replace('%', '')} points cheaper ›</button>}
        {zone === 'spicy' && take > 0 && <label className="qack"><span><b>Spicy:</b> an ordinary move in {whatOf(o)} can liquidate this, and liquidation costs a penalty on top.</span><span className="qck"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I have a plan to add collateral or pay back fast</span></label>}
        <div className="cells" style={{ marginTop: 10 }}>
        <button type="button" className="c more" aria-expanded={details} onClick={() => setDetails(!details)}>{details ? 'Hide details' : 'Details'}<span className="t40">{details ? '' : 'limits · liquidity · after'}</span><span className="chev" aria-hidden>▾</span></button>
        {details && <>
          <div className="c"><span className="k">You owe after</span><span className="v">{usd(totalDebt)}</span><span className="s">{num(owedUsd / debtPrice + debtUnits, 2)} {o.debt.symbol}</span></div>
          <div className="c"><span className="k">Put up after</span><span className="v">{usd(collUsd)}</span><span className="s">{num(collUnits, 4)} {o.collateral.symbol}</span></div>
          <div className="c"><span className="k">Most you can take</span><span className="v">{usd(cap)}</span><span className="s">{pct(o.maxLtv * 100, 0)} limit · never under health {MIN_HEALTH.toFixed(2)}{range.data?.maxBorrow ? ' · read for your account' : ''}</span></div>
          <div className="c"><span className="k">Free to borrow</span><span className={`v ${o.liquidityUsd < take * 2 ? 'warn' : ''}`}>{o.liquidityUsd > 0 ? usdShort(o.liquidityUsd) : '—'}</span><span className="s">{o.utilization != null ? `${Math.round(o.utilization * 100)}% lent out` : 'in the market'}</span></div>
          <div className="c"><span className="k">Health</span><span className={`v ${ZONES[zone].cls}`}>{Number.isFinite(effHf) ? effHf.toFixed(2) : '∞'}</span><span className="s">{simHf != null ? 'simulated by the venue' : 'from the liquidation threshold'}</span></div>
        </>}
        </div>
      </div>
      {ladder.finished && take > 0 && <Landed o={o} take={take} liqPx={liqPx} debtKey={debtKey} />}
      <Action ladder={ladder} label={label} account={account} isConnected={isConnected} disabled={!!blocked} blockedNote={blocked ?? undefined} risky={zone === 'spicy'} chainId={o.chainId} fee="borrow" />
    </>
  )
}

/** After it lands: where the money is, the line to keep in mind, and the loop the app is about — borrow cheap, earn more. */
function Landed({ o, take, liqPx, debtKey }: { o: BorrowOffer; take: number; liqPx: number; debtKey: string }) {
  return (
    <div className="tsec landed">
      <b>{usd(take)} {o.debt.symbol} is in your wallet.</b>
      {!o.pegged && liqPx > 0 && <span className="t70"> Your {o.collateral.symbol} is safe while {whatOf(o)} stays above {usd(liqPx)}.</span>}
      <div className="actions" style={{ marginTop: 8 }}>
        <a className="btn sm" href="#/alerts">Set an alert</a>
        <button type="button" className="btn sm pri" onClick={() => go(groupOf(debtKey), { u: debtKey })}>Put the {usdShort(take)} to work ›</button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- Pay back
function RepayPane({ o, h, idle }: { o: BorrowOffer; h: Holding; idle: Idle[] }) {
  const { account, isConnected, solSigner } = useApp()
  const actor = isSvmChain(o.chainId) ? solSigner : account
  const paper = usePaper()
  const owed = h.debtAmount ?? 0
  const held = h.amount
  const collUsd = h.collateralUsd ?? 0
  const price = held > 0 && collUsd > 0 ? collUsd / held : o.collateral.price ?? 0
  const owedUsd = Math.max(0, collUsd - h.valueUsd)
  const debtPrice = owed > 0 && owedUsd > 0 ? owedUsd / owed : o.debt.price || 1
  const debtBal = idle.find((i) => i.chainId === o.chainId && sameToken(i.address, normAddr(o.debt.address)))
  const [repay, setRepay] = useSticky<number>(`b:${h.key}:repay`, () => +owed.toFixed(6))
  const [out, setOut] = useSticky<number>(`b:${h.key}:out`, () => 0)
  const repayAll = owed > 0 && repay >= owed * 0.9999
  const outAll = held > 0 && out >= held * 0.9999
  const r = Math.min(repay, owed), w = Math.min(out, held)
  const debtAfter = repayAll ? 0 : (owed - r) * debtPrice
  const collAfter = outAll ? 0 : (held - w) * price
  const liq = h.health && owedUsd > 0 && collUsd > 0 ? (h.health * owedUsd) / collUsd : o.liqLtv
  const hfAfter = healthOf(collAfter, debtAfter, liq)
  // the most that can come out with what is still owed after this repay
  const maxOut = debtAfter > 0 ? Math.max(0, held - (debtAfter * MIN_HEALTH) / (liq * Math.max(price, 1e-12))) : held
  const canNative = wrapsNative(o.chainId, o.collateral.address)
  const [asNative, setAsNative] = useSticky<boolean>(`b:${h.key}:native`, false)
  const native = canNative && asNative
  const coin = nativeSymbol(o.chainId)
  const build = async () => {
    const base = { operator: actor!, accountId: h.accountId }
    const receiveAsset = native ? nativeAsset(o.chainId) : undefined
    const env = r > 0 && w > 0
      ? await lendingWithdrawAndRepay({ ...base, collateralMarketUid: o.collateral.uid, debtMarketUid: o.debt.uid, repayRaw: toRaw(r, o.debt.decimals), withdrawRaw: outAll && h.amountRaw ? h.amountRaw : toRaw(w, o.collateral.decimals), repayMax: repayAll, withdrawMax: repayAll && outAll, receiveAsset })
      : r > 0 ? await lendingAction('repay', { ...base, marketUid: o.debt.uid, amountRaw: toRaw(r, o.debt.decimals), isAll: repayAll })
      : await lendingAction('withdraw', { ...base, marketUid: o.collateral.uid, amountRaw: outAll && h.amountRaw ? h.amountRaw : toRaw(w, o.collateral.decimals), isAll: outAll, receiveAsset })
    return stepsFrom(env.actions, r > 0 && w > 0 ? 'Pay back and take out' : r > 0 ? 'Pay back' : 'Take collateral out', o.chainId)
  }
  const key = [h.key, Math.round(r * 1e6), Math.round(w * 1e6), native ? 'n' : 't', actor ?? ''].join('|')
  const ladder = useTicketLadder(key, o.chainId, build, [o.collateral.uid, o.debt.uid],
    [{ address: o.debt.address, symbol: o.debt.symbol }, native ? { address: nativeAsset(o.chainId), symbol: coin } : { address: o.collateral.address, symbol: o.collateral.symbol }],
    repayPlan({ ledger: paper.ledger, h, repayUnits: r, repayAll, withdrawUnits: w, withdrawAll: outAll }))
  const shortDebt = !!account && r > 0 && (!debtBal || debtBal.amount < r - 1e-9)
  const blocked = !(r > 0 || w > 0) ? 'Pay something back or take something out'
    : h.paper && !paperPos(paper.ledger, h) ? 'This paper loan is not in the book any more'
    : outAll && !repayAll ? 'The collateral comes back once the loan is repaid'
    : shortDebt ? `You have ${num(debtBal?.amount ?? 0, 2)} ${o.debt.symbol}`
    : debtAfter > 0 && hfAfter < MIN_HEALTH ? 'Too close to liquidation — take less out'
    : null
  const zone = debtAfter > 0 ? zoneOf(dropOf(collAfter, debtAfter, liq), bordersFor(o)) : 'safe'
  return (
    <>
      <div className="tsec">
        <span className="lbl">Pay back <span className="t50">· {o.debt.symbol} (of {num(owed, 2)} owed)</span></span>
        <AmountBox unit={o.debt.symbol} value={repay} onChange={setRepay} onMax={() => setRepay(+owed.toFixed(6))} />
        <div className="amt-sub"><span>≈ {usd(r * debtPrice)}</span><span>{account ? <>Wallet: {num(debtBal?.amount ?? 0, 2)} {o.debt.symbol}{shortDebt && <span className="warn"> · short</span>}</> : ''}</span></div>
        {repayAll && <div className="foot" style={{ marginTop: 4 }}>Paying back all of it: the amount is sized on chain when it lands, interest to that block included, so nothing is left behind. Keep a little more {o.debt.symbol} than shown.</div>}
        <span className="lbl" style={{ marginTop: 14 }}>Take out <span className="t50">· {o.collateral.symbol} (of {num(held, 4)} put up)</span></span>
        <AmountBox unit={o.collateral.symbol} value={out} onChange={setOut} onMax={() => setOut(repayAll ? held : floor6(maxOut))} />
        <div className="amt-sub"><span>≈ {usd(w * price)}</span><span>{debtAfter > 0 ? `at most ${num(maxOut, 4)} while ${usd(debtAfter)} is owed` : 'all of it, once repaid'}</span></div>
        {canNative && <div className="seg" style={{ marginTop: 8 }}>{[false, true].map((n) => <button key={String(n)} aria-pressed={native === n} onClick={() => setAsNative(n)}><Tok sym={n ? coin : o.collateral.symbol} logo={n ? undefined : o.collateral.logo} size={16} /> as {n ? coin : o.collateral.symbol}</button>)}</div>}
      </div>
      <div className="tsec"><div className="cells">
        <div className="c hero"><span className="k">Owed after</span><span className="v">{usd(debtAfter)}</span><span className="s">{debtAfter > 0 ? `costs about ${usd(monthlyCost(debtAfter, o.borrowApr))} a month` : 'the loan is paid off'}</span></div>
        <div className="c"><span className="k">Health after</span><span className={`v ${ZONES[zone].cls}`}>{debtAfter > 0 ? hfAfter.toFixed(2) : '—'}</span><span className="s">{debtAfter > 0 ? `${ZONES[zone].word} · −${pct(dropOf(collAfter, debtAfter, liq) * 100, 0)} to liquidation` : 'nothing owed'}</span></div>
        <div className="c"><span className="k">Back to you</span><span className="v">{usd(w * price)}</span><span className="s">{num(w, 4)} {native ? coin : o.collateral.symbol}</span></div>
      </div></div>
      <Action ladder={ladder} label={r > 0 && w > 0 ? `Pay back ${usd(r * debtPrice)} · take ${num(w, 4)} ${o.collateral.symbol}` : r > 0 ? `Pay back ${usd(r * debtPrice)}` : `Take out ${num(w, 4)} ${o.collateral.symbol}`} account={account} isConnected={isConnected} disabled={!!blocked} blockedNote={blocked ?? undefined} chainId={o.chainId} fee="repay" />
    </>
  )
}

// ----------------------------------------------------------------- social
/** "37 wallets borrow against TSLAx here", with the biggest one's face — only what the index can back — then the market's thread. */
function BorrowSocial({ o, thread }: { o: BorrowOffer; thread: ThreadRef | null }) {
  const key = pairKey(o.collateral.uid, o.debt.uid)
  const keys = React.useMemo(() => (key ? [key] : []), [key])
  const proofs = useStrategyProofs(keys)
  const row = key ? proofs.data?.get(key) : undefined
  const top = row?.top?.account
  const { profile } = useProfiles(top ? [top] : [])
  if (!row?.wallets && !thread) return null
  return (
    <>
      {row && row.wallets > 0 && <div className="tsec tsocial bproof">{top && <Who account={top} profile={profile(top)} size={22} />}<span className="t70"><b>{row.wallets} wallet{row.wallets === 1 ? '' : 's'}</b> borrow against {o.collateral.symbol} here · {usdShort(row.equityUsd)} of equity in their loans</span></div>}
      {thread && <div className="tsec tsocial"><span className="lbl">What people say</span><Thread kind={thread.kind} subjectKey={thread.key} compact max={2} placeholder={`What do you make of borrowing against ${o.collateral.symbol} here?`} /></div>}
    </>
  )
}

/** For the lists: a held native-coin balance sits at the zero address, the market at the wrapper. */
export const isNativeFor = (chainId: string, a: string) => isNativeAddress(a) || wrapsNative(chainId, a)
