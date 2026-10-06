import React from 'react'
import { nameOf, unitOf } from '../model/assets'
import { DEFAULT_TIER, TIERS, borrowAtSize, curveRateNow, customRange, healthAt, liqBuffer, netAprAtLeverage, toRaw, type TierId } from '../model/leverage'
import { dateOf, exitTerms, type LoopStrategy, type LoopTerm, type SimpleStrategy, type Strategy } from '../model/strategies'
import { isSvmTx, type LoopActions } from '../sdk/types'
import { isNativeAddress, nativeDecimals, nativeSymbol, wrapsNative, type Holding, type Idle } from '../model/positions'
import { earnDeposit, earnWithdraw, loopClose, loopOpen, ZERO } from '../sdk/api'
import { chainLabel, SOL_POSITIONS_READY, useCloseQuote, useIrm, useLoopPayAssets, useLoopQuote, useRateHistory } from '../sdk/queries'
import { seriesFor } from '../model/rateHistory'
import { RateHistoryPanel, useSparkRewards } from './Spark'
import { useApp, type Mode } from '../state/AppState'
import { useSticky } from '../state/sticky'
import { useSettings } from '../state/Settings'
import { DecimalInput, Info, KindPill, LegsPill, RiskDot, Sk, StratMark, Tok, Toks, TxLink, num, pct, usd, usdShort } from './bits'
import { Who } from './social-bits'
import { isSvmChain, normAddr } from '../model/address'
import { useProfiles } from '../social/queries'
import { stepsFrom, useLadder, type Ladder, type Step } from './useLadder'
import { isDone, useTrace } from '../sdk/txTrace'
import { Spin, TxNote } from './TxTray'
import { GetAsset, type Target } from './GetAsset'
import { IrmLink } from './Irm'
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
const TicketCtx = React.createContext<{ uid: string | null; thread?: ThreadRef | null; copy?: string }>({ uid: null })

/** The ticket: what you do in plain words, amount (+ leverage), the numbers, what can go wrong, one button. */
export function Ticket({ s, idle, holding, mode: mode0, copy, offMenu, talk, onClose }: { s: Strategy; idle: Idle[]; holding: Holding | null; mode?: Mode; copy?: string; offMenu?: string; talk?: boolean; onClose: () => void }) {
  const [mode, setMode] = React.useState<Mode>(holding ? mode0 ?? 'add' : 'add')
  const uid = uidOf(s)
  const thread = useThreadOf()(s)
  return (
    <TicketCtx.Provider value={{ uid, thread, copy }}>
    <div className="ticket">
      <div className="grab" />
      <div className="th">{s.kind === 'loop' ? <Toks a={s.holds} b={s.debt} logoA={s.logoLong} logoB={s.logoShort} /> : <StratMark sym={s.holds} logo={s.logo} venueKey={s.protocolKey} brand={s.brand} size={26} />}
        <div style={{ flex: 1, minWidth: 0 }}><div className="n">{s.kind === 'loop' ? `${s.holds} / ${s.debt} loop` : s.holds} <Info label="How this strategy works">{s.kind === 'loop' ? <>Deposit <b>{s.holds}</b>, borrow <b>{s.debt}</b> against it, swap the {s.debt} into more {s.holds}, repeat. One transaction does all of it. You earn the {s.holds} rate on the whole position and pay the {s.debt} rate on the borrowed part{s.terms ? <>, fixed for the term you pick</> : ''}.{s.desk ? <> Your exposure is <b>{nameOf(s.asset)}</b>{s.instrument ? <> (through {s.instrument})</> : ''}: a dollar debt cannot depeg upward, so {s.debt} is a rate you pay, not a risk you hold.</> : ''}{!isSavings(s.nature) ? <> This is not a carry: you owe {s.debt} and hold <b>{s.holds}</b>, whose price moves on its own, so the leverage multiplies that move as well as the rate.</> : ''}</> : <SimpleWords s={s} />}{!isSavings(s.nature) && <p style={{ margin: '8px 0 0' }}><b>Not a saving · {NATURES[s.nature].word}.</b> {NATURES[s.nature].why}</p>}</Info></div><div className="s">{nameOf(s.asset)} strategy · {s.kind === 'loop' ? `${s.venue}${s.terms ? ' · fixed rate' : ''}` : s.via} · {chainLabel(s.chainId)}</div><TicketAssetLinks s={s} /></div>
        <KindPill kind={s.kind} source={s.kind === 'simple' ? s.source : undefined} />{holding && <LegsPill others={holding.others} />}<button className="x" onClick={onClose} aria-label="Close">✕</button></div>
      {holding && (
        <div className="tsec"><div className="modes" role="tablist" aria-label="Manage">
          <button role="tab" aria-selected={mode === 'add'} onClick={() => setMode('add')}>Add</button>
          <button role="tab" aria-selected={mode !== 'add'} onClick={() => setMode(s.kind === 'loop' ? 'manage' : 'reduce')}>{s.kind === 'loop' ? 'Manage' : 'Withdraw'}</button>
          <span className="sp" /><span className="sum">{usd(holding.valueUsd)}{s.kind === 'loop' && holding.leverage && holding.leverage > 1.05 ? ` · ${holding.leverage.toFixed(1)}×` : ''}{holding.health != null ? ` · health ${holding.health.toFixed(2)}` : ''}</span>
        </div></div>
      )}
      {copy && <CopyBanner who={copy} s={s} />}
      {offMenu && (
        <div className="tsec offmenu" role="note">
          <b>Not in the menu.</b> {offMenu} Check the liquidity, rate and risk yourself before you size it.
        </div>
      )}
      {holding && mode !== 'add' ? (s.kind === 'loop' ? <ManageLoop s={s} h={holding} closeFirst={mode === 'close'} /> : <ManageTicket s={s} h={holding} mode={mode} />)
        : s.kind === 'simple' ? <SimpleTicket s={s} idle={idle.filter((i) => i.chainId === s.chainId)} allIdle={idle} /> : <LoopTicket s={s} idle={idle.filter((i) => i.chainId === s.chainId)} allIdle={idle} holding={holding} />}
      <TicketSocial uid={uid} thread={thread} s={s} focus={talk} />
    </div>
    </TicketCtx.Provider>
  )
}

/** The token(s) behind the strategy, each a way to its asset page: what it is, before what to do with it. */
function TicketAssetLinks({ s }: { s: Strategy }) {
  const legs = s.kind === 'loop'
    ? [{ g: s.assetGroup, sym: s.holds, logo: s.logoLong }, { g: s.debtGroup, sym: s.debt, logo: s.logoShort }]
    : [{ g: s.shareGroup, sym: s.shareGroup ?? '', logo: s.shareLogo ?? s.logo }, { g: s.assetGroup, sym: s.assetSymbol, logo: s.tokenLogo }]
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
        <KindPill kind={h.kind} /><LegsPill others={h.others} /><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
      <div className="tsec"><div className="modes"><span className="t50" style={{ fontSize: 12 }}>Not in the menu — you can {h.kind === 'loop' ? 'deleverage or close' : 'withdraw from'} it here.</span>
        <span className="sp" /><span className="sum">{usd(h.valueUsd)}{h.kind === 'loop' && h.leverage && h.leverage > 1.05 ? ` · ${h.leverage.toFixed(1)}×` : ''}{h.health != null ? ` · health ${h.health.toFixed(2)}` : ''}</span></div></div>
      {h.kind === 'loop' ? <ManageLoop s={null} h={h} /> : <ManageTicket s={null} h={h} mode="reduce" />}
    </div>
    </TicketCtx.Provider>
  )
}

/**
 * Copying is the same strategy and the same leverage tier at YOUR size —
 * never a mirror of someone else's amount, which would be a promise about a
 * balance sheet this app cannot see.
 */
function CopyBanner({ who, s }: { who: string; s: Strategy }) {
  const { profile } = useProfiles([who])
  return (
    <div className="tsec copy">
      <Who account={who} profile={profile(who)} size={24} />
      <span className="t70">is in this {s.kind === 'loop' ? 'loop' : 'strategy'}. You are opening the same one — your own size.</span>
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
  fixed: 'You buy a principal token at a discount. At maturity it redeems for exactly one unit of the underlying, which locks the yield in today. Selling before maturity gets the market price.',
  vault: 'You deposit into a curated vault that allocates across lending markets. You hold vault shares that grow in value.',
}
/**
 * What a plain deposit can be paid with: the market's own token, and — into a row whose token is
 * the chain's wrapped gas coin — the gas coin itself, which the API wraps inside the deposit when
 * asked with `payAsset` = {@link ZERO}. Leaving `payAsset` out asks for the ERC-20: an approve of
 * WHYPE and a deposit that reverts for a wallet holding HYPE. Native first, so a wallet holding
 * neither is offered the coin it is likelier to get.
 */
/**
 * An idle row against a pay option. The option spells the gas coin `ZERO` (what the API takes), the
 * Solana balance row spells it `1111…1111` (the System Program id) — so SOL read 0 in the chips.
 */
const sameToken = (held: string, want: string) => held === want || (isNativeAddress(held) && isNativeAddress(want))
type PayRole = 'native' | 'token'
interface PayOption { role: PayRole; address: string; symbol: string; decimals: number }
function payOptions(s: SimpleStrategy): PayOption[] {
  const token: PayOption = { role: 'token', address: normAddr(s.assetAddress), symbol: s.assetSymbol, decimals: s.decimals }
  const native = s.nativeIn ?? (wrapsNative(s.chainId, s.assetAddress) && !startsAny(s.venueKey, NO_NATIVE_DEPOSIT))
  return native ? [{ role: 'native', address: ZERO, symbol: nativeSymbol(s.chainId), decimals: nativeDecimals(s.chainId) }, token] : [token]
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
function SimpleTicket({ s, idle: chainIdle, allIdle }: { s: SimpleStrategy; idle: Idle[]; allIdle: Idle[] }) {
  const { account, isConnected, solSigner } = useApp()
  // who the API builds for: the VM's own signer — a Solana row is built for the Solana wallet
  const actor = isSvmChain(s.chainId) ? solSigner : account
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
  const [amount, setAmount] = useSticky<number>(`t:${s.id}:amount`, () => (unit === '$' ? 1000 : Math.min(idle?.amount ?? 1, 1)))
  const amtUsd = amount * price
  const yearly = amtUsd * s.rate / 100
  const key = [s.id, amount, chosen.role, account ?? ''].join('|')
  const ladder = useLadder(key, s.chainId, async () => {
    const env = await earnDeposit({ earnUid: s.earnUid, amountRaw: toRaw(amount, chosen.decimals), operator: actor!, payAsset: chosen.role === 'native' ? ZERO : undefined })
    if (chosen.role === 'native' && !paysNative(env.actions)) throw new Error(`${s.brand} does not take ${chosen.symbol} directly here. Pay with ${s.assetSymbol}.`)
    return stepsFrom(env.actions, s.via, s.chainId)
  }, [s.earnUid, s.marketUid])
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
        <AmountBox unit={unit} value={amount} onChange={setAmount} onMax={idle ? () => setAmount(idle.amount) : undefined} />
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
      <Action ladder={ladder} label={`${s.source === 'lending' ? 'Deposit' : s.source === 'staking' ? 'Stake' : s.source === 'fixed' ? 'Buy' : 'Deposit'} · ${unit === '$' ? usd(amtUsd) : `${num(amount, 4)} ${chosen.symbol}`}`} account={account} isConnected={isConnected} disabled={!(amount > 0)} chainId={s.chainId} />
    </>
  )
}

/**
 * What this rate has been over the month, under the headline that quotes it
 * today — the one place with room for the whole line. A loop's line is drawn at
 * the ticket's own leverage, so it moves with the tier and the slider. Absent
 * (no section at all) when the history has nothing for the row.
 */
function HistorySec({ s, L, now }: { s: Strategy; L?: number; now: number }) {
  const get = useRateHistory(React.useMemo(() => [s], [s.id]))
  const [withRewards] = useSparkRewards()
  if (!seriesFor(s, get, withRewards, L)) return null
  return <div className="tsec"><RateHistoryPanel s={s} get={get} L={L} now={now} /></div>
}

/**
 * The borrow rate at THIS ticket's size, off the debt market's own curve. The
 * list quotes every loop at $10k, and on a thin market that one quote can be
 * the whole free liquidity — shMON/WMON on Euler read 35 % against a 6 % spot.
 * While the curve loads the spot rate stands in; a market with no curve keeps
 * the $10k quote.
 */
function useBorrowAt(s: LoopStrategy | null, term?: LoopTerm) {
  const irm = useIrm(s?.marketShortUid, !!s)
  // a fixed term costs its card rate at any size: the curve is where the debt goes AFTER the term
  return (extraDebtUsd: number) => (!s ? 0 : term ? term.apr : s.terms ? s.borSpot : irm.isPending ? s.borSpot : borrowAtSize(s.borSpot, s.bor, extraDebtUsd, irm.data))
}
/**
 * The term a fixed-rate loop opens with before anyone picks: the cheapest, and the longest of equals —
 * slisBNB/WBNB charges 0.5 % for 7, 14 and 30 days alike, and a shorter lock of the same rate only
 * moves the day the debt drops to the variable rate closer.
 */
const defaultTerm = (ts: LoopTerm[]) => [...ts].sort((a, b) => a.apr - b.apr || b.days - a.days)[0]
const dayOf = (days: number) => new Date(Date.now() + days * 86400_000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function LoopTicket({ s, idle, allIdle, holding }: { s: LoopStrategy; idle: Idle[]; allIdle: Idle[]; holding: Holding | null }) {
  const { account, isConnected, solSigner } = useApp()
  const slip = useSettings().st.loopSlippageBp
  const actor = isSvmChain(s.chainId) ? solSigner : account
  const [getOpen, setGetOpen] = React.useState(false)
  const unit = unitOf(s.asset)
  // pay with the collateral or the debt token, whichever the venue accepts and the wallet holds more of
  const pay = useLoopPayAssets(s)
  const opts = React.useMemo(() => {
    const coll = { role: 'collateral' as const, symbol: s.holds, address: s.collateralAddress, decimals: s.decimalsLong, price: s.priceLong ?? 0, logo: s.logoLong }
    const debt = { role: 'debt' as const, symbol: s.debt, address: s.debtAddress, decimals: s.decimalsShort, price: s.priceShort ?? 0, logo: s.logoShort }
    const list = pay.data ? pay.data.payAssets.map((a) => a.role === 'collateral' ? { ...coll, address: a.address || coll.address } : a.role === 'debt' ? { ...debt, address: a.address || debt.address } : { ...(a.wrapsRole === 'debt' ? debt : coll), role: 'native' as const, address: ZERO, symbol: a.symbol || 'ETH', logo: a.logoURI }) : [coll, debt]
    return list
  }, [pay.data, s.id])
  // the pay-with chips read the exact token: native is the zero address in the balances (and the API), wrapped is its own entry
  const balOf = (address: string, _symbol: string) => idle.find((i) => sameToken(i.address, normAddr(address)))
  const [role, setRole] = useSticky<'collateral' | 'debt' | 'native' | null>(`t:${s.id}:role`, null)
  const chosen = opts.find((o) => o.role === role) ?? [...opts].sort((a, b) => (balOf(b.address, b.symbol)?.usd ?? 0) - (balOf(a.address, a.symbol)?.usd ?? 0))[0]
  const bal = chosen ? balOf(chosen.address, chosen.symbol) : undefined
  const price = chosen?.price || bal?.price || (unit === '$' ? 1 : 0)
  const [amount, setAmount] = useSticky<number>(`t:${s.id}:amount`, () => (unit === '$' ? 1000 : 1))
  const [tier, setTier] = useSticky<TierId>(`t:${s.id}:tier`, isSavings(s.nature) ? DEFAULT_TIER : 'defensive')
  // a number of your own is behind the slider icon, never the default: the tiers are the advice,
  // the slider is for someone who already knows the number they want. `null` = on the tiers
  const [custom, setCustom] = useSticky<number | null>(`t:${s.id}:lev`, null)
  const [lo, hi] = customRange(s.maxLev), canCustom = hi > lo + 0.05
  const L = custom != null && canCustom ? Math.min(hi, Math.max(lo, custom)) : s.tiers[tier]
  const E = amount * price, C = E * L, D = E * (L - 1)
  // a fixed-rate loop borrows for one term off the broker's card; `undefined` on a float loop
  const [termId, setTermId] = useSticky<string | null>(`t:${s.id}:term`, null)
  const term = s.terms ? s.terms.find((t) => t.id === termId) ?? defaultTerm(s.terms) : undefined
  const borAt = useBorrowAt(s, term)
  const dep = s.depSpot, bor = borAt(D)
  const net = netAprAtLeverage(dep, bor, L), drop = liqBuffer(s.liqLtv, L), hf = healthAt(s.liqLtv, L)
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
  const netC = netAprAtLeverage(dep, bor, Lc), hfC = healthAt(s.liqLtv, Lc)
  const q = useLoopQuote(s, E, L, account, slip, term?.id)
  const econ = q.data?.data?.economics ?? q.data?.data?.quotes?.[0]?.economics ?? null
  // the quote's carry prices a broker debt at the market's variable rate, not the term's (API gap,
  // 2026-09-29): on a fixed loop only its entry cost is kept, and the payback is this ticket's own
  const payback = !econ ? null : term ? (net > 0 && E > 0 && econ.entryCostUsd.total > 0 ? econ.entryCostUsd.total / (E * net / 100 / 365) : null) : econ.breakEvenDays.total
  const simHf = q.data?.data?.simulation?.post?.healthFactor
  // answered, but with no route: the build would come back with nothing but an approval
  const noRoute = !!q.data && !hasRoute(q.data.data)
  const yearly = E * net / 100
  const key = [s.id, amount, L, term?.id ?? '', chosen?.role ?? '', account ?? ''].join('|')
  const ladder = useLadder(key, s.chainId, async () => {
    const debtTokens = s.priceShort ? D / s.priceShort : 0
    const env = await loopOpen({
      collateralMarketUid: s.marketLongUid, debtMarketUid: s.marketShortUid, debtAmountRaw: toRaw(debtTokens, s.decimalsShort), slippageBp: slip, leverage: L, account: actor!,
      payAsset: chosen ? (chosen.role === 'native' ? ZERO : chosen.address) : undefined, payAmountRaw: chosen ? toRaw(amount, chosen.decimals) : undefined, termId: term?.id,
    })
    if (!hasRoute(env.data)) throw new Error(NO_ROUTE)
    if (chosen?.role === 'native' && !paysNative(env.actions)) throw new Error(`This loop does not take ${chosen.symbol} directly. Pay with another asset.`)
    return stepsFrom(env.actions, `Open ${num(L, 2)}× loop${term ? ` · ${term.days}-day fixed` : ''}`, s.chainId)
  }, [s.marketLongUid, s.marketShortUid])
  const more = !!bal && amount > bal.amount
  return (
    <>
      <div className="tsec">
        <span className="lbl">You pay with <Info label="Paying for a loop">The margin can be paid in {opts.map((o) => o.symbol).join(' or ')}: whatever the venue accepts. Paid in {s.debt}, it is swapped into {s.holds} inside the same transaction.</Info></span>
        <div className="seg" style={{ marginBottom: 10 }}>{opts.map((o) => <button key={o.role} aria-pressed={chosen?.role === o.role} onClick={() => setRole(o.role)}><Tok sym={o.symbol} logo={o.logo} size={16} /> {o.symbol}<span className="c" style={{ marginLeft: 6 }}>{account ? (balOf(o.address, o.symbol) ? num(balOf(o.address, o.symbol)!.amount, 2) : '0') : ''}</span></button>)}</div>
        <AmountBox unit={chosen?.symbol ?? unit} value={amount} onChange={setAmount} onMax={bal ? () => setAmount(bal.amount) : undefined} />
        <div className="amt-sub"><span>≈ {usd(E)} equity</span><span>{account ? <>Idle: {bal ? `${num(bal.amount, 4)} ${chosen?.symbol}` : `0 ${chosen?.symbol ?? ''}`}{more && <span className="warn"> · more than idle</span>}</> : 'connect to see your balance'}</span></div>
        {holding && <LegsNote h={holding} holds={s.holds} debt={s.debt} adding />}
        {chosen && <GetLine account={account} short={!bal || more} symbol={chosen.symbol} open={getOpen} onOpen={() => setGetOpen(true)} />}
        {getOpen && chosen && <GetAsset targets={getForms(opts, chosen, s.chainId).map((o) => ({ chainId: s.chainId, address: o.address, symbol: o.symbol, decimals: o.decimals, price: o.price || price || 1, logo: o.logo, have: balOf(o.address, o.symbol)?.amount ?? 0 }))} want={amount} sources={allIdle}
          onTarget={(t) => setRole(opts.find((o) => normAddr(o.address) === normAddr(t.address))?.role ?? null)} onClose={() => setGetOpen(false)} />}
        {s.terms && term && <>
          <span className="lbl" style={{ marginTop: 14 }}>Fix the {s.debt} rate for <Info label="Fixed-rate borrowing">
            <p style={{ margin: '0 0 6px' }}>{s.venue} lends {s.debt} here at a rate it sets for each term, the same at any size. The rate you pick is locked from today until the term ends.</p>
            <p style={{ margin: '0 0 6px' }}>When it ends the debt is not due and nothing is liquidated for it: the loan moves to the market's variable rate{after != null ? <> ({pct(after)} now)</> : ''} until you fix it again.</p>
            <p style={{ margin: 0 }}>Repaying before the end (closing or deleveraging) costs a penalty of about half the interest the repaid part would still pay.</p></Info></span>
          <div className="seg" role="radiogroup" aria-label="Fixed term">{s.terms.map((t) => <button key={t.id} role="radio" aria-checked={t.id === term.id} aria-pressed={t.id === term.id} onClick={() => setTermId(t.id)}>{t.days} days<span className="c" style={{ marginLeft: 6 }}>{pct(t.apr)}</span></button>)}</div>
        </>}
        <span className="lbl" style={{ marginTop: 14 }}>How hard to push it <Info label="Leverage tiers">{TIERS.map((t) => <p key={t.id} style={{ margin: '0 0 6px' }}><b>{t.name}</b> · {t.blurb}</p>)}<p style={{ margin: '0 0 6px' }}>This venue allows up to {num(s.maxLev, 1)}×. At {num(L, 2)}× the collateral can fall <b>{pct(drop * 100, 1)}</b> against the debt before liquidation.</p>{canCustom && <p style={{ margin: 0 }}>The slider icon swaps the tiers for a leverage of your own, up to {num(hi, 2)}×.</p>}</Info>
          {canCustom && <button type="button" className="levtoggle" aria-pressed={custom != null} aria-label={custom != null ? 'Back to the tiers' : 'Set my own leverage'} title={custom != null ? 'Back to the tiers' : 'Set my own leverage'} onClick={() => setCustom(custom != null ? null : L)}>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="18" r="2" /></svg>
          </button>}</span>
        {custom != null && canCustom ? <>
          <div className="levr"><input type="range" min={lo} max={hi} step={0.01} value={L} onChange={(e) => setCustom(parseFloat(e.target.value))} aria-label="Leverage" /><span className={`v ${drop < 0.05 ? 'bad' : drop < 0.1 ? 'warn' : ''}`}>{num(L, 2)}×</span></div>
          <div className="snaps">{TIERS.map((t) => <button key={t.id} className={`pctb ${Math.abs(L - s.tiers[t.id]) < 0.02 ? 'on' : ''}`} onClick={() => setCustom(s.tiers[t.id])}>{t.name} {num(s.tiers[t.id], 1)}×</button>)}</div>
        </> : <div className="tiers" role="radiogroup" aria-label="Leverage tier">{TIERS.map((t) => { const l = s.tiers[t.id]; const n = netAprAtLeverage(dep, borAt(E * (l - 1)), l); const d = liqBuffer(s.liqLtv, l); return (
          <button key={t.id} className={`tier ${t.id}`} role="radio" aria-checked={tier === t.id} onClick={() => setTier(t.id)}>
            <span className="tn">{t.name}</span>
            <span className={`tr ${n >= 3 ? 'ok' : n < 0 ? 'bad' : ''}`}>{pct(n)}</span>
            <span className={`tl ${d < 0.05 ? 'bad' : d < 0.1 ? 'warn' : ''}`} title={`${num(l, 2)}× leverage · liquidated if the collateral falls ${pct(d * 100, 1)} against the debt`}>{num(l, 2)}× · −{pct(d * 100, d < 0.1 ? 1 : 0)}</span>
          </button>) })}</div>}

      </div>
      <div className="tsec"><div className="cells">
        <div className="c hero"><span className="k">Net yield</span><span className={`v ${net >= 3 ? 'ok' : net < 0 ? 'bad' : ''}`}>{pct(net)}</span><span className="s">earn {pct(dep)} on {num(L, 1)}× · pay {pct(bor)} on {num(L - 1, 1)}×{term ? ` fixed to ${ends}` : Math.abs(bor - s.borSpot) >= 0.05 ? ` (${pct(s.borSpot)} now)` : ''}</span></div>
        {Eh > 0 && <div className="c"><span className="k">Your loop after</span><span className={`v ${netC >= 3 ? 'ok' : netC < 0 ? 'bad' : ''}`}>{pct(netC)}</span><span className="s">{num(Lh, 2)}× → {num(Lc, 2)}× · health {hfC.toFixed(2)}</span></div>}
        <div className="c"><span className="k">Per year</span><span className="v">{usd(yearly)}</span><span className="s">vs {usd(E * dep / 100)} unlevered</span></div>
        {term ? <div className="c"><span className="k">After {ends}</span><span className={`v ${netAfter == null ? '' : netAfter < 0 ? 'bad' : netAfter < 1 ? 'warn' : ''}`}>{pct(netAfter)}</span><span className="s">{after != null ? `if not re-fixed · variable ${pct(after)} now` : 'if not re-fixed · variable rate'}</span></div>
          : <div className="c"><span className="k">If borrow +2%</span><span className={`v ${netWorst < 0 ? 'bad' : netWorst < 1 ? 'warn' : ''}`}>{pct(netWorst)}</span><span className="s">rate sensitivity</span></div>}
        {/* a loop is two markets, so it gets two curves: the one that pays you
            and the one that charges you. The borrow leg is the one that ends
            loops — the "If borrow +2%" cell above says how much it would hurt,
            the curve says how close the market is to doing it. */}
        <div className="c"><span className="k">You hold</span><span className="v">{usd(C)}</span><span className="s">{s.holds} on {s.venue}</span><IrmLink uid={s.marketLongUid} side="supply" label="supply curve" rewards={s.rewardsLong} /></div>
        <div className="c"><span className="k">You owe</span><span className="v">{usd(D)}</span><span className="s">{s.debt} · {term ? `fixed ${pct(term.apr)} for ${term.days} days` : 'floating'} · {usdShort(s.borrowLiquidityUsd)} to borrow</span><IrmLink uid={s.marketShortUid} side="borrow" label={term ? 'rate after the term' : 'borrow curve'} rewards={s.rewardsShort} /></div>
        <div className="c"><span className="k">Entry cost</span><span className="v">{q.isFetching && !econ ? <Sk w={60} h={14} /> : econ ? usd(econ.entryCostUsd.total) : '—'}</span><span className="s">{econ ? `${payback != null ? `earned back in ${Math.ceil(payback)} days` : 'slippage, fees, gas'} · max slippage ${slip / 100}%` : noRoute ? 'no route at this size' : q.error ? 'no quote at this size' : 'quoting the route…'}</span></div>
        <div className="c"><span className="k">Health</span><span className={`v ${(simHf ?? hf) < 1.1 ? 'bad' : (simHf ?? hf) < 1.25 ? 'warn' : 'ok'}`}>{(simHf ?? hf).toFixed(2)}</span><span className="s">{simHf ? 'simulated by the API' : 'from the liquidation threshold'}</span></div>
      </div>
        <span className="lbl" style={{ marginTop: 14 }}>Liquidation</span>
        <div className="plain">Liquidated if <b>{s.holds}</b> falls <b>{pct(drop * 100, 1)}</b> against <b>{s.debt}</b>.</div>
        <div className="liqbar"><i style={{ ['--x' as string]: `${Math.min(98, Math.max(2, drop / 0.25 * 100))}%` }} /></div>
        <div className="liqcap"><span>0% buffer</span><span>{drop < 0.03 ? 'very tight' : drop < 0.06 ? 'tight' : drop < 0.12 ? 'comfortable' : 'wide'}</span><span>25%</span></div>
      </div>
      {!term && <HistorySec s={s} L={L} now={net} />}
      <div className="tsec"><span className="lbl">What can go wrong</span><ul className="risks">
        {overLiquidity && <li className="w"><i /><span>This borrows {usd(D)} of {s.debt}, more than the {usdShort(s.borrowLiquidityUsd)} the market has free: the rate is at the top of its curve and the transaction may not go through.</span></li>}
        {term ? <>
          <li className="w"><i /><span>The {pct(term.apr)} is fixed until {ends}. After that the debt pays the variable rate{after != null ? ` (${pct(after)} now, which would make the loop ${pct(netAfter)})` : ''} until you fix it again.</span></li>
          <li className="w"><i /><span>Closing or deleveraging before {ends} costs a penalty: about half the interest the repaid part would still pay.</span></li>
          {!!holding && <li><i /><span>This opens a second loan beside the one you hold, on the same collateral. Each has its own term and is repaid on its own.</span></li>}
        </> : <li className="w"><i /><span>Net yield goes negative if the {s.debt} borrow rate rises above the {s.holds} rate.</span></li>}
        {isSavings(s.nature) ? <li className="w"><i /><span>Liquidation if {s.holds} trades at a discount to {s.debt}.</span></li>
          : <li className="w"><i /><span>Not a saving ({NATURES[s.nature].word}): {s.holds} is priced on its own and {s.debt} is not, so a {pct(drop * 100, 1)} fall in {s.holds} liquidates — at {num(L, 2)}× every move is {num(L, 2)} times bigger. {NATURES[s.nature].why}</span></li>}
        {s.expiry && <li><i /><span>The collateral matures on {dateOf(s.expiry)}; the position must be closed or rolled.</span></li>}
        {s.rewardsLong + s.rewardsShort > 0.05 && <li><i /><span>Part of the rate is incentives that can stop without notice.</span></li>}
      </ul></div>
      {noRoute && <div className="err" style={{ margin: '0 0 10px' }}>{NO_ROUTE}</div>}
      <Action ladder={ladder} label={`Open ${TIERS.find((t) => t.id === tier)!.name.toLowerCase()} loop · ${num(L, 2)}×${term ? ` · ${term.days}-day fixed` : ''} · ${usd(E)}`} account={account} isConnected={isConnected} disabled={!(amount > 0) || !chosen || noRoute} chainId={s.chainId} />
    </>
  )
}

/** Withdraw from a deposit the wallet already holds. `s` is null for a position the menu has no row for. */
function ManageTicket({ s, h, mode }: { s: SimpleStrategy | null; h: Holding; mode: Mode }) {
  const { account, isConnected, solSigner } = useApp()
  const actor = isSvmChain(h.chainId) ? solSigner : account
  const all = mode === 'close'
  const [amount, setAmount] = useSticky<number>(`t:${h.key}:withdraw`, () => +(h.amount / 2).toFixed(6))
  const eff = all ? h.amount : Math.min(amount, h.amount)
  const share = h.amount > 0 ? eff / h.amount : 0
  // out of a wrapped-native row the gas coin is one tap away (`receiveAsset` = ZERO, unwrapped in the
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
  const key = [s?.id ?? h.key, mode, eff, native ? 'native' : 'token', account ?? ''].join('|')
  const rate = s?.rate ?? h.apr
  const ladder = useLadder(key, h.chainId, async () => {
    const env = await earnWithdraw({ earnUid: s?.earnUid ?? h.earnUid!, amountRaw: all && h.amountRaw ? h.amountRaw : toRaw(eff, h.decimals), operator: actor!, isAll: fullExit, receiveAsset: native ? ZERO : undefined })
    return stepsFrom(env.actions, 'Withdraw', h.chainId)
  }, [s?.earnUid, h.earnUid])
  const price = h.amount > 0 ? h.valueUsd / h.amount : 0
  const exit = s && exitTerms(s)
  return (
    <>
      <div className="tsec">
        <span className="lbl">Amount to withdraw (of {num(h.amount, 4)} {h.symbol})</span>
        <div className="amt"><DecimalInput value={amount} onChange={setAmount} ariaLabel="Amount" /><span className="u">{h.symbol}</span><button className="max" onClick={() => setAmount(h.amount)}>Max</button></div>
        <div className="amt-sub"><span>≈ {usd(eff * price)}{amount > h.amount + 1e-9 && <span className="warn"> · more than you hold</span>}</span><span>{[25, 50, 75, 100].map((p) => <button key={p} className="pctb" onClick={() => setAmount(+(h.amount * p / 100).toFixed(6))}>{p}%</button>)}</span></div>
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
      <Action ladder={ladder} label={`Withdraw · ${num(eff, 4)} ${h.symbol}`} account={account} isConnected={isConnected} disabled={!(eff > 0)} chainId={h.chainId} />
    </>
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
  const { account, isConnected, solSigner } = useApp()
  const slip = useSettings().st.loopSlippageBp
  const actor = isSvmChain(h.chainId) ? solSigner : account
  const holds = s?.holds ?? h.symbol, debt = s?.debt ?? h.debtSymbol ?? 'debt'
  // the book as the API reports it: equity and leverage from the position, prices only to size the legs in tokens
  const E = Math.max(h.valueUsd, 0.01)
  const Lnow = Math.max(1, h.leverage && h.leverage > 1 ? h.leverage : s?.priceLong ? (h.amount * s.priceLong) / E : 1)
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
  const [L0, setL] = React.useState<number>(() => (closeFirst ? 1 : +Lnow.toFixed(2)))
  const L = Math.max(minL, L0)
  const same = Math.abs(L - Lnow) < 0.02
  const closing = L <= 1.001
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
  const otherColl = (h.others ?? []).filter((o) => o.side === 'collateral'), otherUsd = otherColl.reduce((t, o) => t + o.usd, 0)
  const sameToken = holds === debt
  const [recv, setRecv] = useSticky<'debt' | 'collateral'>(`t:${h.key}:recv`, 'debt')
  const keep = closing && !sameToken && recv === 'collateral'
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
  const key = [s?.id ?? h.key, 'manage', L, keep ? 'keep' : 'sell', account ?? ''].join('|')
  const ladder = useLadder(key, h.chainId, async () => {
    if (down || !s) {
      const amountRaw = closing && !keep ? allRaw : toRaw(closing ? sellKeep! : sellTok, h.decimals)
      const env = await loopClose({ collateralMarketUid: collUid, debtMarketUid: debtUid, amountRaw, slippageBp: slip, isAll: closing, account: actor!, accountId: h.accountId, loanId: loan?.id })
      if (!hasRoute(env.data)) throw new Error(NO_ROUTE)
      return stepsFrom(env.actions, closing ? `Close the loop · receive ${keep ? holds : debt}` : `Deleverage to ${num(L, 2)}×`, h.chainId)
    }
    // a pure leverage step: borrow more against what is there, no new margin
    const env = await loopOpen({ collateralMarketUid: s.marketLongUid, debtMarketUid: s.marketShortUid, debtAmountRaw: toRaw(borrowTok, s.decimalsShort), slippageBp: slip, leverage: L, account: actor!, accountId: h.accountId })
    if (!hasRoute(env.data)) throw new Error(NO_ROUTE)
    return stepsFrom(env.actions, `Increase to ${num(L, 2)}×`, h.chainId)
  }, [h.collateralUid ?? s?.marketLongUid, h.debtUid ?? s?.marketShortUid])
  const snaps: { l: number; t: string }[] = [...(minL <= 1 ? [{ l: 1, t: 'Close' }] : [{ l: minL, t: 'Repay loan' }]), ...(s ? TIERS.map((t) => ({ l: Math.min(maxL, s.tiers[t.id]), t: t.name })).filter((x) => x.l >= minL) : []), { l: +Lnow.toFixed(2), t: 'Now' }]
  return (
    <>
      <div className="tsec">
        <span className="lbl">Leverage <Info label="Managing a loop">Drag left to deleverage: collateral is sold into {debt} to repay debt, and at 1× everything is sold and the loop is closed.{s && !loan ? <> Drag right to borrow more {debt} and buy more {holds}.</> : ''} Either way it is one transaction.</Info></span>
        <LegsNote h={h} holds={holds} debt={debt} />
        {loans.length > 1 && <div className="seg" role="radiogroup" aria-label="Which loan" style={{ marginBottom: 10 }}>{loans.map((x) => <button key={x.id} role="radio" aria-checked={x.id === loan?.id} aria-pressed={x.id === loan?.id} onClick={() => { setLoanId(x.id); setL(Lnow) }}>Loan {x.id}<span className="c" style={{ marginLeft: 6 }}>{usdShort(x.debtUsd)}</span></button>)}</div>}
        {maxL > minL && <div className="levr"><span className="t50 mono" style={{ fontSize: 11 }}>{minL <= 1 ? 'close' : 'repaid'}</span><input type="range" min={minL} max={maxL} step={0.01} value={L} onChange={(e) => setL(parseFloat(e.target.value))} aria-label="Target leverage" style={{ ['--now' as string]: `${((Lnow - minL) / (maxL - minL)) * 100}%` }} className="lev-now" /><span className="v">{closing ? 'closed' : `${num(L, 2)}×`}</span></div>}
        <div className="snaps">{snaps.map((x) => <button key={x.t} className={`pctb ${Math.abs(L - x.l) < 0.02 ? 'on' : ''}`} onClick={() => setL(x.l)}>{x.t}{x.t !== 'Close' ? ` ${num(x.l, x.t === 'Now' ? 2 : 1)}×` : ''}</button>)}</div>
        {closing && !sameToken && <>
          <span className="lbl" style={{ marginTop: 12 }}>Receive <Info label="How a close pays out">In <b>{debt}</b>: all your {holds} is sold, the debt is repaid, and what is left of the sale comes to your wallet.<br />In <b>{holds}</b>: only enough {holds} is sold to repay the debt (with a 1% margin for the fill), and the rest of your {holds} is withdrawn to your wallet, with the small {debt} surplus of that margin.</Info></span>
          <div className="seg" role="radiogroup" aria-label="Receive">{([['debt', debt, backDebt], ['collateral', holds, backColl]] as const).map(([k, sym, amt]) => <button key={k} role="radio" aria-checked={recv === k} aria-pressed={recv === k} onClick={() => setRecv(k)}>{sym}{amt != null && amt > 0 && <span className="c" style={{ marginLeft: 6 }}>≈ {num(amt, 4)}</span>}</button>)}</div>
        </>}
        <div className="plain" style={{ marginTop: 8 }}>{same ? <span className="t50">You are at {num(Lnow, 2)}×. Move the slider to {s && !loan ? 'change' : 'reduce'} it.</span>
          : closing ? (closeBlock === 'pricing' ? <span className="t50">Pricing the sale of {num(h.amount, 4)} {holds}…</span>
            : closeBlock === 'no-route' ? <span className="t50">No swap route for {num(h.amount, 4)} {holds} into {debt} right now.</span>
            : closeBlock === 'short' ? <>Selling all <b>{num(h.amount, 4)} {holds}</b> fetches <b>{num(sale!.output, 4)} {debt}</b> on the market, less than the <b>{num(owed, 4)} {debt}</b> you owe.</>
            : keep ? <>Sell ≈ <b>{num(sellKeep!, 4)} {holds}</b> into {debt}, repay the <b>{num(owed, 4)} {debt}</b> debt, and withdraw the other{keepOk ? <> <b>≈ {num(backColl!, 4)} {holds}</b></> : ''} to your wallet, with ≈ {num(leftover, 4)} {debt} left over from the sale.</>
            : <>Sell all <b>{num(h.amount, 4)} {holds}</b> into ≈ {num(sale!.output, 4)} {debt}, repay the <b>{num(owed, 4)} {debt}</b> debt, and <b>≈ {num(backDebt!, 4)} {debt}</b> comes back to your wallet.</>)
          : down ? <>Sell <b>{num(sellTok, 4)} {holds}</b> (≈ {usd(sellUsd)}) into {debt} and repay that much debt.</>
          : <>Borrow <b>{num(borrowTok, 4)} {debt}</b> (≈ {usd(borrowUsd)}) more and buy {holds} with it.</>}</div>
        {loan && !same && <div className="plain t50" style={{ marginTop: 6 }}>This repays {loans.length > 1 ? `loan ${loan.id}` : 'your fixed-rate loan'}{minL > 1 ? `, which is ${usd(loan.debtUsd)} of the ${usd(D)} you owe` : ''}. Before its term ends the broker adds a penalty of about half the interest the repaid part would still pay.</div>}
        {closeBlock === 'short' && otherColl.length > 0 && <div className="err" style={{ marginTop: 8 }}>A close would revert: selling your {holds} cannot repay the whole debt on its own{sale && owed > 0 ? <> (about <b>{num(owed * (1 + CLOSE_INTEREST_PAD) - sale.output, 4)} {debt}</b> short)</> : ''}. Part of what backs the debt is {legList(otherColl)}, which this close does not sell. Repay that much {debt} on {h.venue} first, or sell some of the {otherColl.map((o) => o.symbol).join(' and ')} into {debt} there.</div>}
        {closeBlock === 'short' && !otherColl.length && <div className="err" style={{ marginTop: 8 }}>A close would revert: the sale cannot repay the debt. {h.venue} values your {holds} at its own oracle ({usd(h.valueUsd)} of equity), above what it sells for right now{sale && owed > 0 ? <>, which leaves you about <b>{num(owed * (1 + CLOSE_INTEREST_PAD) - sale.output, 4)} {debt}</b> short</> : ''}. Repay that much {debt} on the venue first, or wait for {holds} to trade closer to its oracle.</div>}
        {closeBlock === 'keep-short' && <div className="err" style={{ marginTop: 8 }}>Repaying {num(owed, 4)} {debt} with a 1% margin for the fill takes ≈ {num(sellKeep!, 4)} {holds}, more than the {num(h.amount, 4)} you hold. Take the payout in {debt} instead.</div>}
        {tight && !closeBlock && <div className="plain warn" style={{ marginTop: 6 }}>Tight: a fill at the worst the {slip / 100}% slippage allows would not cover the debt, and the close would revert (only gas is lost).</div>}
        {h.valueUsd <= 0 && closeBlock !== 'short' && <div className="err" style={{ marginTop: 8 }}>This loop has no equity left: the collateral is worth less than the debt, so selling it cannot repay everything. Closing may fail; add {debt} on the venue to repay first.</div>}
      </div>
      <div className="tsec"><div className="cells">
        {s && !loan && <div className="c hero"><span className="k">Net yield after</span><span className={`v ${net == null ? '' : net >= 3 ? 'ok' : net < 0 ? 'bad' : ''}`}>{net == null ? '—' : pct(net)}</span><span className="s">{closing ? 'position closed' : `was ${pct(netAprAtLeverage(s.depSpot, s.borSpot, Lnow))} at ${num(Lnow, 2)}×`}</span></div>}
        <div className="c"><span className="k">You hold</span><span className="v">{usd(Math.max(0, C2 - otherUsd))}</span><span className="s">{holds} · was {usd(C - otherUsd)}{otherUsd > 0.5 ? ` · + ${usd(otherUsd)} ${otherColl.map((o) => o.symbol).join(' + ')} stays` : ''}</span><IrmLink uid={s?.marketLongUid ?? h.collateralUid} side="supply" label="supply curve" rewards={s?.rewardsLong} /></div>
        <div className="c"><span className="k">You owe</span><span className="v">{usd(D2)}</span><span className="s">{debt} · was {usd(D)}</span><IrmLink uid={s?.marketShortUid ?? h.debtUid} side="borrow" label="borrow curve" rewards={s?.rewardsShort} /></div>
        {closing ? <>
          <div className="c"><span className="k">You get back</span><span className={`v ${closeBlock === 'short' ? 'bad' : ''}`}>{cq.isPending ? <Sk w={60} h={14} /> : backUsd != null && backUsd > 0 ? usd(backUsd) : '—'}</span><span className="s">{closeBlock ? (closeBlock === 'short' ? 'the sale does not cover the debt' : closeBlock === 'keep-short' ? 'not enough to keep any' : '') : keep ? `≈ ${num(backColl!, 4)} ${holds} + ${num(leftover, 4)} ${debt}` : `≈ ${num(backDebt!, 4)} ${debt} · at market, not ${usd(h.valueUsd)}`}</span></div>
          <div className="c"><span className="k">Exit cost</span><span className="v">{sale?.exitCostUsd != null ? usd(sale.exitCostUsd * (keep && keepOk ? sellKeep! / h.amount : 1)) : '—'}</span><span className="s">{sale?.via ? `slippage and fees · via ${sale.via}` : 'slippage and fees'}</span></div>
        </> : <>
          <div className="c"><span className="k">Health after</span><span className={`v ${hf == null ? '' : hf < 1.1 ? 'bad' : hf < 1.25 ? 'warn' : 'ok'}`}>{hf == null ? '—' : hf.toFixed(2)}</span><span className="s">{h.health != null ? `now ${h.health.toFixed(2)}` : ''}</span></div>
          <div className="c"><span className="k">Buffer after</span><span className={`v ${drop == null ? '' : drop < 0.05 ? 'bad' : drop < 0.1 ? 'warn' : ''}`}>{drop == null ? '—' : `−${pct(drop * 100, 1)}`}</span><span className="s">{drop == null ? '' : `${holds} fall that liquidates`}</span></div>
        </>}
      </div></div>
      <Action ladder={ladder} label={same ? 'Nothing to change' : closing ? (keep ? `Close · sell ≈ ${num(sellKeep ?? 0, 4)} ${holds}, keep the rest` : `Close · sell all ${holds} for ${debt}`) : down ? `Deleverage to ${num(L, 2)}× · sell ${num(sellTok, 4)} ${holds}` : `Increase to ${num(L, 2)}× · borrow ${num(borrowTok, 4)} ${debt}`} account={account} isConnected={isConnected} disabled={same || !!closeBlock} chainId={h.chainId} />
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
function GetLine({ account, short, symbol, open, onOpen }: { account?: string; short: boolean; symbol: string; open: boolean; onOpen: () => void }) {
  if (!account || open) return null
  return <button className={`getline ${short ? 'short' : ''}`} onClick={onOpen}>{short ? <><b>Don't have enough {symbol}?</b> Get it from anything you hold, on any chain ›</> : <>Get more {symbol} from another asset or chain ›</>}</button>
}
function AmountBox({ unit, value, onChange, onMax }: { unit: string; value: number; onChange: (v: number) => void; onMax?: () => void }) {
  return (
    <div className="amt">{unit === '$' && <span className="u">$</span>}<DecimalInput value={value} onChange={onChange} ariaLabel="Amount" />{unit !== '$' && <span className="u">{unit}</span>}{onMax && <button className="max" onClick={onMax}>Max</button>}</div>
  )
}

/** The sticky bottom of the ticket: one button, then the ladder once built. */
function Action({ ladder: l, label, account, isConnected, disabled, chainId }: { ladder: Ladder; label: string; account?: string; isConnected: boolean; disabled: boolean; chainId: string }) {
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
      {l.err && <div className="err">{l.err}</div>}
      {solWait ? <button className="btn wide" disabled>Transactions on Solana open shortly — browsing and tracking work today</button>
        : !account ? <button className="btn wide pri" onClick={() => setViewAs(undefined)} disabled>Connect a wallet to continue</button>
        : viewing ? <button className="btn wide" disabled>Viewing {account.slice(0, 6)}… · connect to sign</button>
        : !l.isConnected ? <button className="btn wide" disabled>{isSvmChain(chainId) ? 'Connect a Solana wallet (Phantom, Solflare, Backpack) to sign' : 'Connect a wallet to sign'}</button>
        : <button className="btn wide pri" disabled={disabled || l.busy} onClick={() => l.start(label)}>{l.busy ? 'Building…' : label}</button>}
      {!viewing && <SayWhy on={thread ?? null} />}
      <div className="foot" style={{ marginTop: 8 }}>The API builds the exact calls (approvals, then the action); nothing is sent until you sign each one. Gas on {chainLabel(chainId)}.</div>
    </div>
  )
  return (
    <div className="tsec cta">
      <span className="lbl">{l.settled ? 'Done' : l.finished ? 'Updating your positions…' : l.signing ? 'Confirm in your wallet' : l.pending ? 'Waiting for the block…' : 'Sign in your wallet'}</span>
      <ol className="steps">{l.bundle.steps.map((st, i) => <StepRow key={i} st={st} n={i + 1} on={st === l.next} signing={l.signing && st === l.next} chainId={chainId} />)}</ol>
      {l.err && <div className="err" style={{ marginTop: 8 }}>{l.err}</div>}
      {l.finished && <SayWhy on={thread ?? null} done />}
      <div className="actions" style={{ marginTop: 12 }}>
        {l.finished ? <a className="btn wide pri" href="#/">{l.settled ? 'See your positions' : <><Spin sm /> Updating your positions…</>}</a>
          : <button className="btn wide pri" disabled={!!l.pending || l.switching || (l.signing && !l.remote)} onClick={l.signing ? l.reopen : l.sendNext}>{l.switching ? 'Switching…' : l.wrongChain ? `Switch wallet to ${chainLabel(chainId)}` : l.signing ? (l.remote ? 'Open your wallet to confirm' : 'Confirm in your wallet…') : l.pending ? <><Spin sm /> Waiting for the block…</> : `Send ${l.done + 1} of ${l.total}`}</button>}
        <button className="btn" onClick={l.reset} disabled={!!l.pending}>Reset</button>
      </div>
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
