import React from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLiteMenu } from '@yieldcircle/app/lite'
import { brandOf, holdingLine, leverTag, liteEligible, liteModes, moneyWord, plainName, riskWord, trustKind, type LiteMode } from '@yieldcircle/core/model/lite'
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
import { Choices, Details, MoreCtx, MoreSheet, Numbers, Sec, TicketHead, Trust } from '../../src/ticket/parts'
import { bufferOfHealth } from '@yieldcircle/core/model/lite'
import { pct } from '@yieldcircle/core/model/format'
import { chainLabel } from '@yieldcircle/app/sdk/queries'
import type { Holding } from '@yieldcircle/core/model/positions'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { DepositBody, LoanBody, LoopBody, ManageLoopBody, WithdrawBody } from '../../src/ticket/bodies'

/**
 * Lite's ticket (the web's `LiteTicket`, docs/lite.md §5), as a sheet: what it is in words, then one
 * of a few plain actions — never a tier, a slider, a route or a sub-account. What those decide is
 * offered back in Lite's words in "More choices" (`MoreSheet`, drawn by each body). Opened on a row
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
  // more than one position on it (sub-accounts): the one picked in "More choices", else the one the link named
  const [hk, setHk] = React.useState<string | undefined>(p.h)
  const holding = holdings.find((x) => x.key === hk) ?? holdings.find((x) => x.key === p.h) ?? holdings[0] ?? null
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
  const [more, setMore] = React.useState(false)

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
      <MoreCtx.Provider value={{ open: more, close: () => setMore(false), pro: `#/${byKey.group}?${new URLSearchParams({ k: 'borrow', h: byKey.key, m: 'reduce' })}` }}>
      <Frame insets={insets}>
        <TicketHead face={<Toks a={byKey.symbol} b={byKey.debtSymbol ?? 'USD'} logoA={byKey.logo} />} title={`${moneyWord(byKey.asset, byKey.group)} loan`} sub={`owes ${usd(owedOf(byKey))} · ${ln.text.replace(/^A loan · /, '')}`} subTone={ln.tone} pnl={pnl ? pnlLine(pnl, { loan: true }) : null} onClose={close} />
        <LoanBody h={byKey} idle={b.idlePerChain} />
        <Details what="Every number · borrowing more is in Pro" onOpen={() => setMore(true)} />
      </Frame>
      </MoreCtx.Provider>
    )
  }
  const n = s ? plainName(s) : null
  const title = n?.title ?? (h ? moneyWord(h.asset, h.group) : '')
  const line = h ? holdingLine(h) : null
  const chainIdle = s ? b.idlePerChain.filter((i) => i.chainId === s.chainId) : []
  const lev = s?.kind === 'loop' ? (h?.leverage && h.leverage > 1.05 ? h.leverage : copyLev && copyLev > 1.05 ? copyLev : s.tiers.balanced) : h?.kind === 'loop' ? h.leverage ?? 1 : 0
  const face = s?.kind === 'loop' ? <Toks a={s.holds} b={s.debt} logoA={s.logoLong} logoB={s.logoShort} /> : s ? <Tok sym={s.assetSymbol} logo={[s.tokenLogo, s.logo]} size={26} /> : <Tok sym={h!.symbol} logo={h!.logo} size={26} />
  // the sheet's foot: the same position (or row) on Pro's own page, on the web
  const pro = h ? `#/${h.group}?${new URLSearchParams({ ...(s ? { s: s.id } : {}), k: h.kind, h: h.key, m: mode === 'add' ? 'add' : isLoop ? 'manage' : 'reduce' })}`
    : s ? `#/${s.group}?${new URLSearchParams({ s: s.id, k: s.kind })}` : '#/'
  const top = holdings.length > 1 && mode !== 'add' && h
    ? <Choices label="Which one" items={holdings.map((x) => ({ id: x.key, word: usd(x.valueUsd), line: [x.subAccount?.label, holdingLine(x).text].filter(Boolean).join(' · ') }))} on={h.key} onPick={(k) => setHk(k)} />
    : null
  const moreWhat = mode === 'add' ? (isLoop ? 'How hard to push it, what to pay with, every number' : 'What to pay with, every number')
    : mode === 'close' ? 'What you get it back in, every number'
    : isLoop ? 'Any of Lite’s leverages, every number' : 'How it is paid out, every number'
  return (
    <MoreCtx.Provider value={{ open: more, close: () => setMore(false), pro, top }}>
    <Frame insets={insets}>
      <TicketHead face={face} title={title} sub={line ? `${usd(h!.valueUsd)} yours · ${line.text}` : n ? `${n.sub} · ${riskWord(s!.risk)}` : undefined} subTone={line?.tone} pnl={h && pnl ? pnlLine(pnl) : null} onShare={sharePosition(s, h, account)} lever={lev > 1.05 ? leverTag(lev) : undefined} onClose={close} />
      {tabs.length > 1 && (
        <Sec>
          <View style={st.modes}>
            {tabs.map((x) => (
              <Pressable key={x.id} onPress={() => setMode(x.id)} style={[st.mode, mode === x.id && st.modeOn]}>
                <Txt s={13} c={mode === x.id ? C.primary : C.tx50}>{x.word}</Txt>
              </Pressable>
            ))}
            {holdings.length > 1 && <Txt s={12} c={C.tx50} style={{ marginLeft: 'auto' }}>1 of {holdings.length}</Txt>}
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
          ? <><Sec><Txt s={13} c={C.tx70}>YieldCircle cannot build for this account yet: manage it on {h.venue.split(' · ')[0]}.</Txt></Sec><MoreSheet><HeldNumbers h={h} s={s} /></MoreSheet></>
          : isLoop ? <ManageLoopBody key={h.key + mode} s={s?.kind === 'loop' ? s : null} h={h} close={mode === 'close'} />
          : <WithdrawBody key={h.key} s={s?.kind === 'simple' ? s : null} h={h} />)
        : s?.kind === 'simple' ? <DepositBody key={into?.key} s={s} idle={chainIdle} allIdle={b.idlePerChain} into={into} />
        : s?.kind === 'loop' ? <LoopBody key={into?.key} s={s} idle={chainIdle} allIdle={b.idlePerChain} holding={into} copyLev={copyLev} />
        : null}
      {s && <Trust left={`${trustKind(s)} · ${usdShort(s.tvlUsd)} in it`} right={brandOf(s)} />}
      {s && h && !liteEligible(s) && <Trust left={`Lite does not offer this one new, but it is yours: ${isLoop ? 'make it safer or close it here' : 'take it out here'}.`} />}
      <Details what={moreWhat} onOpen={() => setMore(true)} />
    </Frame>
    </MoreCtx.Provider>
  )
}

/** "More choices" on a move with nothing to choose (an account it cannot build for): the position's numbers. */
function HeldNumbers({ h, s }: { h: Holding; s: Strategy | null }) {
  const b = bufferOfHealth(h.health)
  return (
    <Numbers rows={[
      ['Yours', usd(h.valueUsd)],
      ...(h.kind === 'loop' && h.leverage && h.leverage > 1.05 ? [['Leverage', leverTag(h.leverage)] as [string, string]] : []),
      ...(b != null ? [['From liquidation', pct(b * 100, 1)] as [string, string]] : []),
      ...(h.debtAmount ? [['Owes', `${h.debtAmount.toFixed(h.group === 'USD' ? 2 : 4)} ${h.debtSymbol ?? ''}`] as [string, string]] : []),
      ...(s ? [['Risk', riskWord(s.risk)] as [string, string]] : []),
      ['Where', `${h.venue.split(' · ')[0]} · ${chainLabel(h.chainId)}`],
    ]} />
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
