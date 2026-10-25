import React from 'react'
import { useAccount, useCapabilities, useSendTransaction, useWalletClient } from 'wagmi'
import type { Idle } from '@yieldcircle/core/model/positions'
import { fromUnits, payRaw, portion, unitsOf, type Amount } from '@yieldcircle/core/model/amount'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchTokenBalances, spotSwapQuote, xchainSwapQuote, ZERO, type DestinationGas, type SwapQuoteActions, type SwapQuoteData, type SwapRouteQuote } from '@yieldcircle/core/sdk/api'
import { CHAINS, chainLabel, useBalances } from '@yieldcircle/app/sdk/queries'
import { hasLanded, isDone, isOk, tracePaper, traceTx, useTrace } from '@yieldcircle/app/sdk/txTrace'
import { paperId, usePaper } from '../state/Paper'
import { realTradingGated } from '../wallet/gate'
import { balanceOf, gasTokenOf, knownOf, MAX_TOPUPS, starterOf, starterRef, tokenKey, TOPUP_UNITS, type PaperOp } from '@yieldcircle/core/model/paper'
import { destinationGasFor, isGasAsk, AUTO_GAS_SHARE, type GasPref } from '@yieldcircle/core/model/destGas'
import { loadGasPref, saveGasPref } from '@yieldcircle/app/state/gasPref'
import { balancesChanged } from '@yieldcircle/app/sdk/liveBalances'
import { isNativeAddress } from '@yieldcircle/core/model/positions'
import { Spin, TxTrack, phaseWords, useNow } from './TxTray'
import type { ApiEnvelope } from '@yieldcircle/core/vendor/allocator/http'
import { useApp } from '../state/AppState'
import { isRemote, openWallet } from '../wallet/deeplink'
import { useSwitchTo } from '../wallet/useSwitchTo'
import { base58Encode, isSolAddr, isSvmChain, normAddr } from '@yieldcircle/core/model/address'
import { isSvmTx, type AnyTx, type ApiTx } from '@yieldcircle/core/sdk/types'
import { solSignAndSend } from '../wallet/solana'
import { AmountInput, Info, Popover, RouteChooser, Tok, num, usd } from './bits'
import { Drawer } from './Drawer'
import { LossAck, ValueRow, useValueCheck } from './ValueCheck'
import { isRejection } from '@yieldcircle/core/sdk/walletErrors'
import { gasOf, useGetAsset } from '@yieldcircle/app/tickets/get'

// the targets' shapes are the shared hook's
export type { GetTarget, Target } from '@yieldcircle/app/tickets/get'
import type { GetTarget, Target } from '@yieldcircle/app/tickets/get'

/**
 * "Get <asset>": fund the strategy from anything the wallet holds, on any chain, without leaving the
 * ticket. It opens as a drawer beside the ticket on a desk and as a bottom sheet on a phone. One
 * choice (what to pay with), one amount (prefilled with the shortfall), the routes the API found
 * with the best picked, one button. Spot swap on the same chain, bridge aggregation across chains —
 * the same endpoints a full swap terminal uses.
 *
 * `targets` are the forms the strategy takes the same money in — the gas coin and its wrapper,
 * when the venue has a payable entry — PREFERRED FIRST: arriving as the coin, the deposit needs no
 * approval (and a bridge usually delivers the coin anyway). Both stay one tap apart. `want` is the
 * amount the ticket asks for (the coin and its wrapper are 1:1); `onTarget` tells the ticket which
 * form was bought, so it pays with that one.
 */
export function GetAsset({ targets, want, sources, onTarget, onClose }: { targets: GetTarget[]; want: number; sources: Idle[]; onTarget?: (t: Target) => void; onClose: () => void }) {
  // everything but the screen is shared with the phone (`@yieldcircle/app/tickets/get`)
  const { account, solSigner, paper, walletOn, ti, setTi, target, need, isTarget, opts, pick, setPick, custom, setCustom, otherOpen, setOtherOpen, src, choose, amt, setAmt, amount, payR, quote, setQuote, quoting, setQuoting, err, setErr, sent, setSent, pendingApprove, setPendingApprove, reqId, cross, dstGasTok, dstGas, dstGasRef, realGas, gasHeldUsd, gasPref, setGasPrefState, setGasPref, gasOn, setGasOn, tradeUsd, gasPlan, askGas, gasMiss, setGasMiss, sel, setSel, quotes, best, tx, srcSvm, perms, approveTr, approved, needsApprove, walletChain, address, connector, switchTo, switching, send, wrongChain, sendTx, sentTr, now, arrived, lost, busy, setBusy, remote, goPaper, dollar, topupsLeft, topup, qc, walletClient, caps, canBatch, gasLegMiss, setGasLegMiss, traceBridge, sendBatched, go, sendGasLeg, traceGas, out, covers, bg, gasPaidUsd, srcNative, srcNativeDec, feeNative, feeUsd, legNative, extraNative, nativeShort, gasGotUsd, v } = useGetAsset(targets, want, sources, onTarget)
  return (
    <Drawer open onClose={onClose} side="right" label={`Get ${target.symbol}`} cls="get-drawer">
    <div className="get">
      <p className="get-why">{paper.active ? <><span className="pill paper">paper</span> Pay with anything in your paper bank, on any chain — at the real routes' prices, fees and times. </> : 'Pay with anything you hold, on any chain. '}<Info label="How this works">The API swaps it on the same chain, or bridges it from another chain, into {target.symbol} on {chainLabel(target.chainId)}. {paper.active ? 'On paper, the route’s output lands in your paper bank — a bridge when its quoted time is up.' : 'It lands in your wallet; then you continue with the strategy.'}</Info></p>
      {paper.active && !dollar && <p className="foot" style={{ margin: '0 0 12px' }}><span className="pill paper">paper</span> Paper cash lands on Solana. To fund {chainLabel(target.chainId)}, bridge from there — as a real wallet would.</p>}
      {dollar && <div className="paper-card" style={{ margin: '0 0 12px' }}>
        <span className="t70" style={{ fontSize: 12.5 }}>Short of play money? Add {num(TOPUP_UNITS, 0)} {dollar.symbol} on {chainLabel(target.chainId)} to your paper bank ({topupsLeft > 0 ? `${topupsLeft} top-up${topupsLeft === 1 ? '' : 's'} left` : 'none left'}).</span>
        <div className="actions"><button className="btn paper ghost sm" disabled={topupsLeft <= 0} onClick={() => void topup()}>Add {num(TOPUP_UNITS, 0)} {dollar.symbol}</button></div>
      </div>}
      {need > 0 && <div className="get-need"><Tok sym={target.symbol} logo={target.logo} size={22} /><span>You need <b>{num(need, need > 100 ? 2 : 4)} {target.symbol}</b> more on {chainLabel(target.chainId)}</span></div>}
      {targets.length > 1 && (
        <div className="seg get-as" role="radiogroup" aria-label="Receive as">
          {targets.map((t, k) => <button key={t.address} role="radio" aria-checked={k === ti} aria-pressed={k === ti} disabled={!!sent} onClick={() => { setTi(k); setPendingApprove(undefined) }}>
            <Tok sym={t.symbol} logo={t.logo} size={16} /> {t.symbol}{t.address === ZERO && <span className="c" style={{ marginLeft: 6 }}>no approval</span>}
          </button>)}
        </div>
      )}
      {!opts.length && !custom && <div className="hint">No listed balance in the wallet to pay with on the selected chains. Pay with any other token by its address, or fund the wallet first.</div>}
      {(
        <>
          <span className="lbl">Pay with</span>
          <div className="srcs" role="radiogroup" aria-label="Pay with">
            {[...(custom ? [custom] : []), ...opts.slice(0, 8)].map((o) => <button key={o.chainId + o.address} role="radio" aria-checked={src === o} className="src" onClick={() => choose(o)}><Tok sym={o.symbol} size={18} /><span className="s">{o.symbol}<small>{chainLabel(o.chainId)}</small></span><span className="b">{o.price > 0 ? usd(o.usd) : num(o.amount, 4)}</span></button>)}
            {!otherOpen && !paper.active && <button className="src other" onClick={() => setOtherOpen(true)}><span className="s">Other token<small>paste an address</small></span><span className="b">+</span></button>}
          </div>
          {otherOpen && (account || solSigner) && <CustomToken walletOn={walletOn} chainId0={src?.chainId ?? target.chainId}
            onUse={(i) => { setCustom(i); choose(i) }}
            onCancel={() => { setOtherOpen(false); if (custom && src === custom) choose(null); setCustom(null) }} />}
          {src && (
            <>
              <div className="amt" style={{ marginTop: 10, minHeight: 42 }}><AmountInput value={amt} onChange={(a) => { setAmt(a); setSent(null) }} ariaLabel="Amount to pay" style={{ fontSize: 16 }} /><span className="u">{src.symbol}</span><button className="max" onClick={() => { setAmt(portion(src, 100, src.decimals)); setSent(null) }}>Max</button></div>
              <div className="amt-sub"><span>{src.price > 0 ? `≈ ${usd(amount * src.price)}` : 'no price for it'}{amount > src.amount + 1e-9 && <span className="warn"> · more than you hold</span>}</span><span className="pcts" role="group" aria-label="Share of what you hold">{[25, 50, 75, 100].map((p) => <button key={p} type="button" className={`pctb${amt.pct === p ? ' on' : ''}`} aria-pressed={amt.pct === p} onClick={() => { setAmt(portion(src, p, src.decimals)); setSent(null) }}>{p}%</button>)}</span></div>
              {/* once sent the quote is gone (nothing to re-quote): the status line below takes its place */}
              {!sent && <div className="qline">
                {quoting && !best ? <span className="t50"><Spin sm /> Finding routes…</span>
                  : best ? <>You get <b className={covers ? 'ok' : 'warn'}>~{num(out, out > 100 ? 2 : 4)} {target.symbol}</b>{need > 0 && !covers && <span className="warn"> · short of the {num(need, 4)} needed</span>}</>
                  : err ? <span className="bad">{err}</span> : <span className="t50">{src.price > 0 ? 'Enter an amount.' : `Enter how much ${src.symbol} to spend; the quote shows what it buys.`}</span>}
              </div>}
              {!sent && cross && dstGas && gasPlan && <GasCard sym={dstGas.symbol} srcSym={knownOf(src.chainId)?.native?.symbol ?? 'gas'} chain={chainLabel(target.chainId)} plan={gasPlan} on={gasOn} setOn={setGasOn}
                pref={gasPref} setPref={setGasPref} heldUsd={gasHeldUsd ?? 0} route={best} miss={gasMiss} batch={canBatch} />}
              {!sent && best && nativeShort > 0 && <div className="qnote warn">This route also takes {num(extraNative, 6)} {srcNative} in fees{best.destinationGas?.paidFrom === 'gas-leg' ? ' and gas' : ''} on top of the amount — {num(nativeShort, 6)} {srcNative} more than you hold.{' '}
                <button className="lnk" onClick={() => { setAmt(fromUnits(+Math.max(0, src.amount - extraNative * 1.02).toFixed(6))); setSent(null) }}>Leave room for it</button></div>}
              {/* the route it runs on, in one row; every other one the API found sits behind the button beside it, best first */}
              {!sent && quotes.length > 0 && (() => {
                const top = quotes[0].tradeOutput || 1
                const rows = quotes.map((q, i) => { const o = q.tradeOutput ?? 0; const d = (o / top - 1) * 1e4; const name = q.bridge ?? q.aggregator ?? 'route'; return {
                  body: <>
                    <span className="rn"><b>{name}</b><small>{Number(q.estimatedDuration) > 0 ? `~${Math.max(1, Math.round(Number(q.estimatedDuration) / 60))} min` : 'instant'}{cross && q.bridge && q.aggregator ? ` · via ${q.aggregator}` : ''}{cross && dstGas && askGas && askGas !== 'wait' && !gasMiss ? (q.destinationGas ? ` · +${num(Number(q.destinationGas.amount) / 10 ** q.destinationGas.decimals, 4)} ${dstGas.symbol}${q.destinationGas.paidFrom !== 'output' && q.destinationGas.cost?.usd != null ? ` for $${q.destinationGas.cost.usd.toFixed(2)}` : ''}` : ` · no ${dstGas.symbol}`) : ''}{q.nativeFee ? ` · +${num(Number(q.nativeFee.amount) / 10 ** q.nativeFee.decimals, 4)} ${srcNative} fee${q.nativeFee.usd != null ? ` ($${q.nativeFee.usd.toFixed(2)})` : ''}` : ''}</small></span>
                    <span className="rbar"><i style={{ width: `${Math.max(3, Math.min(100, (o / top) * 100))}%` }} /></span>
                    <span className="ro"><b>{num(o, o > 100 ? 2 : 4)} {target.symbol}</b><small className={i === 0 ? 'ok' : d < -20 ? 'warn' : ''}>{i === 0 ? 'best' : `${d > 0 ? '+' : '−'}${Math.abs(d) >= 100 ? (Math.abs(d) / 100).toFixed(1) + '%' : Math.abs(d).toFixed(0) + ' bp'}`}</small></span>
                  </>,
                  title: `${name} ${cross ? 'bridges' : 'swaps'} ${num(amount, 6)} ${src.symbol} into ${num(o, 4)} ${target.symbol}`,
                } })
                return <RouteChooser rows={rows} sel={sel} onPick={setSel}
                  label={<>{quotes.length === 1 ? 'Route · the one found' : `Route · ${quotes.length} found`} · <span className="t50">{cross ? `bridge ${chainLabel(src.chainId)} → ${chainLabel(target.chainId)}` : `swap on ${chainLabel(src.chainId)}`}</span>{quoting ? <span className="t40"> · refreshing…</span> : null}</>} />
              })()}
              {best && !sent && <>
                <ValueRow v={v} labels={['Pay', 'Receive', 'Price impact']} missing={v.inUsd > 0 ? target.symbol : src.symbol}
                  info={<>What you receive is worth this much more or less than what you pay, both at market prices. It includes the route's fees{cross ? ' and the bridge\'s' : ''}{feeUsd > 0 ? ` (the bridge also charges $${feeUsd.toFixed(2)} in ${srcNative} on top of the amount)` : ''}{bg ? <>, and the {dstGas?.symbol ?? 'gas'} it brings along for network fees on {chainLabel(target.chainId)}{gasPaidUsd > 0 ? ` (that costs $${gasPaidUsd.toFixed(2)} more, paid in ${knownOf(src!.chainId)?.native?.symbol ?? 'the gas coin'})` : ' (taken out of what arrives)'}</> : null}.</>} />
                <LossAck v={v} what={cross ? 'This route' : 'This swap'} advice="Pay less, try another route, or pay with another asset." />
              </>}
              {best && !sent && v.sev === 'unk' && <div className="qnote warn">The value of this {cross ? 'route' : 'swap'} can't be checked: compare what you pay and get yourself.</div>}
              {sent ? (
                <div className="qline">
                  {arrived ? (sentTr!.note ? <span className="warn">{sentTr!.note}</span> : <span className="ok">Received. Your {target.symbol} balance is refreshed; go ahead with the strategy.</span>)
                    : lost ? <span className="bad">{phaseWords(sentTr!).head}: {sentTr!.err ?? 'it did not go through'}</span>
                    : <span className="t70">{sentTr ? <><Spin sm /> {phaseWords(sentTr, now).head}{phaseWords(sentTr, now).detail ? <span className="t50"> · {phaseWords(sentTr, now).detail}</span> : null}</> : cross ? 'Bridging…' : 'Swapping…'}</span>}
                  {sentTr && !lost && <TxTrack t={sentTr} />}
                </div>
              ) : (
                <div className="actions" style={{ marginTop: 10 }}>
                  <button className={`btn pri ${paper.active ? 'paperbtn' : ''} ${v.severe ? 'risky' : ''}`} disabled={(!tx && !(paper.active && best)) || v.blocked || (busy && !remote) || switching || (!!pendingApprove && !approved) || amount > src.amount + 1e-9 || nativeShort > 0} onClick={busy ? () => openWallet(connector?.id) : go}>
                    {switching ? 'Switching…' : busy && remote ? 'Open your wallet to confirm' : wrongChain ? `Switch wallet to ${chainLabel(src.chainId)}` : pendingApprove && !approved ? 'Approving…' : needsApprove ? `Approve ${src.symbol}` : busy ? (paper.active ? 'Applying on paper…' : 'Sending…') : `${paper.active ? 'Paper ' : ''}${cross ? (paper.active ? 'bridge' : 'Bridge') : (paper.active ? 'swap' : 'Swap')}${v.severe ? ' anyway' : ''} · ${num(amount, amount < 0.01 ? 6 : 4)} ${src.symbol}`}
                  </button>
                  <button className="btn" onClick={onClose}>Cancel</button>
                </div>
              )}
              {sent && gasLegMiss && dstGas && <div className="gas-card miss">
                <span className="t70">{gasLegMiss.why === 'rejected' ? `The bridge is on its way. The gas for ${chainLabel(target.chainId)} was not sent — you declined it in the wallet.` : `The bridge is on its way. The gas for ${chainLabel(target.chainId)} did not go out: ${gasLegMiss.why}`} Without {dstGas.symbol} there, nothing can be done on {chainLabel(target.chainId)}. Sent late, the gas still arrives; if its quote has expired, {gasLegMiss.q.destinationGas?.bridge ?? 'the gas bridge'} refunds it to you.</span>
                <div className="actions"><button className="btn sm" disabled={busy} onClick={async () => { setBusy(true); try { await sendGasLeg(gasLegMiss.leg, gasLegMiss.q) } finally { setBusy(false) } }}>Send the gas ({num(gasOf(gasLegMiss.q.destinationGas, srcNativeDec)?.units ?? 0, 4)} {dstGas.symbol})</button><button className="btn ghost sm" onClick={() => setGasLegMiss(null)}>Continue without</button></div>
              </div>}
              {err && (sent || best) && <div className="err">{err}</div>}
            </>
          )}
        </>
      )}
    </div>
    </Drawer>
  )
}
// `gasOf` and `shortErr` are the shared hook's (`@yieldcircle/app/tickets/get`)

/**
 * The destination-gas card: whether this transfer brings the destination's gas coin along, how much,
 * what it costs and how it travels with the chosen route — switched on by default whenever the
 * receiving wallet is short, with the standing rule (auto / a fixed amount / off) behind Settings.
 */
function GasCard({ sym, srcSym, chain, plan, on, setOn, pref, setPref, heldUsd, route, miss, batch }: {
  sym: string; srcSym: string; chain: string; plan: ReturnType<typeof destinationGasFor>; on: boolean; setOn: (b: boolean) => void
  pref: GasPref; setPref: (p: GasPref) => void; heldUsd: number; route?: SwapRouteQuote; miss: boolean; batch: boolean
}) {
  const ref = React.useRef<HTMLButtonElement>(null)
  const [open, setOpen] = React.useState(false)
  const [custom, setCustom] = React.useState(pref.mode === 'custom' && pref.usd ? String(pref.usd) : '2')
  if (!plan) return null
  const held = heldUsd > 0 ? `You hold ${usd(heldUsd)} of ${sym} on ${chain}` : `You hold no ${sym} on ${chain}`
  const g = route?.destinationGas
  const got = g ? Number(g.amount) / 10 ** g.decimals : 0
  const cost = g?.paidFrom === 'output' ? undefined : g?.paidFrom === 'value' && route?.nativeFee?.usd != null ? undefined : g?.cost?.usd
  const how = !g ? undefined
    : g.paidFrom === 'output' ? 'taken out of what arrives — no extra cost'
    : g.paidFrom === 'value' ? 'dropped by the bridge itself, paid in the bridge transaction'
    : g.bundled ? `in the same transaction as the bridge — one signature`
    : batch ? `${g.bridge ?? 'a gas leg'} beside the bridge, both in one wallet batch`
    : `${g.bridge ?? 'a gas leg'}: a second transaction right after the bridge (two signatures)`
  const settings = (
    <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={320} align="right">
      <div className="pop-text gas-pop">
        <b>Gas for the destination</b>
        <p>When the wallet you bridge to holds too little of the chain's gas coin to pay its network fees, the bridge can bring some along.</p>
        <div className="seg" role="radiogroup" aria-label="Destination gas">
          {(['auto', 'custom', 'off'] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={pref.mode === m} aria-pressed={pref.mode === m}
            onClick={() => setPref(m === 'custom' ? { mode: 'custom', usd: Math.max(0.5, Number(custom) || 2) } : { mode: m })}>{m === 'auto' ? 'Auto' : m === 'custom' ? 'Fixed amount' : 'Off'}</button>)}
        </div>
        {pref.mode === 'custom' && <label className="gas-usd">$ <input inputMode="decimal" value={custom} aria-label="Gas to bring, USD"
          onChange={(e) => { setCustom(e.target.value); const n = Number(e.target.value); if (n >= 0.5) setPref({ mode: 'custom', usd: n }) }} /> worth of gas each time</label>}
        <p className="t50">{pref.mode === 'auto' ? `Auto: about two transactions' worth on the destination, never more than ${Math.round(AUTO_GAS_SHARE * 100)} % of what you bridge — and none when the transfer is too small to carry a useful amount.`
          : pref.mode === 'custom' ? 'Fixed: this much whenever the destination wallet is short (at least $0.50 — a gas leg has fixed costs of its own).'
          : 'Off: bridges bring only the asset. You will need gas on the destination from somewhere else.'}</p>
        {isGasAsk(plan) && <p className="t50">This transfer: {plan.amount === 'auto' ? '0.005' : plan.amount} {sym} (≈ {usd(plan.usd)}) — {plan.why}.</p>}
      </div>
    </Popover>
  )
  if (!isGasAsk(plan)) return (
    <div className="gas-card"><div className="gas-row"><span className="warn">{held}, and this transfer is too small to bring useful gas along (from about {usd(plan.needUsd)}). Get {sym} there separately.</span>
      <button ref={ref} type="button" className="gas-set" aria-label="Gas settings" aria-expanded={open} onClick={() => setOpen((o) => !o)}>⚙</button></div>{settings}</div>
  )
  return (
    <div className={`gas-card${on ? ' on' : ''}`}>
      <div className="gas-row">
        <label className="gas-sw"><input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /><span>Bring gas to {chain}</span></label>
        <span className="gas-amt">{on ? <>+{num(got || Number(plan.amount === 'auto' ? 0.005 : plan.amount), 5)} {sym}{cost != null ? <small> · ${cost.toFixed(2)} in {srcSym}</small> : <small> · ≈ {usd(plan.usd)}</small>}</> : <small>off</small>}</span>
        <button ref={ref} type="button" className="gas-set" aria-label="Gas settings" aria-expanded={open} onClick={() => setOpen((o) => !o)}>⚙</button>
      </div>
      <div className="gas-sub">
        {miss && on ? <span className="warn">{held}, and no route here can bring some along. Get {sym} there separately — without it, nothing can be done on {chain}.</span>
          : on ? <span className="t50">{held} for network fees{how ? <> · {how}</> : null}.</span>
          : <span className="warn">{held}. Without it, nothing can be done there after the transfer.</span>}
      </div>
      {settings}
    </div>
  )
}

/**
 * Any token, by address. Looked up on the chosen chain through the balance route — symbol,
 * decimals, the wallet's balance, and a price when the API has one — then offered as a source like
 * any listed balance. An address the route knows no symbol for is not a token on that chain.
 */
function CustomToken({ walletOn, chainId0, onUse, onCancel }: { walletOn: (chainId: string) => string | undefined; chainId0: string; onUse: (i: Idle) => void; onCancel: () => void }) {
  const [chainId, setChainId] = React.useState(chainId0)
  const account = walletOn(chainId) ?? ''
  const [raw, setRaw] = React.useState('')
  const addr = normAddr(raw.trim())
  const valid = /^0x[0-9a-f]{40}$/.test(addr) || isSolAddr(addr)
  const q = useQuery({
    enabled: valid && !!account,
    queryKey: ['custom-token', chainId, addr, account],
    queryFn: () => fetchTokenBalances(account, chainId, [addr], true),
    staleTime: 30_000, retry: false,
  })
  const b = q.data?.items.find((i) => normAddr(i.address) === addr)
  const found = b?.symbol ? b : undefined
  React.useEffect(() => {
    if (!found) return
    const amount = parseFloat(found.balance) || 0, price = found.priceUSD ?? 0
    onUse({ asset: found.symbol, symbol: found.symbol, amount, usd: found.balanceUSD ?? amount * price, address: addr, decimals: found.decimals, price, chainId, raw: found.balanceRaw })
  }, [found?.symbol, found?.balanceRaw, chainId, addr])
  return (
    <div className="custom-tok">
      <div className="row">
        <select value={chainId} onChange={(e) => setChainId(e.target.value)} aria-label="Chain">{CHAINS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
        <input value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="0x… token address" spellCheck={false} autoComplete="off" aria-label="Token address" autoFocus />
        <button className="x" onClick={onCancel} aria-label="Remove">✕</button>
      </div>
      <div className="st">
        {!raw ? <span className="t50">Paste the token's contract address on {chainLabel(chainId)}.</span>
          : !valid ? <span className="warn">Not an address.</span>
          : q.isFetching && !q.data ? <span className="t50"><Spin sm /> Looking it up…</span>
          : q.isError ? <span className="bad">Could not read it: {(q.error as Error).message}</span>
          : !found ? <span className="bad">No token at this address on {chainLabel(chainId)}.</span>
          : <span className="t70"><b>{found.symbol}</b>{b?.name && b.name !== found.symbol ? ` · ${b.name}` : ''} · you hold {num(parseFloat(found.balance) || 0, 6)}{found.priceUSD ? '' : <span className="warn"> · no price: the quote is the only estimate</span>}</span>}
      </div>
    </div>
  )
}
