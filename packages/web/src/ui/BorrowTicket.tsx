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
 * How much can also be typed (tickets/0011), in dollars or in the token: "exactly 500 USDC". Typed
 * with nothing chosen to put up, the Put up box follows — the collateral that starts the loan in
 * Safe, never under what the venue itself asks for (`range` → `minDeposit`).
 *
 * Collateral already put up — a running loan, or a plain deposit in the same market with nothing
 * owed (`depositsAsLoans`) — is counted as it stands, every leg of the account: nothing has to be
 * typed to borrow against it. The most it can take is the model's (the venue's range route cannot
 * read an account yet, docs/apis.md); a fresh loan is held to the venue's number as well.
 *
 * Two tabs on the ticket's own mode row once a loan is running: Borrow (more collateral, more
 * debt, or both) and Pay back (some or all of it, and the collateral out). Every build is one of
 * the API's lending actions (`deposit-and-borrow`, `withdraw-and-repay`, or a single leg where the
 * other is zero), through the same ladder, paper path and trace as every other ticket.
 */
import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { nameOf } from '@yieldcircle/core/model/assets'
import { offerFromHolding, CRYPTO_BORDERS, MIN_HEALTH, ZONES, bordersFor, collateralFor, collateralOf, defaultBorrow, dropOf, healthOf, isPutUp, liquidationPrice, maxBorrowUsd, monthlyCost, owedOf, usMarket, zoneAmounts, zoneOf, type BorrowOffer, type Zone } from '@yieldcircle/core/model/borrow'
import { borrowAtSize, capRaw, toRaw } from '@yieldcircle/core/model/leverage'
import { fromUnits, heldRaw, payRaw, portion, unitsOf, type Amount } from '@yieldcircle/core/model/amount'
import { isNativeAddress, nativeDecimals, nativeSymbol, wrapsNative, type Holding, type Idle } from '@yieldcircle/core/model/positions'
import { isSvmChain, normAddr } from '@yieldcircle/core/model/address'
import { keyOfToken } from '@yieldcircle/core/model/desk'
import { denomOf, groupOf } from '@yieldcircle/core/model/assets'
import type { LoopStrategy } from '@yieldcircle/core/model/strategies'
import { canonUid, pairKey, type ThreadRef } from '@yieldcircle/core/model/uid'
import { lendingAction, lendingDepositAndBorrow, lendingRange, lendingWithdrawAndRepay, nativeAsset } from '@yieldcircle/core/sdk/api'
import { chainLabel, useIrm, useLendingBooks } from '@yieldcircle/app/sdk/queries'
import { useStrategyProofs } from '@yieldcircle/app/index/queries'
import { useProfiles } from '../social/queries'
import { go, useApp, type Mode } from '../state/AppState'
import { usePaper } from '../state/Paper'
import { useSticky, useStickyAmount } from '../state/sticky'
import { Action, AmountBox, GetLine, TicketCtx, collateralOnFirst, sameToken } from './Ticket'
import { GetAsset } from './GetAsset'
import { IrmLink } from './Irm'
import { BookLink } from './Book'
import { RatePicker } from './RatePicker'
import { clampRate, rateToWad, recommendedOf, userSetOfBook } from '@yieldcircle/core/model/userSetRate'
import { Thread } from './Thread'
import { Who } from './social-bits'
import { BorrowRewards, DecimalInput, Info, KindPill, RiskDot, SubAccountPill, Tok, Toks, num, pct, usd, usdShort } from './bits'
import { stepsFrom, useTicketLadder } from '@yieldcircle/app/ladder'
import { borrowPlan, paperPos, repayPlan } from '@yieldcircle/app/tickets/paperPlans'
import { bufferOfHealth, holdingLine, moneyWord } from '@yieldcircle/core/model/lite'
import { LiteDetails, LiteMoreCtx, LiteMoreSheet, LiteNumbers, LitePresets } from './lite/LiteTicketBits'
import { ceil6, floor6 } from '@yieldcircle/core/model/ticket'
import { useRepayTicket } from '@yieldcircle/app/tickets/repay'
import { useHoldingPnl } from '@yieldcircle/app/index/pnl'
import { pnlLine } from '@yieldcircle/core/model/holdingPnl'
import { proHref } from '../state/AppState'

/** a coin amount or a price in another coin, to four significant figures (0.03124 BTC, 1,240 USDC) */
const sig4 = (x: number) => (x >= 1000 ? num(x, 0) : String(+x.toPrecision(4)))
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
  const owedUsd = holding ? owedOf(holding) : 0
  // collateral in with nothing owed yet: there is nothing to pay back, so no tabs — one line saying what is in
  const putUp = !!holding && isPutUp(holding)
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
      {holding && putUp && (
        <div className="tsec"><div className="modes putup">
          <span className="sum"><b>{num(holding.amount, 4)} {holding.symbol}</b> already put up at {holding.venue} · nothing owed</span>
          <span className="sp" />{holdings.length < 2 && <SubAccountPill sub={holding.subAccount} venue={holding.venue} />}
        </div></div>
      )}
      {holding && !putUp && (
        <div className="tsec"><div className="modes" role="tablist" aria-label="Manage">
          <button role="tab" aria-selected={pane === 'borrow'} onClick={() => setPane('borrow')}>Borrow</button>
          <button role="tab" aria-selected={pane === 'repay'} onClick={() => setPane('repay')}>Pay back</button>
          <span className="sp" /><span className="sum">owes {usd(owedUsd)}{holding.health != null ? ` · health ${holding.health.toFixed(2)}` : ''}</span>
          {holdings.length < 2 && <SubAccountPill sub={holding.subAccount} venue={holding.venue} />}
        </div></div>
      )}
      {(!holding || putUp) && choices && onPick && <WhereLine o={o} choices={choices} idle={idle} onPick={onPick} />}
      {offMenu && <div className="tsec offmenu" role="note"><b>Not in the list.</b> {offMenu}</div>}
      {holding && !putUp && pane === 'repay'
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
function BorrowPane({ o, h, idle, alternatives, loop }: { o: BorrowOffer; h: Holding | null; idle: Idle[]; alternatives: BorrowOffer[]; /** a held loop's own account (`LoopLoanPanes`): nothing is borrowed unless asked for, and the words are a loop's */ loop?: boolean }) {
  const { account, isConnected, solSigner, actorOn } = useApp()
  const actor = actorOn(o.chainId)
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
  const outAmt = (usdV: number) => (usdOut ? usd(usdV) : `${sig4(usdV / debtPrice)} ${o.debt.symbol}`)
  // the real build, asked for its simulation only: the health the venue itself computes
  const build = (simulate: boolean) => {
    const base = { operator: actor!, accountId: h?.accountId, simulate }
    const pay = chosen.role === 'native' ? chosen.address : undefined
    if (put > 0 && take > 0) return lendingDepositAndBorrow({ ...base, collateralMarketUid: o.collateral.uid, debtMarketUid: o.debt.uid, collateralRaw: putRaw, borrowRaw: toRaw(debtUnits, o.debt.decimals), payAsset: pay, modeId: o.modeId, ...(rate != null ? { interestRate: rateToWad(rate) } : {}) })
    if (put > 0) return lendingAction('deposit', { ...base, marketUid: o.collateral.uid, amountRaw: putRaw, payAsset: pay })
    return lendingAction('borrow', { ...base, marketUid: o.debt.uid, amountRaw: toRaw(debtUnits, o.debt.decimals) })
  }
  const dKey = useDebounced([o.id, putRaw, Math.round(take * 100), chosen.role, actor ?? '', h?.accountId ?? '', rate ?? ''].join('|'), 500)
  const sim = useQuery({
    enabled: !!actor && isConnected && !paper.active && (put > 0 || take > 0) && dKey === [o.id, putRaw, Math.round(take * 100), chosen.role, actor ?? '', h?.accountId ?? '', rate ?? ''].join('|'),
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
  const debtKey = keyOfToken({ chainId: o.chainId, address: o.debt.address, symbol: o.debt.symbol }) ?? o.debt.symbol
  // (a borrow on collateral already in whose flag is off switches it on first, or the borrow reverts: tickets/0015)
  const ladder = useTicketLadder(key, o.chainId, async () => [...(take > 0 ? await collateralOnFirst(h, actor!) : []), ...stepsFrom((await build(false)).actions, put > 0 && take > 0 ? 'Put up and borrow' : put > 0 ? 'Add collateral' : 'Borrow', o.chainId)],
    [o.collateral.uid, o.debt.uid], [{ address: chosen.address, symbol: chosen.symbol }, { address: o.debt.address, symbol: o.debt.symbol }],
    borrowPlan({ offer: o, into: h, payToken: chosen.address, collUnits: put, debtUnits, borrowApr: apr }),
    // the build, unsigned, before a paper loan: what the API would refuse, paper refuses
    !isSvmChain(o.chainId))
  // what stops the button, in words
  const short = !!account && (!bal || put > bal.amount + 1e-9) && put > 0
  const [ack, setAck] = React.useState(false)
  const blocked = !(put > 0 || take > 0) ? (loop ? 'Put some collateral in or borrow something' : 'Put something up or take something out')
    : paper.active && o.assetClass ? `Paper loans against ${o.ticker ?? 'stocks'} open once their prices can be trusted`
    : short ? `You have ${num(bal?.amount ?? 0, 4)} ${chosen.symbol}`
    : over && take > 0 ? (cap > 0 ? `The most you can take here is ${outAmt(cap)}` : `Put something up to take ${usdOut ? 'dollars' : o.debt.symbol} out`)
    : take > 0 && effHf < MIN_HEALTH ? 'Too close to liquidation — take less'
    : o.maxLtv <= 0 && take > 0 ? 'Borrow more on this loan at the venue'
    : zone === 'spicy' && take > 0 && !ack ? 'Tick the box above to take this much'
    : null
  // a stock does not trade at night or at weekends: Monday's open can jump past the line
  const mkt = o.assetClass ? usMarket() : null
  // (not on collateral already in: a cheaper market elsewhere is a new loan there, not a switch)
  const cheaper = h ? undefined : alternatives.filter((a) => a.id !== o.id && a.liquidityUsd >= Math.max(take, 1000) && a.borrowApr <= apr - 0.5 && a.maxLtv > 0).sort((a, b) => a.borrowApr - b.borrowApr)[0]
  const [details, setDetails] = React.useState(false)
  const takeWord = pick?.by === 'tok' || !usdOut ? `${sig4(debtUnits)} ${o.debt.symbol}` : usd(take)
  const label = take > 0 ? `Borrow ${takeWord}` : `Add ${num(put, 4)} ${chosen.symbol}`
  const zbar = cap > 0 ? ZONE_ORDER.map((k) => { const at = (d: number) => Math.min(cap, Math.max(0, collUsd * o.liqLtv * (1 - d) - owedUsd)); const lo = k === 'safe' ? 0 : at(k === 'watch' ? borders.safe : borders.watch), hi = k === 'safe' ? at(borders.safe) : k === 'watch' ? at(borders.watch) : cap; return { k, w: Math.max(0, hi - lo) / cap } }) : []
  return (
    <>
      <div className="tsec">
        {opts.length > 1 && <>
          <span className="lbl">You put up</span>
          <div className="seg" style={{ marginBottom: 10 }}>{opts.map((x) => <button key={x.role} aria-pressed={chosen.role === x.role} onClick={() => setRole(x.role)}><Tok sym={x.symbol} logo={x.role === 'token' ? o.collateral.logo : undefined} size={16} /> {x.symbol}<span className="c" style={{ marginLeft: 6 }}>{account ? num(balOf(x.address)?.amount ?? 0, 3) : ''}</span></button>)}</div>
        </>}
        <span className="lbl">{h ? 'Add collateral' : 'Put up'} <span className="t50">· {chosen.symbol}{h ? ' · optional' : ''}</span></span>
        <AmountBox unit={chosen.symbol} value={putAmt} onChange={setPut} onMax={bal ? () => setPut(portion(bal, 100, chosen.decimals)) : undefined} />
        <div className="amt-sub"><span>{price > 0 ? `≈ ${usd(putUsd)}` : 'no price for it right now'}{h ? <> · {num(heldUnits, 4)} {h.symbol} in already</> : null}</span><span>{account ? <>In your wallet: {bal ? `${num(bal.amount, 4)} ${bal.symbol}` : `0 ${chosen.symbol}`}{short && <span className="warn"> · not enough</span>}</> : 'connect to see your balance'}</span></div>
        <GetLine account={account} short={short} symbol={chosen.symbol} open={getOpen} onOpen={() => setGetOpen(true)} />
        {getOpen && <GetAsset targets={opts.map((x) => ({ chainId: o.chainId, address: x.address, symbol: x.symbol, decimals: x.decimals, price, logo: x.role === 'token' ? o.collateral.logo : undefined, have: balOf(x.address)?.amount ?? 0 }))} want={put} sources={idle} onTarget={(t) => setRole(opts.find((x) => x.address === t.address)?.role ?? null)} onClose={() => setGetOpen(false)} />}

        <span className="lbl" style={{ marginTop: 14 }}>{loop ? 'Borrow' : 'Take out'} <span className="t50">· {o.debt.symbol}{loop ? ' · optional' : ''}</span> <Info label="The three zones">
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
            <input type="range" min={0} max={Math.max(cap, 0.01)} step={Math.max(0.01, cap / 400)} value={Math.min(take, cap)} onChange={(e) => setTake(parseFloat(e.target.value))} aria-label="Amount to borrow" disabled={!(cap > 0)} />
          </div>
          {/* or the exact sum: typed in the token (500 USDC is 500 USDC) or in dollars */}
          <div className={`amt sm tk-amt ${over ? 'over' : ZONES[zone].cls}`}>
            <DecimalInput value={boxValue} style={String(Math.round(boxValue)).length > 7 ? { fontSize: 13 } : undefined} onChange={(v) => setPick({ by: unit, v, typed: true })} ariaLabel={`Amount to borrow, in ${unit === 'usd' ? 'dollars' : o.debt.symbol}`} />
            <button type="button" className="u uswap" title={`Type it in ${unit === 'usd' ? o.debt.symbol : 'dollars'} instead`} onClick={() => setUnit(unit === 'usd' ? 'tok' : 'usd')}>{unit === 'usd' ? '$' : o.debt.symbol}<span aria-hidden> ⇄</span></button>
          </div>
        </div>
        <div className="amt-sub">
          <span>{unit === 'usd' ? `= ${sig4(debtUnits)} ${o.debt.symbol}` : `≈ ${usd(take)}`}</span>
          {over && take > 0
            ? <span className="warn">{cap > 0 ? `most here: ${outAmt(cap)}` : 'put something up first'}{cap > 0 && o.liquidityUsd > 0 && cap >= o.liquidityUsd - 1 ? ' · all the market has free' : ''}</span>
            : typed && put + 1e-9 < wantUnits && price > 0
              ? <button type="button" className="lnk" onClick={() => setPut(fromUnits(wantUnits))}>put up {sig4(wantUnits)} {chosen.symbol} to start Safe ›</button>
              : typed && floorUnits > 0 ? <span>{o.venue} asks at least {sig4(Math.max(0, floorUnits))} {o.collateral.symbol}</span> : <span />}
        </div>
      </div>

      {u && rate != null && <RatePicker u={u} book={queueBook} rate={rate} onRate={setRate} debtSymbol={o.debt.symbol} price={debtPrice} />}

      {/* the sentence: the zone, what it costs in money, and the line in the asset's own price */}
      <div className="tsec bsum">
        <div className="bline"><span className={`zdot ${ZONES[zone].cls}`} aria-hidden /><b className={ZONES[zone].cls}>{ZONES[zone].word}</b>
          <span className="t70"> · {owedUsd > 0.005 ? 'the whole loan costs' : 'costs'} about <b>{usd(monthly)}</b> a month</span> <span className="t50">({pct(apr)} APR{Math.abs(apr - o.borrowApr) >= 0.05 ? ` at this size, ${pct(o.borrowApr)} now` : ''}<BorrowRewards apr={apr} rewards={o.rewards} sep=", " />)</span>
          {o.userSet ? <BookLink uid={o.debt.uid} side="borrow" size={0} symbol={o.debt.symbol} price={debtPrice} label="the queue" rate={rate ?? undefined} /> : <IrmLink uid={o.debt.uid} side="borrow" label="rate curve" />}</div>
        {totalDebt > 0 && (o.pegged
          ? <div className="bline t70">Both sides are dollars: only {o.collateral.symbol} losing its peg by {pct(drop * 100, 1)} can liquidate this.</div>
          : mixed ? <div className="bline t70">If what you have put up loses <b>{pct(drop * 100, 0)}</b> of its value{usdOut ? '' : ` against ${o.debt.symbol}`}, the lender sells some of it to repay. <span className="t50">(More than one token backs this account, so there is no single price to name.)</span></div>
          : !usdOut ? liqRatio > 0 && <div className="bline t70">If <b>{whatOf(o)}</b> falls below <b>{sig4(liqRatio)} {o.debt.symbol}</b> (−{pct(drop * 100, 0)}{ratioNow > 0 ? ` from ${sig4(ratioNow)}` : ''}), the lender sells your {o.collateral.symbol} to repay. <span className="t50">You owe {o.debt.symbol}, so {o.debt.symbol} rising counts as much as {whatOf(o)} falling.</span></div>
          : liqPx > 0 && <div className="bline t70">If <b>{whatOf(o)}</b> falls below <b>{usd(liqPx)}</b> (−{pct(drop * 100, 0)}{price > 0 ? ` from ${usd(price)}` : ''}), the lender sells your {o.collateral.symbol} to repay.</div>)}
        {mkt && !mkt.open && totalDebt > 0 && <div className="bline warn">{o.ticker ?? whatOf(o)} trades again {mkt.next} — until then its price holds still, and the open can jump past your line in one step.</div>}
        {cheaper && <button type="button" className="bline nudge" onClick={() => go(cheaper.group, { u: cheaper.asset, k: 'borrow', s: cheaper.id })}><b>{pct(cheaper.borrowApr)}</b> at {cheaper.venue} — {pct(apr - cheaper.borrowApr, 1).replace('%', '')} points cheaper ›</button>}
        {zone === 'spicy' && take > 0 && <label className="qack"><span><b>Spicy:</b> an ordinary move in {whatOf(o)} can liquidate this, and liquidation costs a penalty on top.</span><span className="qck"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I have a plan to add collateral or pay back fast</span></label>}
        <div className="cells" style={{ marginTop: 10 }}>
        <button type="button" className="c more" aria-expanded={details} onClick={() => setDetails(!details)}>{details ? 'Hide details' : 'Details'}<span className="t40">{details ? '' : 'limits · liquidity · after'}</span><span className="chev" aria-hidden>▾</span></button>
        {details && <>
          <div className="c"><span className="k">You owe after</span><span className="v">{usd(totalDebt)}</span><span className="s">{sig4(owedUnits + debtUnits)} {o.debt.symbol}</span></div>
          <div className="c"><span className="k">Put up after</span><span className="v">{usd(collUsd)}</span><span className="s">{num(collUnits, 4)} {o.collateral.symbol}</span></div>
          <div className="c"><span className="k">Most you can take</span><span className="v">{usd(cap)}</span><span className="s">{pct(o.maxLtv * 100, 0)} limit · never under health {MIN_HEALTH.toFixed(2)}{range.data?.maxBorrow ? ' · read for your account' : ''}</span></div>
          <div className="c"><span className="k">Free to borrow</span><span className={`v ${o.liquidityUsd < take * 2 ? 'warn' : ''}`}>{o.liquidityUsd > 0 ? usdShort(o.liquidityUsd) : '—'}</span><span className="s">{o.utilization != null ? `${Math.round(o.utilization * 100)}% lent out` : 'in the market'}</span></div>
          <div className="c"><span className="k">Health</span><span className={`v ${ZONES[zone].cls}`}>{Number.isFinite(effHf) ? effHf.toFixed(2) : '∞'}</span><span className="s">{simHf != null ? 'simulated by the venue' : 'from the liquidation threshold'}</span></div>
        </>}
        </div>
      </div>
      {ladder.finished && take > 0 && <Landed o={o} take={take} what={takeWord} line={mixed ? '' : usdOut ? (liqPx > 0 ? usd(liqPx) : '') : liqRatio > 0 ? `${sig4(liqRatio)} ${o.debt.symbol}` : ''} debtKey={debtKey} />}
      <Action ladder={ladder} label={label} account={account} isConnected={isConnected} disabled={!!blocked} blockedNote={blocked ?? undefined} risky={zone === 'spicy'} chainId={o.chainId} fee="borrow" />
    </>
  )
}

/** After it lands: where the money is, the line to keep in mind, and the loop the app is about — borrow cheap, earn more. */
function Landed({ o, take, what, line, debtKey }: { o: BorrowOffer; take: number; what: string; line: string; debtKey: string }) {
  return (
    <div className="tsec landed">
      <b>{what.startsWith('$') ? `${what} ${o.debt.symbol}` : what} is in your wallet.</b>
      {!o.pegged && line && <span className="t70"> Your {o.collateral.symbol} is safe while {whatOf(o)} stays above {line}.</span>}
      <div className="actions" style={{ marginTop: 8 }}>
        <a className="btn sm" href="#/alerts">Set an alert</a>
        <button type="button" className="btn sm pri" onClick={() => go(groupOf(debtKey), { u: debtKey })}>Put the {usdShort(take)} to work ›</button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- Lite
/**
 * A loan on Lite's You page (docs/lite.md): Lite opens no loans, but a reader who holds one must be
 * able to end it. Two plain actions — pay it all back and take the collateral home, or pay part of
 * it back to move away from liquidation — on Pro's own repay build. Borrowing more is Pro's.
 */
export function LiteLoanTicket({ h, idle, onClose }: { h: Holding; idle: Idle[]; onClose: () => void }) {
  const o = React.useMemo(() => offerFromHolding(h), [h])
  const [pane, setPane] = React.useState<'all' | 'some'>((bufferOfHealth(h.health) ?? 1) < 0.1 ? 'some' : 'all')
  const line = holdingLine(h)
  const pnl = useHoldingPnl(h)
  const pl = pnl ? pnlLine(pnl, { loan: true }) : null
  const [details, setDetails] = React.useState(false)
  const detailsHref = proHref(`#/${h.group}?${new URLSearchParams({ k: 'borrow', h: h.key, m: 'reduce' })}`)
  return (
    <TicketCtx.Provider value={{ uid: o ? canonUid(o.collateral.uid) : null, lite: true }}>
    <div className="ticket lite-ticket">
      <div className="grab" />
      <div className="th"><Toks a={h.symbol} b={h.debtSymbol} logoA={h.logo} />
        <div style={{ flex: 1, minWidth: 0 }}><div className="n">{moneyWord(h.asset, h.group)} loan</div><div className={`s ${line.tone}`}>owes {usd(owedOf(h))} · {line.text.replace(/^A loan · /, '')}</div>{pl && <div className={`s ${pl.tone}`}>{pl.text}</div>}</div>
        <button className="x" onClick={onClose} aria-label="Close">✕</button></div>
      {!o ? <div className="tsec"><div className="caution">This loan can’t be read well enough to pay back here. Open it in Details.</div></div> : <>
        <div className="tsec"><div className="modes" role="tablist" aria-label="Pay back">
          <button role="tab" aria-selected={pane === 'all'} onClick={() => setPane('all')}>Pay back all</button>
          <button role="tab" aria-selected={pane === 'some'} onClick={() => setPane('some')}>Pay back some</button>
        </div></div>
        <RepayPane key={h.key + pane} o={o} h={h} idle={idle} lite={pane} />
      </>}
      <LiteDetails onOpen={() => setDetails(true)} what="Every number · borrowing more is in Pro" />
      <LiteMoreCtx.Provider value={{ open: details, close: () => setDetails(false), pro: detailsHref }}>
        <LiteMoreSheet>
          <section className="lite-more-s"><h3>Borrow more, or take collateral out</h3><p className="plain">Lite only ends loans. Both are in Pro, from the link below.</p></section>
          <LiteNumbers rows={[
            ['Owes', usd(owedOf(h))],
            ['Put up', `${usd(collateralOf(h))} · ${num(h.amount, 4)} ${h.symbol}`],
            ...(bufferOfHealth(h.health) != null ? [['From liquidation', pct(bufferOfHealth(h.health)! * 100, 1)] as [string, string]] : []),
            ['Where', `${h.venue.split(' · ')[0]} · ${chainLabel(h.chainId)}`],
          ]} />
        </LiteMoreSheet>
      </LiteMoreCtx.Provider>
    </div>
    </TicketCtx.Provider>
  )
}

/**
 * A held loop worked as a loan, on its own account and with no swap — the way to contain its risk
 * when a swap would cost too much: collateral in, and more debt out where it is a plain loan
 * (`deposit-and-borrow`, or either leg alone); or debt paid from the wallet and collateral out
 * (`withdraw-and-repay`). The loan ticket's own panes, on an offer read off the holding with the
 * loop strategy's limits and rate laid over it (`offerFromHolding` knows no limit).
 *
 * `canBorrow` false — a term, a tenor or a maturity, whose debt the lending routes cannot add to, or
 * a position off the menu with no limit to borrow under — keeps the collateral side to Top up's one
 * leg. Pro's Loan tab switches the two sides here; Lite's Top up and Pay back tabs each pass `pane`.
 */
export function LoopLoanPanes({ s, h, idle, canBorrow, pane: fixed }: { s: LoopStrategy | null; h: Holding; idle: Idle[]; canBorrow: boolean; pane?: 'borrow' | 'repay' }) {
  const o = React.useMemo(() => {
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
  }, [h, s])
  const [pick, setPane] = React.useState<'borrow' | 'repay'>('borrow')
  const pane = fixed ?? pick
  const borrows = canBorrow && !!s
  if (!o) return <Unreadable />
  return (
    <>
      {!fixed && <div className="tsec"><div className="seg" role="tablist" aria-label="Loan">
        <button role="tab" aria-selected={pane === 'borrow'} aria-pressed={pane === 'borrow'} onClick={() => setPane('borrow')}>{borrows ? 'Add collateral · borrow' : 'Add collateral'}</button>
        <button role="tab" aria-selected={pane === 'repay'} aria-pressed={pane === 'repay'} onClick={() => setPane('repay')}>Pay back · withdraw</button>
      </div></div>}
      <div className="tsec"><div className="foot">{pane === 'repay' ? 'Pay debt back from your wallet and, if you like, take collateral out. No swap: nothing is sold, whatever the market pays.'
        : borrows ? 'Put more collateral in to make it safer and, if you like, borrow against it to your wallet. No swap: nothing is bought, whatever the market pays.'
        : 'Put more collateral in from your wallet to move it away from liquidation. No swap: nothing is bought, whatever the market pays.'}</div></div>
      {pane === 'repay' ? <RepayPane key={h.key + ':repay'} o={o} h={h} idle={idle} loop />
        : borrows ? <BorrowPane key={h.key + ':borrow'} o={o} h={h} idle={idle} alternatives={[]} loop />
        : <TopUpPane key={h.key + ':topup'} o={o} h={h} idle={idle} />}
    </>
  )
}

const Unreadable = () =><div className="tsec"><div className="caution">This position can’t be read well enough to change here. Open it in Details.</div></div>

function TopUpPane({ o, h, idle }: { o: BorrowOffer; h: Holding; idle: Idle[] }) {
  const { account, isConnected, actorOn } = useApp()
  const actor = actorOn(o.chainId)
  // put in the collateral token or — into a market of the chain's wrapped coin — the coin itself
  const opts = React.useMemo(() => {
    const token = { role: 'token' as const, address: normAddr(o.collateral.address), symbol: o.collateral.symbol, decimals: o.collateral.decimals }
    return wrapsNative(o.chainId, o.collateral.address) ? [{ role: 'native' as const, address: nativeAsset(o.chainId), symbol: nativeSymbol(o.chainId), decimals: nativeDecimals(o.chainId) }, token] : [token]
  }, [o.id])
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
    return stepsFrom(env.actions, 'Top up', o.chainId)
  }
  const key = [h.key, 'topup', putRaw, chosen.role, actor ?? ''].join('|')
  const ladder = useTicketLadder(key, o.chainId, build, [o.collateral.uid], [{ address: chosen.address, symbol: chosen.symbol }])
  return (
    <>
      <div className="tsec">
        <span className="lbl">How much {chosen.symbol} to put in <span className="t50">· {num(h.amount, 4)} in it now</span></span>
        <AmountBox unit={chosen.symbol} value={amt} onChange={setAmt} onMax={bal ? () => setAmt(portion(bal, 100, chosen.decimals)) : undefined} />
        <LitePresets onPick={(p) => bal && setAmt(portion(bal, p, chosen.decimals))} />
        <div className="amt-sub"><span>≈ {usd(put * price)}</span><span>{account ? <>You have {num(bal?.amount ?? 0, 4)} {chosen.symbol}{short && <span className="warn"> · not enough</span>}</> : ''}</span></div>
        <div className="plain t50" style={{ fontSize: 12, marginTop: 6 }}>It goes in beside what the loop holds: no swap, nothing borrowed. The debt stays as it is, so the loop gets safer and earns on more of your own money.</div>
      </div>
      <div className="tsec"><div className="cells">
        <div className="c hero"><span className="k">From liquidation after</span><span className="v">{owedUsd > 0 ? pct(dropOf(collAfter, owedUsd, liq) * 100, 1) : '—'}</span><span className="s">{owedUsd > 0 ? `was ${pct(dropOf(heldUsd, owedUsd, liq) * 100, 1)}` : 'nothing owed'}</span></div>
        <div className="c"><span className="k">Leverage after</span><span className="v">×{num(levOf(collAfter), 1)}</span><span className="s">was ×{num(levOf(heldUsd), 1)}</span></div>
      </div></div>
      <Action ladder={ladder} label={put > 0 ? `Put in ${num(put, 4)} ${chosen.symbol}` : 'Top up'} account={account} isConnected={isConnected} disabled={!!blocked} blockedNote={blocked ?? undefined} chainId={o.chainId} fee="deposit" />
    </>
  )
}

// ----------------------------------------------------------------- Pay back
function RepayPane({ o, h, idle, lite, loop }: { o: BorrowOffer; h: Holding; idle: Idle[]; /** Lite: all of it back and the collateral home, or part of the debt only */ lite?: 'all' | 'some'; /** a held loop's own account: the words are a loop's */ loop?: boolean }) {
  // everything but the screen is shared with the phone (`@yieldcircle/app/tickets/repay`)
  const { account, isConnected, actor, paper, owed, held, collUsd, price, otherUsd, owedUsd, otherDebtUsd, debtPrice, debtBal, repayAmt0, setRepay, outAmt0, setOut, repayAmt, outAmt, repay, out, repayAll, outAll, r, w, repayRaw, outRaw, debtAfter, collAfter, liq, hfAfter, maxOut, canNative, asNative, setAsNative, native, coin, build, key, ladder, shortDebt, blocked, zone, liteBlocked } = useRepayTicket(o, h, idle, lite)
  if (lite) return (
    <>
      <div className="tsec">
        {lite === 'some' && <>
          <span className="lbl">How much to pay back <span className="t50">· of {usd(owedUsd - otherDebtUsd)}</span></span>
          <AmountBox unit={o.debt.symbol} value={repayAmt} onChange={setRepay} onMax={() => setRepay(fromUnits(owed))} />
          <LitePresets onPick={(p) => setRepay(fromUnits(p === 100 ? owed : floor6(owed * p / 100)))} />
        </>}
        {lite === 'all' && <div className="plain">You pay back the {usd(owedUsd - otherDebtUsd)} you owe, interest to the block included, and your {num(held, 4)} {o.collateral.symbol} comes back to your wallet.</div>}
        <div className="amt-sub"><span>{account ? <>You have {num(debtBal?.amount ?? 0, 2)} {o.debt.symbol}{shortDebt && <span className="warn"> · not enough</span>}</> : ''}</span></div>
        {shortDebt && <GetLine account={account} short symbol={o.debt.symbol} open={false} onOpen={() => { location.hash = proHref(`#/${h.group}?${new URLSearchParams({ k: 'borrow', h: h.key, m: 'reduce' })}`) }} />}
      </div>
      <div className="tsec"><div className="cells">
        <div className="c hero"><span className="k">{lite === 'all' ? 'Back to you' : 'Owed after'}</span><span className="v">{lite === 'all' ? usd(w * price) : usd(debtAfter)}</span><span className="s">{lite === 'all' ? `${num(w, 4)} ${o.collateral.symbol}` : debtAfter > 0 ? `${pct(dropOf(collAfter, debtAfter, liq) * 100, 0)} from liquidation after` : 'nothing owed'}</span></div>
      </div></div>
      <Action ladder={ladder} label={lite === 'all' ? `Pay back ${usd(r * debtPrice)} and take it home` : `Pay back ${usd(r * debtPrice)}`} account={account} isConnected={isConnected} disabled={!!liteBlocked} blockedNote={liteBlocked ?? undefined} chainId={o.chainId} fee="repay" />
    </>
  )
  return (
    <>
      <div className="tsec">
        <span className="lbl">Pay back <span className="t50">· {o.debt.symbol} (of {num(owed, 2)} owed)</span></span>
        <AmountBox unit={o.debt.symbol} value={repayAmt} onChange={setRepay} onMax={() => setRepay(fromUnits(owed))} />
        <div className="amt-sub"><span>≈ {usd(r * debtPrice)}</span><span>{account ? <>Wallet: {num(debtBal?.amount ?? 0, 2)} {o.debt.symbol}{shortDebt && <span className="warn"> · short</span>}</> : ''}</span></div>
        {repayAll && <div className="foot" style={{ marginTop: 4 }}>Paying back all of it: the amount is sized on chain when it lands, interest to that block included, so nothing is left behind. Keep a little more {o.debt.symbol} than shown.</div>}
        <span className="lbl" style={{ marginTop: 14 }}>{loop ? 'Withdraw' : 'Take out'} <span className="t50">· {o.collateral.symbol} (of {num(held, 4)} {loop ? 'in it' : 'put up'}){loop ? ' · optional' : ''}</span></span>
        <AmountBox unit={o.collateral.symbol} value={outAmt} onChange={setOut} onMax={() => setOut(repayAll && otherDebtUsd <= 0.5 ? portion(heldRaw(h), 100, o.collateral.decimals) : fromUnits(floor6(maxOut)))} />
        <div className="amt-sub"><span>≈ {usd(w * price)}</span><span>{debtAfter > 0 ? `at most ${num(maxOut, 4)} while ${usd(debtAfter)} is owed` : 'all of it, once repaid'}</span></div>
        {canNative && <div className="seg" style={{ marginTop: 8 }}>{[false, true].map((n) => <button key={String(n)} aria-pressed={native === n} onClick={() => setAsNative(n)}><Tok sym={n ? coin : o.collateral.symbol} logo={n ? undefined : o.collateral.logo} size={16} /> as {n ? coin : o.collateral.symbol}</button>)}</div>}
      </div>
      <div className="tsec"><div className="cells">
        <div className="c hero"><span className="k">Owed after</span><span className="v">{usd(debtAfter)}</span><span className="s">{debtAfter > 0 ? (repayAll && otherDebtUsd > 0.5 ? `the ${(h.others ?? []).filter((x) => x.side === 'debt').map((x) => x.symbol).join(' + ')} the account also owes stays` : `costs about ${usd(monthlyCost(debtAfter, o.borrowApr))} a month`) : 'the loan is paid off'}</span></div>
        <div className="c"><span className="k">Health after</span><span className={`v ${ZONES[zone].cls}`}>{debtAfter > 0 ? hfAfter.toFixed(2) : '—'}</span><span className="s">{debtAfter > 0 ? `${ZONES[zone].word} · −${pct(dropOf(collAfter, debtAfter, liq) * 100, 0)} to liquidation` : 'nothing owed'}</span></div>
        <div className="c"><span className="k">Back to you</span><span className="v">{usd(w * price)}</span><span className="s">{num(w, 4)} {native ? coin : o.collateral.symbol}</span></div>
      </div></div>
      <Action ladder={ladder} label={r > 0 && w > 0 ? `Pay back ${usd(r * debtPrice)} · ${loop ? 'withdraw' : 'take'} ${num(w, 4)} ${o.collateral.symbol}` : r > 0 ? `Pay back ${usd(r * debtPrice)}` : `${loop ? 'Withdraw' : 'Take out'} ${num(w, 4)} ${o.collateral.symbol}`} account={account} isConnected={isConnected} disabled={!!blocked} blockedNote={blocked ?? undefined} chainId={o.chainId} fee="repay" />
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
