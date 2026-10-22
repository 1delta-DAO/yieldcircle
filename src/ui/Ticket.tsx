import React from 'react'
import { nameOf, unitOf } from '../model/assets'
import { DEFAULT_TIER, TIERS, borrowAtSize, curveRateNow, customRange, healthAt, liqBuffer, netAprAtLeverage, capRaw, toRaw, type TierId } from '../model/leverage'
import { fromUnits, heldRaw, payRaw, portion, unitsOf, type Amount } from '../model/amount'
import { dateOf, exitTerms, isBooked, loopRewards, isLoopscale, type LoopStrategy, type LoopTenor, type LoopTerm, type SimpleStrategy, type Strategy } from '../model/strategies'
import { isSvmTx, type LoopActions, type LoopPayAsset } from '../sdk/types'
import { isNativeAddress, nativeDecimals, nativeSymbol, wrapsNative, type Holding, type Idle } from '../model/positions'
import { earnDeposit, earnWithdraw, enableCollateral, loopClose, loopOpen, midnightSell, nativeAsset } from '../sdk/api'
import { needsCollateralOn } from '../model/putUp'
import { bookAprAt, bookDepth, chainLabel, quoteClose, SOL_POSITIONS_READY, useCloseQuote, useIrm, useLendingBooks, useLoopPayAssets, useLoopQuote, useRateHistory, useTenorQuotes } from '../sdk/queries'
import { seriesFor } from '../model/rateHistory'
import { RateHistoryPanel, useSparkRewards } from './Spark'
import { useApp, type Mode } from '../state/AppState'
import { useSticky, useStickyAmount } from '../state/sticky'
import { slippageFor, useSettings } from '../state/Settings'
import { SlippagePicker } from './SettingsPanel'
import { AmountInput, Info, KindPill, RouteChooser, LegsPill, SubAccountPill, RiskDot, Sk, StratMark, Tok, Toks, TxLink, num, pct, usd, usdShort } from './bits'
import { Who } from './social-bits'
import { LossAck, ValueRow, cents, useValueCheck } from './ValueCheck'
import { isSvmChain, normAddr } from '../model/address'
import { useProfiles } from '../social/queries'
import { stepsFrom, useTicketLadder, type Ladder, type Step } from './useLadder'
import { usePaper } from '../state/Paper'
import { balanceOf, gasCoinOf, gasTokenOf, networkFeeUsd, NO_GAS, tokenKey, type FeeKind } from '../model/paper'
import { openPaperSignIn } from './PaperSignIn'
import { openGate, realTradingGated } from '../wallet/gate'
import { depositPlan, leverPlan, loopPlan, reducePlan, withdrawPlan } from './paperPlans'
import { isDone, useTrace } from '../sdk/txTrace'
import { Spin, TxNote } from './TxTray'
import { GetAsset, type Target } from './GetAsset'
import { FundingLock } from './FundingLock'
import { IrmLink } from './Irm'
import { BookLink } from './Book'
import { RatePicker } from './RatePicker'
import { clampRate, rateToWad, recommendedOf, userSetOfBook } from '../model/userSetRate'
import { useSignTypedData } from 'wagmi'
import { withSignature } from '../sdk/signedAction'
import { uidOf, type ThreadRef } from '../model/uid'
import { useThreadOf } from '../social/queries'
import { NATURES, isSavings } from '../model/nature'
import { SayWhy } from './SayWhy'
import { TicketSocial } from './TicketSocial'
import { AssetLink } from './TokenPage'

/**
 * What the ticket is about, for the pieces too deep to thread props through:
 * the market the strategy sits in, the thread it is talked about on
 * (`threadOf`), and the wallet being copied when the ticket was opened from a
 * feed card.
 */
export const TicketCtx = React.createContext<{ uid: string | null; thread?: ThreadRef | null; copy?: string; copyLev?: number }>({ uid: null })

/** The ticket: what you do in plain words, amount (+ leverage), the numbers, what can go wrong, one button. */
/**
 * `holdings`: every position the wallet runs on this strategy — more than one when the venue keeps
 * isolated sub-accounts (Euler, Dolomite, Fluid / Jupiter Lend NFTs, Kamino obligations). They are
 * never summed: each has its own health, and every action names one (`accountId`), so the ticket
 * shows a picker and works on the picked one. `pick`: the `Holding.key` to start on.
 */
export function Ticket({ s, idle, holdings, beside, pick, mode: mode0, copy, copyLev, offMenu, talk, socialInList, onClose }: { s: Strategy; idle: Idle[]; holdings: Holding[]; /** deposits in this loop's collateral market that a venue rule keeps it from levering in place (`depositsAsLoops`) */ beside?: { h: Holding; why: string }[]; pick?: string; mode?: Mode; copy?: string; /** the leverage `copy` runs this loop at, offered as its own tile */ copyLev?: number; offMenu?: string; talk?: boolean; /** the list shows the thread and who is in it under the picked row, so the ticket need not */ socialInList?: boolean; onClose: () => void }) {
  const [hk, setHk] = React.useState(pick)
  const holding = holdings.find((h) => h.key === hk) ?? holdings[0] ?? null
  // what an Add builds on: the picked position, unless the API cannot build for its account — then a new one, never figures for a book it will not touch
  const into = holding && !holding.subAccount?.unsupported ? holding : null
  // a deposit a loop can start from opens on levering it: that is why it is offered here (tickets/0015)
  const [mode, setMode] = React.useState<Mode>(holding ? mode0 ?? (holding.putUp ? 'manage' : 'add') : 'add')
  const uid = uidOf(s)
  const thread = useThreadOf()(s)
  return (
    <TicketCtx.Provider value={{ uid, thread, copy, copyLev }}>
    <div className="ticket">
      <div className="grab" />
      <div className="th">{s.kind === 'loop' ? <Toks a={s.holds} b={s.debt} logoA={s.logoLong} logoB={s.logoShort} /> : <StratMark sym={s.holds} logo={s.logo} venueKey={s.protocolKey} brand={s.brand} size={26} />}
        <div style={{ flex: 1, minWidth: 0 }}><div className="n">{s.kind === 'loop' ? `${s.holds} / ${s.debt} loop` : s.holds} <Info label="How this strategy works">{s.kind === 'loop' ? <>Deposit <b>{s.holds}</b>, borrow <b>{s.debt}</b> against it, swap the {s.debt} into more {s.holds}, repeat. One transaction does all of it. You earn the {s.holds} rate on the whole position and pay the {s.debt} rate on the borrowed part{s.terms ? <>, fixed for the term you pick</> : ''}.{s.desk ? <> Your exposure is <b>{nameOf(s.asset)}</b>{s.instrument ? <> (through {s.instrument})</> : ''}: a dollar debt cannot depeg upward, so {s.debt} is a rate you pay, not a risk you hold.</> : ''}{!isSavings(s.nature) ? <> This is not a carry: you owe {s.debt} and hold <b>{s.holds}</b>, whose price moves on its own, so the leverage multiplies that move as well as the rate.</> : ''}</> : <SimpleWords s={s} />}{!isSavings(s.nature) && <p style={{ margin: '8px 0 0' }}><b>Not a saving · {NATURES[s.nature].word}.</b> {NATURES[s.nature].why}</p>}</Info></div><div className="s">{nameOf(s.asset)} strategy · {s.kind === 'loop' ? `${s.venue}${s.terms ? ' · fixed rate' : ''}` : s.via} · {chainLabel(s.chainId)}</div><TicketAssetLinks s={s} /></div>
        <KindPill kind={s.kind} source={s.kind === 'simple' ? s.source : undefined} />{holding && <LegsPill others={holding.others} />}<button className="x" onClick={onClose} aria-label="Close">✕</button></div>
      {holdings.length > 1 && (
        <div className="tsec">
          <span className="lbl">Which position <Info label="Separate positions">You run this strategy in {holdings.length} separate accounts on {holding!.venue.split(' · ')[0]}. Each is its own position with its own health: collateral in one does not back debt in another. Adding, withdrawing, deleveraging and closing act on the one picked here.</Info></span>
          <div className="seg" role="radiogroup" aria-label="Which position">{holdings.map((h) => <button key={h.key} role="radio" aria-checked={h.key === holding!.key} aria-pressed={h.key === holding!.key} onClick={() => setHk(h.key)}>{h.subAccount?.label ?? 'Main account'}<span className="c" style={{ marginLeft: 6 }}>{usdShort(h.valueUsd)}</span></button>)}</div>
        </div>
      )}
      {holding && (
        <div className="tsec"><div className="modes" role="tablist" aria-label="Manage">
          <button role="tab" aria-selected={mode === 'add'} onClick={() => setMode('add')}>Add</button>
          <button role="tab" aria-selected={mode !== 'add'} onClick={() => setMode(s.kind === 'loop' ? 'manage' : 'reduce')}>{s.kind === 'loop' ? (holding.putUp ? 'Lever it' : 'Manage') : 'Withdraw'}</button>
          <span className="sp" /><span className="sum">{usd(holding.valueUsd)}{holding.putUp ? ` · ${num(holding.amount, 4)} ${holding.symbol} deposited` : ''}{s.kind === 'loop' && holding.leverage && holding.leverage > 1.05 ? ` · ${holding.leverage.toFixed(1)}×` : ''}{holding.health != null ? ` · health ${holding.health.toFixed(2)}` : ''}</span>
          {holdings.length < 2 && <SubAccountPill sub={holding.subAccount} venue={holding.venue} />}
        </div></div>
      )}
      {copy && <CopyBanner who={copy} s={s} lev={copyLev} />}
      {offMenu && (
        <div className="tsec offmenu" role="note">
          <b>Not in the menu.</b> {offMenu} Check the liquidity, rate and risk yourself before you size it.
        </div>
      )}
      {holding && mode !== 'add' ? (holding.subAccount?.unsupported ? <CannotManage h={holding} /> : s.kind === 'loop' ? <ManageLoop key={holding.key} s={s} h={holding} closeFirst={mode === 'close'} /> : s.book ? <ManageFixed key={holding.key} s={s} h={holding} mode={mode} /> : <ManageTicket key={holding.key} s={s} h={holding} mode={mode} />)
        : s.kind === 'simple' && s.book ? <FixedTicket key={into?.key} s={s} idle={idle.filter((i) => i.chainId === s.chainId)} allIdle={idle} into={into} />
        : s.kind === 'simple' ? <SimpleTicket key={into?.key} s={s} idle={idle.filter((i) => i.chainId === s.chainId)} allIdle={idle} into={into} /> : <LoopTicket key={into?.key} s={s} idle={idle.filter((i) => i.chainId === s.chainId)} allIdle={idle} holding={into} />}
      {holding && mode === 'add' && !into && <div className="tsec plain t50" style={{ fontSize: 12 }}>This opens a new position beside your {holding.subAccount?.label ?? 'existing one'}: YieldCircle cannot add to that one.</div>}
      {!holding && beside?.[0] && <div className="tsec plain t50" style={{ fontSize: 12 }}>Your {num(beside[0].h.amount, 4)} {beside[0].h.symbol} on {beside[0].h.venue} stays a plain deposit: {beside[0].why} This opens a new loop beside it.</div>}
      {!socialInList && <TicketSocial uid={uid} thread={thread} s={s} focus={talk} />}
    </div>
    </TicketCtx.Provider>
  )
}

/** The token(s) behind the strategy, each a way to its asset page: what it is, before what to do with it. */
function TicketAssetLinks({ s }: { s: Strategy }) {
  const legs = s.kind === 'loop'
    ? [{ g: s.assetGroup, sym: s.holds, logo: s.logoLong }, { g: s.debtGroup, sym: s.debt, logo: s.logoShort }]
    : [{ g: s.shareGroup, sym: s.holds, logo: s.shareLogo ?? s.logo }, { g: s.assetGroup, sym: s.assetSymbol, logo: s.tokenLogo }]
  const shown = legs.filter((l) => l.g)
  if (!shown.length) return null
  return <div className="assetlinks">{shown.map((l) => <AssetLink key={l.g} group={l.g} sym={l.sym} logo={l.logo} />)}</div>
}

/**
 * The ticket for a position the menu has no row for — a market below every
 * floor the catalogue can lower, or one it never lists (a debt in another
 * money, a venue it does not curate). The wallet is in it all the same, so it
 * can always get OUT: withdraw a deposit, deleverage or close a loop. Adding is
 * not offered, because every number an entry needs (rates, max leverage, the
 * liquidation threshold) comes from the catalogue row this position does not have.
 */
export function HoldingTicket({ h, onClose }: { h: Holding; onClose: () => void }) {
  return (
    <TicketCtx.Provider value={{ uid: null }}>
    <div className="ticket">
      <div className="grab" />
      <div className="th"><Tok sym={h.symbol} logo={h.logo} size={26} />
        <div style={{ flex: 1, minWidth: 0 }}><div className="n">{h.label.split(' · ')[0]}</div><div className="s">{nameOf(h.asset)} position · {h.venue} · {chainLabel(h.chainId)}</div></div>
        <KindPill kind={h.kind} /><SubAccountPill sub={h.subAccount} venue={h.venue} /><LegsPill others={h.others} /><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
      <div className="tsec"><div className="modes"><span className="t50" style={{ fontSize: 12 }}>Not in the menu — you can {h.kind === 'loop' ? 'deleverage or close' : 'withdraw from'} it here.</span>
        <span className="sp" /><span className="sum">{usd(h.valueUsd)}{h.kind === 'loop' && h.leverage && h.leverage > 1.05 ? ` · ${h.leverage.toFixed(1)}×` : ''}{h.health != null ? ` · health ${h.health.toFixed(2)}` : ''}</span></div></div>
      {h.subAccount?.unsupported ? <CannotManage h={h} /> : h.kind === 'loop' ? <ManageLoop s={null} h={h} /> : <ManageTicket s={null} h={h} mode="reduce" />}
    </div>
    </TicketCtx.Provider>
  )
}

/**
 * Copying is the same strategy at the same leverage (when the link carries
 * theirs) at YOUR size — never a mirror of someone else's amount, which would
 * be a promise about a balance sheet this app cannot see.
 */
function CopyBanner({ who, s, lev }: { who: string; s: Strategy; lev?: number }) {
  const { profile } = useProfiles([who])
  return (
    <div className="tsec copy">
      <Who account={who} profile={profile(who)} size={24} />
      <span className="t70">is in this {s.kind === 'loop' ? 'loop' : 'strategy'}. You are opening the same one{s.kind === 'loop' && lev ? <> at their {num(lev, 2)}×</> : ''} — your own size.</span>
    </div>
  )
}

/**
 * What this strategy IS, in the row's own words.
 *
 * `s.description` is the server's per-row explainer (`termSheet.supply`) —
 * templated from that row's live numbers, or the vault's hand-written copy
 * where it has any. `SOURCE_WORDS` below is the fallback and used to be the
 * whole story: one sentence per SOURCE, so every savings row in the list was
 * explained by the same twelve words. Two Bitway USDT products on BNB — a
 * different vault, a different strategy and a different rate each — read as
 * the same deposit, which is exactly the confusion that is being fixed.
 *
 * The headline leads because it is the numeric summary (rate · term · exit)
 * and the description elaborates on it; neither is ever hand-written here.
 */
function SimpleWords({ s }: { s: SimpleStrategy }) {
  return (
    <>
      {s.headline && <div className="t70" style={{ marginBottom: 6 }}>{s.headline}</div>}
      {s.description ?? SOURCE_WORDS[s.source] ?? SOURCE_WORDS.vault}
    </>
  )
}

const SOURCE_WORDS: Record<string, string> = {
  lending: 'You deposit into the lending pool and receive a receipt token that grows with the interest borrowers pay. Withdraw any time while the pool has liquidity.',
  staking: 'You stake and receive a liquid staking token that grows with validator rewards. Sell it on a DEX any time, or unstake through the queue.',
  savings: 'You deposit into the savings module and receive a token that accrues the protocol\'s rate.',
  'fixed-book': 'You lend on an order book: the deposit fills borrowers’ offers at their rates, best first, and the loan is repaid at face on its date. The rate is fixed when the offer is filled, whatever the market rate does after.',
  fixed: 'You buy a principal token at a discount. At maturity it redeems for exactly one unit of the underlying, which locks the yield in today. Selling before maturity gets the market price.',
  vault: 'You deposit into a curated vault that allocates across lending markets. You hold vault shares that grow in value.',
}
/**
 * What a plain deposit can be paid with: the market's own token, and — into a row whose token is
 * the chain's wrapped gas coin — the gas coin itself, which the API wraps inside the deposit when
 * asked with `payAsset` = {@link nativeAsset}. Leaving `payAsset` out asks for the ERC-20: an approve of
 * WHYPE and a deposit that reverts for a wallet holding HYPE. Native first, so a wallet holding
 * neither is offered the coin it is likelier to get.
 */
/**
 * An idle row against a pay option. The option spells the gas coin as the API takes it ({@link nativeAsset}),
 * a balance row may use another alias (`0xEeee…`, `native`) — so the coin read 0 in the chips.
 */
export const sameToken = (held: string, want: string) => held === want || (isNativeAddress(held) && isNativeAddress(want))
type PayRole = 'native' | 'token'
interface PayOption { role: PayRole; address: string; symbol: string; decimals: number }
function payOptions(s: SimpleStrategy): PayOption[] {
  const token: PayOption = { role: 'token', address: normAddr(s.assetAddress), symbol: s.assetSymbol, decimals: s.decimals }
  const native = s.nativeIn ?? (wrapsNative(s.chainId, s.assetAddress) && !startsAny(s.venueKey, NO_NATIVE_DEPOSIT))
  return native ? [{ role: 'native', address: nativeAsset(s.chainId), symbol: nativeSymbol(s.chainId), decimals: nativeDecimals(s.chainId) }, token] : [token]
}
/**
 * The API answers "can the coin go in / come out here" itself (`acceptsNative`, read into
 * `s.nativeIn` / `s.nativeOut`). These lists are only for the window before the flag reaches the
 * listing (docs/native-routes.md): what the worker serves without it. Every venue with no payable
 * entry now takes the coin as a wrap step, so what is left is structural — the Liquity family needs
 * a `troveId` an earn request never carries, and Fluid lists the coin as its own token, never the
 * wrapper. The exits refuse more: TermMax and Term price theirs at execution, and the single-token
 * vaults (the savings registry, Lagoon) pay their token only.
 */
const LIQUITY_FAMILY = ['LIQUITY', 'FELIX', 'NERITE', 'QUILL', 'EBISU', 'SONETA', 'ENOSYS_LOANS']
const NO_NATIVE_DEPOSIT = [...LIQUITY_FAMILY, 'FLUID']
const NO_NATIVE_WITHDRAW = [...NO_NATIVE_DEPOSIT, 'TERMMAX', 'TERM_FINANCE', 'vault.savings', 'vault.lagoon']
/**
 * Aave forks whose native gateway withdraws `max` from an aToken transfer that rounds 1 wei short,
 * so a native FULL exit reverts every time (fork-checked 2026-09-28, docs/native-routes.md).
 * `lender prefix → chains`. The ERC-20 exit works there; the coin is withheld for a full exit only.
 */
const NATIVE_MAX_ROUNDS: Record<string, string[]> = {
  XLEND: ['10', '8453'], GRANARY: ['1'], VALAS: ['56'], RADIANT_V2: ['1'], PRIME_FI: ['50'], PLOUTOS: ['43111'],
  RMM: ['100'], ZEROLEND: ['169'], MOLEND: ['34443'], MERIDIAN: ['167000'],
}
const startsAny = (key: string, prefixes: string[]) => prefixes.some((v) => key.startsWith(v))
const nativeMaxRounds = (key: string, chainId: string) => Object.entries(NATIVE_MAX_ROUNDS).some(([v, cs]) => key.startsWith(v) && cs.includes(chainId))
/**
 * Asked to pay in the gas coin, a bundle that moves none of it is a bundle for the ERC-20 — the
 * approve-then-revert this whole choice exists to avoid. Some leg must carry `value` (a gateway
 * deposit, a bundler call, or Gearbox's wrap step).
 */
function paysNative(a: LoopActions | null | undefined): boolean {
  // an svm step has no `value` and resolves its lamport transfers inside the message: trust it
  return [...(a?.permissions ?? []), ...(a?.transactions ?? []), ...(a?.alternatives ?? []).slice(0, 1)].some((t) => { if (isSvmTx(t)) return true; try { return BigInt(t.value || '0') > 0n } catch { return false } })
}
/**
 * A loop answer with no quote has no swap route: `quotes: []`, no transactions, and still the
 * lender's permissions (Lista's borrow approval), which on their own only cost the user gas.
 */
const hasRoute = (d: { quotes?: unknown[] } | null | undefined) => !!d?.quotes?.length
const NO_ROUTE = 'No swap route at this size right now, so there is nothing to sign. Try another amount or leverage, or come back later.'
/**
 * A loop built on a deposit whose collateral flag is off (an Aave supply, `needsCollateralOn`):
 * switching it on is the first step, or the borrow reverts (tickets/0015). Nothing to re-read after
 * it — the lever after it is what moves the position.
 */
export async function collateralOnFirst(h: Holding | null, operator: string): Promise<Step[]> {
  if (!h?.putUp || !h.marketUid || !needsCollateralOn(h)) return []
  const env = await enableCollateral({ marketUid: h.marketUid, operator, accountId: h.accountId })
  return stepsFrom(env.actions, `Use ${h.symbol} as collateral`, h.chainId).map((x) => ({ ...x, moves: 'none' as const }))
}
/** `into`: the held position an Add tops up — its sub-account is named, or the deposit lands in the venue's default (Euler 0) or a new Fluid / Jupiter Lend position */
function SimpleTicket({ s, idle: chainIdle, allIdle, into }: { s: SimpleStrategy; idle: Idle[]; allIdle: Idle[]; into?: Holding | null }) {
  const { account, isConnected, solSigner, actorOn } = useApp()
  // who the API builds for: the VM's own signer — a Solana row is built for the Solana wallet
  const actor = actorOn(s.chainId)
  const [getOpen, setGetOpen] = React.useState(false)
  const opts = React.useMemo(() => payOptions(s), [s.id])
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
  const paper = usePaper()
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
  const risks = [
    ...(!isSavings(s.nature) ? [`Not a saving (${NATURES[s.nature].word}). ${NATURES[s.nature].why}`] : []),
    ...(s.passthrough ? [`The market pays nothing of its own: the ${pct(s.rate)} is ${s.holds}’s own yield, which ${s.holds} held in the wallet earns too. Here it sits as collateral, where the ${s.holds} loops borrow against it — and carries the market’s risk on top.`] : []),
    s.source === 'lending' ? 'Rate floats with utilisation.' : s.source === 'fixed' ? 'Carry ends at maturity; roll or redeem.' : s.source === 'staking' ? 'Staking rate drifts with network activity; slashing is socialised.' : 'Rate is set by the protocol and can change.',
    exit.risk ? exit.risk
      : tight ? `${Math.round(s.utilization! * 100)}% of this market is lent out — only ${usdShort(s.liquidityUsd)} can be withdrawn right now, and a bigger exit waits for a borrower to repay.`
      : 'Withdrawals wait if the pool is fully borrowed (rare, short).',
    ...(s.risk >= 3 ? ['Rated high risk by the API\'s venue and token scoring.'] : []),
    ...(s.rewards > 0.05 ? [`${pct(s.rewards)} of the rate is incentives that can stop without notice.`] : []),
  ]
  return (
    <>
      <div className="tsec">
        {opts.length > 1 && <>
          <span className="lbl">You pay with <Info label="Paying with the native coin">This market holds {s.assetSymbol}, the wrapped form of {opts[0].symbol}. Paid in {opts[0].symbol}, the deposit wraps it for you: there is no {s.assetSymbol} to hold or approve first.</Info></span>
          <div className="seg" style={{ marginBottom: 10 }}>{opts.map((o) => <button key={o.role} aria-pressed={chosen.role === o.role} onClick={() => setRole(o.role)}><Tok sym={o.symbol} logo={o.role === 'token' ? s.logo : undefined} size={16} /> {o.symbol}<span className="c" style={{ marginLeft: 6 }}>{account ? num(balOf(o.address)?.amount ?? 0, 2) : ''}</span></button>)}</div>
        </>}
        <span className="lbl">Amount of {unit === '$' ? s.assetSymbol : chosen.symbol}</span>
        <AmountBox unit={unit} value={amt} onChange={setAmt} onMax={idle ? () => setAmt(portion(idle, 100, chosen.decimals)) : undefined} />
        <div className="amt-sub"><span>{unit === '$' ? '' : `≈ ${usd(amtUsd)}`}</span><span>{account ? <>Idle: {idle ? `${num(idle.amount, 4)} ${idle.symbol}` : `0 ${chosen.symbol}`}{more && <span className="warn"> · more than idle</span>}</> : 'connect to see your balance'}</span></div>
        <GetLine account={account} short={!idle || more} symbol={chosen.symbol} open={getOpen} onOpen={() => setGetOpen(true)} />
        {/* every form the venue takes, the coin first (`payOptions` orders it): bought as the coin, the deposit needs no approval */}
        {getOpen && <GetAsset targets={opts.map((o) => ({ chainId: s.chainId, address: o.address, symbol: o.symbol, decimals: o.decimals, price, logo: o.role === 'token' ? s.logo : undefined, have: balOf(o.address)?.amount ?? 0 }))} want={amount} sources={allIdle}
          onTarget={(t) => setRole(opts.find((o) => o.address === t.address)?.role ?? null)} onClose={() => setGetOpen(false)} />}</div>
      <div className="tsec"><div className="cells">
        <div className="c hero"><span className="k">You earn</span><span className={`v ${s.rate >= 3 ? 'ok' : ''}`}>{pct(s.rate)}</span><span className="s">{s.maturity ? `fixed to ${dateOf(s.maturity)}` : 'variable'}{s.rewards > 0.05 ? ` · incl. ${pct(s.rewards)} rewards` : ''}</span>
          {/* what MOVES the headline: absent on a vault and on the families that do not price off utilisation, which is exactly when there is nothing to open */}
          <IrmLink uid={s.marketUid} side="supply" rewards={s.rewards} /></div>
        <div className="c"><span className="k">Per year</span><span className="v">{usd(yearly)}</span><span className="s">≈ {usd(yearly / 12)} / month</span></div>
        {/* the vault's own name under the share token: `steakUSDC` / `Steakhouse USDC`. WHICH vault is the thing the venue alone never says. */}
        <div className="c"><span className="k">You hold</span><span className="v">{s.holds}</span><span className="s" title={s.vaultName ? `${s.vaultName} · ${s.venue}` : s.venue}>{s.vaultName ?? s.venue}</span></div>
        <div className="c"><span className="k">Risk</span><span className="v" style={{ fontSize: 14 }}><RiskDot r={s.risk} label={s.riskLabel} /></span><span className="s">{isSavings(s.nature) ? `${s.source} yield` : `${NATURES[s.nature].word} · not a saving`}</span></div>
        <div className="c"><span className="k">Exit</span><span className="v" style={{ fontSize: 14 }}>{exit.word}</span><span className="s">{exit.when}</span></div>
        {/* SIZE and LIQUIDITY are two questions, and the ticket used to answer
            neither properly — the size hid under the exit word and how much of
            it could actually leave was nowhere. A $200m pool that is 99 % lent
            out is not a $200m pool you can get out of today. */}
        <div className="c"><span className="k">Market size</span><span className="v">{usdShort(s.tvlUsd)}</span><span className="s">{s.source === 'vault' ? 'in the vault' : 'total deposited'}</span></div>
        <div className="c"><span className="k">Liquidity</span><span className={`v ${s.liquidityUsd != null && s.tvlUsd > 0 && s.liquidityUsd < s.tvlUsd * 0.05 ? 'warn' : ''}`}>{s.liquidityUsd != null ? usdShort(s.liquidityUsd) : '—'}</span>
          <span className="s">{s.utilization != null ? `${Math.round(s.utilization * 100)}% lent out` : s.liquidityUsd != null ? 'can leave now' : 'not reported'}</span></div>
      </div></div>
      <HistorySec s={s} now={s.rate} />
      <div className="tsec"><span className="lbl">What can go wrong</span><ul className="risks">{risks.map((t, i) => <li key={i} className={(i === 0 && s.risk >= 2) || (!isSavings(s.nature) && i === 0) ? 'w' : ''}><i /><span>{t}</span></li>)}</ul></div>
      {s.booked && <BookedSlippage pegged={isSavings(s.nature)} what={s.holds} />}
      <Action ladder={ladder} label={`${s.source === 'lending' ? 'Deposit' : s.source === 'staking' ? 'Stake' : s.source === 'fixed' ? 'Buy' : 'Deposit'} · ${unit === '$' ? usd(amtUsd) : `${num(amount, 4)} ${chosen.symbol}`}`} account={account} isConnected={isConnected} disabled={!(amount > 0)} chainId={s.chainId} fee="deposit" />
    </>
  )
}

const DAY_S = 86_400
/** `25 Dec` — a picker's date, the year said elsewhere */
const dayMonth = (t: number) => new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
/**
 * A fixed-rate deposit into an order book (tickets/0013, `s.book`): the amount fills borrowers'
 * offers on the lend side of the book, best rate first, and the position is repaid its FACE on the
 * date — the amount plus the rate for the days to run, fixed at the fill. The rate at this size is
 * the book's (`bookAprAt` on `side=lend`), and a size past the book's depth is refused here rather
 * than by a build that fills part of it. A book with several maturities picks one (`s.dates`).
 */
function FixedTicket({ s: s0, idle: chainIdle, allIdle, into }: { s: SimpleStrategy; idle: Idle[]; allIdle: Idle[]; into?: Holding | null }) {
  const { actorOn, isConnected } = useApp()
  // the operator the API builds for: an EVM address, never a Solana-only user's Solana one
  const account = actorOn(s0.chainId)
  const dates = s0.dates?.length ? s0.dates : [s0]
  const [dateId, setDateId] = useSticky<string>(`t:${s0.id}:date`, s0.id)
  const s = dates.find((d) => d.id === dateId) ?? s0
  const book = s.book!
  const [getOpen, setGetOpen] = React.useState(false)
  const tok = { address: normAddr(s.assetAddress), symbol: s.assetSymbol, decimals: s.decimals }
  const idle = chainIdle.find((i) => sameToken(i.address, tok.address))
  const unit = unitOf(s.asset) === '$' ? '$' : tok.symbol
  const price = s.priceUsd ?? idle?.price ?? allIdle.find((i) => i.asset === s.asset)?.price ?? (unit === '$' ? 1 : 0)
  const [amt, setAmt] = useStickyAmount(`t:${s0.id}:amount`, () => fromUnits(unit === '$' ? 100 : Math.min(idle?.amount ?? 0.05, 0.05)))
  const amount = unitsOf(amt)
  const sendRaw = payRaw(amt, tok.decimals, idle)
  // the lend side of every maturity's book: the picker quotes each at this size
  const books = useLendingBooks(dates.map((d) => d.marketUid ?? d.earnUid), 'lend')
  const bookOf = (d: SimpleStrategy) => books.find((b) => b.uid === (d.marketUid ?? d.earnUid))
  const cur = bookOf(s)
  const depth = bookDepth(cur?.book ?? null)
  const rateAt = (d: SimpleStrategy, a: number) => { const b = bookOf(d)?.book; return b ? bookAprAt(b, a) : d.rate }
  const r = rateAt(s, amount)
  const over = !!cur?.book && r == null
  const days = Math.max(0, (s.maturity! - Date.now() / 1000) / DAY_S)
  const lock = r ?? s.rate
  const face = amount * (1 + (lock / 100) * (days / 365))
  const amtUsd = amount * price
  const paper = usePaper()
  const key = [s.id, into?.accountId ?? '', sendRaw, account ?? ''].join('|')
  const ladder = useTicketLadder(key, s.chainId, async () => {
    const env = await earnDeposit({ earnUid: s.earnUid, amountRaw: sendRaw, operator: account!, accountId: into?.accountId })
    return stepsFrom(env.actions, s.via, s.chainId)
  }, [s.earnUid, s.marketUid], [tok], depositPlan({ ...s, rate: lock }, { into, payToken: tok.address, amount, price, feed: paper.price }), true)
  const more = !!idle && amount > idle.amount
  const exit = exitTerms(s)
  const money = (x: number) => (unit === '$' ? usd(x * price) : `${num(x, 4)} ${tok.symbol}`)
  const who = book.collateral ? `${book.collateral}${book.lltv ? ` at up to ${book.lltv}% of its value` : ''}` : null
  const risks = [
    `The rate is fixed when the offers are filled. The book can move before you sign: the deposit takes the offers standing then, best first${cur?.book && cur.book.levels.length > 1 ? `, and a bigger amount walks into lower rates (${pct(cur.book.levels[0].aprPct)} on the first ${money(cur.book.levels[0].assets)})` : ''}.`,
    exit.risk ?? '',
    who ? `You are lending to borrowers who put up ${who}. If its price falls faster than they are liquidated, the lenders on this book take the loss.` : `The market does not name what its borrowers put up: check the book on ${s.brand} before you size it.`,
    ...(book.family === 'term' ? ['Term Finance repays through a repurchase window after the date; a borrower who misses it is liquidated against their collateral, and the repo tokens are redeemed from what that recovers.'] : []),
    ...(s.risk >= 3 ? ['Rated high risk by the API\'s venue and token scoring.'] : []),
  ].filter(Boolean)
  return (
    <>
      <div className="tsec">
        {dates.length > 1 && <>
          <span className="lbl">Repaid on <Info label="Maturities">Each date is its own book with its own borrowers and rate. Your loan is repaid at face on the date you pick; before it, {book.earlyExit ? 'the way out is selling to that book' : 'it cannot be taken out'}.</Info></span>
          <div className="seg terms" role="radiogroup" aria-label="Repaid on" style={{ marginBottom: 10 }}>{dates.map((d) => { const x = rateAt(d, amount); return <button key={d.id} role="radio" aria-checked={d.id === s.id} aria-pressed={d.id === s.id} onClick={() => setDateId(d.id)}>{dayMonth(d.maturity!)}<span className="c">{x == null ? 'full' : pct(x)}</span></button> })}</div>
        </>}
        <span className="lbl">Amount of {unit === '$' ? s.assetSymbol : tok.symbol}</span>
        <AmountBox unit={unit} value={amt} onChange={setAmt} onMax={idle ? () => setAmt(depth > 0 && depth < idle.amount ? fromUnits(depth) : portion(idle, 100, tok.decimals)) : undefined} />
        <div className="amt-sub"><span>{unit === '$' ? '' : `≈ ${usd(amtUsd)}`}{over && <span className="warn">{unit === '$' ? '' : ' · '}the book takes {money(depth)} now</span>}</span><span>{account ? <>Idle: {idle ? `${num(idle.amount, 4)} ${idle.symbol}` : `0 ${tok.symbol}`}{more && <span className="warn"> · more than idle</span>}</> : 'connect to see your balance'}</span></div>
        <GetLine account={account} short={!idle || more} symbol={tok.symbol} open={getOpen} onOpen={() => setGetOpen(true)} />
        {getOpen && <GetAsset targets={[{ chainId: s.chainId, address: tok.address, symbol: tok.symbol, decimals: tok.decimals, price, logo: s.tokenLogo, have: idle?.amount ?? 0 }]} want={amount} sources={allIdle} onClose={() => setGetOpen(false)} />}
      </div>
      <div className="tsec"><div className="cells">
        <div className="c hero"><span className="k">You lock</span><span className={`v ${lock >= 3 ? 'ok' : ''}`}>{over ? '—' : pct(lock)}</span><span className="s">fixed to {dateOf(s.maturity!)}{cur?.pending ? ' · reading the book…' : cur?.failed ? ' · book not read, listed rate' : ''}</span>
          <BookLink uid={s.marketUid ?? s.earnUid} side="lend" size={amount} symbol={tok.symbol} price={price || undefined} act="Lending" /></div>
        <div className="c"><span className="k">Back on {dayMonth(s.maturity!)}</span><span className="v">{over ? '—' : money(face)}</span><span className="s">{over ? 'more than the book takes' : `+${money(face - amount)} in ${Math.ceil(days)} days`}</span></div>
        <div className="c"><span className="k">Book</span><span className={`v ${cur?.book && depth * price < 1000 ? 'warn' : ''}`}>{cur?.book ? money(depth) : cur?.pending ? <Sk w={50} /> : '—'}</span><span className="s">{cur?.book ? `${cur.book.levels.length} offer${cur.book.levels.length === 1 ? '' : 's'} to fill · best ${pct(cur.book.levels[0]?.aprPct ?? s.rate)}` : 'borrowers’ offers'}</span></div>
        <div className="c"><span className="k">Borrowers put up</span><span className="v" style={{ fontSize: 14 }}>{book.collateral ?? '—'}</span><span className="s">{book.lltv ? `borrow up to ${book.lltv}% of it` : book.collateral ? 'as collateral' : 'not named by the market'}</span></div>
        <div className="c"><span className="k">Risk</span><span className="v" style={{ fontSize: 14 }}><RiskDot r={s.risk} label={s.riskLabel} /></span><span className="s">fixed-rate loan</span></div>
        <div className="c"><span className="k">Exit</span><span className="v" style={{ fontSize: 14 }}>{exit.word}</span><span className="s">{exit.when}</span></div>
      </div></div>
      <HistorySec s={s} now={s.rate} />
      <div className="tsec"><span className="lbl">What can go wrong</span><ul className="risks">{risks.map((t, i) => <li key={i} className={i === 1 ? 'w' : ''}><i /><span>{t}</span></li>)}</ul></div>
      <Action ladder={ladder} label={`Lend · ${unit === '$' ? usd(amtUsd) : `${num(amount, 4)} ${tok.symbol}`} to ${dayMonth(s.maturity!)}`} account={account} isConnected={isConnected} disabled={!(amount > 0) || over} blockedNote={over ? `This book takes at most ${money(depth)} right now.` : undefined} chainId={s.chainId} fee="deposit" />
    </>
  )
}

/**
 * Out of a fixed-rate book loan. After its date the face is redeemed (`/earn/withdraw`). Before it,
 * a Midnight loan is SOLD to the book (`/midnight/sell`): the face units go to the lenders' offers
 * at their rate, so the proceeds are the face discounted for the days left — less than put in when
 * rates have risen. A Term loan has no exit before its date.
 */
function ManageFixed({ s, h, mode }: { s: SimpleStrategy; h: Holding; mode: Mode }) {
  const { actorOn, isConnected } = useApp()
  const account = actorOn(h.chainId)
  const book = s.book!
  const now = Date.now() / 1000
  const matured = !!s.maturity && now >= s.maturity
  const sell = !matured && book.earlyExit
  const locked = !matured && !book.earlyExit
  const all = mode === 'close'
  const [amt, setAmt] = useStickyAmount(`t:${h.key}:withdraw`, () => portion(heldRaw(h), 100, h.decimals))
  const amount = unitsOf(amt)
  const eff = all ? h.amount : Math.min(amount, h.amount)
  const fullExit = all || (h.amount > 0 && eff / h.amount > 0.999)
  // Max and 100 % are the exact holding; a typed amount is parsed from its text and capped at it
  const raw = fullExit && h.amountRaw ? h.amountRaw : all ? capRaw(eff, h.decimals, heldRaw(h)) : payRaw(amt, h.decimals, heldRaw(h))
  // what the sale fetches: the face, discounted at the lenders' rate for the days left
  const [sb] = useLendingBooks(sell ? [s.marketUid ?? s.earnUid] : [], 'borrow')
  const sellApr = sb?.book ? bookAprAt(sb.book, eff) : null
  const daysLeft = s.maturity ? Math.max(0, (s.maturity - now) / DAY_S) : 0
  const proceeds = sellApr != null ? eff / (1 + (sellApr / 100) * (daysLeft / 365)) : null
  const px = h.amount > 0 ? h.valueUsd / h.amount : 0
  const paper = usePaper()
  const key = [s.id, h.accountId ?? '', mode, raw, account ?? ''].join('|')
  const ladder = useTicketLadder(key, h.chainId, async () => {
    if (locked) throw new Error(`Locked until ${dateOf(s.maturity!)}.`)
    const env = sell
      ? await midnightSell({ chainId: h.chainId, lender: book.lender, amountRaw: raw, operator: account! })
      : await earnWithdraw({ earnUid: s.earnUid, amountRaw: raw, operator: account!, isAll: fullExit, accountId: h.accountId })
    return stepsFrom(env.actions, sell ? 'Sell to the book' : 'Withdraw', h.chainId)
  }, [s.earnUid], [{ address: h.assetAddress ?? s.assetAddress, symbol: h.symbol }],
    withdrawPlan({ ledger: paper.ledger, h, units: eff, all: fullExit, receiveToken: h.assetAddress ?? s.assetAddress, feed: paper.price, receiveName: { symbol: h.symbol, decimals: h.decimals }, refuse: locked ? `Locked until ${dateOf(s.maturity!)}.` : null }))
  const exit = exitTerms(s)
  const noBids = sell && !!sb && !sb.pending && !sb.failed && sellApr == null
  return (
    <>
      {locked ? (
        <div className="tsec"><div className="caution"><b>Locked until {dateOf(s.maturity!)}.</b> {s.brand} has no exit before the date: your {num(h.amount, 2)} {h.symbol} is repaid at face once the borrowers’ repayment window after it closes, and can be withdrawn here then.</div></div>
      ) : (
        <div className="tsec">
          <span className="lbl">{sell ? 'Face to sell' : 'Amount to withdraw'} (of {num(h.amount, 4)} {h.symbol}) {sell && <Info label="Selling before the date">Your position is the {h.symbol} it is repaid on {dateOf(s.maturity!)}. Before then it can be sold to the lenders on this book, who pay that amount discounted at their rate for the days left — so if rates have risen since you lent, you get back less than you put in.</Info>}</span>
          <div className="amt"><AmountInput value={amt} onChange={setAmt} ariaLabel="Amount" /><span className="u">{h.symbol}</span><button className="max" onClick={() => setAmt(portion(heldRaw(h), 100, h.decimals))}>Max</button></div>
          <div className="amt-sub"><span>{amount > h.amount + 1e-9 && <span className="warn">more than you hold</span>}</span><span>{[25, 50, 75, 100].map((p) => <button key={p} className="pctb" onClick={() => setAmt(portion(heldRaw(h), p, h.decimals))}>{p}%</button>)}</span></div>
        </div>
      )}
      <div className="tsec"><div className="cells">
        <div className="c hero"><span className="k">{sell ? 'You get about' : 'You get back'}</span><span className="v">{locked ? '—' : sell ? (proceeds != null ? usd(proceeds * px) : sb?.pending ? <Sk w={60} /> : '—') : usd(eff * px)}</span>
          <span className="s">{locked ? `on ${dateOf(s.maturity!)}` : sell ? (sellApr != null ? `sold at ${pct(sellApr)} · face ${num(eff, 2)} ${h.symbol}` : noBids ? 'no lender is buying at this size' : sb?.failed ? 'the book could not be read — the sale still fills at its rate' : 'reading the book…') : `${num(eff, 4)} ${h.symbol} to your wallet`}</span>
          {sell && <BookLink uid={s.marketUid ?? s.earnUid} side="borrow" size={eff} symbol={h.symbol} price={px || undefined} act="Selling" />}</div>
        {sell && <div className="c"><span className="k">Or wait</span><span className="v">{usd(eff * px)}</span><span className="s">repaid {dateOf(s.maturity!)}</span></div>}
        <div className="c"><span className="k">Exit</span><span className="v" style={{ fontSize: 14 }}>{exit.word}</span><span className="s">{exit.when}</span></div>
      </div></div>
      <Action ladder={ladder} label={locked ? `Locked to ${dayMonth(s.maturity!)}` : sell ? `Sell · ${num(eff, 4)} ${h.symbol}` : `Withdraw · ${num(eff, 4)} ${h.symbol}`} account={account} isConnected={isConnected} disabled={locked || !(eff > 0) || noBids} blockedNote={locked ? `${s.brand} repays after ${dateOf(s.maturity!)}; nothing can be taken out before.` : noBids ? 'Nobody on the book is buying this much right now: sell less, or wait for the date.' : undefined} chainId={h.chainId} fee="withdraw" />
    </>
  )
}

/** The bound on a PT's fill, where the ticket trades it — the same switch as the profile's settings. */
function BookedSlippage({ pegged, what, sell }: { pegged: boolean; what: string; sell?: boolean }) {
  return (
    <div className="tsec">
      <span className="lbl">Max slippage <Info label="Max slippage">{what} is {sell ? 'sold' : 'bought'} on a market, not at a price the protocol sets. This is how far the fill may land from the quote before the transaction reverts instead. Auto is tight because {what} and what you pay with are the same money; a revert only costs gas. It applies to every trade the app builds (loops too) and is also under Settings.</Info></span>
      <SlippagePicker pegged={pegged} />
    </div>
  )
}

/**
 * What this rate has been over the month, under the headline that quotes it
 * today — the one place with room for the whole line. A loop's line is drawn at
 * the ticket's own leverage, so it moves with the tier and the slider. Absent
 * (no section at all) when the history has nothing for the row.
 */
function HistorySec({ s, L, now, bare }: { s: Strategy; L?: number; now: number; /** inside a fold, not a section of its own */ bare?: boolean }) {
  const get = useRateHistory(React.useMemo(() => [s], [s.id]))
  const [withRewards] = useSparkRewards()
  if (!seriesFor(s, get, withRewards, L)) return null
  const panel = <RateHistoryPanel s={s} get={get} L={L} now={now} />
  return bare ? panel : <div className="tsec">{panel}</div>
}

/**
 * How far from the line, in a word — the same bands as the tier cards' colours (red under 5 %,
 * amber under 10 %), so the hero and the card it came from never disagree.
 */
export const safetyOf = (drop: number): { word: string; cls: 'bad' | 'warn' | 'ok' } =>
  drop < 0.05 ? { word: 'Tight', cls: 'bad' } : drop < 0.1 ? { word: 'Narrow', cls: 'warn' } : drop < 0.2 ? { word: 'Comfortable', cls: 'ok' } : { word: 'Wide', cls: 'ok' }

/**
 * One of the loop ticket's folds: a question as its header, the numbers that answer it inside.
 * Each remembers its own state for the tab, so whoever always opens Risk finds it open.
 */
function Fold({ id, title, hint, children }: { id: string; title: string; hint: string; children: React.ReactNode }) {
  const [open, setOpen] = useSticky<boolean>(`t:fold:${id}`, false)
  return (
    <div className="fold">
      <button type="button" className="fold-h" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="fold-t">{title}</span><span className="t40">{open ? '' : hint}</span><span className="chev" aria-hidden>▾</span>
      </button>
      {open && <div className="fold-b">{children}</div>}
    </div>
  )
}

/**
 * The borrow rate at THIS ticket's size, off the debt market's own curve. The
 * list quotes every loop at $10k, and on a thin market that one quote can be
 * the whole free liquidity — shMON/WMON on Euler read 35 % against a 6 % spot.
 * While the curve loads the spot rate stands in; a market with no curve keeps
 * the $10k quote.
 */
function useBorrowAt(s: LoopStrategy | null, term?: LoopTerm, bookApr?: number) {
  // an order book has no curve: its rate is what the size fills at (a Loopscale tenor's offer, a Midnight book's levels)
  const books = !!s && (!!s.tenors || !!s.dueAt)
  const irm = useIrm(s?.marketShortUid, !!s && !books)
  // a fixed term costs its card rate at any size: the curve is where the debt goes AFTER the term
  return (extraDebtUsd: number) => (!s ? 0 : term ? term.apr : books ? bookApr ?? s.borSpot : s.terms ? s.borSpot : irm.isPending ? s.borSpot : borrowAtSize(s.borSpot, s.bor, extraDebtUsd, irm.data))
}
/**
 * The term a fixed-rate loop opens with before anyone picks: the cheapest, and the longest of equals —
 * slisBNB/WBNB charges 0.5 % for 7, 14 and 30 days alike, and a shorter lock of the same rate only
 * moves the day the debt drops to the variable rate closer.
 */
const defaultTerm = (ts: LoopTerm[]) => [...ts].sort((a, b) => a.apr - b.apr || b.days - a.days)[0]
/**
 * The number beside a leverage slider, typed into. A keystroke moves the slider only once the text
 * reads as a leverage inside the range — "1" on the way to "1.5" would otherwise snap to the floor
 * and eat the dot; Enter or leaving the box clamps whatever is there. The quote downstream is
 * debounced, so typing costs no more requests than dragging.
 */
function LevInput({ value, min, max, onChange, className = '', label = 'Leverage' }: { value: number; min: number; max: number; onChange: (v: number) => void; className?: string; label?: string }) {
  const [text, setText] = React.useState<string | null>(null)
  const parse = (t: string) => parseFloat(t.replace(',', '.'))
  const commit = () => {
    if (text == null) return
    const v = parse(text)
    if (Number.isFinite(v)) onChange(Math.round(Math.min(max, Math.max(min, v)) * 100) / 100)
    setText(null)
  }
  return (
    <span className={`v levin ${className}`}>
      <input inputMode="decimal" autoComplete="off" aria-label={label} value={text ?? value.toFixed(2)}
        onFocus={(e) => { setText(value.toFixed(2)); e.target.select() }}
        onChange={(e) => { const t = e.target.value.replace(/[^0-9.,]/g, ''); setText(t); const v = parse(t); if (v >= min && v <= max) onChange(v) }}
        onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { setText(null); e.currentTarget.blur() } }} />×
    </span>
  )
}
/** The copied wallet's leverage as a tile beside the tiers; `theirs` above `l` means this venue's new-loop range held it down. */
function CopiedTier({ l, theirs, on, n, d, onPick }: { l: number; theirs: number; on: boolean; n: number; d: number; onPick: () => void }) {
  const capped = theirs > l + 0.01
  return (
    <button className="tier copied" role="radio" aria-checked={on} onClick={onPick} title={`${capped ? `They run ${num(theirs, 2)}×; a new loop here goes up to ${num(l, 2)}×. ` : ''}${num(l, 2)}× leverage · liquidated if the collateral falls ${pct(d * 100, 1)} against the debt`}>
      <span className="tn">Copied{capped ? ' · capped' : ''}</span>
      <span className={`tl ${d < 0.05 ? 'bad' : d < 0.1 ? 'warn' : ''}`}>{num(l, 2)}× · −{pct(d * 100, d < 0.1 ? 1 : 0)}</span>
      <span className={`tr ${n >= 3 ? 'ok' : n < 0 ? 'bad' : ''}`}>{pct(n)}</span>
    </button>
  )
}
/** The tenor a Loopscale loop opens with before anyone picks: the cheapest quoted, the longest of equals; the shortest while nothing has answered. */
const defaultTenor = <T extends { tenor: LoopTenor; offer: { apr: number } | null }>(qs: T[]) =>
  [...qs].filter((q) => q.offer).sort((a, b) => a.offer!.apr - b.offer!.apr || b.tenor.days - a.tenor.days)[0] ?? qs[0]
/** A payback in words: hours under a day, then whole days (rounded up — it is not earned back before). */
const daysWord = (d: number) => (d <= 0 ? 'at once' : d < 1 ? `${Math.max(1, Math.ceil(d * 24))} h` : `${Math.ceil(d)} day${Math.ceil(d) === 1 ? '' : 's'}`)
const tenorWord = (t: LoopTenor) => (t.days === 1 ? '1 day' : t.days === 7 ? '1 week' : t.days === 30 ? '1 month' : `${t.days / 30} months`)
const dayOf = (days: number) => new Date(Date.now() + days * 86400_000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function LoopTicket({ s: s0, idle, allIdle, holding }: { s: LoopStrategy; idle: Idle[]; allIdle: Idle[]; holding: Holding | null }) {
  const { account, isConnected, solSigner, actorOn } = useApp()
  // a dated pair (Midnight) is one row with a date per maturity, each its own market: the picked date
  // IS the strategy from here on — its lender, its market uids, its top of book
  const dates = s0.dates
  const [dateId, setDateId] = useSticky<string | null>(`t:${s0.id}:date`, null)
  const s = dates?.find((d) => d.id === dateId) ?? s0
  // every loop on the menu is a carry (one money); an exposure loop (JLP against dollars) is not
  const slip = slippageFor(useSettings().st, isSavings(s.nature))
  const actor = actorOn(s.chainId)
  const [getOpen, setGetOpen] = React.useState(false)
  const unit = unitOf(s.asset)
  // pay with the collateral or the debt token, whichever the venue accepts and the wallet holds more of
  const pay = useLoopPayAssets(s)
  const opts = React.useMemo(() => {
    const coll = { role: 'collateral' as const, symbol: s.holds, address: s.collateralAddress, decimals: s.decimalsLong, price: s.priceLong ?? 0, logo: s.logoLong }
    const debt = { role: 'debt' as const, symbol: s.debt, address: s.debtAddress, decimals: s.decimalsShort, price: s.priceShort ?? 0, logo: s.logoShort }
    // A role can carry MORE than one token (Alchemix: the MYT share AND its underlying USDC both fund
    // the collateral), so a row whose address is not the market's own token takes the server's metadata
    // — copying the side's symbol / decimals onto it showed USDC as "mixUSDC" and scaled it by 1e12.
    const own = (side: typeof coll | typeof debt, a: LoopPayAsset) => !a.address || normAddr(side.address) === normAddr(a.address) ? { ...side, address: a.address || side.address } : { ...side, address: a.address, symbol: a.symbol ?? side.symbol, decimals: a.decimals ?? side.decimals, price: 0, logo: a.logoURI }
    const list = pay.data ? pay.data.payAssets.map((a) => a.role === 'collateral' ? own(coll, a) : a.role === 'debt' ? own(debt, a) : { ...(a.wrapsRole === 'debt' ? debt : coll), role: 'native' as const, address: nativeAsset(s.chainId), symbol: a.symbol || 'ETH', logo: a.logoURI }) : [coll, debt]
    return list
  }, [pay.data, s.id])
  // a venue that takes no margin with the open (the server lists none): say so rather than a dead button
  const noPay = !!pay.data && pay.data.payAssets.length === 0
  // the pay-with chips read the exact token: native is the zero address in the balances (and the API), wrapped is its own entry
  const balOf = (address: string, _symbol: string) => idle.find((i) => sameToken(i.address, normAddr(address)))
  // chosen by ADDRESS: two pay rows can share a role (see `own` above)
  const [payAddr, setPayAddr] = useSticky<string | null>(`t:${s0.id}:payaddr`, null)
  const chosen = opts.find((o) => !!payAddr && normAddr(o.address) === normAddr(payAddr)) ?? [...opts].sort((a, b) => (balOf(b.address, b.symbol)?.usd ?? 0) - (balOf(a.address, a.symbol)?.usd ?? 0))[0]
  const bal = chosen ? balOf(chosen.address, chosen.symbol) : undefined
  const price = chosen?.price || bal?.price || (unit === '$' ? 1 : 0)
  const [amt, setAmt] = useStickyAmount(`t:${s0.id}:amount`, () => fromUnits(unit === '$' ? 1000 : 1))
  const amount = unitsOf(amt)
  // the margin as sent: Max is the exact balance (a float Max overshot it by 166,624 wei and the loop reverted, tickets/0014)
  const marginRaw = chosen && amount > 0 ? payRaw(amt, chosen.decimals, bal) : undefined
  const [tier, setTier] = useSticky<TierId>(`t:${s0.id}:tier`, isSavings(s.nature) ? DEFAULT_TIER : 'defensive')
  // a number of your own is behind the slider icon, never the default: the tiers are the advice,
  // the slider is for someone who already knows the number they want. `null` = on the tiers
  const [custom, setCustom] = useSticky<number | null>(`t:${s0.id}:lev`, null)
  const [lo, hi] = customRange(s.maxLev), canCustom = hi > lo + 0.05
  // a copy opens on the copied wallet's own leverage, held inside what this venue lets a new loop take;
  // any tier or the slider leaves it, and its tile brings it back
  const { copyLev } = React.useContext(TicketCtx)
  const copyL = copyLev && copyLev > 1.05 ? Math.round(Math.min(hi, Math.max(lo, copyLev)) * 100) / 100 : null
  const [onCopy, setOnCopy] = React.useState(copyL != null)
  const pickTier = (t: TierId) => { setOnCopy(false); setCustom(null); setTier(t) }
  const L = onCopy && copyL != null ? copyL : custom != null && canCustom ? Math.min(hi, Math.max(lo, custom)) : s.tiers[tier]
  const E = amount * price, C = E * L, D = E * (L - 1)
  // a fixed-rate loop borrows for one term off the broker's card; `undefined` on a float loop
  const [termId, setTermId] = useSticky<string | null>(`t:${s0.id}:term`, null)
  const term = s.terms ? s.terms.find((t) => t.id === termId) ?? defaultTerm(s.terms) : undefined
  // a Loopscale loop borrows for one tenor, each its own order book: every tenor is quoted at this size
  const tenorQs = useTenorQuotes(s, E, L, actor, slip)
  const [tenorId, setTenorId] = useSticky<string | null>(`t:${s0.id}:tenor`, null)
  // the pick holds while it is quoting; a tenor nobody offers at this size falls back to the default
  const picked = tenorQs.find((x) => x.tenor.id === tenorId)
  const tq = s.tenors ? (picked && (picked.offer || picked.pending) ? picked : defaultTenor(tenorQs)) : undefined
  const tenor = tq?.tenor, offer = tq?.offer ?? null
  // each tenor's lenders set their own liquidation threshold (JLP/USDC: 95 % for a day, 90 % for longer)
  const liqLtv = offer?.lqt || s.liqLtv
  // a rate the borrower sets (Liquity family, Flex): a NEW trove picks it here, off the live
  // redemption queue (model/userSetRate.ts); a running trove keeps its own. The feed's `bor` is the
  // queue's suggested pick, so a different pick shifts the borrow leg by the difference.
  const picksRate = !!s.userSet && !holding
  const [queueQ] = useLendingBooks(picksRate ? [s.marketShortUid] : [])
  const queueBook = queueQ?.book ?? null
  const urate = picksRate ? userSetOfBook(queueBook) ?? s.userSet! : null
  const suggested = recommendedOf(urate)?.apr
  const [rate0, setRate] = useSticky<number | null>(`t:${s0.id}:rate`, null)
  const rate = urate ? clampRate(urate, rate0 ?? suggested ?? s.borSpot) : null
  const rateShift = rate != null && suggested != null ? rate - suggested : 0
  // a dated book prices the debt at size: the levels this loan walks, for every maturity on offer
  const books = useLendingBooks(dates ? dates.map((d) => d.marketShortUid) : [])
  const debtTok = s.priceShort ? (E * (L - 1)) / s.priceShort : 0
  const bookOf = (d: LoopStrategy) => books.find((b) => b.uid === d.marketShortUid)
  const bookApr = s.dueAt ? bookAprAt(bookOf(s)?.book ?? null, debtTok) : null
  const bookShort = !!s.dueAt && !!bookOf(s)?.book && bookApr == null
  const due = s.dueAt ? new Date(s.dueAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  const dueDays = s.dueAt ? Math.max(0, Math.round((s.dueAt * 1000 - Date.now()) / 86400_000)) : 0
  const borAt0 = useBorrowAt(s, term, offer?.apr ?? bookApr ?? undefined)
  const borAt = (d: number) => borAt0(d) + rateShift
  const dep = s.depSpot, bor = borAt(D)
  const net = netAprAtLeverage(dep, bor, L), drop = liqBuffer(liqLtv, L), hf = healthAt(liqLtv, L)
  const netWorst = netAprAtLeverage(dep, bor + 2, L)
  // when the term ends the debt is not due: it moves to the market's variable rate until it is fixed again
  const irm = useIrm(s.marketShortUid, !!term)
  const after = term ? curveRateNow(irm.data) : null
  const netAfter = after != null ? netAprAtLeverage(dep, after, L) : null
  const ends = term ? dayOf(term.days) : ''
  const overLiquidity = s.borrowLiquidityUsd > 0 && D > s.borrowLiquidityUsd
  // adding to a loop the wallet already runs: the new debt lands in the same book, so the number that
  // matters is the whole position after — the existing debt is already in the curve's utilisation
  const Eh = holding && holding.valueUsd > 0 ? holding.valueUsd : 0, Lh = holding?.leverage && holding.leverage > 1 ? holding.leverage : 1
  const Lc = Eh > 0 ? (Eh * Lh + E * L) / (Eh + E) : L
  const netC = netAprAtLeverage(dep, bor, Lc), hfC = healthAt(liqLtv, Lc)
  // the VM's own signer, as the build below: a Solana loop quoted for the EVM address is quoted for nobody
  // the margin rides the preview too: a lender that checks health up front (Alchemix) cannot price a
  // loop with no collateral of its own, and every other lender's preview is more accurate with it
  const { q: q0, settling } = useLoopQuote(s, E, L, actor, slip, term?.id, tenor, chosen && marginRaw ? { asset: chosen.address, raw: marginRaw } : undefined)
  // while the slider or the amount is ahead of the debounce, the answer in hand is the last size's: it reads as quoting
  const q = { data: settling ? undefined : q0.data, error: settling ? null : q0.error, isFetching: q0.isFetching || settling }
  // the swap routes the API found for the leverage leg, best first; another is picked by its aggregator's
  // name, so the build (a fresh call) runs the same one wherever it lands in that answer's order
  const routes = q.data?.data?.quotes ?? []
  const [routeName, setRouteName] = React.useState<string | null>(null)
  const routeSel = Math.max(0, routes.findIndex((r) => r.deltas?.aggregator === routeName))
  const econ = (routeSel > 0 ? routes[routeSel]?.economics : null) ?? q.data?.data?.economics ?? routes[0]?.economics ?? null
  // Break-even: the entry cost over what the loop earns a day. The API's own where it prices the
  // carry (EVM). Its Solana quote leaves the carry null (worker-api `svmEconomics`, 2026-10-06), and
  // on a broker term it prices the debt at the market's variable rate, not the term's (2026-09-29):
  // there the payback is this ticket's own, off the net it shows. Null = never (no positive carry).
  const cost = econ?.entryCostUsd.total ?? 0
  const ownPayback = !econ ? null : cost <= 0 ? 0 : net > 0 && E > 0 ? cost / (E * net / 100 / 365) : null
  const payback = !econ ? null : term ? ownPayback : econ.breakEvenDays.total ?? ownPayback
  // the clock the payback runs against: the fixed debt's term, its due date, the PT's expiry
  const clockDays = term?.days ?? tenor?.days ?? (s.dueAt ? (s.dueAt * 1000 - Date.now()) / 86400_000 : s.expiry ? (s.expiry * 1000 - Date.now()) / 86400_000 : null)
  const clockWord = term ? `the ${term.days}-day term` : tenor ? `the ${tenorWord(tenor)} term` : s.dueAt ? `the loan's due date` : s.expiry ? 'maturity' : ''
  const simHf = q.data?.data?.simulation?.post?.healthFactor
  // answered, but with no route: the build would come back with nothing but an approval
  const noRoute = !!q.data && !hasRoute(q.data.data)
  // a Loopscale loan draws on ONE lender: too big for the deepest on this tenor, nothing opens. The API
  // says so in words and hands back the margin (USD, re-read in the pay token) and leverage that fit
  const short = tq?.short ?? null
  const fitAmount = short?.fit.margin?.usd && price > 0 ? short.fit.margin.usd / price : 0
  const fitLev = short?.fit.leverage ?? 0
  const fitTier = fitLev ? [...TIERS].reverse().find((t) => s.tiers[t.id] <= fitLev) : undefined
  const yearly = E * net / 100
  const key = [s.id, holding?.accountId ?? '', marginRaw ?? '', L, term?.id ?? '', tenor?.id ?? '', chosen?.address ?? '', actor ?? '', slip, routeName ?? '', rate ?? ''].join('|')
  const paper = usePaper()
  const { signTypedDataAsync } = useSignTypedData()
  // on paper, what the chain would refuse is refused too (tickets/0006): a quote with a route, the
  // market's free liquidity, a dated book deep enough for the size
  const paperRefuse = !paper.active ? null
    : overLiquidity ? `The market has only ${usdShort(s.borrowLiquidityUsd)} of ${s.debt} free to borrow — lower the amount or the leverage.`
    : bookShort ? `The book does not hold ${usd(D)} of ${s.debt} at this date — borrow less or pick another date.`
    : q.isFetching && !q.data ? 'Quoting the route…'
    : !q.data || !hasRoute(q.data.data) ? 'No quote with a route at this size right now, so nothing can be opened — try another amount or leverage.'
    : null
  const ladder = useTicketLadder(key, s.chainId, async () => {
    const debtTokens = s.priceShort ? D / s.priceShort : 0
    const openParams = {
      collateralMarketUid: s.marketLongUid, debtMarketUid: s.marketShortUid, debtAmountRaw: toRaw(debtTokens, s.decimalsShort), slippageBp: slip, leverage: L, account: actor!,
      payAsset: chosen?.address, payAmountRaw: marginRaw, termId: term?.id, tenor,
      // a new user-set-rate trove opens at the picked rate (absent → the API's suggested pick)
      ...(rate != null ? { interestRate: rateToWad(rate) } : {}),
      // into the position the after-figures below are computed for, not a fresh account beside it
      accountId: holding?.accountId, simulate: !!holding,
    }
    const pre = await collateralOnFirst(holding, actor!)
    // a venue may answer a sign step first (`actions.signs`: Inverse's ALE borrows on a per-action permit); paper asks, never signs
    const env = await withSignature(await loopOpen(openParams), paper.active ? null : (td) => signTypedDataAsync(td as never))
    if (!hasRoute(env.data)) throw new Error(NO_ROUTE)
    if (chosen?.role === 'native' && !paysNative(env.actions)) throw new Error(`This loop does not take ${chosen.symbol} directly. Pay with another asset.`)
    const route = Math.max(0, (env.data?.quotes ?? []).findIndex((r) => r.deltas?.aggregator === routeName))
    return [...pre, ...stepsFrom(env.actions, `Open ${num(L, 2)}× loop${term ? ` · ${term.days}-day fixed` : tenor ? ` · ${tenorWord(tenor)} term` : s.dueAt ? ` · due ${due}` : ''}`, s.chainId, route)]
    // the swap's leftover lands in the wallet as either leg's token (Jupiter's exact-in fill on Solana)
  }, [s.marketLongUid, s.marketShortUid], [{ address: chosen?.address, symbol: chosen?.symbol }, { address: s.collateralAddress, symbol: s.holds }, { address: s.debtAddress, symbol: s.debt }],
    // on paper: the same margin, leverage and rates, and the quote's entry cost (a Solana quote prices none: 0)
    loopPlan(s, { into: holding, payToken: chosen?.address ?? '', amount, equityUsd: E, L, dep, bor, liqLtv, entryCostUsd: econ ? Math.max(0, cost - (econ.entryCostUsd.gas ?? 0)) : isSvmChain(s.chainId) && q.data ? 0 : null, quoting: q.isFetching, refuse: paperRefuse }),
    // the open's own build, unsigned, on either chain: the same call the quote makes
    true)
  // the open at market prices: your equity right after it is what you put in less the entry cost (`ValueCheck.tsx`)
  const vc = useValueCheck(E, econ && E > 0 ? E - cost : 0, `${key}|${cost}`)
  const more = !!bal && amount > bal.amount
  // the hero's two answers: the net, and how far from the line — in a word, the distance and the health factor
  const hfShown = simHf ?? hf, safe = safetyOf(drop)
  const rewardsNow = loopRewards(s, L)
  const fixedNote = term ? `fixed to ${ends}` : tenor ? `fixed for ${tenorWord(tenor)}` : s.dueAt ? `fixed to ${due}` : ''
  const entryWhy = econ ? `Entry cost ${usd(cost)}: swap slippage ${usd(econ.entryCostUsd.slippage)}, fees ${usd(econ.entryCostUsd.fees)}, network ${econ.entryCostUsd.gas == null ? 'not priced' : usd(econ.entryCostUsd.gas)} (max slippage ${slip / 100}%), on the whole ${num(L, 2)}× position. ${payback == null ? `At ${pct(net)} the loop earns nothing, so the entry is never earned back.` : `At ${pct(net)} on ${usd(E)} it earns ${usd(E * net / 100 / 365)} a day, so the entry is earned back in ${daysWord(payback)}${clockDays != null ? ` — ${payback > clockDays ? 'after' : 'before'} ${clockWord}` : ''}.`} Closing costs about as much again.` : ''
  return (
    <>
      <div className="tsec">
        <span className="lbl">You pay with <Info label="Paying for a loop">The margin can be paid in {opts.map((o) => o.symbol).join(' or ')}: whatever the venue accepts. Paid in {s.debt}, it is swapped into {s.holds} inside the same transaction.</Info></span>
        <div className="seg" style={{ marginBottom: 10 }}>{opts.map((o) => <button key={o.address} aria-pressed={!!chosen && normAddr(chosen.address) === normAddr(o.address)} onClick={() => setPayAddr(o.address)}><Tok sym={o.symbol} logo={o.logo} size={16} /> {o.symbol}</button>)}</div>
        {noPay && <div className="err" style={{ margin: '0 0 10px' }}>{pay.data!.notes[0] ?? 'This venue takes no margin with the loop.'}</div>}
        <AmountBox unit={chosen?.symbol ?? unit} value={amt} onChange={setAmt} onMax={bal && chosen ? () => setAmt(portion(bal, 100, chosen.decimals)) : undefined} />
        <div className="amt-sub"><span>≈ {usd(E)} equity</span><span>{account ? <>Idle: {bal ? `${num(bal.amount, 4)} ${chosen?.symbol}` : `0 ${chosen?.symbol ?? ''}`}{more && <span className="warn"> · more than idle</span>}</> : 'connect to see your balance'}</span></div>
        {holding && <LegsNote h={holding} holds={s.holds} debt={s.debt} adding />}
        {chosen && <GetLine account={account} short={!bal || more} symbol={chosen.symbol} open={getOpen} onOpen={() => setGetOpen(true)} />}
        {getOpen && chosen && <GetAsset targets={getForms(opts, chosen, s.chainId).map((o) => ({ chainId: s.chainId, address: o.address, symbol: o.symbol, decimals: o.decimals, price: o.price || price || 0, logo: o.logo, have: balOf(o.address, o.symbol)?.amount ?? 0 }))} want={amount} sources={allIdle}
          onTarget={(t) => setPayAddr(opts.find((o) => normAddr(o.address) === normAddr(t.address))?.address ?? null)} onClose={() => setGetOpen(false)} />}
        {s.terms && term && <>
          <span className="lbl" style={{ marginTop: 14 }}>Fix the {s.debt} rate for <Info label="Fixed-rate borrowing">
            <p style={{ margin: '0 0 6px' }}>{s.venue} lends {s.debt} here at a rate it sets for each term, the same at any size. The rate you pick is locked from today until the term ends.</p>
            <p style={{ margin: '0 0 6px' }}>When it ends the debt is not due and nothing is liquidated for it: the loan moves to the market's variable rate{after != null ? <> ({pct(after)} now)</> : ''} until you fix it again.</p>
            <p style={{ margin: 0 }}>Repaying before the end (closing or deleveraging) costs a penalty of about half the interest the repaid part would still pay.</p></Info></span>
          <div className="seg terms" role="radiogroup" aria-label="Fixed term">{s.terms.map((t) => <button key={t.id} role="radio" aria-checked={t.id === term.id} aria-pressed={t.id === term.id} onClick={() => setTermId(t.id)}>{t.days} days<span className="c">{pct(t.apr)}</span></button>)}</div>
        </>}
        {dates && s.dueAt && <>
          <span className="lbl" style={{ marginTop: 14 }}>Repay the {s.debt} by <Info label="Fixed-date loans">
            <p style={{ margin: '0 0 6px' }}>{s.venue} lends {s.debt} from an order book: lenders post rates for a loan due on a set date, and the loop takes the cheapest offers first. The rate shown is what this size pays.</p>
            <p style={{ margin: '0 0 6px' }}>What you owe is fixed when you open and does not grow. Repaying early costs no penalty, but you repay that same amount, so the interest up to the date is paid either way.</p>
            <p style={{ margin: 0 }}>The loan must be repaid by its date. After it, the position can be liquidated whatever its health.</p></Info></span>
          <div className="seg terms" role="radiogroup" aria-label="Due date">{dates.map((d) => { const r = d === s ? bookApr ?? d.borSpot : bookAprAt(bookOf(d)?.book ?? null, debtTok) ?? d.borSpot; return <button key={d.id} role="radio" aria-checked={d.id === s.id} aria-pressed={d.id === s.id} onClick={() => setDateId(d.id)}>{new Date(d.dueAt! * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}<span className="c">{pct(r)}</span></button> })}</div>
        </>}
        {s.tenors && tenor && <>
          <span className="lbl" style={{ marginTop: 14 }}>Borrow the {s.debt} for <Info label="Loopscale loan terms">
            <p style={{ margin: '0 0 6px' }}>{s.venue} matches you with lenders who each quote a fixed rate for a set term. Every term is its own market, so the rate depends on the term and on how much you borrow; the rates shown are for this size.</p>
            <p style={{ margin: '0 0 6px' }}>When the term ends the loan rolls into a new one-day term at whatever lenders then offer. If nobody does, there is a 48-hour grace period, then part of the position is liquidated.</p>
            <p style={{ margin: 0 }}>Repaying early costs nothing.</p></Info></span>
          <div className="seg terms" role="radiogroup" aria-label="Loan term">{tenorQs.map((x) => <button key={x.tenor.id} role="radio" aria-checked={x.tenor.id === tenor.id} aria-pressed={x.tenor.id === tenor.id} disabled={!x.offer && !x.pending} title={x.short ? x.short.message : !x.offer && !x.pending ? 'No lender offers this term at this size' : undefined} onClick={() => setTenorId(x.tenor.id)}>{tenorWord(x.tenor)}<span className="c">{x.offer ? pct(x.offer.apr) : x.pending ? '…' : '—'}</span></button>)}</div>
        </>}
        {urate && rate != null && <RatePicker className="ratepick" u={urate} book={queueBook} rate={rate} onRate={setRate} debtSymbol={s.debt} price={s.priceShort} />}
        <span className="lbl" style={{ marginTop: 14 }}>How hard to push it <Info label="Leverage tiers">{TIERS.map((t) => <p key={t.id} style={{ margin: '0 0 6px' }}><b>{t.name}</b> · {t.blurb}</p>)}<p style={{ margin: '0 0 6px' }}>This venue allows up to {num(s.maxLev, 1)}×. At {num(L, 2)}× the collateral can fall <b>{pct(drop * 100, 1)}</b> against the debt before liquidation.</p>{canCustom && <p style={{ margin: 0 }}>The slider icon swaps the tiers for a leverage of your own, up to {num(hi, 2)}×.</p>}</Info>
          {canCustom && <button type="button" className="levtoggle" aria-pressed={custom != null && !onCopy} aria-label={custom != null && !onCopy ? 'Back to the tiers' : 'Set my own leverage'} title={custom != null && !onCopy ? 'Back to the tiers' : 'Set my own leverage'} onClick={() => { setOnCopy(false); setCustom(custom != null && !onCopy ? null : L) }}>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></svg>
          </button>}</span>
        {custom != null && canCustom && !onCopy ? <>
          <div className="levr"><input type="range" min={lo} max={hi} step={0.01} value={L} onChange={(e) => setCustom(parseFloat(e.target.value))} aria-label="Leverage" /><LevInput value={L} min={lo} max={hi} onChange={setCustom} className={drop < 0.05 ? 'bad' : drop < 0.1 ? 'warn' : ''} /></div>
          <div className="snaps">{copyL != null && <button className={`pctb ${Math.abs(L - copyL) < 0.02 ? 'on' : ''}`} onClick={() => setCustom(copyL)}>Theirs {num(copyL, 1)}×</button>}{TIERS.map((t) => <button key={t.id} className={`pctb ${Math.abs(L - s.tiers[t.id]) < 0.02 ? 'on' : ''}`} onClick={() => setCustom(s.tiers[t.id])}>{t.name} {num(s.tiers[t.id], 1)}×</button>)}</div>
        </> : <div className="tiers" role="radiogroup" aria-label="Leverage tier">{copyL != null && <CopiedTier l={copyL} theirs={copyLev!} on={onCopy} n={netAprAtLeverage(dep, borAt(E * (copyL - 1)), copyL)} d={liqBuffer(liqLtv, copyL)} onPick={() => setOnCopy(true)} />}{TIERS.map((t) => { const l = s.tiers[t.id]; const n = netAprAtLeverage(dep, borAt(E * (l - 1)), l); const d = liqBuffer(liqLtv, l); return (
          <button key={t.id} className={`tier ${t.id}`} role="radio" aria-checked={!onCopy && tier === t.id} onClick={() => pickTier(t.id)}>
            <span className="tn">{t.name}</span>
            <span className={`tr ${n >= 3 ? 'ok' : n < 0 ? 'bad' : ''}`}>{pct(n)}</span>
            {/* leverage and the drop each on a line of their own: on one line a 16.92× venue cut the drop
                off, and the drop is the number the three cards are compared by */}
            <span className="tl" title={`${num(l, 2)}× leverage`}>{num(l, 2)}×</span>
            <span className={`tl ${d < 0.05 ? 'bad' : d < 0.1 ? 'warn' : ''}`} title={`liquidated if the collateral falls ${pct(d * 100, 1)} against the debt`}>−{pct(d * 100, d < 0.1 ? 1 : 0)} to liq.</span>
          </button>) })}</div>}
        {short && <div className="caution depth">
          <b>Too big for one lender.</b> {short.message}
          {(fitAmount > 0 || fitTier || (fitLev > 1 && canCustom && fitLev >= lo)) && <div className="fixes">
            {fitAmount > 0 && <button type="button" className="pctb" onClick={() => setAmt(fromUnits(Math.floor(fitAmount * 100) / 100))}>Pay {num(fitAmount, 2)} {chosen?.symbol}</button>}
            {fitTier ? <button type="button" className="pctb" onClick={() => pickTier(fitTier.id)}>{fitTier.name} {num(s.tiers[fitTier.id], 2)}×</button>
              : fitLev > 1 && canCustom && fitLev >= lo && <button type="button" className="pctb" onClick={() => { setOnCopy(false); setCustom(fitLev) }}>{num(fitLev, 2)}×</button>}
          </div>}
        </div>}
        {/* what it costs to get in, in one line: the cost, what is left, how long until it is earned
            back. The route it runs on is under "How it's executed" — named here only when it is not the best */}
        {econ ? <div className={`entryline ${vc.sev}`} title={entryWhy}>
          <span>Entry <b>{cents(cost)}</b></span>
          {vc.outUsd > 0 && <span className="t50">→ <b>{cents(vc.outUsd)}</b> equity</span>}
          {routeSel > 0 && <span className="t50">via {routes[routeSel].deltas?.aggregator}</span>}
          <span className="qe">break-even <b className={payback == null ? 'bad' : clockDays != null && payback > clockDays ? 'warn' : 'ok'}>{payback == null ? 'never' : daysWord(payback)}</b> <Info label="About the entry">{entryWhy} Over {pct(1, 0)} lost it turns amber; over {pct(3, 0)} you confirm the loss before signing.</Info></span>
        </div> : amount > 0 && <div className="entryline unk"><span>Entry</span><span className="t50">{noRoute ? 'no route at this size' : short ? 'too big for one lender' : q.error && !q.isFetching ? 'no quote at this size' : <Sk w={90} h={12} />}</span></div>}
        {econ && <LossAck v={vc} what="Opening this loop" advice="Lower the leverage or the amount: the swap is sized on the whole position, not on what you put in." />}
      </div>
      {/* the three answers stay up — what it earns, how far from liquidation, what it costs to
          get in (above) — and everything else folds under the question it explains
          (docs/simplify-selections.md §4) */}
      <div className="tsec"><div className="cells">
        <div className="c hero duo"><div><span className="k">Net yield</span><span className={`v ${net >= 3 ? 'ok' : net < 0 ? 'bad' : ''}`}>{pct(net)}</span>{fixedNote || rewardsNow > 0.05 ? <span className="s">{fixedNote}{fixedNote && rewardsNow > 0.05 ? ' · ' : ''}{rewardsNow > 0.05 ? `incl. ${pct(rewardsNow)} rewards` : ''}</span> : null}</div>
          <div className="hf" title={`Health factor ${hfShown.toFixed(2)} ${simHf ? '(simulated by the API)' : '(from the liquidation threshold)'} — liquidation at 1.00`}><span className="k">Safety</span><span className={`v ${safe.cls}`}>{safe.word}</span><span className="s">−{pct(drop * 100, drop < 0.1 ? 1 : 0)} to liq. · HF {hfShown.toFixed(2)}</span></div></div>
      </div>
      <div className="folds">
        <Fold id="yield" title="Where the yield comes from" hint="per year · if rates move · 30 days">
          <div className="plain">Earn <b>{pct(dep)}</b> on {num(L, 2)}× the money, pay <b>{pct(bor)}</b> on {num(L - 1, 2)}× of it{term ? `, fixed to ${ends}` : tenor ? `, fixed for ${tenorWord(tenor)}` : s.dueAt ? `, fixed to ${due}` : Math.abs(bor - s.borSpot) >= 0.05 ? ` (${pct(s.borSpot)} now; more at this size)` : ''}{rewardsNow > 0.05 ? `; ${pct(rewardsNow)} of it is rewards` : ''}.</div>
          <div className="cells">
            {Eh > 0 && <div className="c"><span className="k">Your loop after</span><span className={`v ${netC >= 3 ? 'ok' : netC < 0 ? 'bad' : ''}`}>{pct(netC)}</span><span className="s">{num(Lh, 2)}× → {num(Lc, 2)}× · health {hfC.toFixed(2)}</span></div>}
            <div className="c"><span className="k">Per year</span><span className="v">{usd(yearly)}</span><span className="s">vs {usd(E * dep / 100)} unlevered</span></div>
            {term ? <div className="c"><span className="k">After {ends}</span><span className={`v ${netAfter == null ? '' : netAfter < 0 ? 'bad' : netAfter < 1 ? 'warn' : ''}`}>{pct(netAfter)}</span><span className="s">{after != null ? `if not re-fixed · variable ${pct(after)} now` : 'if not re-fixed · variable rate'}</span></div>
              : <div className="c"><span className="k">If borrow +2%</span><span className={`v ${netWorst < 0 ? 'bad' : netWorst < 1 ? 'warn' : ''}`}>{pct(netWorst)}</span><span className="s">rate sensitivity</span></div>}
            {/* a loop is two markets, so it gets two curves: the one that pays you and the one that
                charges you. The borrow leg is the one that ends loops */}
            <div className="c"><span className="k">You hold</span><span className="v">{usd(C)}</span><span className="s">{s.holds} on {s.venue}</span><IrmLink uid={s.marketLongUid} side="supply" label="supply curve" rewards={s.rewardsLong} /></div>
            <div className="c"><span className="k">You owe</span><span className="v">{usd(D)}</span><span className="s">{s.debt} · {term ? `fixed ${pct(term.apr)} for ${term.days} days` : tenor ? `fixed ${pct(bor)} for ${tenorWord(tenor)}` : s.dueAt ? `fixed ${pct(bor)}, due ${due}` : 'floating'}</span>{s.dueAt ? <BookLink uid={s.marketShortUid} side="borrow" size={debtTok} symbol={s.debt} price={s.priceShort} act="Borrowing" /> : <IrmLink uid={s.marketShortUid} side="borrow" label={term ? 'rate after the term' : 'borrow curve'} rewards={s.rewardsShort} />}</div>
          </div>
          {!term && !s.dueAt && <HistorySec s={s} L={L} now={net} bare />}
        </Fold>
        <Fold id="risk" title="Risk and liquidation" hint="health · loan-to-value · the line">
          <div className="plain">Liquidated if <b>{s.holds}</b> falls <b>{pct(drop * 100, 1)}</b> against <b>{s.debt}</b>.</div>
          <div className="liqbar"><i style={{ ['--x' as string]: `${Math.min(98, Math.max(2, drop / 0.25 * 100))}%` }} /></div>
          <div className="liqcap"><span>0% buffer</span><span>{safe.word.toLowerCase()}</span><span>25%</span></div>
          <div className="cells">
            <div className="c"><span className="k">Health factor</span><span className={`v ${hfShown < 1.1 ? 'bad' : hfShown < 1.25 ? 'warn' : 'ok'}`}>{hfShown.toFixed(2)}</span><span className="s">{simHf ? 'simulated by the API' : 'from the threshold'} · liq. at 1.00</span></div>
            <div className="c"><span className="k">Loan-to-value</span><span className="v">{pct((L - 1) / L * 100, 0)}</span><span className="s">liquidated at {pct(liqLtv * 100, 0)}</span></div>
            <div className="c"><span className="k">Free to borrow</span><span className={`v ${overLiquidity ? 'bad' : ''}`}>{usdShort(s.borrowLiquidityUsd)}</span><span className="s">{s.debt} left in the market</span></div>
            <div className="c"><span className="k">Venue max</span><span className="v">{num(s.maxLev, 1)}×</span><span className="s">{onCopy && copyL != null ? 'copied' : custom != null && canCustom ? 'your own' : TIERS.find((t) => t.id === tier)!.name.toLowerCase()} is {num(L, 2)}×</span></div>
          </div>
        </Fold>
        <Fold id="exec" title="How it's executed" hint="swap route · fees · slippage">
          {routes.length > 0 ? <RoutePick routes={routes} sel={routeSel} debt={s.debt} holds={s.holds} onPick={(i, name) => setRouteName(i === 0 ? null : name)} /> : <div className="plain t50">{q.isFetching ? 'Quoting the route…' : noRoute ? 'No route at this size.' : 'No quote yet.'}</div>}
          <div className="cells">
            <div className="c"><span className="k">Entry cost</span><span className="v">{econ ? cents(cost) : '—'}</span><span className="s">{econ ? `swap ${cents(econ.entryCostUsd.slippage)} · fees ${cents(econ.entryCostUsd.fees)} · network ${econ.entryCostUsd.gas == null ? 'n/a' : cents(econ.entryCostUsd.gas)}` : 'once quoted'}</span></div>
            <div className="c"><span className="k">Max slippage</span><span className="v">{num(slip / 100, 2)}%</span><span className="s">set in Settings</span></div>
          </div>
        </Fold>
      </div>
      </div>
      <FundingLock s={s} C={C} />
      <div className="tsec"><span className="lbl">What can go wrong</span><ul className="risks">
        {overLiquidity && <li className="w"><i /><span>This borrows {usd(D)} of {s.debt}, more than the {usdShort(s.borrowLiquidityUsd)} the market has free: the rate is at the top of its curve and the transaction may not go through.</span></li>}
        {term ? <>
          <li className="w"><i /><span>The {pct(term.apr)} is fixed until {ends}. After that the debt pays the variable rate{after != null ? ` (${pct(after)} now, which would make the loop ${pct(netAfter)})` : ''} until you fix it again.</span></li>
          <li className="w"><i /><span>Closing or deleveraging before {ends} costs a penalty: about half the interest the repaid part would still pay.</span></li>
          {!!holding && <li><i /><span>This opens a second loan beside the one you hold, on the same collateral. Each has its own term and is repaid on its own.</span></li>}
        </> : s.dueAt ? <>
          <li className="w"><i /><span>The loan is due on {due} ({dueDays} days). Close the loop before then: after that date it can be liquidated whatever its health.</span></li>
          <li className="w"><i /><span>What you owe is fixed at the open. Closing early repays all of it, so the {pct(bor)} is paid up to {due} however long you stay.</span></li>
          {bookShort && <li className="w"><i /><span>The book does not hold {usd(D)} of {s.debt} at this date: the open will take less or fail. Borrow less, or pick another date.</span></li>}
        </> : tenor ? <>
          <li className="w"><i /><span>The {pct(bor)} is fixed for {tenorWord(tenor)}. After that the loan rolls into a new one-day term at whatever lenders then offer, which may cost more than the {s.holds} pays.</span></li>
          <li className="w"><i /><span>If no lender offers a new term when it ends, there is a 48-hour grace period and then part of the position is liquidated, whatever the price.</span></li>
        </> : <li className="w"><i /><span>Net yield goes negative if the {s.debt} borrow rate rises above the {s.holds} rate.</span></li>}
        {isSavings(s.nature) ? <li className="w"><i /><span>Liquidation if {s.holds} trades at a discount to {s.debt}.</span></li>
          : <li className="w"><i /><span>Not a saving ({NATURES[s.nature].word}): {s.holds} is priced on its own and {s.debt} is not, so a {pct(drop * 100, 1)} fall in {s.holds} liquidates — at {num(L, 2)}× every move is {num(L, 2)} times bigger. {NATURES[s.nature].why}</span></li>}
        {s.expiry && <li><i /><span>The collateral matures on {dateOf(s.expiry)}; the position must be closed or rolled.</span></li>}
        {s.rewardsLong + s.rewardsShort > 0.05 && <li><i /><span>Part of the rate is incentives that can stop without notice.</span></li>}
      </ul></div>
      {noRoute && <div className="err" style={{ margin: '0 0 10px' }}>{NO_ROUTE}</div>}
      <Action ladder={ladder} label={`Open ${onCopy && copyL != null ? 'copied ' : custom != null && canCustom ? '' : `${TIERS.find((t) => t.id === tier)!.name.toLowerCase()} `}loop · ${num(L, 2)}×${term ? ` · ${term.days}-day fixed` : tenor ? ` · ${tenorWord(tenor)}` : s.dueAt ? ` · due ${due}` : ''} · ${usd(E)}`} account={account} isConnected={isConnected} disabled={!(amount > 0) || !chosen || noRoute || !!short || vc.blocked || !!paperRefuse} risky={vc.severe} blockedNote={noPay ? 'This venue takes no margin with the loop — see above' : short ? 'Too big for one lender — see above' : vc.blocked ? `Confirm the ${cents(-vc.diff)} loss above to continue` : paperRefuse ?? undefined} chainId={s.chainId} fee="loop" />
    </>
  )
}

/** Withdraw from a deposit the wallet already holds. `s` is null for a position the menu has no row for. */
function ManageTicket({ s, h, mode }: { s: SimpleStrategy | null; h: Holding; mode: Mode }) {
  const { account, isConnected, solSigner, actorOn } = useApp()
  const actor = actorOn(h.chainId)
  const all = mode === 'close'
  const [amt, setAmt] = useStickyAmount(`t:${h.key}:withdraw`, () => portion(heldRaw(h), 50, h.decimals))
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
  const paper = usePaper()
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
  return (
    <>
      <div className="tsec">
        <span className="lbl">Amount to withdraw (of {num(h.amount, 4)} {h.symbol})</span>
        <div className="amt"><AmountInput value={amt} onChange={setAmt} ariaLabel="Amount" /><span className="u">{h.symbol}</span><button className="max" onClick={() => setAmt(portion(heldRaw(h), 100, h.decimals))}>Max</button></div>
        <div className="amt-sub"><span>≈ {usd(eff * price)}{amount > h.amount + 1e-9 && <span className="warn"> · more than you hold</span>}</span><span>{[25, 50, 75, 100].map((p) => <button key={p} className="pctb" onClick={() => setAmt(portion(heldRaw(h), p, h.decimals))}>{p}%</button>)}</span></div>
        {canNative && <>
          <span className="lbl" style={{ marginTop: 14 }}>Paid out as <Info label="Getting the native coin back">Paid out as {coin}, the {h.symbol} is unwrapped for you. That costs one more signature on most venues: an approval for their gateway the first time, or an unwrap step of its own. If that unwrap step fails, the withdrawal has still gone through and the funds sit in your wallet as {h.symbol}.</Info></span>
          <div className="seg">{[false, true].map((n) => <button key={String(n)} aria-pressed={native === n} disabled={n && maxRounds} onClick={() => setAsNative(n)}><Tok sym={n ? coin : h.symbol} logo={n ? undefined : h.logo} size={16} /> {n ? coin : h.symbol}</button>)}</div>
          {maxRounds && <div className="foot" style={{ marginTop: 6 }}>This venue's {coin} exit fails on a full withdrawal. Take {h.symbol}, or leave a little in to take {coin}.</div>}
        </>}
      </div>
      <div className="tsec"><div className="cells">
        <div className="c hero"><span className="k">You get back</span><span className="v">{usd(eff * price)}</span><span className="s">{num(eff, 4)} {outSym} to your wallet</span></div>
        <div className="c"><span className="k">Left in</span><span className="v">{num(Math.max(0, h.amount - eff), 4)}</span><span className="s">{h.symbol}{rate != null ? ` · still earning ${pct(rate)}` : ''}</span></div>
        {exit && <div className="c"><span className="k">Exit</span><span className="v" style={{ fontSize: 14 }}>{exit.word}</span><span className="s">{exit.when}</span></div>}
      </div></div>
      {booked && <BookedSlippage pegged={s ? isSavings(s.nature) : true} what={h.symbol} sell />}
      {paper.active && queueSecs > 0 && <div className="tsec plain t70" style={{ fontSize: 12.5 }}><span className="pill paper">paper</span> This exit is queued: on paper the {h.symbol} lands in your bank {s?.exitSecs ? `after the venue's ${exit ? exit.word.toLowerCase() : 'wait'}` : 'after a week (the venue publishes no wait time)'}, and the tray shows it on its way.</div>}
      <Action ladder={ladder} label={`Withdraw · ${num(eff, 4)} ${h.symbol}`} account={account} isConnected={isConnected} disabled={!(eff > 0) || !!paperRefuse} blockedNote={paperRefuse ?? undefined} chainId={h.chainId} fee="withdraw" />
    </>
  )
}

/**
 * A position in an account the API cannot build for (`subAccount.unsupported` — today a Kamino
 * Multiply / Leverage obligation: the hosted builder reaches only the vanilla one). Said here,
 * before anything is sized, instead of a withdraw or close that comes back refused.
 */
function CannotManage({ h }: { h: Holding }) {
  const venue = h.venue.split(' · ')[0]
  return (
    <div className="tsec"><div className="caution">
      <b>Manage this one on {venue}.</b> It sits in your {h.subAccount?.label ?? 'separate account'}, which YieldCircle cannot build transactions for yet: {venue} only lets us reach your main account there. Your {usd(h.valueUsd)} is safe and still shown here; withdraw{h.kind === 'loop' ? ', deleverage or close' : ''} it in the {venue} app.
    </div></div>
  )
}

/**
 * Manage a running loop with ONE control: the target leverage. Left of where you are is a
 * deleverage (collateral sold into the debt token to repay; all the way left, 1×, sells everything
 * and closes); right of it borrows more and buys more collateral. Both are one transaction.
 *
 * `s` is null for a loop the menu has no row for: then the slider only goes left. Increasing
 * needs the pair's max leverage and rates, which only a catalogue row carries; unwinding needs
 * nothing but the two market uids the position already names.
 */
function ManageLoop({ s, h, closeFirst }: { s: LoopStrategy | null; h: Holding; closeFirst?: boolean }) {
  const { account, isConnected, solSigner, actorOn } = useApp()
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
  const [recv, setRecv] = useSticky<'debt' | 'collateral'>(`t:${h.key}:recv`, 'debt')
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
  const paper = usePaper()
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
  const snaps: { l: number; t: string }[] = [...(putUp ? [] : minL <= 1 ? [{ l: 1, t: 'Close' }] : [{ l: minL, t: 'Repay loan' }]), ...(s ? TIERS.map((t) => ({ l: Math.min(maxL, s.tiers[t.id]), t: t.name })).filter((x) => x.l >= minL) : []), { l: +Lnow.toFixed(2), t: 'Now' }]
  return (
    <>
      <div className="tsec">
        <span className="lbl">Leverage {putUp ? <Info label="Levering a deposit">Your {holds} already sits on {h.venue} with nothing borrowed against it. Drag right to borrow {debt} against it and buy more {holds}, which lands in the same {h.subAccount && h.subAccount.id !== '0' ? h.subAccount.label.toLowerCase() : 'account'}. Nothing is taken from your wallet, and it is one transaction{needsCollateralOn(h) ? <>, after one that switches your {holds} on as collateral: {h.venue} does not count it yet</> : ''}. To take the deposit out instead, withdraw it from the deposit itself.</Info>
          : <Info label="Managing a loop">Drag left to deleverage: collateral is sold into {debt} to repay debt, and at 1× everything is sold and the loop is closed.{s && !loan ? <> Drag right to borrow more {debt} and buy more {holds}.</> : ''} Either way it is one transaction.</Info>}</span>
        <LegsNote h={h} holds={holds} debt={debt} />
        {loans.length > 1 && <div className="seg" role="radiogroup" aria-label="Which loan" style={{ marginBottom: 10 }}>{loans.map((x) => <button key={x.id} role="radio" aria-checked={x.id === loan?.id} aria-pressed={x.id === loan?.id} onClick={() => { setLoanId(x.id); setL(Lnow) }}>Loan {x.id}<span className="c" style={{ marginLeft: 6 }}>{usdShort(x.debtUsd)}</span></button>)}</div>}
        {maxL > minL && <div className="levr"><span className="t50 mono" style={{ fontSize: 11 }}>{putUp ? '1×' : minL <= 1 ? 'close' : 'repaid'}</span><input type="range" min={minL} max={maxL} step={0.01} value={L} onChange={(e) => setL(parseFloat(e.target.value))} aria-label="Target leverage" style={{ ['--now' as string]: `${((Lnow - minL) / (maxL - minL)) * 100}%` }} className="lev-now" /><LevInput value={L} min={minL} max={maxL} onChange={setL} label="Target leverage" /></div>}
        <div className="snaps">{snaps.map((x) => <button key={x.t} className={`pctb ${Math.abs(L - x.l) < 0.02 ? 'on' : ''}`} onClick={() => setL(x.l)}>{x.t}{x.t !== 'Close' ? ` ${num(x.l, x.t === 'Now' ? 2 : 1)}×` : ''}</button>)}</div>
        {closing && !sameToken && !venueKeeps && <>
          <span className="lbl" style={{ marginTop: 12 }}>Receive <Info label="How a close pays out">In <b>{debt}</b>: all your {holds} is sold, the debt is repaid, and what is left of the sale comes to your wallet.<br />In <b>{holds}</b>: only enough {holds} is sold to repay the debt (with a 1% margin for the fill), and the rest of your {holds} is withdrawn to your wallet, with the small {debt} surplus of that margin.</Info></span>
          <div className="seg" role="radiogroup" aria-label="Receive">{([['debt', debt, backDebt], ['collateral', holds, backColl]] as const).map(([k, sym, amt]) => <button key={k} role="radio" aria-checked={recv === k} aria-pressed={recv === k} onClick={() => setRecv(k)}>{sym}{amt != null && amt > 0 && <span className="c" style={{ marginLeft: 6 }}>≈ {num(amt, 4)}</span>}</button>)}</div>
        </>}
        <div className="plain" style={{ marginTop: 8 }}>{same ? <span className="t50">{putUp ? <>Your {num(h.amount, 4)} {holds} sits on {h.venue} with nothing borrowed. Pick how far to push it.</> : <>You are at {num(Lnow, 2)}×. Move the slider to {s && !loan ? 'change' : 'reduce'} it.</>}</span>
          : closing ? (closeBlock === 'pricing' ? <span className="t50">Pricing the sale of {num(h.amount, 4)} {holds}…</span>
            : closeBlock === 'no-route' ? <span className="t50">No swap route for {num(h.amount, 4)} {holds} into {debt} right now.</span>
            : closeBlock === 'short' ? <>Selling all <b>{num(h.amount, 4)} {holds}</b> fetches <b>{num(sale!.output, 4)} {debt}</b> on the market, less than the <b>{num(owed, 4)} {debt}</b> you owe.</>
            : keep ? <>Sell ≈ <b>{num(sellKeep!, 4)} {holds}</b> into {debt}, repay the <b>{num(owed, 4)} {debt}</b> debt, and withdraw the other{keepOk ? <> <b>≈ {num(backColl!, 4)} {holds}</b></> : ''} to your wallet, with ≈ {num(leftover, 4)} {debt} left over from the sale.</>
            : <>Sell all <b>{num(h.amount, 4)} {holds}</b> into ≈ {num(sale!.output, 4)} {debt}, repay the <b>{num(owed, 4)} {debt}</b> debt, and <b>≈ {num(backDebt!, 4)} {debt}</b> comes back to your wallet.</>)
          : down ? <>Sell <b>{num(sellTok, 4)} {holds}</b> (≈ {usd(sellUsd)}) into {debt} and repay that much debt.</>
          : <>Borrow <b>{num(borrowTok, 4)} {debt}</b> (≈ {usd(borrowUsd)}){putUp ? <> against your {num(h.amount, 4)} {holds}</> : ' more'} and buy {holds} with it.</>}</div>
        {putUp && !same && needsCollateralOn(h) && <div className="plain t50" style={{ marginTop: 6 }}>First, one transaction switches your {holds} on as collateral: {h.venue} does not count it yet. The lever follows it.</div>}
        {loan && !same && <div className="plain t50" style={{ marginTop: 6 }}>This repays {loans.length > 1 ? `loan ${loan.id}` : 'your fixed-rate loan'}{minL > 1 ? `, which is ${usd(loan.debtUsd)} of the ${usd(D)} you owe` : ''}. Before its term ends the broker adds a penalty of about half the interest the repaid part would still pay.</div>}
        {closeBlock === 'short' && otherColl.length > 0 && <div className="err" style={{ marginTop: 8 }}>A close would revert: selling your {holds} cannot repay the whole debt on its own{sale && owed > 0 ? <> (about <b>{num(owed * (1 + CLOSE_INTEREST_PAD) - sale.output, 4)} {debt}</b> short)</> : ''}. Part of what backs the debt is {legList(otherColl)}, which this close does not sell. Repay that much {debt} on {h.venue} first, or sell some of the {otherColl.map((o) => o.symbol).join(' and ')} into {debt} there.</div>}
        {closeBlock === 'short' && !otherColl.length && <div className="err" style={{ marginTop: 8 }}>A close would revert: the sale cannot repay the debt. {h.venue} values your {holds} at its own oracle ({usd(h.valueUsd)} of equity), above what it sells for right now{sale && owed > 0 ? <>, which leaves you about <b>{num(owed * (1 + CLOSE_INTEREST_PAD) - sale.output, 4)} {debt}</b> short</> : ''}. Repay that much {debt} on the venue first, or wait for {holds} to trade closer to its oracle.</div>}
        {closeBlock === 'keep-short' && <div className="err" style={{ marginTop: 8 }}>Repaying {num(owed, 4)} {debt} with a 1% margin for the fill takes ≈ {num(sellKeep!, 4)} {holds}, more than the {num(h.amount, 4)} you hold. Take the payout in {debt} instead.</div>}
        {tight && !closeBlock && <div className="plain warn" style={{ marginTop: 6 }}>Tight: a fill at the worst the {slip / 100}% slippage allows would not cover the debt, and the close would revert (only gas is lost).</div>}
        {valued && <>
          <ValueRow v={vc} labels={['Equity', 'You get back', 'Value change']}
            info={<>What the close pays out at market prices, against the equity {h.venue} values the position at with its own oracle. The difference is the sale's slippage and fees, plus any gap between the oracle and what {holds} sells for.</>} />
          <LossAck v={vc} what="Closing now" advice={!keep && !sameToken && !venueKeeps ? `Taking the payout in ${holds} sells less of it; or wait for ${holds} to trade closer to its oracle.` : `It can be worth waiting for ${holds} to trade closer to its oracle.`} />
        </>}
        {h.valueUsd <= 0 && closeBlock !== 'short' && <div className="err" style={{ marginTop: 8 }}>This loop has no equity left: the collateral is worth less than the debt, so selling it cannot repay everything. Closing may fail; add {debt} on the venue to repay first.</div>}
      </div>
      <div className="tsec"><div className="cells">
        {s && !loan && <div className="c hero"><span className="k">Net yield after</span><span className={`v ${net == null ? '' : net >= 3 ? 'ok' : net < 0 ? 'bad' : ''}`}>{net == null ? '—' : pct(net)}</span><span className="s">{closing ? 'position closed' : putUp ? `was ${pct(s.depSpot)} as a plain deposit` : `was ${pct(netAprAtLeverage(s.depSpot, s.borSpot, Lnow))} at ${num(Lnow, 2)}×`}</span></div>}
        <div className="c"><span className="k">You hold</span><span className="v">{usd(Math.max(0, C2 - otherUsd))}</span><span className="s">{holds} · was {usd(C - otherUsd)}{otherUsd > 0.5 ? ` · + ${usd(otherUsd)} ${otherColl.map((o) => o.symbol).join(' + ')} stays` : ''}</span><IrmLink uid={s?.marketLongUid ?? h.collateralUid} side="supply" label="supply curve" rewards={s?.rewardsLong} /></div>
        <div className="c"><span className="k">You owe</span><span className="v">{usd(D2)}</span><span className="s">{debt} · was {usd(D)}</span>{s?.dueAt ? <BookLink uid={s.marketShortUid} side="borrow" size={0} symbol={s.debt} price={s.priceShort} /> : <IrmLink uid={s?.marketShortUid ?? h.debtUid} side="borrow" label="borrow curve" rewards={s?.rewardsShort} />}</div>
        {closing ? <>
          <div className="c"><span className="k">You get back</span><span className={`v ${closeBlock === 'short' ? 'bad' : ''}`}>{cq.isPending ? <Sk w={60} h={14} /> : backUsd != null && backUsd > 0 ? usd(backUsd) : '—'}</span><span className="s">{closeBlock ? (closeBlock === 'short' ? 'the sale does not cover the debt' : closeBlock === 'keep-short' ? 'not enough to keep any' : '') : keep ? `≈ ${num(backColl!, 4)} ${holds} + ${num(leftover, 4)} ${debt}` : `≈ ${num(backDebt!, 4)} ${debt} · at market, not ${usd(h.valueUsd)}`}</span></div>
          <div className="c"><span className="k">Exit cost</span><span className="v">{sale?.exitCostUsd != null ? usd(sale.exitCostUsd * (keep && keepOk ? sellKeep! / h.amount : 1)) : '—'}</span><span className="s">{sale?.via ? `slippage and fees · via ${sale.via}` : 'slippage and fees'}</span></div>
        </> : <>
          <div className="c"><span className="k">Health after</span><span className={`v ${hf == null ? '' : hf < 1.1 ? 'bad' : hf < 1.25 ? 'warn' : 'ok'}`}>{hf == null ? '—' : hf.toFixed(2)}</span><span className="s">{h.health != null ? `now ${h.health.toFixed(2)}` : ''}</span></div>
          <div className="c"><span className="k">Buffer after</span><span className={`v ${drop == null ? '' : drop < 0.05 ? 'bad' : drop < 0.1 ? 'warn' : ''}`}>{drop == null ? '—' : `−${pct(drop * 100, 1)}`}</span><span className="s">{drop == null ? '' : `${holds} fall that liquidates`}</span></div>
        </>}
      </div></div>
      <Action ladder={ladder} label={same ? 'Nothing to change' : closing ? (keep ? `Close · sell ≈ ${num(sellKeep ?? 0, 4)} ${holds}, keep the rest` : `Close · sell all ${holds} for ${debt}`) : down ? `Deleverage to ${num(L, 2)}× · sell ${num(sellTok, 4)} ${holds}` : `${putUp ? 'Lever' : 'Increase'} to ${num(L, 2)}× · borrow ${num(borrowTok, 4)} ${debt}`} account={account} isConnected={isConnected} disabled={same || !!closeBlock || vc.blocked} risky={vc.severe} blockedNote={vc.blocked ? `Confirm the ${cents(-vc.diff)} loss above to continue` : undefined} chainId={h.chainId} fee={closing || down ? 'reduce' : 'lever'} />
    </>
  )
}
/**
 * A full close is sized off a market quote taken seconds before the block. INTEREST: the debt grows
 * and the price moves in between, so a sale that only just covers it is refused. KEEP: keeping the
 * collateral sells what repays the debt plus a margin of twice the slippage (never under 0.4 %, the
 * interest pad's double), and the surplus comes back in the debt token.
 */
const CLOSE_INTEREST_PAD = 0.002
const closeKeepPad = (slipBp: number) => Math.max((2 * slipBp) / 10_000, 2 * CLOSE_INTEREST_PAD)

type Leg = NonNullable<Holding['others']>[number]
const legList = (ls: Leg[]) => ls.map((o) => `${num(o.amount, 4)} ${o.symbol} (${usd(o.usd)})`).join(' and ')
/**
 * A loop account with legs beyond the one pair the ticket builds on. Nothing here can manage them:
 * a close sells the loop's own collateral and repays its own debt, and every other leg stays where it
 * is — which also means a close can come up short when the other collateral carried part of the
 * debt. Said before anything is signed, with the account-wide numbers above flagged as such.
 */
function LegsNote({ h, holds, debt, adding }: { h: Holding; holds: string; debt: string; adding?: boolean }) {
  const coll = (h.others ?? []).filter((o) => o.side === 'collateral'), debts = (h.others ?? []).filter((o) => o.side === 'debt')
  if (!coll.length && !debts.length) return null
  // a deposit's neighbours: they back the new debt too, so the venue's health is above the pair's
  if (h.putUp) return (
    <div className="caution">
      <b>Your account on {h.venue} holds more than {holds}.</b>{' '}
      It also has {legList(coll)} as collateral. Those back the {debt} debt as well, so {h.venue} will count a higher health than the one shown here, which is {holds} against {debt} alone. Withdrawing them later brings it down to that.
    </div>
  )
  return (
    <div className="caution">
      <b>This position has more than one {coll.length && debts.length ? 'collateral and debt' : coll.length ? 'collateral' : 'debt'}.</b>{' '}
      Besides {holds} against {debt}, the account holds {[coll.length ? `${legList(coll)} as collateral` : '', debts.length ? `${legList(debts)} of debt` : ''].filter(Boolean).join(', and ')}.{' '}
      {adding
        ? <>Adding builds on {holds} and {debt} only; the leverage and health shown count the whole account.</>
        : <>YieldCircle manages {holds} against {debt} only: deleveraging and closing sell {holds} and repay {debt}{coll.length ? <>, and the {coll.map((o) => o.symbol).join(' and ')} stays deposited — withdraw it on {h.venue}</> : ''}{debts.length ? <>. The {debts.map((o) => o.symbol).join(' and ')} debt stays open, so a full close can revert while it is backed by what you withdraw</> : ''}. Equity, leverage and health here are the whole account's.</>}
    </div>
  )
}

/** One quiet line under the amount: the way in when the wallet is short, a smaller link when it is not. */
/**
 * What "Get" buys for a loop: the chosen margin token — and, when it is the gas coin or its wrapper
 * and the venue takes the coin, both of them, the coin first (no approval to pay it in).
 */
function getForms<T extends { role: string; address: string; symbol: string }>(opts: T[], chosen: T, chainId: string): T[] {
  const coin = opts.find((o) => o.role === 'native')
  const wrapped = opts.find((o) => o.role !== 'native' && wrapsNative(chainId, o.address))
  return coin && wrapped && (chosen === coin || chosen === wrapped) ? [coin, wrapped] : [chosen]
}
export function GetLine({ account, short, symbol, open, onOpen }: { account?: string; short: boolean; symbol: string; open: boolean; onOpen: () => void }) {
  if (!account || open) return null
  return (
    <button className={`getline ${short ? 'short' : ''}`} onClick={onOpen}>
      <span className="gl-ic" aria-hidden><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h11l-3-3M17 13H6l3 3" /></svg></span>
      <span className="gl-t">{short ? <><b>Don't have enough {symbol}?</b><small>Swap or bridge it from anything you hold, on any chain.</small></> : <><b>Get more {symbol}</b><small>from another asset or chain</small></>}</span>
      <span className="gl-go">Get {symbol.length > 8 ? 'it' : symbol} →</span>
    </button>
  )
}
export function AmountBox({ unit, value, onChange, onMax }: { unit: string; value: Amount; onChange: (a: Amount) => void; onMax?: () => void }) {
  return (
    <div className="amt">{unit === '$' && <span className="u">$</span>}<AmountInput value={value} onChange={onChange} ariaLabel="Amount" />{unit !== '$' && <span className="u">{unit}</span>}{onMax && <button className="max" onClick={onMax}>Max</button>}</div>
  )
}

/** The sticky bottom of the ticket: one button, then the ladder once built. */
export function Action({ ladder: l, label, account, isConnected, disabled, risky, blockedNote, chainId, fee }: { ladder: Ladder; label: string; account?: string; isConnected: boolean; disabled: boolean; risky?: boolean; blockedNote?: string; chainId: string; /** what the action pays in network fees on paper (tickets/0007 B) */ fee: FeeKind }) {
  const { setViewAs } = useApp()
  const { thread } = React.useContext(TicketCtx)
  const viewing = !!account && !isConnected
  // Solana actions open together with the positions read (docs/solana.md
  // "Sequencing" step 4): the deposit route already builds, but a deposit the
  // app cannot read back is money that vanishes from the user's book — so the
  // button waits for `SOL_POSITIONS_READY` and says so, rather than signing
  // into a blind spot.
  const solWait = isSvmChain(chainId) && !SOL_POSITIONS_READY
  if (!l.bundle) return (
    <div className="tsec cta">
      {l.paper && <PaperGas chainId={chainId} fee={fee} refused={!!l.err?.includes(NO_GAS)} />}
      {l.err && <div className="err">{l.err}</div>}
      {realTradingGated() && !l.paper ? <>
          {/* no beta access: a real ticket is the one thing behind the waitlist (tickets/0006) */}
          <div className="plain" style={{ marginBottom: 8 }}>Trading with a real wallet is in closed beta.</div>
          <button className="btn wide paper" onClick={openPaperSignIn}>Do it on paper instead</button>
          <button className="btn wide" style={{ marginTop: 8 }} onClick={() => openGate()}>Join the waitlist</button>
        </>
        : solWait ? <button className="btn wide" disabled>Transactions on Solana open shortly — browsing and tracking work today</button>
        : !account ? <><button className="btn wide pri" onClick={() => setViewAs(undefined)} disabled>Connect a wallet to continue</button><button className="btn wide paper" style={{ marginTop: 8 }} onClick={openPaperSignIn}>Or try it with paper money</button></>
        : viewing ? <button className="btn wide" disabled>Viewing {account.slice(0, 6)}… · connect to sign</button>
        : !l.isConnected ? <button className="btn wide" disabled>{isSvmChain(chainId) ? 'Connect a Solana wallet (Phantom, Solflare, Backpack) to sign' : 'Connect a wallet to sign'}</button>
        : l.paper ? <button className={`btn wide pri paperbtn ${risky ? 'risky' : ''}`} disabled={disabled || l.busy} onClick={() => l.start(label)}>{l.busy ? 'Applying on paper…' : blockedNote ?? `Confirm paper ${label.charAt(0).toLowerCase()}${label.slice(1)}${risky ? ' anyway' : ''}`}</button>
        : <button className={`btn wide pri ${risky ? 'risky' : ''}`} disabled={disabled || l.busy} onClick={() => l.start(label)}>{l.busy ? 'Building…' : blockedNote ?? (risky ? `${label} anyway` : label)}</button>}
      {!viewing && !l.paper && <SayWhy on={thread ?? null} />}
      {l.paper
        ? <div className="foot" style={{ marginTop: 8 }}><span className="pill paper">paper</span> Play money on real rates and real quotes. Nothing is signed or sent on chain.</div>
        : <div className="foot" style={{ marginTop: 8 }}>The API builds the exact calls (approvals, then the action); nothing is sent until you sign each one. Gas on {chainLabel(chainId)}.</div>}
    </div>
  )
  return (
    <div className="tsec cta">
      <span className="lbl">{l.paper ? 'Done on paper' : l.settled ? 'Done' : l.finished ? 'Updating your positions…' : l.signing ? 'Confirm in your wallet' : l.pending ? 'Waiting for the block…' : 'Sign in your wallet'}</span>
      <ol className="steps">{l.bundle.steps.map((st, i) => <StepRow key={i} st={st} n={i + 1} on={st === l.next} signing={l.signing && st === l.next} chainId={chainId} />)}</ol>
      {l.err && <div className="err" style={{ marginTop: 8 }}>{l.err}</div>}
      {l.finished && !l.paper && <SayWhy on={thread ?? null} done />}
      <div className="actions" style={{ marginTop: 12 }}>
        {l.finished ? <a className="btn wide pri" href="#/">{l.settled ? 'See your positions' : <><Spin sm /> Updating your positions…</>}</a>
          : <button className="btn wide pri" disabled={!!l.pending || l.switching || (l.signing && !l.remote)} onClick={l.signing ? l.reopen : l.sendNext}>{l.switching ? 'Switching…' : l.wrongChain ? `Switch wallet to ${chainLabel(chainId)}` : l.signing ? (l.remote ? 'Open your wallet to confirm' : 'Confirm in your wallet…') : l.pending ? <><Spin sm /> Waiting for the block…</> : `Send ${l.done + 1} of ${l.total}`}</button>}
        <button className="btn" onClick={l.reset} disabled={!!l.pending}>Reset</button>
      </div>
    </div>
  )
}
/**
 * Paper's network fee, said before it is refused (tickets/0007 B): the bank holds too little of the
 * chain's gas coin for this action, so — as on chain — it cannot happen. One tap opens *Get* with the
 * gas coin as the target; a bridge into it pays its own fee out of what it buys.
 */
function PaperGas({ chainId, fee, refused }: { chainId: string; fee: FeeKind; refused: boolean }) {
  const paper = usePaper()
  const [open, setOpen] = React.useState(false)
  const l = paper.ledger
  const coin = gasCoinOf(chainId)
  if (!paper.active || !l || !coin) return null
  const t = gasTokenOf(chainId), p = paper.price(chainId, t) ?? coin.refUsd
  // a transfer whose time is up has landed, settled or not: the next op settles it first
  const now = Date.now(), gasIn = l.inflight.filter((x) => x.toChainId === chainId && x.token === tokenKey(chainId, t))
  const held = balanceOf(l, chainId, t) + gasIn.filter((x) => x.arrivesAt <= now).reduce((a, x) => a + x.units, 0)
  const needUsd = networkFeeUsd(chainId, fee)
  if (!refused && held * p >= needUsd) return null
  const coming = gasIn.filter((x) => x.arrivesAt > now).reduce((a, x) => a + x.units, 0)
  const fmt = (x: number) => (x < 0.1 ? `$${x.toFixed(3)}` : usd(x))
  return (
    <div className="paper-card" style={{ margin: '0 0 10px' }}>
      <span className="t70" style={{ fontSize: 12.5 }}>This costs about {fmt(needUsd)} of {coin.symbol} in network fees on {chainLabel(chainId)}, and your paper bank holds {held > 0 ? `only ${num(held, 6)}` : 'none'}{coming > 0 ? ` (${num(coming, 6)} is still on its way)` : ''}. As on chain, nothing happens there without it.</span>
      <div className="actions"><button className="btn paper ghost sm" onClick={() => setOpen(true)}>Get {coin.symbol} on {chainLabel(chainId)}</button></div>
      {open && <GetAsset targets={[{ chainId, address: t, symbol: coin.symbol, decimals: coin.decimals, price: p, have: held }]} want={Math.max(5 * needUsd, 1) / p} sources={paper.idle(Object.keys(l.bank))} onClose={() => setOpen(false)} />}
    </div>
  )
}
/** One step of the ladder: its number (a spinner while its transaction is out), and where that transaction is. */
function StepRow({ st, n, on, signing, chainId }: { st: Step; n: number; on: boolean; signing: boolean; chainId: string }) {
  const t = useTrace(st.hash)
  const flying = !!t && !isDone(t)
  return (
    <li className={st.done ? 'done' : on ? 'on' : ''}>
      <i>{st.done && !flying ? '✓' : flying || signing ? <Spin sm /> : n}</i>
      <span className="sl">{st.label}{signing ? <small>Confirm in your wallet</small> : <TxNote t={t} />}</span>
      {st.hash && <TxLink chainId={chainId} hash={t?.hash ?? st.hash} label={`${(t?.hash ?? st.hash).slice(0, 10)}…`} />}
    </li>
  )
}

type Route = NonNullable<NonNullable<ReturnType<typeof useLoopQuote>['q']['data']>['data']>['quotes'][number]
/**
 * The loop's swap route: the one it runs on, in one row; the others the API found sit behind the
 * settings button next to it (`RouteChooser`), best first.
 */
function RoutePick({ routes, sel, debt, holds, onPick }: { routes: Route[]; sel: number; debt: string; holds: string; onPick: (i: number, name: string) => void }) {
  const top = routes[0].deltas?.tradeOutput || 1
  const rows = routes.map((r, i) => {
    const o = r.deltas?.tradeOutput ?? 0, inp = r.deltas?.tradeInput ?? 0, d = (o / top - 1) * 1e4, name = r.deltas?.aggregator ?? `route ${i + 1}`
    return {
      body: <>
        <span className="rn"><b>{name}</b>{inp > 0 && <small>for {num(inp, inp > 100 ? 0 : 2)} {debt}</small>}</span>
        <span className="rbar"><i style={{ width: `${Math.max(3, Math.min(100, (o / top) * 100))}%` }} /></span>
        <span className="ro"><b>{num(o, o > 100 ? 0 : 4)} {holds}</b><small className={i === 0 ? 'ok' : d < -20 ? 'warn' : ''}>{i === 0 ? 'best' : `${d > 0 ? '+' : '−'}${Math.abs(d) >= 100 ? (Math.abs(d) / 100).toFixed(1) + '%' : Math.abs(d).toFixed(0) + ' bp'}`}</small></span>
      </>,
      title: `${name} swaps the ${num(inp, 2)} ${debt} the loop borrows into ${num(o, 2)} ${holds}${r.economics ? ` · entry cost ${usd(r.economics.entryCostUsd.total)}` : ''}`,
    }
  })
  return <RouteChooser rows={rows} sel={sel} ariaLabel="Swap route" onPick={(i) => onPick(i, routes[i].deltas?.aggregator ?? `route ${i + 1}`)}
    label={<>{routes.length === 1 ? 'Swap route · the one found' : `Swap route · ${routes.length} found`} <Info label="The swap inside the loop">The loop borrows {debt} and swaps it into {holds} inside the same transaction. The API asks every aggregator it knows and picks the one that returns the most {holds}; the button next to it lists the others, and the loop runs on the one you choose.</Info></>} />
}
