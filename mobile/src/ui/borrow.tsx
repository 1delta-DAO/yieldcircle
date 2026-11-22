import React from 'react'
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { router, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBook } from '@yieldcircle/app/book'
import { useSession } from '@yieldcircle/app/session'
import { chainLabel, useBorrowOffers } from '@yieldcircle/app/sdk/queries'
import { GROUPS, nameOf, type GroupId } from '@yieldcircle/core/model/assets'
import { DEEP_USD, OUTS, bestOfferFor, isPutUp, loansByOffer, offerFromHolding, outOf, owedOf, yoursOf, type BorrowOffer, type Out, type Yours } from '@yieldcircle/core/model/borrow'
import { num, pct, usd, usdShort } from '@yieldcircle/core/model/format'
import { bufferOfHealth } from '@yieldcircle/core/model/lite'
import type { Holding } from '@yieldcircle/core/model/positions'
import { C } from '../theme'
import { ChainChip } from './ChainChip'
import { Pill, Seg, Tok, Toks } from './bits'
import { LiteRowSk } from './lite'
import { Txt } from './Txt'

/** A loan the ticket can open: one that lends. (A market that only takes collateral stays for the loans running on it.) */
export const canOpen = (o: BorrowOffer) => o.maxLtv > 0

/** Opening a row is opening its loan's sheet (`app/borrow/[id].tsx`): on an offer, or on a running loan. */
export const borrowPath = (o: BorrowOffer | null, h?: Holding, m?: 'add' | 'reduce') =>
  `/borrow/${encodeURIComponent(o?.id ?? '_')}?${new URLSearchParams({ ...(o && o.out !== 'USD' ? { out: o.out } : {}), ...(h ? { h: h.key } : {}), ...(m ? { m } : {}) })}` as Href
export const openBorrow = (o: BorrowOffer | null, h?: Holding, m?: 'add' | 'reduce') => router.push(borrowPath(o, h, m))

/** Rows shown before "Show more": the whole list runs to a thousand. */
const PAGE = 40
const OUT_WORD: Record<Out, string> = { USD: 'Dollars', ETH: 'ETH', BTC: 'BTC', MORE: 'Other' }
type Mine = { o: BorrowOffer; y: Yours }
type Row = { k: 'mine'; id: string; m: Mine } | { k: 'offer'; id: string; o: BorrowOffer }

/**
 * The Borrow tab (the web's `BorrowPage`): put up what you hold and take liquidity out, without
 * selling. Your loans first; then "What you hold" — one card per asset the wallet could put up, with
 * the most it could take held to Safe, opening on the app's pick for it — or every place that lends,
 * by what is put up. The list decides where; the sheet decides how much.
 */
export function BorrowPage() {
  const { bottom } = useSafeAreaInsets()
  const b = useBook()
  const { chainIds } = useSession()
  const [out, setOut] = React.useState<Out>('USD')
  const bo = useBorrowOffers(chainIds, { out })
  const offers = React.useMemo(() => bo.offers.filter((o) => o.out === out), [bo.offers, out])
  const held = React.useMemo(() => loansByOffer(bo.offers, b.holdings), [bo.offers, b.holdings])
  const yours = React.useMemo(() => yoursOf(offers, b.idlePerChain, held), [offers, b.idlePerChain, held])
  const loans = b.holdings.filter((h) => h.kind === 'borrow')
  // what you hold, once per asset: the app's pick among the places it can be put up, most room first
  const mine = React.useMemo(() => {
    const usable = offers.filter((o) => canOpen(o) && (yours.get(o.id)?.idleUsd ?? 0) + (yours.get(o.id)?.putUpUsd ?? 0) > 0)
    const out0: Mine[] = []
    for (const asset of new Set(usable.map((o) => o.asset))) { const o = bestOfferFor(asset, usable, b.idlePerChain, out); if (o) out0.push({ o, y: yours.get(o.id)! }) }
    return out0.sort((x, y) => y.y.room - x.y.room)
  }, [offers, yours, b.idlePerChain, out])
  // "What you hold" leads when there is something to put up; the reader's own pick stays
  const [view0, setView] = React.useState<'mine' | 'all' | null>(null)
  const view = view0 ?? (mine.length ? 'mine' : 'all')
  const [group, setGroup] = React.useState<GroupId | 'all'>('all')
  const [q, setQ] = React.useState('')
  const [shown, setShown] = React.useState(PAGE)
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const all = React.useMemo(() => offers.filter((o) => (canOpen(o) || held.has(o.id)) && (group === 'all' || o.group === group)
    && terms.every((t) => [o.collateral.symbol, o.asset, nameOf(o.asset), o.debt.symbol, o.venue, chainLabel(o.chainId)].join(' ').toLowerCase().includes(t))), [offers, held, group, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const groups = GROUPS.filter((g) => offers.some((o) => o.group === g.id))
  const rows: Row[] = view === 'mine' ? mine.map((m) => ({ k: 'mine', id: m.o.asset, m })) : all.slice(0, shown).map((o) => ({ k: 'offer', id: o.id, o }))
  const offerOf = (h: Holding) => bo.offers.find((o) => h.collateralUid?.toLowerCase() === o.collateral.uid.toLowerCase() && h.debtUid?.toLowerCase() === o.debt.uid.toLowerCase()) ?? offerFromHolding(h)
  const waiting = bo.isLoading || (view === 'mine' && b.positionsLoading)
  const outWord = out === 'USD' ? 'dollars' : OUTS.find((f) => f.id === out)!.name.toLowerCase()
  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.id}
      renderItem={({ item }) => item.k === 'mine' ? <MineRow m={item.m} /> : <OfferRow o={item.o} hs={held.get(item.o.id)} y={yours.get(item.o.id)} />}
      initialNumToRender={15}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View>
          <View style={{ padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Txt s={22} w={700} style={{ flex: 1 }}>Borrow</Txt>
              <ChainChip />
            </View>
            <Txt s={13} c={C.tx50} lh={19}>Put up what you hold and take {outWord} out, without selling it.</Txt>
          </View>
          {loans.length > 0 && (
            <View style={{ marginBottom: 12 }}>
              <View style={st.secH}><Txt s={14} w={600} style={{ flex: 1 }}>Your loans</Txt><Txt s={12.5} c={C.tx50}>{usd(loans.reduce((a, h) => a + owedOf(h), 0))} owed</Txt></View>
              {loans.map((h) => <LoanRow key={h.key} h={h} onOpen={() => openBorrow(offerOf(h), h, 'reduce')} />)}
            </View>
          )}
          <View style={{ paddingHorizontal: 16, paddingBottom: 10, gap: 10 }}>
            {!!b.account && <Seg grow items={[{ id: 'mine', word: 'What you hold' }, { id: 'all', word: 'Every place' }]} value={view} onChange={setView} />}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt s={12.5} c={C.tx50}>Take out</Txt>
              <Seg items={OUTS.map((f) => ({ id: f.id, word: OUT_WORD[f.id] }))} value={out} onChange={(f) => { setOut(f); setShown(PAGE) }} />
            </View>
            {view === 'all' && <>
              {groups.length > 1 && <Seg items={[{ id: 'all' as const, word: 'All' }, ...groups.map((g) => ({ id: g.id, word: g.id === 'USD' ? '$' : g.id === 'STOCKS' ? 'Stocks' : g.id === 'MORE' ? 'More' : g.id }))]} value={group} onChange={(g) => { setGroup(g); setShown(PAGE) }} />}
              <TextInput value={q} onChangeText={(x) => { setQ(x); setShown(PAGE) }} placeholder="Search what you put up, a venue or a chain" placeholderTextColor={C.tx40} autoCapitalize="none" autoCorrect={false} style={st.input} returnKeyType="search" />
            </>}
          </View>
        </View>
      }
      ListEmptyComponent={waiting ? <View>{[0, 1, 2, 3, 4].map((i) => <LiteRowSk key={i} />)}</View>
        : view === 'mine' ? <View style={{ padding: 16, gap: 10 }}><Txt s={13} c={C.tx50} lh={19}>Nothing you hold can be put up for {outWord} on the chains you picked.</Txt><Pressable onPress={() => setView('all')} hitSlop={8}><Txt s={13} c={C.primary}>Show every place ›</Txt></Pressable></View>
        : <Txt s={13} c={C.tx50} lh={19} style={{ padding: 16 }}>{terms.length ? `Nothing here matches “${q.trim()}”.` : `Nothing lends ${outWord} here on the chains you picked.`}</Txt>}
      ListFooterComponent={
        <View style={{ padding: 16, gap: 12 }}>
          {view === 'all' && all.length > shown && <Pressable onPress={() => setShown(shown + PAGE * 2)} style={st.more}><Txt s={13} w={600}>Show {Math.min(all.length - shown, PAGE * 2)} more of {all.length}</Txt></Pressable>}
          <Txt s={12} c={C.tx50} lh={17}>You keep everything it does and pay interest on what you take. If its price falls far enough, the lender sells part of it to repay. The ticket starts you in the Safe zone.</Txt>
        </View>
      }
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ paddingBottom: 40 + bottom }}
    />
  )
}

/** One thing the wallet holds: how much, the most it could take held to Safe, and the rate where the app would take it. */
function MineRow({ m: { o, y } }: { m: Mine }) {
  const name = nameOf(o.asset)
  return (
    <Pressable onPress={() => openBorrow(o)} style={({ pressed }) => [st.row, pressed && { backgroundColor: C.b300 }]}>
      <Tok sym={o.collateral.symbol} logo={o.collateral.logo} size={30} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt s={14.5} w={600} numberOfLines={1}>{name === o.asset ? o.collateral.symbol : name}</Txt>
        <Txt s={12} c={C.tx50} numberOfLines={1}>{y.idleUsd > 0 ? `you hold ${num(y.idleAmount, 4)} ${y.symbol} · ${usdShort(y.idleUsd)}` : `${usdShort(y.putUpUsd)} already put up`}</Txt>
        <Txt s={12} c={C.tx50} numberOfLines={1}>{o.venue} · {chainLabel(o.chainId)}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 1 }}>
        <Txt s={12} c={C.tx50}>take up to</Txt>
        <Txt s={16} w={700} c={y.room >= 1 ? C.ok : C.tx50}>{y.room >= 1 ? usdShort(y.room) : '—'}</Txt>
        <Txt s={12} c={C.tx50}>{pct(o.borrowApr)} APR</Txt>
      </View>
      <Txt c={C.tx40}>›</Txt>
    </Pressable>
  )
}

/** One market: what is put up and taken out, where, how far it lends and what is free — and the borrow APR. */
function OfferRow({ o, hs, y }: { o: BorrowOffer; hs?: Holding[]; y?: Yours }) {
  return (
    <Pressable onPress={() => openBorrow(o)} style={({ pressed }) => [st.row, pressed && { backgroundColor: C.b300 }]}>
      <Toks a={o.collateral.symbol} b={o.debt.symbol} logoA={o.collateral.logo} logoB={o.debt.logo} on={C.bg} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt s={14.5} w={600} numberOfLines={1}>{o.collateral.symbol} <Txt s={13} c={C.tx50}>→ {o.debt.symbol}</Txt></Txt>
        <Txt s={12} c={C.tx50} numberOfLines={1}>{o.venue} · {chainLabel(o.chainId)}</Txt>
        <Txt s={12} c={o.liquidityUsd < DEEP_USD ? C.warn : C.tx50} numberOfLines={1}>up to {Math.round(o.maxLtv * 100)}% · {usdShort(o.liquidityUsd)} free</Txt>
        {(hs?.length || (y && y.idleUsd > 0)) ? <View style={{ flexDirection: 'row', marginTop: 3 }}><Pill tone="ok">{hs?.some((h) => !isPutUp(h)) ? 'your loan' : hs?.length ? 'already put up' : `you hold ${usdShort(y!.idleUsd)}`}</Pill></View> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 1 }}>
        <Txt s={16} w={600} c={o.borrowApr < 5 ? C.ok : o.borrowApr > 15 ? C.bad : C.tx}>{pct(o.borrowApr)}</Txt>
        <Txt s={11} c={C.tx50}>{o.userSet ? 'you set the rate' : 'borrow APR'}</Txt>
      </View>
      <Txt c={C.tx40}>›</Txt>
    </Pressable>
  )
}

/** A running loan: what is up, where, what it owes and how far it is from liquidation. */
function LoanRow({ h, onOpen }: { h: Holding; onOpen: () => void }) {
  const buf = bufferOfHealth(h.health)
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [st.row, pressed && { backgroundColor: C.b300 }]}>
      <Toks a={h.symbol} b={h.debtSymbol ?? 'USD'} logoA={h.logo} on={C.bg} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt s={14.5} w={600} numberOfLines={1}>{h.label}</Txt>
        <Txt s={12} c={C.tx50} numberOfLines={1}>{h.venue} · {chainLabel(h.chainId)}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 1 }}>
        <Txt w={700}>owes {usd(owedOf(h))}</Txt>
        {buf != null && <Txt s={12} c={buf < 0.1 ? C.bad : buf < 0.2 ? C.warn : C.tx50}>{pct(buf * 100, 0)} from liquidation</Txt>}
      </View>
      <Txt c={C.tx40}>›</Txt>
    </Pressable>
  )
}

const st = StyleSheet.create({
  secH: { flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 16, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  input: { minHeight: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.b300, color: C.tx, fontSize: 14 },
  more: { minHeight: 44, borderRadius: 999, borderWidth: 1, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
})
