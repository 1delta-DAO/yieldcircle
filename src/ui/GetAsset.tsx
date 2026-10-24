import React from 'react'
import { useAccount, useCapabilities, useSendTransaction, useWalletClient } from 'wagmi'
import type { Idle } from '../model/positions'
import { fromUnits, payRaw, portion, unitsOf, type Amount } from '../model/amount'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchTokenBalances, spotSwapQuote, xchainSwapQuote, ZERO, type DestinationGas, type SwapQuoteActions, type SwapQuoteData, type SwapRouteQuote } from '../sdk/api'
import { CHAINS, chainLabel, useBalances } from '../sdk/queries'
import { hasLanded, isDone, isOk, tracePaper, traceTx, useTrace } from '../sdk/txTrace'
import { paperId, usePaper } from '../state/Paper'
import { realTradingGated } from '../wallet/gate'
import { balanceOf, gasTokenOf, knownOf, MAX_TOPUPS, starterOf, starterRef, tokenKey, TOPUP_UNITS, type PaperOp } from '../model/paper'
import { destinationGasFor, isGasAsk, loadGasPref, saveGasPref, AUTO_GAS_SHARE, type GasPref } from '../model/destGas'
import { balancesChanged } from '../sdk/liveBalances'
import { isNativeAddress } from '../model/positions'
import { Spin, TxTrack, phaseWords, useNow } from './TxTray'
import type { ApiEnvelope } from '../vendor/allocator/http'
import { useApp } from '../state/AppState'
import { isRemote, openWallet } from '../wallet/deeplink'
import { useSwitchTo } from '../wallet/useSwitchTo'
import { base58Encode, isSolAddr, isSvmChain, normAddr } from '../model/address'
import { isSvmTx, type AnyTx, type ApiTx } from '../sdk/types'
import { solSignAndSend } from '../wallet/solana'
import { AmountInput, Info, Popover, RouteChooser, Tok, num, usd } from './bits'
import { Drawer } from './Drawer'
import { LossAck, ValueRow, useValueCheck } from './ValueCheck'
import { isRejection } from '../wallet/errors'

export interface Target { chainId: string; address: string; symbol: string; decimals: number; price: number; logo?: string }
/** A form the strategy takes the money in, with what the wallet already holds of it. */
export type GetTarget = Target & { have: number }

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
  const { account, solSigner, actorOn } = useApp()
  // a paper account trades its paper bank at the same quotes (tickets/0006 §K): only the send differs
  const paper = usePaper()
  // each side is signed / received by its own VM's wallet: a Solana leg is the Solana account, never the EVM one
  const walletOn = actorOn
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
  const [amt, setAmt] = React.useState<Amount>({ text: '0' })
  const amount = unitsOf(amt)
  // what is sent: Max is the exact balance, a typed amount its text capped at it (tickets/0014)
  const payR = src ? payRaw(amt, src.decimals, src) : '0'
  // with no price for either side there is nothing to work backwards from (no oracle for a reverse
  // quote): the amount starts empty, you say what to spend, and the forward quote says what it buys
  // (and 5 cents: a small buy — gas for a chain — loses more than 1 % to the route's fixed fees)
  React.useEffect(() => { if (src) { const want = src.price > 0 && target.price > 0 ? (need * target.price * 1.01 + 0.05) / src.price : 0; setAmt(want >= src.amount ? portion(src, 100, src.decimals) : fromUnits(+want.toFixed(6))) } }, [src?.address, src?.chainId, need])
  const [quote, setQuote] = React.useState<ApiEnvelope<SwapQuoteData, SwapQuoteActions> | null>(null)
  const [quoting, setQuoting] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState<{ hash: string; bridge?: string } | null>(null)
  const [pendingApprove, setPendingApprove] = React.useState<`0x${string}` | undefined>()
  const reqId = React.useRef(0)
  const cross = !!src && src.chainId !== target.chainId
  // destination gas (tickets/0007 C): a bridge brings the destination's gas coin along only when the
  // receiving wallet has too little of it to act there — paper bank and real wallet alike
  const dstGasTok = gasTokenOf(target.chainId)
  const dstGas = knownOf(target.chainId)?.native
  const dstGasRef = starterRef(target.chainId, dstGasTok) ?? 0
  const realGas = useBalances(!paper.active && cross ? walletOn(target.chainId) : undefined, target.chainId, [dstGasTok])
  const gasHeldUsd: number | undefined = !cross ? undefined
    : paper.active ? (paper.ledger ? (balanceOf(paper.ledger, target.chainId, dstGasTok) + paper.ledger.inflight.filter((t) => t.toChainId === target.chainId && t.token === tokenKey(target.chainId, dstGasTok)).reduce((a, t) => a + t.units, 0)) * dstGasRef : undefined)
    : realGas.data ? (() => { const b = realGas.data.items.find((i) => isNativeAddress(i.address)); const u = b ? parseFloat(b.balance) || 0 : 0; return b?.balanceUSD ?? u * (b?.priceUSD ?? dstGasRef) })()
    // the read failed: nothing detected, nothing asked for
    : realGas.isError || !realGas.isFetching && !realGas.isLoading ? Infinity : undefined
  // the standing choice (auto / custom / off, Settings on the gas card) and, per transfer, the card's switch
  const [gasPref, setGasPrefState] = React.useState<GasPref>(loadGasPref)
  const setGasPref = (p: GasPref) => { setGasPrefState(p); saveGasPref(p); setGasOn(p.mode !== 'off') }
  const [gasOn, setGasOn] = React.useState(() => loadGasPref().mode !== 'off')
  // sized to what is bridged (`destGas.ts`): the auto rule caps it at a share of the trade
  const tradeUsd = src && src.price > 0 ? amount * src.price : 0
  /** The gas this transfer would bring under the CURRENT rule — shown on the card even while switched off. */
  const gasPlan = !cross || gasHeldUsd === undefined ? undefined : destinationGasFor(target.chainId, target.address, gasHeldUsd, tradeUsd, gasPref.mode === 'off' ? { mode: 'auto' } : gasPref)
  /** What every route is asked to deliver (`undefined`: nothing), or `wait` while the wallet's gas is still being read. */
  const askGas: string | undefined | 'wait' = !cross ? undefined : gasHeldUsd === undefined ? 'wait' : gasOn && isGasAsk(gasPlan) ? gasPlan.amount : undefined
  // asked for gas, no route could bring it: quoted again without, and the drawer says so
  const [gasMiss, setGasMiss] = React.useState(false)
  React.useEffect(() => {
    if (!src || !(amount > 0) || sent) { setQuote(null); return }
    const from = walletOn(src.chainId), to = walletOn(target.chainId)
    // a Solana leg with no Solana wallet: there is no one to send from, or to deliver to
    if (askGas === 'wait') return
    if (!from || !to) { setQuote(null); setErr(`Connect ${!from ? (isSvmChain(src.chainId) ? 'a Solana' : 'an EVM') : isSvmChain(target.chainId) ? 'a Solana' : 'an EVM'} wallet to ${!from ? 'pay from' : 'receive on'} ${chainLabel(!from ? src.chainId : target.chainId)}.`); return }
    const id = ++reqId.current
    const t = setTimeout(async () => {
      setQuoting(true); setErr(null)
      try {
        const raw = payR
        // a paper wallet holds nothing on Solana, and Solana-origin bridges (Mayan, NEAR Intents, Relay) build by reading
        // the sender on chain — they drop every route for an empty one. Paper needs only the quote: ask it without a sender
        // (tickets/0007; measured 2026-10-11: no sender answers what a funded wallet would)
        const x = (destinationGas?: string) => xchainSwapQuote({ fromChainId: src.chainId, toChainId: target.chainId, tokenIn: src.address, tokenOut: target.address, amountRaw: raw, slippageBp: 50, account: paper.active && isSvmChain(src.chainId) ? undefined : from, receiver: to, destinationGas })
        let env = cross ? await x(askGas) : await spotSwapQuote({ chainId: src.chainId, tokenIn: src.address, tokenOut: target.address, amountRaw: raw, slippageBp: 50, account: from })
        let miss = false
        if (cross && askGas && !env.data?.quotes?.length) { env = await x(); miss = !!env.data?.quotes?.length }
        if (id !== reqId.current) return
        setGasMiss(miss)
        setQuote(env); if (!env.data?.quotes?.length) setErr('No route found for this pair. Try another asset to pay with.')
      } catch (e) { if (id === reqId.current) { setQuote(null); setErr(shortErr((e as Error).message)) } } finally { if (id === reqId.current) setQuoting(false) }
    }, 600)
    return () => clearTimeout(t)
  }, [src?.address, src?.chainId, payR, target.address, target.chainId, account, solSigner, sent, paper.active, askGas])
  // the route: the API's best by default; every other one it found is listed under it, picked in a tap
  const [sel, setSel] = React.useState(0)
  React.useEffect(() => { setSel(0) }, [quote])
  const quotes = quote?.data?.quotes ?? []
  const best = quotes[sel]
  const tx = quote?.actions?.alternatives?.[sel] as AnyTx | undefined
  const srcSvm = isSvmChain(src?.chainId)
  const perms = (quote?.actions?.permissions ?? []).filter((p) => !best?.approvalTarget || !p.spender || normAddr(p.spender) === normAddr(best.approvalTarget))
  // the approval and the swap/bridge are followed by `txTrace.ts`, like every ladder step: the tray shows them too
  const approveTr = useTrace(pendingApprove)
  const approved = hasLanded(approveTr)
  // a spot quote lists the approval without flagging `approvalRequired`; trust the permission the API returned (never for native)
  const needsApprove = !paper.active && !srcSvm && perms.length > 0 && src?.address !== ZERO && !approved
  const { chainId: walletChain, address, connector } = useAccount(); const { switchTo, switching } = useSwitchTo()
  const send = useSendTransaction()
  const wrongChain = !paper.active && !!src && !srcSvm && walletChain !== Number(src.chainId)
  const sendTx = async (t: { to: string; data: string; value?: string }) => send.sendTransactionAsync({ to: t.to as `0x${string}`, data: t.data as `0x${string}`, value: BigInt(t.value || '0') })
  // settled = final on the source chain (and, across chains, the bridge says DONE); the tracer has
  // already re-read both chains' balances by then
  const sentTr = useTrace(sent?.hash)
  // the status line's "sent 14s ago" counts up while it is in flight
  const now = useNow(!!sentTr && !isDone(sentTr))
  const arrived = sentTr?.phase === 'settled'
  const lost = !!sentTr && isDone(sentTr) && !isOk(sentTr)
  React.useEffect(() => { if (approveTr && isDone(approveTr) && !isOk(approveTr)) { setErr(approveTr.err ?? 'The approval did not go through.'); setPendingApprove(undefined) } }, [approveTr?.phase])
  const [busy, setBusy] = React.useState(false)
  const remote = !srcSvm && isRemote(connector?.id)
  /** On paper: the source leaves the bank now and the quote's output arrives — at once on a swap, when the route says on a bridge. */
  const goPaper = async () => {
    if (!src || !best) return
    setErr(null); setBusy(true)
    try {
      const out = best.tradeOutput ?? 0
      const id = paperId()
      const eta = Number(best.estimatedDuration) > 0 ? Number(best.estimatedDuration) * 1000 : 0
      const route = { bridge: best.bridge, aggregator: best.aggregator, estimatedDuration: best.estimatedDuration }
      const gas = cross ? gasOf(best.destinationGas, knownOf(src.chainId)?.native?.decimals ?? (isSvmChain(src.chainId) ? 9 : 18)) : undefined
      const op: PaperOp = cross
        ? { t: 'bridge', id, fromChainId: src.chainId, toChainId: target.chainId, from: src.address, to: target.address, unitsIn: amount, unitsOut: out, arrivesAt: Date.now() + eta, route, ...(gas ? { gas } : {}) }
        : { t: 'swap', chainId: src.chainId, from: src.address, to: target.address, unitsIn: amount, unitsOut: out, route }
      await paper.act(op, [{ chainId: target.chainId, address: target.address, symbol: target.symbol, decimals: target.decimals, logo: target.logo }, ...(gas && dstGas ? [{ chainId: target.chainId, address: dstGasTok, symbol: dstGas.symbol, decimals: dstGas.decimals }] : [])])
      onTarget?.(target)
      const what = `${num(amount, 4)} ${src.symbol} → ${target.symbol}${gas && dstGas ? ` + ${num(gas.units, 4)} ${dstGas.symbol}` : ''}`
      const h = tracePaper({ id, chainId: src.chainId, account: paper.session!.evm, title: cross ? `Paper bridge ${what}` : `Paper swap ${what}`, label: cross ? `${chainLabel(src.chainId)} → ${chainLabel(target.chainId)}` : `on ${chainLabel(src.chainId)}`,
        bridge: cross ? { name: best.bridge ?? best.aggregator ?? 'bridge', toChainId: target.chainId } : undefined, arrivesAt: cross && eta ? Date.now() + eta : undefined })
      setSent({ hash: h, bridge: best.bridge })
    } catch (e) { setErr(shortErr((e as Error).message)) } finally { setBusy(false) }
  }
  const dollar = paper.active ? starterOf(target.chainId)?.dollar : undefined
  const topupsLeft = MAX_TOPUPS - (paper.ledger?.topups ?? 0)
  const topup = async () => {
    setErr(null)
    try { await paper.act({ t: 'topup', chainId: target.chainId, units: TOPUP_UNITS }); tracePaper({ id: paperId(), chainId: target.chainId, account: paper.session!.evm, title: `Paper cash · ${num(TOPUP_UNITS, 0)} ${dollar?.symbol ?? ''}`, label: `on ${chainLabel(target.chainId)}` }) }
    catch (e) { setErr(shortErr((e as Error).message)) }
  }
  const qc = useQueryClient()
  const { data: walletClient } = useWalletClient()
  // EIP-5792: does the wallet batch on the source chain? (`atomic` supported, or `ready` = it upgrades the EOA on first use)
  const caps = useCapabilities({ account: address, query: { enabled: !!address && !paper.active && cross && !srcSvm, retry: false, staleTime: 60_000 } })
  const canBatch = (() => {
    const c = (caps.data as Record<number, { atomic?: { status?: string } }> | undefined)?.[Number(src?.chainId)]
    return c?.atomic?.status === 'supported' || c?.atomic?.status === 'ready'
  })()
  /** The gas leg that did not go out after the bridge did (rejected in the wallet, or failed). */
  const [gasLegMiss, setGasLegMiss] = React.useState<{ leg: AnyTx; q: SwapRouteQuote; why: string } | null>(null)
  React.useEffect(() => { if (!sent) setGasLegMiss(null) }, [sent])
  const traceBridge = (h: string, lastValidHeight?: number) => {
    if (!src) return
    const what = `${num(amount, 4)} ${src.symbol} → ${target.symbol}`
    const signer = srcSvm ? solSigner : address
    if (signer) traceTx({
      hash: h, chainId: src.chainId, account: signer, moves: 'balances', lastValidHeight,
      title: cross ? `Bridge ${what}` : `Swap ${what}`, label: cross ? `${chainLabel(src.chainId)} → ${chainLabel(target.chainId)}` : `on ${chainLabel(src.chainId)}`,
      bridge: cross && best?.bridge ? { name: best.bridge, toChainId: target.chainId, tokenIn: src.address, tokenOut: target.address } : undefined,
      // "Received" means the target balance MOVED, not that the bridge said DONE
      watch: [{ chainId: target.chainId, address: target.address, account: walletOn(target.chainId) }],
    })
  }
  /**
   * Route + gas leg in one `wallet_sendCalls`. Returns the transaction hashes once the wallet reports them
   * (one hash for both on an atomic batch), `rejected` when the user said no (nothing was sent), or
   * undefined when the wallet would not take it — the caller then sends them one after the other.
   */
  const sendBatched = async (calls: ApiTx[]): Promise<{ bridge: string; gas?: string } | 'rejected' | 'stopped' | undefined> => {
    if (!walletClient || !src) return undefined
    let id: string
    try {
      ({ id } = await walletClient.sendCalls({ account: walletClient.account, chain: walletClient.chain, calls: calls.map((c) => ({ to: c.to as `0x${string}`, data: (c.data || '0x') as `0x${string}`, value: BigInt(c.value || '0') })) }))
    } catch (e) { return isRejection(e) ? 'rejected' : undefined }
    // the bridge's status keys on the source transaction hash: read it off the batch's receipts
    try {
      const st = await walletClient.waitForCallsStatus({ id, timeout: 180_000 })
      const rs = st.receipts ?? []
      if (st.status === 'success' && rs[0]?.transactionHash) return { bridge: rs[0].transactionHash, gas: rs[rs.length - 1]?.transactionHash }
      setErr(st.status === 'failure' ? 'The batch reverted on chain — nothing was moved.' : 'The batch was sent; your wallet has not reported it yet. Check the wallet for its status.')
    } catch { setErr('The batch was sent; its status could not be read. Check the wallet before sending again.') }
    balancesChanged(qc, src.chainId)
    return 'stopped'
  }
  const go = async () => {
    if (paper.active) return goPaper()
    // no beta access: real swaps and bridges are behind the waitlist (tickets/0006)
    if (realTradingGated()) { setErr('Trading with a real wallet is in closed beta. Join the waitlist, or use a paper account.'); return }
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
      // a gas leg BESIDE the route (one that could not ride inside it — `bundled`) is batched with it where the wallet
      // batches (EIP-5792 `wallet_sendCalls`): one signature for both. Elsewhere it follows the route (`sendGasLeg`).
      const leg = best?.destinationGas?.paidFrom === 'gas-leg' && !best.destinationGas.bundled ? best.destinationGas.transaction : undefined
      if (leg && !isSvmTx(leg) && !isSvmTx(tx) && canBatch && walletClient) {
        const r = await sendBatched([tx as ApiTx, leg as ApiTx])
        if (r === 'rejected') { setErr('Rejected in the wallet — nothing was sent.'); return }
        if (r === 'stopped') return
        if (r) {
          onTarget?.(target)
          traceBridge(r.bridge)
          setSent({ hash: r.bridge, bridge: best?.bridge })
          if (r.gas && r.gas !== r.bridge) traceGas(r.gas, best!, address)
          return
        }
        // the wallet did not take the batch: one transaction after the other, below
      }
      // a Solana source signs a base64 message in the Solana wallet; anything else is {to, data, value} through wagmi
      let h: string, lastValidHeight: number | undefined
      if (isSvmTx(tx)) {
        if (tx.expiresAt && Date.parse(tx.expiresAt) <= Date.now()) { setQuote(null); setErr('The quote expired before it was signed. It is being refreshed.'); return }
        h = base58Encode(await solSignAndSend(Uint8Array.from(atob(tx.transaction), (c) => c.charCodeAt(0))))
        lastValidHeight = tx.lastValidBlockHeight
      } else h = await sendTx(tx)
      onTarget?.(target)
      traceBridge(h, lastValidHeight)
      setSent({ hash: h, bridge: best?.bridge })
      // a gas leg (NEAR Intents, Gas.zip) beside the route is a second deposit the wallet sends right after it
      if (leg && dstGas) await sendGasLeg(leg, best!)
    } catch (e) { setErr(shortErr((e as Error).message)) } finally { setBusy(false) }
  }
  /**
   * The gas leg on its own. A rejection (or a failure) does not undo the bridge, which is already on its
   * way: the card says the gas did not go, offers to send it again or go on without it, and the balances
   * of both chains are read again either way — the bridge's input has left the wallet.
   */
  const sendGasLeg = async (leg: AnyTx, q: SwapRouteQuote) => {
    if (!src || !dstGas) return
    const signer = srcSvm ? solSigner : address
    try {
      const g = isSvmTx(leg) ? base58Encode(await solSignAndSend(Uint8Array.from(atob(leg.transaction), (c) => c.charCodeAt(0)))) : await sendTx(leg as ApiTx)
      setGasLegMiss(null)
      traceGas(g, q, signer)
    } catch (e) {
      setGasLegMiss({ leg, q, why: isRejection(e) ? 'rejected' : shortErr((e as Error).message) })
    } finally { balancesChanged(qc, src.chainId, target.chainId) }
  }
  const traceGas = (g: string, q: SwapRouteQuote, signer: string | undefined) => {
    if (signer && src && dstGas) traceTx({ hash: g, chainId: src.chainId, account: signer, moves: 'balances', title: `Gas for ${chainLabel(target.chainId)}`, label: `${num(gasOf(q.destinationGas, 18)?.units ?? 0, 4)} ${dstGas.symbol} via ${q.destinationGas?.bridge ?? 'gas leg'}`,
      watch: [{ chainId: target.chainId, address: dstGasTok, account: walletOn(target.chainId) }] })
  }
  const out = best?.tradeOutput ?? 0
  const covers = out >= need * 0.995
  // what the route is worth at market prices (`ValueCheck.tsx`): a severe loss is confirmed before it is signed
  // the gas a route brings is part of the trade: what its leg costs is paid, what lands is received (a drop out of
  // the output is already in `out`)
  const bg = cross ? best?.destinationGas : undefined
  const gasPaidUsd = bg && bg.paidFrom !== 'output' && !(bg.paidFrom === 'value' && best?.nativeFee) ? bg.cost?.usd ?? 0 : 0
  // native the route's transaction takes ON TOP of the amount (Squid's Axelar gas, LayerZero fees): paid, so counted
  const srcNative = (src && knownOf(src.chainId)?.native?.symbol) ?? 'gas'
  const srcNativeDec = (src && knownOf(src.chainId)?.native?.decimals) ?? 18
  const feeNative = best?.nativeFee ? Number(best.nativeFee.amount) / 10 ** best.nativeFee.decimals : 0
  const feeUsd = best?.nativeFee ? best.nativeFee.usd ?? feeNative * (src && isNativeAddress(src.address) ? src.price : 0) : 0
  // a native source pays the fee and any gas leg out of the same balance as the amount
  const legNative = bg?.paidFrom === 'gas-leg' && bg.cost?.amount ? Number(bg.cost.amount) / 10 ** (bg.cost.decimals ?? srcNativeDec) : 0
  const extraNative = feeNative + legNative
  const nativeShort = !paper.active && src && isNativeAddress(src.address) && !srcSvm && extraNative > 0 ? amount + extraNative - src.amount : 0
  const gasGotUsd = bg ? (Number(bg.amount) / 10 ** bg.decimals) * (paper.price(target.chainId, dstGasTok) ?? dstGasRef) : 0
  const v = useValueCheck(src && src.price > 0 ? amount * src.price + gasPaidUsd + feeUsd : 0, target.price > 0 ? out * target.price + gasGotUsd : 0, `${sel}|${out}|${amount}`)
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
const shortErr = (m: string) => (m.length > 140 ? m.slice(0, 140) + '…' : m)
/** The user said no in the wallet (EIP-1193 4001, or the words wallets use for it). */
/**
 * A route's destination gas as the paper bridge op takes it: what lands (destination gas units) and
 * what it costs in the SOURCE gas coin — nothing extra when it is dropped out of the output itself.
 */
function gasOf(g: DestinationGas | undefined, srcGasDecimals: number): { units: number; costUnits?: number } | undefined {
  const units = g ? Number(g.amount) / 10 ** g.decimals : 0
  if (!g || !(units > 0)) return undefined
  const cost = g.paidFrom !== 'output' && g.cost?.amount ? Number(g.cost.amount) / 10 ** (g.cost.decimals ?? srcGasDecimals) : 0
  return { units, ...(cost > 0 ? { costUnits: cost } : {}) }
}

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
