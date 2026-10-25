import React from 'react'
import { useAccount, useCapabilities, useSendTransaction, useWalletClient } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { fromUnits, payRaw, portion, unitsOf, type Amount } from '@yieldcircle/core/model/amount'
import { spotSwapQuote, xchainSwapQuote, ZERO, type DestinationGas, type SwapQuoteActions, type SwapQuoteData, type SwapRouteQuote } from '@yieldcircle/core/sdk/api'
import { balanceOf, gasTokenOf, knownOf, MAX_TOPUPS, paperId, starterOf, starterRef, tokenKey, TOPUP_UNITS, type PaperOp } from '@yieldcircle/core/model/paper'
import { destinationGasFor, isGasAsk, type GasPref } from '@yieldcircle/core/model/destGas'
import { isNativeAddress, type Idle } from '@yieldcircle/core/model/positions'
import type { ApiEnvelope } from '@yieldcircle/core/vendor/allocator/http'
import { base58Encode, isSvmChain, normAddr } from '@yieldcircle/core/model/address'
import { isSvmTx, type AnyTx, type ApiTx } from '@yieldcircle/core/sdk/types'
import { isRejection } from '@yieldcircle/core/sdk/walletErrors'
import { num } from '@yieldcircle/core/model/format'
import { chainLabel, useBalances } from '../sdk/queries'
import { hasLanded, isDone, isOk, tracePaper, traceTx, useTrace } from '../sdk/txTrace'
import { useNow } from '../sdk/txWords'
import { balancesChanged } from '../sdk/liveBalances'
import { loadGasPref, saveGasPref } from '../state/gasPref'
import { usePlatform } from '../platform'
import { useSession } from '../session'
import { usePaperView } from './paper'
import { useValueCheck } from './valueCheck'

export interface Target { chainId: string; address: string; symbol: string; decimals: number; price: number; logo?: string }
/** A form the strategy takes the money in, with what the wallet already holds of it. */
export type GetTarget = Target & { have: number }

export const shortErr = (m: string) => (m.length > 140 ? m.slice(0, 140) + '…' : m)
/** The user said no in the wallet (EIP-1193 4001, or the words wallets use for it). */
/**
 * A route's destination gas as the paper bridge op takes it: what lands (destination gas units) and
 * what it costs in the SOURCE gas coin — nothing extra when it is dropped out of the output itself.
 */
export function gasOf(g: DestinationGas | undefined, srcGasDecimals: number): { units: number; costUnits?: number } | undefined {
  const units = g ? Number(g.amount) / 10 ** g.decimals : 0
  if (!g || !(units > 0)) return undefined
  const cost = g.paidFrom !== 'output' && g.cost?.amount ? Number(g.cost.amount) / 10 ** (g.cost.decimals ?? srcGasDecimals) : 0
  return { units, ...(cost > 0 ? { costUnits: cost } : {}) }
}


/**
 * "Get <asset>", everything but the screen (the web's `GetAsset` drawer, the phone's Get sheet):
 * what to pay with, how much (the shortfall to start), the routes the API found for a swap on the
 * same chain or a bridge across, the destination gas a bridge brings along, the value check, and
 * the send — approve, then one transaction (or the route and its gas leg in one wallet batch).
 * `targets`: the forms the strategy takes the money in, preferred first; `onTarget` says which was bought.
 */
export function useGetAsset(targets: GetTarget[], want: number, sources: Idle[], onTarget?: (t: Target) => void) {
  const session = useSession()
  const platform = usePlatform()
  const account = session.account, solSigner = session.solSigner
  const actorOn = session.actorOn ?? (() => undefined)
  // a paper account trades its paper bank at the same quotes (tickets/0006 §K): only the send differs
  const paper = usePaperView()
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
  const { chainId: walletChain, address, connector } = useAccount(); const { switchTo, switching } = platform.useSwitchTo()
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
  const remote = !srcSvm && platform.isRemote(connector?.id)
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
    if (platform.gated()) { setErr('Trading with a real wallet is in closed beta. Join the waitlist, or use a paper account.'); return }
    if (!src || !tx) return
    setErr(null)
    if (wrongChain) { try { await switchTo(Number(src.chainId)) } catch (e) { setErr(shortErr((e as Error).message)) } return }
    // before the first await: iOS only follows the hand-off while the tap is live (wallet/deeplink.ts); a Solana source signs in the Solana wallet, not the EVM one
    if (!srcSvm) platform.openWallet(connector?.id)
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
        h = base58Encode(await platform.solSignAndSend(Uint8Array.from(atob(tx.transaction), (c) => c.charCodeAt(0))))
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
      const g = isSvmTx(leg) ? base58Encode(await platform.solSignAndSend(Uint8Array.from(atob(leg.transaction), (c) => c.charCodeAt(0)))) : await sendTx(leg as ApiTx)
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
  return { account, solSigner, paper, walletOn, ti, setTi, target, need, isTarget, opts, pick, setPick, custom, setCustom, otherOpen, setOtherOpen, src, choose, amt, setAmt, amount, payR, quote, setQuote, quoting, setQuoting, err, setErr, sent, setSent, pendingApprove, setPendingApprove, reqId, cross, dstGasTok, dstGas, dstGasRef, realGas, gasHeldUsd, gasPref, setGasPrefState, setGasPref, gasOn, setGasOn, tradeUsd, gasPlan, askGas, gasMiss, setGasMiss, sel, setSel, quotes, best, tx, srcSvm, perms, approveTr, approved, needsApprove, walletChain, address, connector, switchTo, switching, send, wrongChain, sendTx, sentTr, now, arrived, lost, busy, setBusy, remote, goPaper, dollar, topupsLeft, topup, qc, walletClient, caps, canBatch, gasLegMiss, setGasLegMiss, traceBridge, sendBatched, go, sendGasLeg, traceGas, out, covers, bg, gasPaidUsd, srcNative, srcNativeDec, feeNative, feeUsd, legNative, extraNative, nativeShort, gasGotUsd, v }
}
