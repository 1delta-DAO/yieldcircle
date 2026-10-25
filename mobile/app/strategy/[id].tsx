import React from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLiteMenu } from '@yieldcircle/app/lite'
import { brandOf, holdingLine, leverTag, liteModes, moneyWord, plainName, trustKind, type LiteMode } from '@yieldcircle/core/model/lite'
import { usd, usdShort } from '@yieldcircle/core/model/format'
import { owedOf } from '@yieldcircle/core/model/borrow'
import { pnlLine } from '@yieldcircle/core/model/holdingPnl'
import { useHoldingPnl } from '@yieldcircle/app/index/pnl'
import { useSession } from '@yieldcircle/app/session'
import { sharePosition } from '../../src/ui/lite'
import { C } from '../../src/theme'
import { Sk, Tok, Toks } from '../../src/ui/bits'
import { Who } from '../../src/ui/Character'
import { Txt } from '../../src/ui/Txt'
import { Details, Sec, TicketHead, Trust } from '../../src/ticket/parts'
import { DepositBody, LoanBody, LoopBody, ManageLoopBody, WithdrawBody } from '../../src/ticket/bodies'

/**
 * Lite's ticket (the web's `LiteTicket`, docs/lite.md §5), as a sheet: what it is in words, then one
 * of a few plain actions — never a tier, a slider, a route or a sub-account. Opened on a row
 * (`id`), or on a position (`h`, its holding key) whether or not Lite would offer it today; `copy`
 * and `lev` when it copies a wallet, `m` the action a link asked for.
 */
export default function TicketScreen() {
  const p = useLocalSearchParams<{ id: string; h?: string; copy?: string; lev?: string; m?: string }>()
  const insets = useSafeAreaInsets()
  const L = useLiteMenu()
  const { b } = L
  const byKey = p.h ? b.holdings.find((x) => x.key === p.h) ?? null : null
  // a position opened by its key (You) runs whatever strategy the catalogue holds for it, or none
  const s = b.all.find((x) => x.id === p.id) ?? b.hidden.find((x) => x.id === p.id) ?? b.overflow.find((x) => x.id === p.id) ?? (byKey ? L.runs(byKey) ?? null : null)
  const holdings = s ? L.holdingsOf(s) : byKey ? [byKey] : []
  const holding = holdings.find((x) => x.key === p.h) ?? holdings[0] ?? null
  // what an Add builds on: the picked position, unless the API cannot build for its account — then a new one
  const into = holding && !holding.subAccount?.unsupported ? holding : null
  const copyLev = p.lev ? Number(p.lev) : undefined
  const { isLoop, start, tabs } = liteModes(s, holding, p.m)
  const [mode, setMode] = React.useState<LiteMode>(start)
  // the position may arrive after the sheet opens: start where it would have
  const seen = React.useRef(!!holding)
  React.useEffect(() => { if (!seen.current && holding) { seen.current = true; setMode(start) } }, [!!holding]) // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => router.back()
  // what the position made since it was opened: the index's own figure for it
  const pnl = useHoldingPnl(byKey ?? holding)
  const { account } = useSession()

  if (!s && !holding) {
    return (
      <Frame insets={insets}>
        <TicketHead face={<Sk w={26} h={26} r={13} />} title={b.isLoading ? '' : 'Not in the catalogue right now'} onClose={close} />
        <Sec plain>{b.isLoading ? <Sk w={200} /> : <Txt s={13} c={C.tx50}>This strategy is not on the menu on these chains at the moment.</Txt>}</Sec>
      </Frame>
    )
  }
  const h = holding
  // a loan (from You): Lite opens none, but pays one back
  if (byKey?.kind === 'borrow') {
    const ln = holdingLine(byKey)
    return (
      <Frame insets={insets}>
        <TicketHead face={<Toks a={byKey.symbol} b={byKey.debtSymbol ?? 'USD'} logoA={byKey.logo} />} title={`${moneyWord(byKey.asset, byKey.group)} loan`} sub={`owes ${usd(owedOf(byKey))} · ${ln.text.replace(/^A loan · /, '')}`} subTone={ln.tone} pnl={pnl ? pnlLine(pnl, { loan: true }) : null} onClose={close} />
        <LoanBody h={byKey} idle={b.idlePerChain} />
        <Details what="Borrow more, or take collateral out" onOpen={() => router.push('/details')} />
      </Frame>
    )
  }
  const n = s ? plainName(s) : null
  const title = n?.title ?? (h ? moneyWord(h.asset, h.group) : '')
  const line = h ? holdingLine(h) : null
  const chainIdle = s ? b.idlePerChain.filter((i) => i.chainId === s.chainId) : []
  const lev = s?.kind === 'loop' ? (h?.leverage && h.leverage > 1.05 ? h.leverage : copyLev && copyLev > 1.05 ? copyLev : s.tiers.balanced) : h?.kind === 'loop' ? h.leverage ?? 1 : 0
  const face = s?.kind === 'loop' ? <Toks a={s.holds} b={s.debt} logoA={s.logoLong} logoB={s.logoShort} /> : s ? <Tok sym={s.assetSymbol} logo={[s.tokenLogo, s.logo]} size={26} /> : <Tok sym={h!.symbol} logo={h!.logo} size={26} />
  return (
    <Frame insets={insets}>
      <TicketHead face={face} title={title} sub={line ? `${usd(h!.valueUsd)} yours · ${line.text}` : n?.sub} subTone={line?.tone} pnl={h && pnl ? pnlLine(pnl) : null} onShare={sharePosition(s, h, account)} lever={lev > 1.05 ? leverTag(lev) : undefined} onClose={close} />
      {tabs.length > 1 && (
        <Sec>
          <View style={st.modes}>
            {tabs.map((x) => (
              <Pressable key={x.id} onPress={() => setMode(x.id)} style={[st.mode, mode === x.id && st.modeOn]}>
                <Txt s={13} c={mode === x.id ? C.primary : C.tx50}>{x.word}</Txt>
              </Pressable>
            ))}
            {holdings.length > 1 && <Txt s={11.5} mono c={C.tx50} style={{ marginLeft: 'auto' }}>1 of {holdings.length}</Txt>}
          </View>
        </Sec>
      )}
      {p.copy && s && (
        <View style={st.copy}>
          <Who account={p.copy} size={24} />
          <Txt s={12.5} c={C.tx70} style={{ flexBasis: '100%' }}>is in this {s.kind === 'loop' ? 'loop' : 'strategy'}. You are opening the same one{s.kind === 'loop' && copyLev ? ` at their ${copyLev.toFixed(2)}×` : ''} — your own size.</Txt>
        </View>
      )}
      {h && mode !== 'add'
        ? (h.subAccount?.unsupported
          ? <Sec><Txt s={13} c={C.tx70}>YieldCircle cannot build for this account yet: manage it on {h.venue.split(' · ')[0]}.</Txt></Sec>
          : isLoop ? <ManageLoopBody key={h.key + mode} s={s?.kind === 'loop' ? s : null} h={h} close={mode === 'close'} />
          : <WithdrawBody key={h.key} s={s?.kind === 'simple' ? s : null} h={h} />)
        : s?.kind === 'simple' ? <DepositBody key={into?.key} s={s} idle={chainIdle} allIdle={b.idlePerChain} into={into} />
        : s?.kind === 'loop' ? <LoopBody key={into?.key} s={s} idle={chainIdle} allIdle={b.idlePerChain} holding={into} copyLev={copyLev} />
        : null}
      {s && <Trust left={`${trustKind(s)} · ${usdShort(s.tvlUsd)} in it`} right={brandOf(s)} />}
      {!s && h && <Trust left="Not one of Lite’s picks: you can take it out or make it safer here" />}
      <Details what={isLoop ? 'Any leverage, the route, every number' : 'Any amount, the venue, the history'} onOpen={() => router.push('/details')} />
    </Frame>
  )
}

/** The sheet: rounded at the top over a dimmed page, its grab handle, scrolling under the keyboard. */
function Frame({ insets, children }: { insets: { top: number; bottom: number }; children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <Pressable style={{ height: Math.max(insets.top, 24) + 36 }} onPress={() => router.back()} accessibilityLabel="Close" />
      <View style={st.sheet}>
        <View style={st.grab} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>{children}</ScrollView>
      </View>
    </KeyboardAvoidingView>
  )
}

const st = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: C.b200, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.line2, marginTop: 8 },
  modes: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mode: { minHeight: 32, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', justifyContent: 'center' },
  modeOn: { borderColor: C.primary, backgroundColor: '#062830' },
  copy: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, backgroundColor: '#062830', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.line },
})
