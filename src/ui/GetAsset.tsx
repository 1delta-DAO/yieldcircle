import React from 'react'
import { useAccount, useSendTransaction } from 'wagmi'
import type { Idle } from '../model/positions'
import { toRaw } from '../model/leverage'
import { useQuery } from '@tanstack/react-query'
import { fetchTokenBalances, spotSwapQuote, xchainSwapQuote, ZERO, type SwapQuoteActions, type SwapQuoteData } from '../sdk/api'
import { CHAINS, chainLabel } from '../sdk/queries'
import { hasLanded, isDone, isOk, traceTx, useTrace } from '../sdk/txTrace'
import { Spin, TxTrack, phaseWords } from './TxTray'
import type { ApiEnvelope } from '../vendor/allocator/http'
import { useApp } from '../state/AppState'
import { isRemote, openWallet } from '../wallet/deeplink'
import { useSwitchTo } from '../wallet/useSwitchTo'
import { base58Encode, isSolAddr, isSvmChain, normAddr } from '../model/address'
import { isSvmTx, type AnyTx } from '../sdk/types'
import { solSignAndSend } from '../wallet/solana'
import { DecimalInput, Info, Popover, Tok, num, usd } from './bits'

export interface Target { chainId: string; address: string; symbol: string; decimals: number; price: number; logo?: string }
/** A form the strategy takes the money in, with what the wallet already holds of it. */
export type GetTarget = Target & { have: number }

/**
 * "Get <asset>": fund the strategy from anything the wallet holds, on any chain, without leaving the
 * ticket. One choice (what to pay with), one amount (prefilled with the shortfall), one button. The
 * API picks the route: spot swap on the same chain, bridge aggregation across chains — the same
 * endpoints a full swap terminal uses, minus the route table and the order toggle.
 *
 * `targets` are the forms the strategy takes the same money in — the gas coin and its wrapper,
 * when the venue has a payable entry — PREFERRED FIRST: arriving as the coin, the deposit needs no
 * approval (and a bridge usually delivers the coin anyway). Both stay one tap apart. `want` is the
 * amount the ticket asks for (the coin and its wrapper are 1:1); `onTarget` tells the ticket which
 * form was bought, so it pays with that one.
 */
export function GetAsset({ targets, want, sources, onTarget, onClose }: { targets: GetTarget[]; want: number; sources: Idle[]; onTarget?: (t: Target) => void; onClose: () => void }) {
  const { account, solSigner } = useApp()
  // each side is signed / received by its own VM's wallet: a Solana leg is the Solana account, never the EVM one
  const walletOn = (chainId: string | undefined) => (isSvmChain(chainId) ? solSigner : account)
  const [ti, setTi] = React.useState(0)
  const target = targets[Math.min(ti, targets.length - 1)]
  const need = Math.max(0, want - target.have)
  const isTarget = (i: Idle) => targets.some((t) => i.chainId === t.chainId && normAddr(i.address) === normAddr(t.address))
  // what you can pay with: every idle base-asset balance on any chain except the forms being bought, biggest first
  // (the wrapper is not a source for the coin: holding it, the ticket simply pays with it)
  const opts = React.useMemo(() => sources.filter((i) => i.usd >= 1 && !isTarget(i)).sort((a, b) => b.usd - a.usd), [sources, targets.map((t) => t.chainId + t.address).join()])
  const [pick, setPick] = React.useState<Idle | null>(null)
  // a token by address (`CustomToken`), once it has resolved: shown in the grid like any balance
  const [custom, setCustom] = React.useState<Idle | null>(null)
  const [otherOpen, setOtherOpen] = React.useState(false)
  const src = pick ?? opts[0] ?? null
  const choose = (i: Idle | null) => { setPick(i); setSent(null); setPendingApprove(undefined) }
  // amount in the source token, prefilled with what covers the shortfall (plus 1 % for the route), capped at the balance
  const [amount, setAmount] = React.useState<number>(0)
  // with no price for the source there is nothing to work backwards from (no oracle for a reverse
  // quote): the amount starts empty, you say what to spend, and the forward quote says what it buys
  React.useEffect(() => { if (src) setAmount(src.price > 0 ? Math.min(src.amount, +(need * target.price / src.price * 1.01).toFixed(6)) : 0) }, [src?.address, src?.chainId, need])
  const [quote, setQuote] = React.useState<ApiEnvelope<SwapQuoteData, SwapQuoteActions> | null>(null)
  const [quoting, setQuoting] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState<{ hash: string; bridge?: string } | null>(null)
  const [pendingApprove, setPendingApprove] = React.useState<`0x${string}` | undefined>()
  const reqId = React.useRef(0)
  const cross = !!src && src.chainId !== target.chainId
  React.useEffect(() => {
    if (!src || !(amount > 0) || sent) { setQuote(null); return }
    const from = walletOn(src.chainId), to = walletOn(target.chainId)
    // a Solana leg with no Solana wallet: there is no one to send from, or to deliver to
    if (!from || !to) { setQuote(null); setErr(`Connect a ${!from ? (isSvmChain(src.chainId) ? 'Solana' : 'EVM') : isSvmChain(target.chainId) ? 'Solana' : 'EVM'} wallet to ${!from ? 'pay from' : 'receive on'} ${chainLabel(!from ? src.chainId : target.chainId)}.`); return }
    const id = ++reqId.current
    const t = setTimeout(async () => {
      setQuoting(true); setErr(null)
      try {
        const raw = toRaw(amount, src.decimals)
        const env = cross
          ? await xchainSwapQuote({ fromChainId: src.chainId, toChainId: target.chainId, tokenIn: src.address, tokenOut: target.address, amountRaw: raw, slippageBp: 50, account: from, receiver: to })
          : await spotSwapQuote({ chainId: src.chainId, tokenIn: src.address, tokenOut: target.address, amountRaw: raw, slippageBp: 50, account: from })
        if (id !== reqId.current) return
        setQuote(env); if (!env.data?.quotes?.length) setErr('No route found for this pair. Try another asset to pay with.')
      } catch (e) { if (id === reqId.current) { setQuote(null); setErr(shortErr((e as Error).message)) } } finally { if (id === reqId.current) setQuoting(false) }
    }, 600)
    return () => clearTimeout(t)
  }, [src?.address, src?.chainId, amount, target.address, target.chainId, account, solSigner, sent])
  // the route: the API's best by default; the quote line is a button that unfolds the others, subtly
  const [sel, setSel] = React.useState(0)
  const [routesOpen, setRoutesOpen] = React.useState(false)
  const qRef = React.useRef<HTMLButtonElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => { setSel(0); setRoutesOpen(false) }, [quote])
  const quotes = quote?.data?.quotes ?? []
  const best = quotes[sel]
  const tx = quote?.actions?.alternatives?.[sel] as AnyTx | undefined
  const srcSvm = isSvmChain(src?.chainId)
  const perms = (quote?.actions?.permissions ?? []).filter((p) => !best?.approvalTarget || !p.spender || normAddr(p.spender) === normAddr(best.approvalTarget))
  // the approval and the swap/bridge are followed by `txTrace.ts`, like every ladder step: the tray shows them too
  const approveTr = useTrace(pendingApprove)
  const approved = hasLanded(approveTr)
  // a spot quote lists the approval without flagging `approvalRequired`; trust the permission the API returned (never for native)
  const needsApprove = !srcSvm && perms.length > 0 && src?.address !== ZERO && !approved
  const { chainId: walletChain, address, connector } = useAccount(); const { switchTo, switching } = useSwitchTo()
  const send = useSendTransaction()
  const wrongChain = !!src && !srcSvm && walletChain !== Number(src.chainId)
  const sendTx = async (t: { to: string; data: string; value?: string }) => send.sendTransactionAsync({ to: t.to as `0x${string}`, data: t.data as `0x${string}`, value: BigInt(t.value || '0') })
  // settled = final on the source chain (and, across chains, the bridge says DONE); the tracer has
  // already re-read both chains' balances by then
  const sentTr = useTrace(sent?.hash)
  const arrived = sentTr?.phase === 'settled'
  const lost = !!sentTr && isDone(sentTr) && !isOk(sentTr)
  React.useEffect(() => { if (approveTr && isDone(approveTr) && !isOk(approveTr)) { setErr(approveTr.err ?? 'The approval did not go through.'); setPendingApprove(undefined) } }, [approveTr?.phase])
  const [busy, setBusy] = React.useState(false)
  const remote = !srcSvm && isRemote(connector?.id)
  const go = async () => {
    if (!src || !tx) return
    setErr(null)
    if (wrongChain) { try { await switchTo(Number(src.chainId)) } catch (e) { setErr(shortErr((e as Error).message)) } return }
    // before the first await: iOS only follows the hand-off while the tap is live (wallet/deeplink.ts); a Solana source signs in the Solana wallet, not the EVM one
    if (!srcSvm) openWallet(connector?.id)
    setBusy(true)
    try {
      if (needsApprove) {
        const h = await sendTx(perms[0] as { to: string; data: string; value: string })
        if (address) traceTx({ hash: h, chainId: src.chainId, account: address, title: `Approve ${src.symbol}`, moves: 'none' })
        setPendingApprove(h); return
      }
      // a Solana source signs a base64 message in the Solana wallet; anything else is {to, data, value} through wagmi
      let h: string, lastValidHeight: number | undefined
      if (isSvmTx(tx)) {
        if (tx.expiresAt && Date.parse(tx.expiresAt) <= Date.now()) { setQuote(null); setErr('The quote expired before it was signed. It is being refreshed.'); return }
        h = base58Encode(await solSignAndSend(Uint8Array.from(atob(tx.transaction), (c) => c.charCodeAt(0))))
        lastValidHeight = tx.lastValidBlockHeight
      } else h = await sendTx(tx)
      onTarget?.(target)
      const what = `${num(amount, 4)} ${src.symbol} → ${target.symbol}`
      const signer = srcSvm ? solSigner : address
      if (signer) traceTx({
        hash: h, chainId: src.chainId, account: signer, moves: 'balances', lastValidHeight,
        title: cross ? `Bridge ${what}` : `Swap ${what}`, label: cross ? `${chainLabel(src.chainId)} → ${chainLabel(target.chainId)}` : `on ${chainLabel(src.chainId)}`,
        bridge: cross && best?.bridge ? { name: best.bridge, toChainId: target.chainId, tokenIn: src.address, tokenOut: target.address } : undefined,
        // "Received" means the target balance MOVED, not that the bridge said DONE
        watch: [{ chainId: target.chainId, address: target.address }],
      })
      setSent({ hash: h, bridge: best?.bridge })
    } catch (e) { setErr(shortErr((e as Error).message)) } finally { setBusy(false) }
  }
  const out = best?.tradeOutput ?? 0
  const covers = out >= need * 0.995
  return (
    <div className="get" ref={panelRef}>
      <div className="gh2"><span className="lbl">Get {target.symbol} <Info label="How this works">Pay with anything you hold. The API swaps it on the same chain, or bridges it from another chain, into {target.symbol} on {chainLabel(target.chainId)}. It lands in your wallet; then you continue with the strategy.</Info></span><span className="sp" /><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
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
          <div className="srcs" role="radiogroup" aria-label="Pay with">
            {[...(custom ? [custom] : []), ...opts.slice(0, 8)].map((o) => <button key={o.chainId + o.address} role="radio" aria-checked={src === o} className="src" onClick={() => choose(o)}><Tok sym={o.symbol} size={18} /><span className="s">{o.symbol}<small>{chainLabel(o.chainId)}</small></span><span className="b">{o.price > 0 ? usd(o.usd) : num(o.amount, 4)}</span></button>)}
            {!otherOpen && <button className="src other" onClick={() => setOtherOpen(true)}><span className="s">Other token<small>paste an address</small></span><span className="b">+</span></button>}
          </div>
          {otherOpen && (account || solSigner) && <CustomToken walletOn={walletOn} chainId0={src?.chainId ?? target.chainId}
            onUse={(i) => { setCustom(i); choose(i) }}
            onCancel={() => { setOtherOpen(false); if (custom && src === custom) choose(null); setCustom(null) }} />}
          {src && (
            <>
              <div className="amt" style={{ marginTop: 10, minHeight: 42 }}><DecimalInput value={amount} onChange={(v) => { setAmount(v); setSent(null) }} ariaLabel="Amount to pay" style={{ fontSize: 16 }} /><span className="u">{src.symbol}</span><button className="max" onClick={() => setAmount(src.amount)}>Max</button></div>
              <div className="amt-sub"><span>{src.price > 0 ? `≈ ${usd(amount * src.price)}` : 'no price for it'}{amount > src.amount + 1e-9 && <span className="warn"> · more than you hold</span>}</span><span>{cross ? `bridge ${chainLabel(src.chainId)} → ${chainLabel(target.chainId)}` : 'swap on ' + chainLabel(src.chainId)}</span></div>
              {/* once sent the quote is gone (nothing to re-quote): the status line below takes its place */}
              {!sent && <div className="qline">
                {quoting && !best ? <span className="t50">Finding the best route…</span>
                  : best ? (
                    <button ref={qRef} className="qbtn" aria-expanded={routesOpen} disabled={quotes.length < 2 || !!sent} onClick={() => setRoutesOpen((o) => !o)} title={quotes.length > 1 ? 'other routes' : undefined}>
                      You get <b className={covers ? 'ok' : 'warn'}>~{num(out, out > 100 ? 2 : 4)} {target.symbol}</b>{need > 0 && !covers && <span className="warn"> · short of the {num(need, 4)} needed</span>}
                      <span className="t50"> · via {best.bridge ?? best.aggregator}{Number(best.estimatedDuration) > 0 ? ` · ~${Math.max(1, Math.round(Number(best.estimatedDuration) / 60))} min` : ''}{quotes.length > 1 ? <> · {sel === 0 ? 'best' : `#${sel + 1}`} of {quotes.length}<span className="chev">{routesOpen ? '▴' : '▾'}</span></> : ''}</span>
                    </button>)
                  : err ? <span className="bad">{err}</span> : <span className="t50">{src.price > 0 ? 'Enter an amount.' : `Enter how much ${src.symbol} to spend; the quote shows what it buys.`}</span>}
              </div>}
              <Popover anchor={panelRef} open={routesOpen && quotes.length > 1 && !sent} onClose={() => setRoutesOpen(false)} align="stretch" near={qRef}>
                <div className="routes" role="radiogroup" aria-label="Route">
                  {quotes.map((q, i) => { const o = q.tradeOutput ?? 0; const top = quotes[0].tradeOutput || 1; const d = (o / top - 1) * 1e4; return (
                    <button key={i} role="radio" aria-checked={i === sel} className="route" onClick={() => { setSel(i); setRoutesOpen(false) }}>
                      <span className="rn">{q.bridge ?? q.aggregator ?? 'route'}</span>
                      <span className="rbar"><i style={{ width: `${Math.max(3, Math.min(100, (o / top) * 100))}%` }} /></span>
                      <span className="ro">{num(o, o > 100 ? 2 : 4)}</span>
                      <span className={`rd ${i === 0 ? 't40' : d < -20 ? 'warn' : 't50'}`}>{i === 0 ? 'best' : `${d > 0 ? '+' : '−'}${Math.abs(d) >= 100 ? (Math.abs(d) / 100).toFixed(1) + '%' : Math.abs(d).toFixed(0) + ' bp'}`}</span>
                      <span className="rt">{Number(q.estimatedDuration) > 0 ? `~${Math.max(1, Math.round(Number(q.estimatedDuration) / 60))} min` : 'instant'}</span>
                    </button>) })}
                </div>
              </Popover>
              {sent ? (
                <div className="qline">
                  {arrived ? (sentTr!.note ? <span className="warn">{sentTr!.note}</span> : <span className="ok">Received. Your {target.symbol} balance is refreshed; go ahead with the strategy.</span>)
                    : lost ? <span className="bad">{phaseWords(sentTr!).head}: {sentTr!.err ?? 'it did not go through'}</span>
                    : <span className="t70">{sentTr ? <><Spin sm /> {phaseWords(sentTr).head}{phaseWords(sentTr).detail ? <span className="t50"> · {phaseWords(sentTr).detail}</span> : null}</> : cross ? 'Bridging…' : 'Swapping…'}</span>}
                  {sentTr && !lost && <TxTrack t={sentTr} />}
                </div>
              ) : (
                <div className="actions" style={{ marginTop: 10 }}>
                  <button className="btn pri" disabled={!tx || (busy && !remote) || switching || (!!pendingApprove && !approved) || amount > src.amount + 1e-9} onClick={busy ? () => openWallet(connector?.id) : go}>
                    {switching ? 'Switching…' : busy && remote ? 'Open your wallet to confirm' : wrongChain ? `Switch wallet to ${chainLabel(src.chainId)}` : pendingApprove && !approved ? 'Approving…' : needsApprove ? `Approve ${src.symbol}` : busy ? 'Sending…' : `${cross ? 'Bridge' : 'Swap'} · ${num(amount, 4)} ${src.symbol}`}
                  </button>
                  <button className="btn" onClick={onClose}>Cancel</button>
                </div>
              )}
              {err && (sent || best) && <div className="err">{err}</div>}
            </>
          )}
        </>
      )}
    </div>
  )
}
const shortErr = (m: string) => (m.length > 140 ? m.slice(0, 140) + '…' : m)

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
    onUse({ asset: found.symbol, symbol: found.symbol, amount, usd: found.balanceUSD ?? amount * price, address: addr, decimals: found.decimals, price, chainId })
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
