import React from 'react'
import { useAccount, useSendTransaction, useSwitchChain, useWaitForTransactionReceipt } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import type { Idle } from '../model/positions'
import { toRaw } from '../model/leverage'
import { spotSwapQuote, xchainSwapQuote, ZERO, type SwapQuoteActions, type SwapQuoteData } from '../sdk/api'
import { chainLabel, useBridgeStatus } from '../sdk/queries'
import type { ApiEnvelope } from '../vendor/allocator/http'
import { useApp } from '../state/AppState'
import { DecimalInput, Info, Popover, Tok, num, usd } from './bits'

export interface Target { chainId: string; address: string; symbol: string; decimals: number; price: number; logo?: string }

/**
 * "Get <asset>": fund the strategy from anything the wallet holds, on any chain, without leaving the
 * ticket. One choice (what to pay with), one amount (prefilled with the shortfall), one button. The
 * API picks the route: spot swap on the same chain, bridge aggregation across chains — the same
 * endpoints a full swap terminal uses, minus the route table and the order toggle.
 */
export function GetAsset({ target, need, sources, onClose }: { target: Target; need: number; sources: Idle[]; onClose: () => void }) {
  const { account } = useApp()
  const qc = useQueryClient()
  // what you can pay with: every idle base-asset balance on any chain except the target token itself, biggest first
  const opts = React.useMemo(() => sources.filter((i) => i.usd >= 1 && !(i.chainId === target.chainId && i.address.toLowerCase() === target.address.toLowerCase())).sort((a, b) => b.usd - a.usd), [sources, target.chainId, target.address])
  const [pick, setPick] = React.useState<Idle | null>(null)
  const src = pick ?? opts[0] ?? null
  // amount in the source token, prefilled with what covers the shortfall (plus 1 % for the route), capped at the balance
  const [amount, setAmount] = React.useState<number>(0)
  React.useEffect(() => { if (src) setAmount(Math.min(src.amount, +(need * target.price / (src.price || 1) * 1.01).toFixed(6))) }, [src?.asset, src?.chainId, need])
  const [quote, setQuote] = React.useState<ApiEnvelope<SwapQuoteData, SwapQuoteActions> | null>(null)
  const [quoting, setQuoting] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState<{ hash: `0x${string}`; bridge?: string } | null>(null)
  const [pendingApprove, setPendingApprove] = React.useState<`0x${string}` | undefined>()
  const reqId = React.useRef(0)
  const cross = !!src && src.chainId !== target.chainId
  React.useEffect(() => {
    if (!src || !(amount > 0) || sent) { setQuote(null); return }
    const id = ++reqId.current
    const t = setTimeout(async () => {
      setQuoting(true); setErr(null)
      try {
        const raw = toRaw(amount, src.decimals)
        const env = cross
          ? await xchainSwapQuote({ fromChainId: src.chainId, toChainId: target.chainId, tokenIn: src.address, tokenOut: target.address, amountRaw: raw, slippageBp: 50, account })
          : await spotSwapQuote({ chainId: src.chainId, tokenIn: src.address, tokenOut: target.address, amountRaw: raw, slippageBp: 50, account })
        if (id !== reqId.current) return
        setQuote(env); if (!env.data?.quotes?.length) setErr('No route found for this pair. Try another asset to pay with.')
      } catch (e) { if (id === reqId.current) { setQuote(null); setErr(shortErr((e as Error).message)) } } finally { if (id === reqId.current) setQuoting(false) }
    }, 600)
    return () => clearTimeout(t)
  }, [src?.address, src?.chainId, amount, target.address, target.chainId, account, sent])
  // the route: the API's best by default; the quote line is a button that unfolds the others, subtly
  const [sel, setSel] = React.useState(0)
  const [routesOpen, setRoutesOpen] = React.useState(false)
  const qRef = React.useRef<HTMLButtonElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => { setSel(0); setRoutesOpen(false) }, [quote])
  const quotes = quote?.data?.quotes ?? []
  const best = quotes[sel]
  const tx = quote?.actions?.alternatives?.[sel]
  const perms = (quote?.actions?.permissions ?? []).filter((p) => !best?.approvalTarget || !p.spender || p.spender.toLowerCase() === best.approvalTarget.toLowerCase())
  const approveRcpt = useWaitForTransactionReceipt({ hash: pendingApprove })
  // a spot quote lists the approval without flagging `approvalRequired`; trust the permission the API returned (never for native)
  const needsApprove = perms.length > 0 && src?.address !== ZERO && !approveRcpt.isSuccess
  const { chainId: walletChain } = useAccount(); const { switchChainAsync, isPending: switching } = useSwitchChain()
  const send = useSendTransaction()
  const wrongChain = !!src && walletChain !== Number(src.chainId)
  const sendTx = async (t: { to: string; data: string; value: string }) => send.sendTransactionAsync({ to: t.to as `0x${string}`, data: t.data as `0x${string}`, value: BigInt(t.value || '0') })
  const status = useBridgeStatus({ bridge: sent?.bridge, fromChainId: src?.chainId, toChainId: target.chainId, txHash: sent?.hash, tokenIn: src?.address, tokenOut: target.address })
  const sentRcpt = useWaitForTransactionReceipt({ hash: !cross && sent ? sent.hash : undefined })
  const arrived = !!sent && (cross ? status.data?.status === 'DONE' : sentRcpt.isSuccess)
  React.useEffect(() => { if (arrived) qc.invalidateQueries({ queryKey: ['balances'] }) }, [arrived])
  const [busy, setBusy] = React.useState(false)
  const go = async () => {
    if (!src || !tx) return
    setErr(null)
    if (wrongChain) { try { await switchChainAsync({ chainId: Number(src.chainId) }) } catch (e) { setErr(shortErr((e as Error).message)) } return }
    setBusy(true)
    try {
      if (needsApprove) { const h = await sendTx(perms[0]); setPendingApprove(h); return }
      const h = await sendTx(tx); setSent({ hash: h, bridge: best?.bridge })
    } catch (e) { setErr(shortErr((e as Error).message)) } finally { setBusy(false) }
  }
  const out = best?.tradeOutput ?? 0
  const covers = out >= need * 0.995
  return (
    <div className="get" ref={panelRef}>
      <div className="gh2"><span className="lbl">Get {target.symbol} <Info label="How this works">Pay with anything you hold. The API swaps it on the same chain, or bridges it from another chain, into {target.symbol} on {chainLabel(target.chainId)}. It lands in your wallet; then you continue with the strategy.</Info></span><span className="sp" /><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
      {!opts.length ? <div className="hint">Nothing in the wallet to pay with on Ethereum, Base, Arbitrum or BNB. Fund the wallet first.</div> : (
        <>
          <div className="srcs" role="radiogroup" aria-label="Pay with">
            {opts.slice(0, 8).map((o) => <button key={o.chainId + o.address} role="radio" aria-checked={src === o} className="src" onClick={() => { setPick(o); setSent(null); setPendingApprove(undefined) }}><Tok sym={o.symbol} size={18} /><span className="s">{o.symbol}<small>{chainLabel(o.chainId)}</small></span><span className="b">{usd(o.usd)}</span></button>)}
          </div>
          {src && (
            <>
              <div className="amt" style={{ marginTop: 10, minHeight: 42 }}><DecimalInput value={amount} onChange={(v) => { setAmount(v); setSent(null) }} ariaLabel="Amount to pay" style={{ fontSize: 16 }} /><span className="u">{src.symbol}</span><button className="max" onClick={() => setAmount(src.amount)}>Max</button></div>
              <div className="amt-sub"><span>≈ {usd(amount * src.price)}{amount > src.amount + 1e-9 && <span className="warn"> · more than you hold</span>}</span><span>{cross ? `bridge ${chainLabel(src.chainId)} → ${chainLabel(target.chainId)}` : 'swap on ' + chainLabel(src.chainId)}</span></div>
              <div className="qline">
                {quoting && !best ? <span className="t50">Finding the best route…</span>
                  : best ? (
                    <button ref={qRef} className="qbtn" aria-expanded={routesOpen} disabled={quotes.length < 2 || !!sent} onClick={() => setRoutesOpen((o) => !o)} title={quotes.length > 1 ? 'other routes' : undefined}>
                      You get <b className={covers ? 'ok' : 'warn'}>~{num(out, out > 100 ? 2 : 4)} {target.symbol}</b>{need > 0 && !covers && <span className="warn"> · short of the {num(need, 4)} needed</span>}
                      <span className="t50"> · via {best.bridge ?? best.aggregator}{Number(best.estimatedDuration) > 0 ? ` · ~${Math.max(1, Math.round(Number(best.estimatedDuration) / 60))} min` : ''}{quotes.length > 1 ? <> · {sel === 0 ? 'best' : `#${sel + 1}`} of {quotes.length}<span className="chev">{routesOpen ? '▴' : '▾'}</span></> : ''}</span>
                    </button>)
                  : err ? <span className="bad">{err}</span> : <span className="t50">Enter an amount.</span>}
              </div>
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
                  {arrived ? <span className="ok">Received. Your {target.symbol} balance is refreshed; go ahead with the strategy.</span>
                    : cross ? <span className="t70">Bridging… <span className="t50 mono">{status.data?.status === 'NOT_FOUND' || !status.data ? 'waiting for the bridge to pick it up' : status.data.status.toLowerCase()}</span></span>
                    : <span className="t70">Swapping… waiting for the block.</span>}
                </div>
              ) : (
                <div className="actions" style={{ marginTop: 10 }}>
                  <button className="btn pri" disabled={!tx || busy || switching || (!!pendingApprove && !approveRcpt.isSuccess) || amount > src.amount + 1e-9} onClick={go}>
                    {wrongChain ? `Switch wallet to ${chainLabel(src.chainId)}` : pendingApprove && !approveRcpt.isSuccess ? 'Approving…' : needsApprove ? `Approve ${src.symbol}` : busy ? 'Sending…' : `${cross ? 'Bridge' : 'Swap'} · ${num(amount, 4)} ${src.symbol}`}
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

