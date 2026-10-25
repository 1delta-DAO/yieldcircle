import React from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import Svg, { Circle, Path } from 'react-native-svg'
import type { Idle } from '@yieldcircle/core/model/positions'
import { fromUnits, portion } from '@yieldcircle/core/model/amount'
import { fetchTokenBalances, ZERO, type SwapRouteQuote } from '@yieldcircle/core/sdk/api'
import { knownOf, TOPUP_UNITS } from '@yieldcircle/core/model/paper'
import { destinationGasFor, isGasAsk, AUTO_GAS_SHARE, type GasPref } from '@yieldcircle/core/model/destGas'
import { isSolAddr, normAddr } from '@yieldcircle/core/model/address'
import { cents, num, pctAbs, usd } from '@yieldcircle/core/model/format'
import { CHAINS, chainLabel } from '@yieldcircle/app/sdk/queries'
import { phaseWords } from '@yieldcircle/app/sdk/txWords'
import { usePlatform } from '@yieldcircle/app/platform'
import { gasOf, useGetAsset, type GetTarget, type Target } from '@yieldcircle/app/tickets/get'
import type { ValueCheck } from '@yieldcircle/app/tickets/valueCheck'
import { C } from '../theme'
import { Btn, Tok } from '../ui/bits'
import { Txt } from '../ui/Txt'
import { AmountBox, LossAck } from './parts'

/**
 * "Get <asset>" (the web's `GetAsset`, its bottom sheet on a phone): pay with anything held, on any
 * chain — the routes the API found, the best picked, one button. Everything but the screen is the
 * shared hook's (`@yieldcircle/app/tickets/get`); it opens over the ticket, so `onTarget` reaches it.
 */
export function GetSheet({ targets, want, sources, onTarget, onClose }: { targets: GetTarget[]; want: number; sources: Idle[]; onTarget?: (t: Target) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable style={{ flex: 1, minHeight: Math.max(insets.top, 24) + 36 }} onPress={onClose} accessibilityLabel="Close" />
        <View style={[st.sheet, { maxHeight: '92%' }]}>
          <Body targets={targets} want={want} sources={sources} onTarget={onTarget} onClose={onClose} bottom={insets.bottom} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function Body({ targets, want, sources, onTarget, onClose, bottom }: { targets: GetTarget[]; want: number; sources: Idle[]; onTarget?: (t: Target) => void; onClose: () => void; bottom: number }) {
  const platform = usePlatform()
  const g = useGetAsset(targets, want, sources, onTarget)
  const { account, solSigner, paper, walletOn, ti, setTi, target, need, opts, custom, setCustom, otherOpen, setOtherOpen, src, choose, amt, setAmt, amount, quoting, err, sent, setSent, setPendingApprove, cross, dstGas, gasHeldUsd, gasPref, setGasPref, gasOn, setGasOn, gasPlan, gasMiss, sel, setSel, quotes, best, tx, needsApprove, pendingApprove, approved, connector, switching, wrongChain, sentTr, now, arrived, lost, busy, setBusy, remote, dollar, topupsLeft, topup, canBatch, gasLegMiss, setGasLegMiss, go, sendGasLeg, out, covers, srcNative, srcNativeDec, extraNative, nativeShort, askGas, v } = g
  const [routesOpen, setRoutesOpen] = React.useState(false)
  return (
    <>
      <View style={st.head}>
        <Txt s={16} w={600}>Get {target.symbol}</Txt>
        <Pressable onPress={onClose} hitSlop={8} style={st.x} accessibilityLabel="Close"><Txt s={16} c={C.tx50}>✕</Txt></Pressable>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: bottom + 20 }}>
        <Txt s={13} c={C.tx70} lh={19.5}>{paper.active ? 'Pay with anything in your paper bank, on any chain — at the real routes’ prices, fees and times.' : 'Pay with anything you hold, on any chain.'}</Txt>
        <Txt s={11.5} c={C.tx40} lh={16} style={{ marginTop: 2 }}>The API swaps it on the same chain, or bridges it from another chain, into {target.symbol} on {chainLabel(target.chainId)}. {paper.active ? 'On paper, the route’s output lands in your paper bank.' : 'It lands in your wallet; then you continue with the strategy.'}</Txt>
        {paper.active && !dollar && <Txt s={12} c={C.tx50} style={{ marginTop: 10 }}>Paper cash lands on Solana. To fund {chainLabel(target.chainId)}, bridge from there — as a real wallet would.</Txt>}
        {dollar && (
          <View style={[st.card, { marginTop: 12 }]}>
            <Txt s={12.5} c={C.tx70}>Short of play money? Add {num(TOPUP_UNITS, 0)} {dollar.symbol} on {chainLabel(target.chainId)} to your paper bank ({topupsLeft > 0 ? `${topupsLeft} top-up${topupsLeft === 1 ? '' : 's'} left` : 'none left'}).</Txt>
            <View style={{ flexDirection: 'row', marginTop: 8 }}><Btn sm kind="paper" disabled={topupsLeft <= 0} title={`Add ${num(TOPUP_UNITS, 0)} ${dollar.symbol}`} onPress={() => void topup()} /></View>
          </View>
        )}
        {need > 0 && (
          <View style={st.need}>
            <Tok sym={target.symbol} logo={target.logo} size={22} />
            <Txt s={13} style={{ flex: 1 }}>You need <Txt s={13} w={700}>{num(need, need > 100 ? 2 : 4)} {target.symbol}</Txt> more on {chainLabel(target.chainId)}</Txt>
          </View>
        )}
        {targets.length > 1 && (
          <View style={st.seg}>
            {targets.map((t, k) => (
              <Pressable key={t.address} disabled={!!sent} onPress={() => { setTi(k); setPendingApprove(undefined) }} style={[st.segI, k === ti && st.segOn]}>
                <Tok sym={t.symbol} logo={t.logo} size={16} />
                <Txt s={13} c={k === ti ? C.tx : C.tx70}>{t.symbol}</Txt>
                {t.address === ZERO && <Txt s={11} mono c={C.tx50}>no approval</Txt>}
              </Pressable>
            ))}
          </View>
        )}
        {!opts.length && !custom && <Txt s={12.5} c={C.tx50} style={{ marginTop: 12 }}>No listed balance in the wallet to pay with on the selected chains. Pay with any other token by its address, or fund the wallet first.</Txt>}
        <Txt s={12} w={600} c={C.tx50} style={{ marginTop: 14, marginBottom: 6 }}>Pay with</Txt>
        <View style={{ gap: 6 }}>
          {[...(custom ? [custom] : []), ...opts.slice(0, 8)].map((o) => (
            <Pressable key={o.chainId + o.address} onPress={() => choose(o)} style={[st.src, src === o && st.srcOn]}>
              <Tok sym={o.symbol} size={18} />
              <View style={{ flex: 1 }}><Txt s={13} lh={15}>{o.symbol}</Txt><Txt s={11.5} c={C.tx40}>{chainLabel(o.chainId)}</Txt></View>
              <Txt s={12} w={600}>{o.price > 0 ? usd(o.usd) : num(o.amount, 4)}</Txt>
            </Pressable>
          ))}
          {!otherOpen && !paper.active && (
            <Pressable onPress={() => setOtherOpen(true)} style={[st.src, st.other]}>
              <View style={{ flex: 1 }}><Txt s={13} c={C.tx50} lh={15}>Other token</Txt><Txt s={11.5} c={C.tx40}>paste an address</Txt></View>
              <Txt s={12} w={600}>+</Txt>
            </Pressable>
          )}
        </View>
        {otherOpen && (account || solSigner) && <CustomToken walletOn={walletOn} chainId0={src?.chainId ?? target.chainId}
          onUse={(i) => { setCustom(i); choose(i) }}
          onCancel={() => { setOtherOpen(false); if (custom && src === custom) choose(null); setCustom(null) }} />}
        {src && (
          <>
            <View style={{ marginTop: 10 }}>
              <AmountBox soft unit={src.symbol} value={amt} onChange={(a) => { setAmt(a); setSent(null) }} onMax={() => { setAmt(portion(src, 100, src.decimals)); setSent(null) }} />
            </View>
            <View style={st.amtSub}>
              <Txt s={12} c={C.tx50} style={{ flex: 1 }}>{src.price > 0 ? `≈ ${usd(amount * src.price)}` : 'no price for it'}{amount > src.amount + 1e-9 ? <Txt s={12} c={C.warn}> · more than you hold</Txt> : null}</Txt>
              {[25, 50, 75, 100].map((p) => (
                <Pressable key={p} onPress={() => { setAmt(portion(src, p, src.decimals)); setSent(null) }} style={[st.pct, amt.pct === p && { backgroundColor: C.b400 }]}>
                  <Txt s={11.5} w={600} c={amt.pct === p ? C.tx : C.tx50}>{p}%</Txt>
                </Pressable>
              ))}
            </View>
            {!sent && (
              <View style={{ marginTop: 8 }}>
                {quoting && !best ? <Txt s={14} c={C.tx50}><ActivityIndicator size="small" color={C.tx50} /> Finding routes…</Txt>
                  : best ? <Txt s={14} c={C.tx70}>You get <Txt s={14} w={700} c={covers ? C.ok : C.warn}>~{num(out, out > 100 ? 2 : 4)} {target.symbol}</Txt>{need > 0 && !covers ? <Txt s={14} c={C.warn}> · short of the {num(need, 4)} needed</Txt> : null}</Txt>
                  : err ? <Txt s={14} c={C.bad}>{err}</Txt>
                  : <Txt s={14} c={C.tx50}>{src.price > 0 ? 'Enter an amount.' : `Enter how much ${src.symbol} to spend; the quote shows what it buys.`}</Txt>}
              </View>
            )}
            {!sent && cross && dstGas && gasPlan && <GasCard sym={dstGas.symbol} srcSym={knownOf(src.chainId)?.native?.symbol ?? 'gas'} chain={chainLabel(target.chainId)} plan={gasPlan} on={gasOn} setOn={setGasOn}
              pref={gasPref} setPref={setGasPref} heldUsd={gasHeldUsd ?? 0} route={best} miss={gasMiss} batch={canBatch} />}
            {!sent && best && nativeShort > 0 && (
              <Txt s={12} c={C.warn} lh={17} style={{ marginTop: 6 }}>This route also takes {num(extraNative, 6)} {srcNative} in fees{best.destinationGas?.paidFrom === 'gas-leg' ? ' and gas' : ''} on top of the amount — {num(nativeShort, 6)} {srcNative} more than you hold.{' '}
                <Txt s={12} c={C.primary} onPress={() => { setAmt(fromUnits(+Math.max(0, src.amount - extraNative * 1.02).toFixed(6))); setSent(null) }}>Leave room for it</Txt></Txt>
            )}
            {!sent && quotes.length > 0 && (() => {
              const top = quotes[0].tradeOutput || 1
              const cur = Math.min(sel, quotes.length - 1)
              const row = (q: SwapRouteQuote, i: number, picker = false) => {
                const o = q.tradeOutput ?? 0, d = (o / top - 1) * 1e4, name = q.bridge ?? q.aggregator ?? 'route'
                const sub = [Number(q.estimatedDuration) > 0 ? `~${Math.max(1, Math.round(Number(q.estimatedDuration) / 60))} min` : 'instant',
                  cross && q.bridge && q.aggregator ? `via ${q.aggregator}` : '',
                  cross && dstGas && askGas && askGas !== 'wait' && !gasMiss ? (q.destinationGas ? `+${num(Number(q.destinationGas.amount) / 10 ** q.destinationGas.decimals, 4)} ${dstGas.symbol}` : `no ${dstGas.symbol}`) : '',
                  q.nativeFee ? `+${num(Number(q.nativeFee.amount) / 10 ** q.nativeFee.decimals, 4)} ${srcNative} fee` : ''].filter(Boolean).join(' · ')
                return (
                  <>
                    <View style={{ flex: 1.2, minWidth: 0 }}><Txt s={13} w={700} numberOfLines={1}>{name}</Txt><Txt s={11.5} mono c={C.tx50} numberOfLines={1}>{sub}</Txt></View>
                    <View style={st.rbar}><View style={[st.rbarI, { width: `${Math.max(3, Math.min(100, (o / top) * 100))}%` }, picker && i === cur && { backgroundColor: C.primary }]} /></View>
                    <View style={{ alignItems: 'flex-end' }}><Txt s={13} w={700}>{num(o, o > 100 ? 2 : 4)} {target.symbol}</Txt><Txt s={11.5} mono c={i === 0 ? C.tx50 : d < -20 ? C.warn : C.tx50}>{i === 0 ? 'best' : `${d > 0 ? '+' : '−'}${Math.abs(d) >= 100 ? (Math.abs(d) / 100).toFixed(1) + '%' : Math.abs(d).toFixed(0) + ' bp'}`}</Txt></View>
                  </>
                )
              }
              return (
                <View style={{ marginTop: 14 }}>
                  <Txt s={12} w={600} c={C.tx50} style={{ marginBottom: 6 }}>{quotes.length === 1 ? 'Route · the one found' : `Route · ${quotes.length} found`} · {cross ? `bridge ${chainLabel(src.chainId)} → ${chainLabel(target.chainId)}` : `swap on ${chainLabel(src.chainId)}`}{quoting ? ' · refreshing…' : ''}</Txt>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <View style={[st.route, st.routeOn]}>{row(quotes[cur], cur)}</View>
                    {quotes.length > 1 && (
                      <Pressable onPress={() => setRoutesOpen((x) => !x)} style={[st.routeSet, routesOpen && { backgroundColor: C.b400 }]} accessibilityLabel="Choose another route">
                        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.tx70} strokeWidth={2} strokeLinecap="round"><Path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><Circle cx={16} cy={7} r={2} /><Circle cx={10} cy={17} r={2} /></Svg>
                      </Pressable>
                    )}
                  </View>
                  {routesOpen && (
                    <View style={st.routePop}>
                      {quotes.map((q, i) => (
                        <Pressable key={i} onPress={() => { setSel(i); setRoutesOpen(false) }} style={[st.route, { borderColor: 'transparent' }, i === cur && { backgroundColor: C.priBg }]}>{row(q, i, true)}</Pressable>
                      ))}
                    </View>
                  )}
                </View>
              )
            })()}
            {best && !sent && <>
              <ValueRow v={v} labels={['Pay', 'Receive', 'Price impact']} missing={v.inUsd > 0 ? target.symbol : src.symbol} />
              <LossAck v={v} what={cross ? 'This route' : 'This swap'} advice="Pay less, try another route, or pay with another asset." />
            </>}
            {best && !sent && v.sev === 'unk' && <Txt s={12} c={C.warn} style={{ marginTop: 6 }}>The value of this {cross ? 'route' : 'swap'} can't be checked: compare what you pay and get yourself.</Txt>}
            {sent ? (
              <View style={{ marginTop: 12 }}>
                {arrived ? (sentTr!.note ? <Txt s={14} c={C.warn}>{sentTr!.note}</Txt> : <Txt s={14} c={C.ok}>Received. Your {target.symbol} balance is refreshed; go ahead with the strategy.</Txt>)
                  : lost ? <Txt s={14} c={C.bad}>{phaseWords(sentTr!).head}: {sentTr!.err ?? 'it did not go through'}</Txt>
                  : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator size="small" color={C.tx50} />
                      <Txt s={14} c={C.tx70} style={{ flex: 1 }}>{sentTr ? phaseWords(sentTr, now).head : cross ? 'Bridging…' : 'Swapping…'}{sentTr && phaseWords(sentTr, now).detail ? <Txt s={14} c={C.tx50}> · {phaseWords(sentTr, now).detail}</Txt> : null}</Txt>
                    </View>}
                {arrived && <View style={{ flexDirection: 'row', marginTop: 10 }}><Btn title="Back to the strategy" onPress={onClose} /></View>}
              </View>
            ) : (
              <View style={st.actions}>
                <View style={{ flex: 1 }}>
                  <Btn wide kind={v.severe ? 'risky' : paper.active ? 'paper' : 'pri'}
                    disabled={(!tx && !(paper.active && best)) || v.blocked || (busy && !remote) || switching || (!!pendingApprove && !approved) || amount > src.amount + 1e-9 || nativeShort > 0}
                    onPress={busy ? () => platform.openWallet(connector?.id) : go}
                    title={switching ? 'Switching…' : busy && remote ? 'Open your wallet to confirm' : wrongChain ? `Switch wallet to ${chainLabel(src.chainId)}` : pendingApprove && !approved ? 'Approving…' : needsApprove ? `Approve ${src.symbol}` : busy ? (paper.active ? 'Applying on paper…' : 'Sending…') : `${paper.active ? 'Paper ' : ''}${cross ? (paper.active ? 'bridge' : 'Bridge') : (paper.active ? 'swap' : 'Swap')}${v.severe ? ' anyway' : ''} · ${num(amount, amount < 0.01 ? 6 : 4)} ${src.symbol}`} />
                </View>
                <Btn kind="plain" title="Cancel" onPress={onClose} />
              </View>
            )}
            {sent && gasLegMiss && dstGas && (
              <View style={[st.card, { backgroundColor: C.warnBg, marginTop: 10 }]}>
                <Txt s={12.5} c={C.tx70} lh={18}>{gasLegMiss.why === 'rejected' ? `The bridge is on its way. The gas for ${chainLabel(target.chainId)} was not sent — you declined it in the wallet.` : `The bridge is on its way. The gas for ${chainLabel(target.chainId)} did not go out: ${gasLegMiss.why}`} Without {dstGas.symbol} there, nothing can be done on {chainLabel(target.chainId)}.</Txt>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <Btn sm disabled={busy} title={`Send the gas (${num(gasOf(gasLegMiss.q.destinationGas, srcNativeDec)?.units ?? 0, 4)} ${dstGas.symbol})`} onPress={async () => { setBusy(true); try { await sendGasLeg(gasLegMiss.leg, gasLegMiss.q) } finally { setBusy(false) } }} />
                  <Btn sm kind="plain" title="Continue without" onPress={() => setGasLegMiss(null)} />
                </View>
              </View>
            )}
            {!!err && (sent || best) && <Txt s={12.5} c={C.bad} style={{ marginTop: 8 }}>{err}</Txt>}
          </>
        )}
      </ScrollView>
    </>
  )
}

/** Pay → receive, and the change in value between them (`ValueRow`, `.qval`). */
export function ValueRow({ v, labels, missing }: { v: ValueCheck; labels: [string, string, string]; missing?: string }) {
  const tone = v.sev === 'up' ? C.ok : v.sev === 'warn' || v.sev === 'unk' ? C.warn : v.sev === 'bad' ? C.bad : C.tx70
  return (
    <View style={[st.qval, v.sev === 'warn' && { borderColor: '#4a3a1a' }, v.sev === 'bad' && { borderColor: '#5a2626', backgroundColor: '#120a0a' }]}>
      <View style={st.qv}><Txt s={10.5} c={C.tx40} style={st.k}>{labels[0]}</Txt><Txt s={13} mono>{v.inUsd > 0 ? cents(v.inUsd) : '—'}</Txt></View>
      <Txt s={12} c={C.tx40} style={{ paddingBottom: 1 }}>→</Txt>
      <View style={st.qv}><Txt s={10.5} c={C.tx40} style={st.k}>{labels[1]}</Txt><Txt s={13} mono>{v.outUsd > 0 ? cents(v.outUsd) : '—'}</Txt></View>
      <View style={[st.qv, { marginLeft: 'auto', alignItems: 'flex-end' }]}>
        <Txt s={10.5} c={C.tx40} style={st.k}>{labels[2]}</Txt>
        <Txt s={13} mono c={tone}>{v.priced ? `${v.diff < 0 ? '−' : '+'}${cents(Math.abs(v.diff))} · ${v.impact < 0 ? '−' : '+'}${pctAbs(v.impact)}` : missing ? `no price for ${missing}` : 'no price'}</Txt>
      </View>
    </View>
  )
}

/** The destination-gas card (`GasCard`): whether the transfer brings the destination's gas coin along, and the standing rule. */
function GasCard({ sym, srcSym, chain, plan, on, setOn, pref, setPref, heldUsd, route, miss, batch }: {
  sym: string; srcSym: string; chain: string; plan: ReturnType<typeof destinationGasFor>; on: boolean; setOn: (b: boolean) => void
  pref: GasPref; setPref: (p: GasPref) => void; heldUsd: number; route?: SwapRouteQuote; miss: boolean; batch: boolean
}) {
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
    : g.bundled ? 'in the same transaction as the bridge — one signature'
    : batch ? `${g.bridge ?? 'a gas leg'} beside the bridge, both in one wallet batch`
    : `${g.bridge ?? 'a gas leg'}: a second transaction right after the bridge (two signatures)`
  const gear = <Pressable onPress={() => setOpen((o) => !o)} hitSlop={6} style={st.gear} accessibilityLabel="Gas settings"><Txt s={14} c={open ? C.tx : C.tx50}>⚙</Txt></Pressable>
  const settings = open && (
    <View style={{ marginTop: 8, gap: 6 }}>
      <Txt s={12} c={C.tx70} lh={17}>When the wallet you bridge to holds too little of the chain's gas coin to pay its network fees, the bridge can bring some along.</Txt>
      <View style={st.seg}>
        {(['auto', 'custom', 'off'] as const).map((m) => (
          <Pressable key={m} onPress={() => setPref(m === 'custom' ? { mode: 'custom', usd: Math.max(0.5, Number(custom) || 2) } : { mode: m })} style={[st.segI, { flex: 1, justifyContent: 'center' }, pref.mode === m && st.segOn]}>
            <Txt s={12.5} c={pref.mode === m ? C.tx : C.tx70}>{m === 'auto' ? 'Auto' : m === 'custom' ? 'Fixed amount' : 'Off'}</Txt>
          </Pressable>
        ))}
      </View>
      {pref.mode === 'custom' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt s={12.5} c={C.tx70}>$</Txt>
          <TextInput value={custom} keyboardType="decimal-pad" onChangeText={(t) => { setCustom(t); const n = Number(t); if (n >= 0.5) setPref({ mode: 'custom', usd: n }) }} style={st.gasIn} accessibilityLabel="Gas to bring, USD" />
          <Txt s={12.5} c={C.tx70}>worth of gas each time</Txt>
        </View>
      )}
      <Txt s={11.5} c={C.tx50} lh={16}>{pref.mode === 'auto' ? `Auto: about two transactions' worth on the destination, never more than ${Math.round(AUTO_GAS_SHARE * 100)} % of what you bridge — and none when the transfer is too small to carry a useful amount.`
        : pref.mode === 'custom' ? 'Fixed: this much whenever the destination wallet is short (at least $0.50 — a gas leg has fixed costs of its own).'
        : 'Off: bridges bring only the asset. You will need gas on the destination from somewhere else.'}</Txt>
    </View>
  )
  if (!isGasAsk(plan)) return (
    <View style={st.gas}>
      <View style={st.gasRow}><Txt s={12.5} c={C.warn} lh={18} style={{ flex: 1 }}>{held}, and this transfer is too small to bring useful gas along (from about {usd(plan.needUsd)}). Get {sym} there separately.</Txt>{gear}</View>
      {settings}
    </View>
  )
  return (
    <View style={st.gas}>
      <View style={st.gasRow}>
        <Switch value={on} onValueChange={setOn} trackColor={{ true: C.primary, false: C.line2 }} />
        <Txt s={12.5} style={{ flex: 1 }}>Bring gas to {chain}</Txt>
        <Txt s={12.5} mono>{on ? `+${num(got || Number(plan.amount === 'auto' ? 0.005 : plan.amount), 5)} ${sym}` : ''}<Txt s={11} c={C.tx50}>{on ? (cost != null ? ` · $${cost.toFixed(2)} in ${srcSym}` : ` · ≈ ${usd(plan.usd)}`) : 'off'}</Txt></Txt>
        {gear}
      </View>
      <Txt s={12} lh={17} c={miss && on ? C.warn : on ? C.tx50 : C.warn} style={{ marginTop: 4 }}>
        {miss && on ? `${held}, and no route here can bring some along. Get ${sym} there separately — without it, nothing can be done on ${chain}.`
          : on ? `${held} for network fees${how ? ` · ${how}` : ''}.`
          : `${held}. Without it, nothing can be done there after the transfer.`}
      </Txt>
      {settings}
    </View>
  )
}

/** Any token, by address (`CustomToken`): looked up on the chosen chain through the balance route, then offered as a source. */
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
  }, [found?.symbol, found?.balanceRaw, chainId, addr]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={st.custom}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {CHAINS.map((c) => (
          <Pressable key={c.id} onPress={() => setChainId(c.id)} style={[st.chip, c.id === chainId && st.segOn]}><Txt s={12} c={c.id === chainId ? C.tx : C.tx50}>{c.label}</Txt></Pressable>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 8 }}>
        <TextInput value={raw} onChangeText={setRaw} placeholder="0x… token address" placeholderTextColor={C.tx40} autoCapitalize="none" autoCorrect={false} autoFocus style={st.addr} accessibilityLabel="Token address" />
        <Pressable onPress={onCancel} hitSlop={6} style={st.x} accessibilityLabel="Remove"><Txt s={14} c={C.tx50}>✕</Txt></Pressable>
      </View>
      <View style={{ marginTop: 6 }}>
        {!raw ? <Txt s={12} c={C.tx50}>Paste the token's contract address on {chainLabel(chainId)}.</Txt>
          : !valid ? <Txt s={12} c={C.warn}>Not an address.</Txt>
          : q.isFetching && !q.data ? <Txt s={12} c={C.tx50}>Looking it up…</Txt>
          : q.isError ? <Txt s={12} c={C.bad}>Could not read it: {(q.error as Error).message}</Txt>
          : !found ? <Txt s={12} c={C.bad}>No token at this address on {chainLabel(chainId)}.</Txt>
          : <Txt s={12} c={C.tx70}><Txt s={12} w={700}>{found.symbol}</Txt>{b?.name && b.name !== found.symbol ? ` · ${b.name}` : ''} · you hold {num(parseFloat(found.balance) || 0, 6)}{found.priceUSD ? '' : <Txt s={12} c={C.warn}> · no price: the quote is the only estimate</Txt>}</Txt>}
      </View>
    </View>
  )
}

const st = StyleSheet.create({
  sheet: { backgroundColor: C.b200, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingBottom: 14, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: C.line },
  x: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  card: { padding: 12, borderRadius: 14, backgroundColor: C.b300 },
  need: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: C.warnBg, marginTop: 12 },
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: C.b300, marginTop: 12 },
  segI: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 30, paddingHorizontal: 10, borderRadius: 10 },
  segOn: { backgroundColor: C.b200 },
  src: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: 'transparent', backgroundColor: C.b300 },
  srcOn: { backgroundColor: C.priBg, borderColor: C.primary },
  other: { borderStyle: 'dashed', borderColor: C.line2, backgroundColor: 'transparent' },
  amtSub: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  pct: { height: 26, paddingHorizontal: 8, borderRadius: 8, backgroundColor: C.b300, justifyContent: 'center' },
  route: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: C.line2 },
  routeOn: { borderColor: C.primary, backgroundColor: C.priBg },
  routeSet: { width: 48, borderRadius: 14, backgroundColor: C.b300, alignItems: 'center', justifyContent: 'center' },
  routePop: { marginTop: 6, padding: 4, gap: 2, borderRadius: 14, backgroundColor: C.b300 },
  rbar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.b400, overflow: 'hidden' },
  rbarI: { height: '100%', backgroundColor: C.tx40, borderRadius: 2 },
  qval: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', columnGap: 10, rowGap: 6, marginTop: 10, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: C.line2, borderRadius: 12, backgroundColor: C.b200 },
  qv: { gap: 2, minWidth: 0 },
  k: { textTransform: 'uppercase', letterSpacing: 0.5 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  gas: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, backgroundColor: C.b300 },
  gasRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gear: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  gasIn: { width: 64, height: 32, borderRadius: 8, borderWidth: 1, borderColor: C.line2, color: C.tx, paddingHorizontal: 8, fontFamily: 'IBMPlexMono_400Regular' },
  custom: { marginTop: 8, padding: 10, borderRadius: 14, backgroundColor: C.b300 },
  chip: { height: 30, paddingHorizontal: 10, borderRadius: 10, justifyContent: 'center', backgroundColor: C.b400 },
  addr: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: C.line2, backgroundColor: '#000', color: C.tx, paddingHorizontal: 10, fontFamily: 'IBMPlexMono_400Regular', fontSize: 14 },
})
