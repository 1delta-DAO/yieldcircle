import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBook } from '@yieldcircle/app/book'
import { useSession } from '@yieldcircle/app/session'
import { chainLabel, useBorrowOffers } from '@yieldcircle/app/sdk/queries'
import { useStrategyProofs } from '@yieldcircle/app/index/queries'
import { useProfiles } from '@yieldcircle/app/social/queries'
import { bestOfferFor, isOut, isPutUp, loansByOffer, offerFromHolding, outOf, owedOf, type BorrowOffer, type Out } from '@yieldcircle/core/model/borrow'
import { num, pct, usd, usdShort } from '@yieldcircle/core/model/format'
import { riskWord } from '@yieldcircle/core/model/lite'
import type { Holding } from '@yieldcircle/core/model/positions'
import { canonUid, pairKey, type ThreadRef } from '@yieldcircle/core/model/uid'
import { C } from '../../src/theme'
import { Sk, Toks } from '../../src/ui/bits'
import { Txt } from '../../src/ui/Txt'
import { Who } from '../../src/ui/Character'
import { canOpen } from '../../src/ui/borrow'
import { openWallet } from '../../src/ui/lite'
import { Thread } from '../../src/ui/thread'
import { Choices, Details, Frame, MoreCtx, Sec, ThreadCtx, TicketHead } from '../../src/ticket/parts'
import { BorrowBody, ManageLoopBody, RepayWithdrawBody } from '../../src/ticket/bodies'

/**
 * The borrow ticket (the web's `BorrowTicket`), as a sheet: put something up, take something out —
 * and pay it back. Opened on an offer (`id`, with `out` when it lends a coin) or on a running loan
 * (`h`, its holding key; `m` = `reduce` starts on Pay back, `close` on Close), or on an asset alone (`u`, with `id`
 * `_`: a link to the web's `#/borrow?u=…`) — then on the app's pick for it. The other places that
 * lend against it are in "More choices", never a list to read first.
 *
 * A loan in a market the list does not show is also unwound here, like a loop with no row
 * (`ManageLoopBody`, `s` null): Lower risk sells collateral to pay debt down, Close sells and repays it all.
 */
export default function BorrowScreen() {
  const p = useLocalSearchParams<{ id: string; h?: string; m?: string; out?: string; u?: string }>()
  const insets = useSafeAreaInsets()
  const b = useBook()
  const { chainIds } = useSession()
  const loan = p.h ? b.holdings.find((x) => x.key === p.h && x.kind === 'borrow') ?? null : null
  // a running loan that owes a coin: its family is asked too, so it is managed from its own market
  const out: Out = isOut(p.out) ? p.out : loan?.debtAddress ? outOf({ chainId: loan.chainId, address: loan.debtAddress, symbol: loan.debtSymbol }) ?? 'USD' : 'USD'
  const bo = useBorrowOffers(chainIds, { out })
  const offers = bo.offers
  const held = React.useMemo(() => loansByOffer(offers, b.holdings), [offers, b.holdings])
  // another place picked in "More choices" moves the sheet there
  const [id, setId] = React.useState(p.id)
  const sameLegs = (o: BorrowOffer, h: Holding) => !!h.collateralUid && !!h.debtUid && h.collateralUid.toLowerCase() === o.collateral.uid.toLowerCase() && h.debtUid.toLowerCase() === o.debt.uid.toLowerCase()
  const listed = offers.find((x) => x.id === id) ?? (loan ? offers.find((x) => sameLegs(x, loan)) : undefined)
    ?? (p.u && id === p.id ? bestOfferFor(p.u, offers.filter((x) => x.out === out && canOpen(x)), b.idlePerChain, out) ?? undefined : undefined)
  const o = listed ?? (loan ? offerFromHolding(loan) : null)
  const holdings = o ? held.get(o.id) ?? (loan ? [loan] : []) : []
  const [hk, setHk] = React.useState(p.h)
  const holding = holdings.find((x) => x.key === hk) ?? holdings[0] ?? null
  // what more is borrowed on: the picked account, unless the API cannot build for it — then a new loan
  const into = holding && !holding.subAccount?.unsupported ? holding : null
  const putUp = !!holding && isPutUp(holding)
  // off the list (once the offers have answered), a running loan is unwound like a loop with no row: the two market uids are all it needs
  const unwinds = !listed && !bo.isLoading && !!holding && !putUp && !holding.subAccount?.unsupported && !!holding.collateralUid && !!holding.debtUid
  const [pane0, setPane] = React.useState<'borrow' | 'repay' | 'safer' | 'close'>(p.h && p.m && p.m !== 'add' ? (p.m === 'close' ? 'close' : 'repay') : 'borrow')
  const pane = (pane0 === 'safer' || pane0 === 'close') && !unwinds ? 'repay' : pane0
  const [more, setMore] = React.useState(false)
  const close = () => router.back()
  const uid = o ? canonUid(o.collateral.uid) : null
  const thread = React.useMemo<ThreadRef | null>(() => (uid ? { kind: 'market', key: uid } : null), [uid])

  if (!o) {
    const waiting = bo.isLoading || b.positionsLoading
    return (
      <Frame insets={insets}>
        <TicketHead face={<Sk w={26} h={26} r={13} />} title={waiting ? '' : 'Not on the list right now'} onClose={close} />
        <Sec plain>{waiting ? <Sk w={200} /> : <Txt s={13} c={C.tx50} lh={19}>No market lends on this pair on the chains you picked right now.</Txt>}</Sec>
      </Frame>
    )
  }
  const fresh = !holding || putUp
  const places = fresh ? offers.filter((x) => x.asset === o.asset && x.out === o.out && canOpen(x)).slice(0, 8) : []
  const where = places.length > 1
    ? <Choices label="Where" note="Every place that lends against it, the app's pick first." on={o.id} onPick={(x) => { setId(x); setMore(false) }}
      items={places.map((x) => ({ id: x.id, word: `${x.venue} · ${chainLabel(x.chainId)}`, line: `${x.collateral.symbol} → ${x.debt.symbol} · lends ${Math.round(x.maxLtv * 100)}% · ${usdShort(x.liquidityUsd)} free`, side: pct(x.borrowApr), tone: x.borrowApr < o.borrowApr ? 'ok' : '' }))} />
    : null
  const owed = holding ? owedOf(holding) : 0
  const top = holdings.length > 1 && holding
    ? <Choices label="Which loan" items={holdings.map((x) => ({ id: x.key, word: x.subAccount?.label ?? 'Main account', line: isPutUp(x) ? `${usdShort(x.valueUsd)} put up · nothing owed` : `owes ${usd(owedOf(x))}` }))} on={holding.key} onPick={(k) => setHk(k)} />
    : null
  // the other markets for the same pair on its chain: the body's "cheaper elsewhere" nudge
  const alternatives = fresh ? offers.filter((x) => x.chainId === o.chainId && x.asset === o.asset && x.debt.symbol === o.debt.symbol && canOpen(x)) : []
  const pro = `#/borrow?${new URLSearchParams({ u: o.asset, s: o.id, ...(holding ? { h: holding.key } : {}), ...(o.out !== 'USD' ? { out: o.out } : {}) })}`
  return (
    <ThreadCtx.Provider value={thread}>
    <MoreCtx.Provider value={{ open: more, close: () => setMore(false), pro, top }}>
    <Frame insets={insets}>
      <TicketHead face={<Toks a={o.collateral.symbol} b={o.debt.symbol} logoA={o.collateral.logo} logoB={o.debt.logo} />} title={`Borrow ${o.debt.symbol} against ${o.collateral.symbol}`}
        sub={holding && !putUp ? `owes ${usd(owed)}${holding.health != null ? ` · health ${holding.health.toFixed(2)}` : ''} · ${o.venue}` : `${o.venue} · ${chainLabel(o.chainId)} · ${o.rated ? riskWord(o.risk) : 'unrated'}`} onClose={close} />
      {holding && !putUp && (
        <Sec>
          <View style={st.modes}>
            {(unwinds ? ['borrow', 'repay', 'safer', 'close'] as const : ['borrow', 'repay'] as const).map((x) => (
              <Pressable key={x} onPress={() => setPane(x)} style={[st.mode, pane === x && st.modeOn]}>
                <Txt s={13} c={pane === x ? C.primary : C.tx50}>{PANES[x]}</Txt>
              </Pressable>
            ))}
            {holdings.length > 1 && <Txt s={12} c={C.tx50} style={{ marginLeft: 'auto' }}>1 of {holdings.length}</Txt>}
          </View>
        </Sec>
      )}
      {holding && putUp && <Sec><Txt s={13} c={C.tx70} lh={19}><Txt s={13} w={600}>{num(holding.amount, 4)} {holding.symbol}</Txt> already put up at {holding.venue.split(' · ')[0]} · nothing owed</Txt></Sec>}
      {/* where it is taken, in one line: the other places are a tap away, not a list to read first */}
      {fresh && (
        <Pressable onPress={() => setMore(true)} disabled={!where} style={st.where}>
          <Txt s={13} c={C.tx50} style={{ flex: 1 }}>From <Txt s={13} w={600}>{o.venue}</Txt> · {chainLabel(o.chainId)} · <Txt s={13} w={600}>{pct(o.borrowApr)}</Txt> · lends {Math.round(o.maxLtv * 100)}%</Txt>
          {where && <Txt s={12.5} c={C.primary}>{places.length - 1} other place{places.length === 2 ? '' : 's'} ›</Txt>}
        </Pressable>
      )}
      {!listed && <Sec><Txt s={12.5} c={C.warn} lh={18}><Txt s={12.5} w={700} c={C.warn}>Not in the list.</Txt> This loan sits in a market the list does not show. It can be paid back or unwound here; borrowing more is for the venue itself.</Txt></Sec>}
      {holding && !putUp && (pane === 'safer' || pane === 'close')
        ? <ManageLoopBody key={holding.key + pane} s={null} h={holding} close={pane === 'close'} />
        : holding && !putUp && pane === 'repay'
        ? <RepayWithdrawBody key={holding.key} o={o} h={holding} idle={b.idlePerChain} />
        : <BorrowBody key={`${o.id}:${into?.key ?? 'new'}`} o={o} h={into} idle={b.idlePerChain} more={where} alternatives={alternatives} onPick={setId} />}
      {pane === 'borrow' || fresh ? <Details what={where ? 'Where to borrow, every number' : 'Every number'} onOpen={() => setMore(true)} />
        : pane === 'safer' ? <Details what="Any of Lite’s leverages, every number" onOpen={() => setMore(true)} />
        : pane === 'close' ? <Details what="What you get it back in, every number" onOpen={() => setMore(true)} /> : null}
      <BorrowSocial o={o} thread={thread} />
    </Frame>
    </MoreCtx.Provider>
    </ThreadCtx.Provider>
  )
}

/** "37 wallets borrow against TSLAx here", with the biggest one's face — only what the index can back — then the market's thread, folded. */
function BorrowSocial({ o, thread }: { o: BorrowOffer; thread: ThreadRef | null }) {
  const key = pairKey(o.collateral.uid, o.debt.uid)
  const keys = React.useMemo(() => (key ? [key] : []), [key])
  const proofs = useStrategyProofs(keys)
  const row = key ? proofs.data?.get(key) : undefined
  const top = row?.top?.account
  const { profile } = useProfiles(top ? [top] : [])
  const [talk, setTalk] = React.useState(false)
  if (!row?.wallets && !thread) return null
  return (
    <View style={st.social}>
      {row && row.wallets > 0 && (
        <View style={{ gap: 8 }}>
          {top && <Pressable onPress={() => openWallet(top)}><Who account={top} profile={profile(top)} size={22} /></Pressable>}
          <Txt s={12.5} c={C.tx70} lh={18}><Txt s={12.5} w={700}>{row.wallets} wallet{row.wallets === 1 ? '' : 's'}</Txt> borrow against {o.collateral.symbol} here · {usdShort(row.equityUsd)} of equity in their loans</Txt>
        </View>
      )}
      {thread && <>
        <Pressable onPress={() => setTalk(!talk)} hitSlop={6} accessibilityState={{ expanded: talk }}>
          <Txt s={13} c={C.primary}>{talk ? 'Hide what people say' : 'What people say ›'}</Txt>
        </Pressable>
        {talk && <Thread kind={thread.kind} subjectKey={thread.key} max={2} placeholder={`What do you make of borrowing against ${o.collateral.symbol} here?`} />}
      </>}
    </View>
  )
}

const PANES = { borrow: 'Borrow', repay: 'Pay back', safer: 'Lower risk', close: 'Close' } as const

const st = StyleSheet.create({
  modes: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, rowGap: 6 },
  mode: { minHeight: 32, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', justifyContent: 'center' },
  modeOn: { borderColor: C.primary, backgroundColor: '#062830' },
  social: { paddingVertical: 14, paddingHorizontal: 16, gap: 12, borderTopWidth: 1, borderTopColor: C.line },
  where: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.line },
})
