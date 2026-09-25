import React from 'react'
import { unitOf } from '../model/assets'
import { DEFAULT_TIER, TIERS, borrowAtSize, healthAt, liqBuffer, netAprAtLeverage, toRaw, type TierId } from '../model/leverage'
import type { LoopStrategy, SimpleStrategy, Strategy } from '../model/strategies'
import type { Holding, Idle } from '../model/positions'
import { earnDeposit, earnWithdraw, loopClose, loopOpen, NATIVE_SENTINEL, ZERO } from '../sdk/api'
import { chainLabel, useIrm, useLoopPayAssets, useLoopQuote } from '../sdk/queries'
import { useApp, type Mode } from '../state/AppState'
import { useSticky } from '../state/sticky'
import { DecimalInput, Info, KindPill, RiskDot, Sk, StratMark, Tok, Toks, num, pct, usd, usdShort } from './bits'
import { Who } from './social-bits'
import { useProfiles } from '../social/queries'
import { stepsFrom, useLadder, type Ladder } from './useLadder'
import { GetAsset, type Target } from './GetAsset'
import { IrmLink } from './Irm'
import { uidOf } from '../model/uid'
import { SayWhy } from './SayWhy'
import { TicketSocial } from './TicketSocial'

/**
 * What the ticket is about, for the pieces too deep to thread props through:
 * the market uid the strategy talks on, and the wallet being copied when the
 * ticket was opened from a feed card.
 */
const TicketCtx = React.createContext<{ uid: string | null; copy?: string }>({ uid: null })

/** The ticket: what you do in plain words, amount (+ leverage), the numbers, what can go wrong, one button. */
export function Ticket({ s, idle, holding, mode: mode0, copy, onClose }: { s: Strategy; idle: Idle[]; holding: Holding | null; mode?: Mode; copy?: string; onClose: () => void }) {
  const [mode, setMode] = React.useState<Mode>(holding ? mode0 ?? 'add' : 'add')
  const uid = uidOf(s)
  return (
    <TicketCtx.Provider value={{ uid, copy }}>
    <div className="ticket">
      <div className="grab" />
      <div className="th">{s.kind === 'loop' ? <Toks a={s.holds} b={s.debt} logoA={s.logoLong} logoB={s.logoShort} /> : <StratMark sym={s.holds} logo={s.logo} venueKey={s.protocolKey} brand={s.brand} size={26} />}
        <div style={{ flex: 1, minWidth: 0 }}><div className="n">{s.kind === 'loop' ? `${s.holds} / ${s.debt} loop` : s.holds} <Info label="How this strategy works">{s.kind === 'loop' ? <>Deposit <b>{s.holds}</b>, borrow <b>{s.debt}</b> against it, swap the {s.debt} into more {s.holds}, repeat. One transaction does all of it. You earn the {s.holds} rate on the whole position and pay the {s.debt} rate on the borrowed part.</> : <SimpleWords s={s} />}</Info></div><div className="s">{s.asset} strategy · {s.kind === 'loop' ? s.venue : s.via} · {chainLabel(s.chainId)}</div></div>
        <KindPill kind={s.kind} source={s.kind === 'simple' ? s.source : undefined} /><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
      {holding && (
        <div className="tsec"><div className="modes" role="tablist" aria-label="Manage">
          <button role="tab" aria-selected={mode === 'add'} onClick={() => setMode('add')}>Add</button>
          <button role="tab" aria-selected={mode !== 'add'} onClick={() => setMode(s.kind === 'loop' ? 'manage' : 'reduce')}>{s.kind === 'loop' ? 'Manage' : 'Withdraw'}</button>
          <span className="sp" /><span className="sum">{usd(holding.valueUsd)}{s.kind === 'loop' && holding.leverage && holding.leverage > 1.05 ? ` · ${holding.leverage.toFixed(1)}×` : ''}{holding.health != null ? ` · health ${holding.health.toFixed(2)}` : ''}</span>
        </div></div>
      )}
      {copy && <CopyBanner who={copy} s={s} />}
      {holding && mode !== 'add' ? (s.kind === 'loop' ? <ManageLoop s={s} h={holding} closeFirst={mode === 'close'} /> : <ManageTicket s={s} h={holding} mode={mode} />)
        : s.kind === 'simple' ? <SimpleTicket s={s} idle={idle.find((i) => i.chainId === s.chainId && i.address === s.assetAddress.toLowerCase()) ?? idle.find((i) => i.chainId === s.chainId && i.asset === s.asset)} allIdle={idle} /> : <LoopTicket s={s} idle={idle.filter((i) => i.chainId === s.chainId)} allIdle={idle} holding={holding} />}
      <TicketSocial uid={uid} s={s} />
    </div>
    </TicketCtx.Provider>
  )
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
        <div style={{ flex: 1, minWidth: 0 }}><div className="n">{h.label.split(' · ')[0]}</div><div className="s">{h.asset} position · {h.venue} · {chainLabel(h.chainId)}</div></div>
        <KindPill kind={h.kind} /><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
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
function SimpleTicket({ s, idle, allIdle }: { s: SimpleStrategy; idle?: Idle; allIdle: Idle[] }) {
  const { account, isConnected } = useApp()
  const [getOpen, setGetOpen] = React.useState(false)
  const unit = unitOf(s.asset)
  const price = s.priceUsd ?? idle?.price ?? (unit === '$' ? 1 : 0)
  const [amount, setAmount] = useSticky<number>(`t:${s.id}:amount`, () => (unit === '$' ? 1000 : Math.min(idle?.amount ?? 1, 1)))
  const amtUsd = amount * price
  const yearly = amtUsd * s.rate / 100
  const key = [s.id, amount, account ?? ''].join('|')
  const ladder = useLadder(key, s.chainId, async () => {
    const env = await earnDeposit({ earnUid: s.earnUid, amountRaw: toRaw(amount, s.decimals), operator: account! })
    return stepsFrom(env.actions, s.via)
  })
  const more = !!idle && amount > idle.amount
  // the exit line, said with this market's own numbers where it has them: a
  // pool that is 94 % lent out is not the "rare, short" case the generic
  // sentence describes, and the figure to check it against is right there
  const tight = s.utilization != null && s.utilization >= 0.9
  const risks = [
    s.source === 'lending' ? 'Rate floats with utilisation.' : s.source === 'fixed' ? 'Carry ends at maturity; roll or redeem.' : s.source === 'staking' ? 'Staking rate drifts with network activity; slashing is socialised.' : 'Rate is set by the protocol and can change.',
    s.exitWord !== 'Any time' ? `Exit is ${s.exitWord.toLowerCase()}: you may wait to get out at par.`
      : tight ? `${Math.round(s.utilization! * 100)}% of this market is lent out — only ${usdShort(s.liquidityUsd)} can be withdrawn right now, and a bigger exit waits for a borrower to repay.`
      : 'Withdrawals wait if the pool is fully borrowed (rare, short).',
    ...(s.risk >= 3 ? ['Rated high risk by the API\'s venue and token scoring.'] : []),
    ...(s.rewards > 0.05 ? [`${pct(s.rewards)} of the rate is incentives that can stop without notice.`] : []),
  ]
  return (
    <>
      <div className="tsec"><span className="lbl">Amount of {s.asset}</span>
        <AmountBox unit={unit} value={amount} onChange={setAmount} onMax={idle ? () => setAmount(idle.amount) : undefined} />
        <div className="amt-sub"><span>{unit === '$' ? '' : `≈ ${usd(amtUsd)}`}</span><span>{account ? <>Idle: {idle ? `${num(idle.amount, 4)} ${idle.symbol}` : `0 ${s.asset}`}{more && <span className="warn"> · more than idle</span>}</> : 'connect to see your balance'}</span></div>
        <GetLine account={account} short={!idle || more} symbol={s.asset} open={getOpen} onOpen={() => setGetOpen(true)} />
        {getOpen && <GetAsset target={{ chainId: s.chainId, address: s.assetAddress, symbol: s.asset, decimals: s.decimals, price, logo: s.logo }} need={Math.max(0, amount - (idle?.amount ?? 0))} sources={allIdle} onClose={() => setGetOpen(false)} />}</div>
      <div className="tsec"><div className="cells">
        <div className="c hero"><span className="k">You earn</span><span className={`v ${s.rate >= 3 ? 'ok' : ''}`}>{pct(s.rate)}</span><span className="s">{s.maturity ? `fixed to ${new Date(s.maturity * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'variable'}{s.rewards > 0.05 ? ` · incl. ${pct(s.rewards)} rewards` : ''}</span>
          {/* what MOVES the headline: absent on a vault and on the families that do not price off utilisation, which is exactly when there is nothing to open */}
          <IrmLink uid={s.marketUid} side="supply" rewards={s.rewards} /></div>
        <div className="c"><span className="k">Per year</span><span className="v">{usd(yearly)}</span><span className="s">≈ {usd(yearly / 12)} / month</span></div>
        {/* the vault's own name under the share token: `steakUSDC` / `Steakhouse USDC`. WHICH vault is the thing the venue alone never says. */}
        <div className="c"><span className="k">You hold</span><span className="v">{s.holds}</span><span className="s" title={s.vaultName ? `${s.vaultName} · ${s.venue}` : s.venue}>{s.vaultName ?? s.venue}</span></div>
        <div className="c"><span className="k">Risk</span><span className="v" style={{ fontSize: 14 }}><RiskDot r={s.risk} label={s.riskLabel} /></span><span className="s">{s.source} yield</span></div>
        <div className="c"><span className="k">Exit</span><span className="v" style={{ fontSize: 14 }}>{s.exitWord}</span><span className="s">{s.exitWord === 'Any time' ? 'same block' : 'may take time'}</span></div>
        {/* SIZE and LIQUIDITY are two questions, and the ticket used to answer
            neither properly — the size hid under the exit word and how much of
            it could actually leave was nowhere. A $200m pool that is 99 % lent
            out is not a $200m pool you can get out of today. */}
        <div className="c"><span className="k">Market size</span><span className="v">{usdShort(s.tvlUsd)}</span><span className="s">{s.source === 'vault' ? 'in the vault' : 'total deposited'}</span></div>
        <div className="c"><span className="k">Liquidity</span><span className={`v ${s.liquidityUsd != null && s.tvlUsd > 0 && s.liquidityUsd < s.tvlUsd * 0.05 ? 'warn' : ''}`}>{s.liquidityUsd != null ? usdShort(s.liquidityUsd) : '—'}</span>
          <span className="s">{s.utilization != null ? `${Math.round(s.utilization * 100)}% lent out` : s.liquidityUsd != null ? 'can leave now' : 'not reported'}</span></div>
      </div></div>
      <div className="tsec"><span className="lbl">What can go wrong</span><ul className="risks">{risks.map((t, i) => <li key={i} className={i === 0 && s.risk >= 2 ? 'w' : ''}><i /><span>{t}</span></li>)}</ul></div>
      <Action ladder={ladder} label={`${s.source === 'lending' ? 'Deposit' : s.source === 'staking' ? 'Stake' : s.source === 'fixed' ? 'Buy' : 'Deposit'} · ${unit === '$' ? usd(amtUsd) : `${num(amount, 4)} ${s.asset}`}`} account={account} isConnected={isConnected} disabled={!(amount > 0)} chainId={s.chainId} />
    </>
  )
}

/**
 * The borrow rate at THIS ticket's size, off the debt market's own curve. The
 * list quotes every loop at $10k, and on a thin market that one quote can be
 * the whole free liquidity — shMON/WMON on Euler read 35 % against a 6 % spot.
 * While the curve loads the spot rate stands in; a market with no curve keeps
 * the $10k quote.
 */
function useBorrowAt(s: LoopStrategy | null) {
  const irm = useIrm(s?.marketShortUid, !!s)
  return (extraDebtUsd: number) => (!s ? 0 : irm.isPending ? s.borSpot : borrowAtSize(s.borSpot, s.bor, extraDebtUsd, irm.data))
}

function LoopTicket({ s, idle, allIdle, holding }: { s: LoopStrategy; idle: Idle[]; allIdle: Idle[]; holding: Holding | null }) {
  const { account, isConnected } = useApp()
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
  const balOf = (address: string, _symbol: string) => idle.find((i) => i.address === address.toLowerCase())
  const [role, setRole] = useSticky<'collateral' | 'debt' | 'native' | null>(`t:${s.id}:role`, null)
  const chosen = opts.find((o) => o.role === role) ?? [...opts].sort((a, b) => (balOf(b.address, b.symbol)?.usd ?? 0) - (balOf(a.address, a.symbol)?.usd ?? 0))[0]
  const bal = chosen ? balOf(chosen.address, chosen.symbol) : undefined
  const price = chosen?.price || bal?.price || (unit === '$' ? 1 : 0)
  const [amount, setAmount] = useSticky<number>(`t:${s.id}:amount`, () => (unit === '$' ? 1000 : 1))
  const [tier, setTier] = useSticky<TierId>(`t:${s.id}:tier`, DEFAULT_TIER)
  const L = s.tiers[tier]
  const E = amount * price, C = E * L, D = E * (L - 1)
  const borAt = useBorrowAt(s)
  const dep = s.depSpot, bor = borAt(D)
  const net = netAprAtLeverage(dep, bor, L), drop = liqBuffer(s.liqLtv, L), hf = healthAt(s.liqLtv, L)
  const netWorst = netAprAtLeverage(dep, bor + 2, L)
  const overLiquidity = s.borrowLiquidityUsd > 0 && D > s.borrowLiquidityUsd
  // adding to a loop the wallet already runs: the new debt lands in the same book, so the number that
  // matters is the whole position after — the existing debt is already in the curve's utilisation
  const Eh = holding && holding.valueUsd > 0 ? holding.valueUsd : 0, Lh = holding?.leverage && holding.leverage > 1 ? holding.leverage : 1
  const Lc = Eh > 0 ? (Eh * Lh + E * L) / (Eh + E) : L
  const netC = netAprAtLeverage(dep, bor, Lc), hfC = healthAt(s.liqLtv, Lc)
  const q = useLoopQuote(s, E, L, account)
  const econ = q.data?.data?.economics ?? q.data?.data?.quotes?.[0]?.economics ?? null
  const simHf = q.data?.data?.simulation?.post?.healthFactor
  const yearly = E * net / 100
  const key = [s.id, amount, tier, chosen?.role ?? '', account ?? ''].join('|')
  const ladder = useLadder(key, s.chainId, async () => {
    const debtTokens = s.priceShort ? D / s.priceShort : 0
    const env = await loopOpen({
      collateralMarketUid: s.marketLongUid, debtMarketUid: s.marketShortUid, debtAmountRaw: toRaw(debtTokens, s.decimalsShort), slippageBp: 50, leverage: L, account: account!,
      payAsset: chosen ? (chosen.role === 'native' ? NATIVE_SENTINEL : chosen.address) : undefined, payAmountRaw: chosen ? toRaw(amount, chosen.decimals) : undefined,
    })
    return stepsFrom(env.actions, `Open ${num(L, 2)}× loop`)
  })
  const more = !!bal && amount > bal.amount
  return (
    <>
      <div className="tsec">
        <span className="lbl">You pay with <Info label="Paying for a loop">The margin can be paid in {opts.map((o) => o.symbol).join(' or ')}: whatever the venue accepts. Paid in {s.debt}, it is swapped into {s.holds} inside the same transaction.</Info></span>
        <div className="seg" style={{ marginBottom: 10 }}>{opts.map((o) => <button key={o.role} aria-pressed={chosen?.role === o.role} onClick={() => setRole(o.role)}><Tok sym={o.symbol} logo={o.logo} size={16} /> {o.symbol}<span className="c" style={{ marginLeft: 6 }}>{account ? (balOf(o.address, o.symbol) ? num(balOf(o.address, o.symbol)!.amount, 2) : '0') : ''}</span></button>)}</div>
        <AmountBox unit={chosen?.symbol ?? unit} value={amount} onChange={setAmount} onMax={bal ? () => setAmount(bal.amount) : undefined} />
        <div className="amt-sub"><span>≈ {usd(E)} equity</span><span>{account ? <>Idle: {bal ? `${num(bal.amount, 4)} ${chosen?.symbol}` : `0 ${chosen?.symbol ?? ''}`}{more && <span className="warn"> · more than idle</span>}</> : 'connect to see your balance'}</span></div>
        {chosen && <GetLine account={account} short={!bal || more} symbol={chosen.symbol} open={getOpen} onOpen={() => setGetOpen(true)} />}
        {getOpen && chosen && <GetAsset target={{ chainId: s.chainId, address: chosen.address, symbol: chosen.symbol, decimals: chosen.decimals, price: price || 1, logo: chosen.logo }} need={Math.max(0, amount - (bal?.amount ?? 0))} sources={allIdle} onClose={() => setGetOpen(false)} />}
        <span className="lbl" style={{ marginTop: 14 }}>How hard to push it <Info label="Leverage tiers">{TIERS.map((t) => <p key={t.id} style={{ margin: '0 0 6px' }}><b>{t.name}</b> · {t.blurb}</p>)}<p style={{ margin: 0 }}>This venue allows up to {num(s.maxLev, 1)}×. At {num(L, 2)}× the collateral can fall <b>{pct(drop * 100, 1)}</b> against the debt before liquidation.</p></Info></span>
        <div className="tiers" role="radiogroup" aria-label="Leverage tier">{TIERS.map((t) => { const l = s.tiers[t.id]; const n = netAprAtLeverage(dep, borAt(E * (l - 1)), l); const d = liqBuffer(s.liqLtv, l); return (
          <button key={t.id} className={`tier ${t.id}`} role="radio" aria-checked={tier === t.id} onClick={() => setTier(t.id)}>
            <span className="tn">{t.name}</span>
            <span className={`tr ${n >= 3 ? 'ok' : n < 0 ? 'bad' : ''}`}>{pct(n)}</span>
            <span className={`tl ${d < 0.05 ? 'bad' : d < 0.1 ? 'warn' : ''}`} title={`${num(l, 2)}× leverage · liquidated if the collateral falls ${pct(d * 100, 1)} against the debt`}>{num(l, 2)}× · −{pct(d * 100, d < 0.1 ? 1 : 0)}</span>
          </button>) })}</div>

      </div>
      <div className="tsec"><div className="cells">
        <div className="c hero"><span className="k">Net yield</span><span className={`v ${net >= 3 ? 'ok' : net < 0 ? 'bad' : ''}`}>{pct(net)}</span><span className="s">earn {pct(dep)} on {num(L, 1)}× · pay {pct(bor)} on {num(L - 1, 1)}×{Math.abs(bor - s.borSpot) >= 0.05 ? ` (${pct(s.borSpot)} now)` : ''}</span></div>
        {Eh > 0 && <div className="c"><span className="k">Your loop after</span><span className={`v ${netC >= 3 ? 'ok' : netC < 0 ? 'bad' : ''}`}>{pct(netC)}</span><span className="s">{num(Lh, 2)}× → {num(Lc, 2)}× · health {hfC.toFixed(2)}</span></div>}
        <div className="c"><span className="k">Per year</span><span className="v">{usd(yearly)}</span><span className="s">vs {usd(E * dep / 100)} unlevered</span></div>
        <div className="c"><span className="k">If borrow +2%</span><span className={`v ${netWorst < 0 ? 'bad' : netWorst < 1 ? 'warn' : ''}`}>{pct(netWorst)}</span><span className="s">rate sensitivity</span></div>
        {/* a loop is two markets, so it gets two curves: the one that pays you
            and the one that charges you. The borrow leg is the one that ends
            loops — the "If borrow +2%" cell above says how much it would hurt,
            the curve says how close the market is to doing it. */}
        <div className="c"><span className="k">You hold</span><span className="v">{usd(C)}</span><span className="s">{s.holds} on {s.venue}</span><IrmLink uid={s.marketLongUid} side="supply" label="supply curve" rewards={s.rewardsLong} /></div>
        <div className="c"><span className="k">You owe</span><span className="v">{usd(D)}</span><span className="s">{s.debt} · floating · {usdShort(s.borrowLiquidityUsd)} to borrow</span><IrmLink uid={s.marketShortUid} side="borrow" label="borrow curve" rewards={s.rewardsShort} /></div>
        <div className="c"><span className="k">Entry cost</span><span className="v">{q.isFetching && !econ ? <Sk w={60} h={14} /> : econ ? usd(econ.entryCostUsd.total) : '—'}</span><span className="s">{econ ? `${econ.breakEvenDays.total != null ? `earned back in ${Math.ceil(econ.breakEvenDays.total)} days` : 'slippage, fees, gas'}` : q.error ? 'no quote at this size' : 'quoting the route…'}</span></div>
        <div className="c"><span className="k">Health</span><span className={`v ${(simHf ?? hf) < 1.1 ? 'bad' : (simHf ?? hf) < 1.25 ? 'warn' : 'ok'}`}>{(simHf ?? hf).toFixed(2)}</span><span className="s">{simHf ? 'simulated by the API' : 'from the liquidation threshold'}</span></div>
      </div>
        <span className="lbl" style={{ marginTop: 14 }}>Liquidation</span>
        <div className="plain">Liquidated if <b>{s.holds}</b> falls <b>{pct(drop * 100, 1)}</b> against <b>{s.debt}</b>.</div>
        <div className="liqbar"><i style={{ ['--x' as string]: `${Math.min(98, Math.max(2, drop / 0.25 * 100))}%` }} /></div>
        <div className="liqcap"><span>0% buffer</span><span>{drop < 0.03 ? 'very tight' : drop < 0.06 ? 'tight' : drop < 0.12 ? 'comfortable' : 'wide'}</span><span>25%</span></div>
      </div>
      <div className="tsec"><span className="lbl">What can go wrong</span><ul className="risks">
        {overLiquidity && <li className="w"><i /><span>This borrows {usd(D)} of {s.debt}, more than the {usdShort(s.borrowLiquidityUsd)} the market has free: the rate is at the top of its curve and the transaction may not go through.</span></li>}
        <li className="w"><i /><span>Net yield goes negative if the {s.debt} borrow rate rises above the {s.holds} rate.</span></li>
        <li className="w"><i /><span>Liquidation if {s.holds} trades at a discount to {s.debt}.</span></li>
        {s.expiry && <li><i /><span>The collateral matures on {new Date(s.expiry * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}; the position must be closed or rolled.</span></li>}
        {s.rewardsLong + s.rewardsShort > 0.05 && <li><i /><span>Part of the rate is incentives that can stop without notice.</span></li>}
      </ul></div>
      <Action ladder={ladder} label={`Open ${TIERS.find((t) => t.id === tier)!.name.toLowerCase()} loop · ${num(L, 2)}× · ${usd(E)}`} account={account} isConnected={isConnected} disabled={!(amount > 0) || !chosen} chainId={s.chainId} />
    </>
  )
}

/** Withdraw from a deposit the wallet already holds. `s` is null for a position the menu has no row for. */
function ManageTicket({ s, h, mode }: { s: SimpleStrategy | null; h: Holding; mode: Mode }) {
  const { account, isConnected } = useApp()
  const all = mode === 'close'
  const [amount, setAmount] = useSticky<number>(`t:${h.key}:withdraw`, () => +(h.amount / 2).toFixed(6))
  const eff = all ? h.amount : Math.min(amount, h.amount)
  const share = h.amount > 0 ? eff / h.amount : 0
  const key = [s?.id ?? h.key, mode, eff, account ?? ''].join('|')
  const rate = s?.rate ?? h.apr
  const ladder = useLadder(key, h.chainId, async () => {
    const env = await earnWithdraw({ earnUid: s?.earnUid ?? h.earnUid!, amountRaw: toRaw(eff, h.decimals), operator: account!, isAll: all || share > 0.999 })
    return stepsFrom(env.actions, 'Withdraw')
  })
  const price = h.amount > 0 ? h.valueUsd / h.amount : 0
  return (
    <>
      <div className="tsec">
        <span className="lbl">Amount to withdraw (of {num(h.amount, 4)} {h.symbol})</span>
        <div className="amt"><DecimalInput value={amount} onChange={setAmount} ariaLabel="Amount" /><span className="u">{h.symbol}</span><button className="max" onClick={() => setAmount(h.amount)}>Max</button></div>
        <div className="amt-sub"><span>≈ {usd(eff * price)}{amount > h.amount + 1e-9 && <span className="warn"> · more than you hold</span>}</span><span>{[25, 50, 75, 100].map((p) => <button key={p} className="pctb" onClick={() => setAmount(+(h.amount * p / 100).toFixed(6))}>{p}%</button>)}</span></div>
      </div>
      <div className="tsec"><div className="cells">
        <div className="c hero"><span className="k">You get back</span><span className="v">{usd(eff * price)}</span><span className="s">{num(eff, 4)} {h.symbol} to your wallet</span></div>
        <div className="c"><span className="k">Left in</span><span className="v">{num(Math.max(0, h.amount - eff), 4)}</span><span className="s">{h.symbol}{rate != null ? ` · still earning ${pct(rate)}` : ''}</span></div>
        {s && <div className="c"><span className="k">Exit</span><span className="v" style={{ fontSize: 14 }}>{s.exitWord}</span><span className="s">{s.exitWord === 'Any time' ? 'same block' : 'may take time'}</span></div>}
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
  const { account, isConnected } = useApp()
  const holds = s?.holds ?? h.symbol, debt = s?.debt ?? h.debtSymbol ?? 'debt'
  // the book as the API reports it: equity and leverage from the position, prices only to size the legs in tokens
  const E = Math.max(h.valueUsd, 0.01)
  const Lnow = Math.max(1, h.leverage && h.leverage > 1 ? h.leverage : s?.priceLong ? (h.amount * s.priceLong) / E : 1)
  const C = E * Lnow, D = C - E
  const pC = s?.priceLong ?? (h.amount > 0 ? C / h.amount : 0)
  const pD = s?.priceShort ?? 0
  // off the menu, the threshold is read back from the health the position reports: HF = L · lt / (L − 1)
  const liqLtv = s?.liqLtv ?? (h.health != null && Lnow > 1 ? (h.health * (Lnow - 1)) / Lnow : null)
  const maxL = s ? Math.max(Lnow, Math.floor(s.maxLev * 100) / 100) : Lnow
  const [L, setL] = React.useState<number>(() => (closeFirst ? 1 : +Lnow.toFixed(2)))
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
  const key = [s?.id ?? h.key, 'manage', L, account ?? ''].join('|')
  const ladder = useLadder(key, h.chainId, async () => {
    if (down || !s) {
      const env = await loopClose({ collateralMarketUid: h.collateralUid ?? s!.marketLongUid, debtMarketUid: h.debtUid ?? s!.marketShortUid, amountRaw: toRaw(closing ? h.amount : sellTok, h.decimals), slippageBp: 50, isAll: closing, account: account!, accountId: h.accountId })
      return stepsFrom(env.actions, closing ? 'Close the loop' : `Deleverage to ${num(L, 2)}×`)
    }
    // a pure leverage step: borrow more against what is there, no new margin
    const env = await loopOpen({ collateralMarketUid: s.marketLongUid, debtMarketUid: s.marketShortUid, debtAmountRaw: toRaw(borrowTok, s.decimalsShort), slippageBp: 50, leverage: L, account: account! })
    return stepsFrom(env.actions, `Increase to ${num(L, 2)}×`)
  })
  const snaps: { l: number; t: string }[] = [{ l: 1, t: 'Close' }, ...(s ? TIERS.map((t) => ({ l: Math.min(maxL, s.tiers[t.id]), t: t.name })) : []), { l: +Lnow.toFixed(2), t: 'Now' }]
  return (
    <>
      <div className="tsec">
        <span className="lbl">Leverage <Info label="Managing a loop">Drag left to deleverage: collateral is sold into {debt} to repay debt, and at 1× everything is sold and the loop is closed.{s ? <> Drag right to borrow more {debt} and buy more {holds}.</> : ''} Either way it is one transaction.</Info></span>
        {maxL > 1 && <div className="levr"><span className="t50 mono" style={{ fontSize: 11 }}>close</span><input type="range" min={1} max={maxL} step={0.01} value={L} onChange={(e) => setL(parseFloat(e.target.value))} aria-label="Target leverage" style={{ ['--now' as string]: `${((Lnow - 1) / (maxL - 1)) * 100}%` }} className="lev-now" /><span className="v">{closing ? 'closed' : `${num(L, 2)}×`}</span></div>}
        <div className="snaps">{snaps.map((x) => <button key={x.t} className={`pctb ${Math.abs(L - x.l) < 0.02 ? 'on' : ''}`} onClick={() => setL(x.l)}>{x.t}{x.t !== 'Close' ? ` ${num(x.l, x.t === 'Now' ? 2 : 1)}×` : ''}</button>)}</div>
        <div className="plain" style={{ marginTop: 8 }}>{same ? <span className="t50">You are at {num(Lnow, 2)}×. Move the slider to {s ? 'change' : 'reduce'} it.</span>
          : closing ? <>Sell all <b>{num(h.amount, 4)} {holds}</b> into {debt}, repay the <b>{usd(D)}</b> debt, and the rest (<b>{usd(h.valueUsd)}</b>) goes to your wallet as {debt}.</>
          : down ? <>Sell <b>{num(sellTok, 4)} {holds}</b> (≈ {usd(sellUsd)}) into {debt} and repay that much debt.</>
          : <>Borrow <b>{num(borrowTok, 4)} {debt}</b> (≈ {usd(borrowUsd)}) more and buy {holds} with it.</>}</div>
        {h.valueUsd <= 0 && <div className="err" style={{ marginTop: 8 }}>This loop has no equity left: the collateral is worth less than the debt, so selling it cannot repay everything. Closing may fail; add {debt} on the venue to repay first.</div>}
      </div>
      <div className="tsec"><div className="cells">
        {s && <div className="c hero"><span className="k">Net yield after</span><span className={`v ${net == null ? '' : net >= 3 ? 'ok' : net < 0 ? 'bad' : ''}`}>{net == null ? '—' : pct(net)}</span><span className="s">{closing ? 'position closed' : `was ${pct(netAprAtLeverage(s.depSpot, s.borSpot, Lnow))} at ${num(Lnow, 2)}×`}</span></div>}
        <div className="c"><span className="k">You hold</span><span className="v">{usd(C2)}</span><span className="s">{holds} · was {usd(C)}</span></div>
        <div className="c"><span className="k">You owe</span><span className="v">{usd(D2)}</span><span className="s">{debt} · was {usd(D)}</span></div>
        <div className="c"><span className="k">Health after</span><span className={`v ${closing || hf == null ? '' : hf < 1.1 ? 'bad' : hf < 1.25 ? 'warn' : 'ok'}`}>{closing || hf == null ? '—' : hf.toFixed(2)}</span><span className="s">{h.health != null ? `now ${h.health.toFixed(2)}` : ''}</span></div>
        <div className="c"><span className="k">Buffer after</span><span className={`v ${closing || drop == null ? '' : drop < 0.05 ? 'bad' : drop < 0.1 ? 'warn' : ''}`}>{closing || drop == null ? '—' : `−${pct(drop * 100, 1)}`}</span><span className="s">{closing || drop == null ? '' : `${holds} fall that liquidates`}</span></div>
      </div></div>
      <Action ladder={ladder} label={same ? 'Nothing to change' : closing ? `Close · sell all ${holds}` : down ? `Deleverage to ${num(L, 2)}× · sell ${num(sellTok, 4)} ${holds}` : `Increase to ${num(L, 2)}× · borrow ${num(borrowTok, 4)} ${debt}`} account={account} isConnected={isConnected} disabled={same} chainId={h.chainId} />
    </>
  )
}

/** One quiet line under the amount: the way in when the wallet is short, a smaller link when it is not. */
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
  const { uid } = React.useContext(TicketCtx)
  const viewing = !!account && !isConnected
  if (!l.bundle) return (
    <div className="tsec cta">
      {l.err && <div className="err">{l.err}</div>}
      {!account ? <button className="btn wide pri" onClick={() => setViewAs(undefined)} disabled>Connect a wallet to continue</button>
        : viewing ? <button className="btn wide" disabled>Viewing {account.slice(0, 6)}… · connect to sign</button>
        : <button className="btn wide pri" disabled={disabled || l.busy} onClick={l.start}>{l.busy ? 'Building…' : label}</button>}
      {!viewing && <SayWhy uid={uid} />}
      <div className="foot" style={{ marginTop: 8 }}>The API builds the exact calls (approvals, then the action); nothing is sent until you sign each one. Gas on {chainLabel(chainId)}.</div>
    </div>
  )
  return (
    <div className="tsec cta">
      <span className="lbl">{l.finished ? 'Done' : l.pending ? 'Waiting for the block…' : 'Sign in your wallet'}</span>
      <ol className="steps">{l.bundle.steps.map((st, i) => <li key={i} className={st.done ? 'done' : st === l.next ? 'on' : ''}><i>{st.done ? '✓' : i + 1}</i>{st.label}{st.hash && <span className="t40 mono" style={{ fontSize: 11, marginLeft: 'auto' }}>{st.hash.slice(0, 10)}…</span>}</li>)}</ol>
      {l.err && <div className="err" style={{ marginTop: 8 }}>{l.err}</div>}
      {l.finished && <SayWhy uid={uid} done />}
      <div className="actions" style={{ marginTop: 12 }}>
        {l.finished ? <a className="btn wide pri" href="#/">See your positions</a>
          : <button className="btn wide pri" disabled={!!l.pending || l.switching} onClick={l.sendNext}>{l.wrongChain ? `Switch wallet to ${chainLabel(chainId)}` : l.pending ? 'Pending…' : `Send ${l.done + 1} of ${l.total}`}</button>}
        <button className="btn" onClick={l.reset} disabled={!!l.pending}>Reset</button>
      </div>
    </div>
  )
}
