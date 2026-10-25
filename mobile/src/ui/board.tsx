import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import * as idx from '@yieldcircle/core/index/api'
import { useAccountPnlBook } from '@yieldcircle/app/index/pnl'
import { useLiteMenu } from '@yieldcircle/app/lite'
import { useSession } from '@yieldcircle/app/session'
import { normAddr } from '@yieldcircle/core/model/address'
import { bookKeyOf } from '@yieldcircle/core/model/uid'
import { boardPositions, boardWallets, type BoardSort, type BoardWallet, type LiteRow } from '@yieldcircle/core/model/lite'
import { pct, usd, usdShort } from '@yieldcircle/core/model/format'
import { C } from '../theme'
import { Seg, Sk, T } from './bits'
import { openStrategy } from './lite'

const SORTS: { id: BoardSort; word: string; why: string }[] = [
  { id: 'apr', word: 'Best rate', why: 'what each wallet earns a year on all its money, at today’s rates' },
  { id: 'perDay', word: 'Most a day', why: 'the dollars each wallet’s money earns a day, at today’s rates' },
]
const MEDAL = ['#e8c35a', '#c9ced6', '#d08b54']
const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

/**
 * The wallet leaderboard (docs/lite.md §6, the web's LiteBoard wallets view): real wallets, one
 * number each, read off the chain. Tap a wallet for its positions and what each made.
 */
export function WalletBoard() {
  const { account } = useSession()
  const [sort, setSort] = React.useState<BoardSort>('apr')
  const q = useQuery({
    // the same keys as the web's board, so the two read one cached answer shape
    queryKey: sort === 'perDay' ? ['earners-me'] : ['earners-lite', sort],
    queryFn: () => idx.walletEarners({ sort, people: true, limit: 100 }),
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const L = useLiteMenu()
  const liteByKey = React.useMemo(() => {
    const m = new Map<string, LiteRow>()
    for (const r of L.rows) { const k = bookKeyOf(r.s); if (k) m.set(k.toLowerCase(), r) }
    return m
  }, [L.rows])
  const rows = boardWallets(q.data?.rows ?? [], sort).slice(0, 50)
  const me = account ? rows.find((r) => normAddr(r.account) === normAddr(account)) : undefined
  const [open, setOpen] = React.useState<string | null>(null)
  return (
    <View style={{ gap: 12 }}>
      <Seg items={SORTS} value={sort} onChange={setSort} />
      <Text style={T.dim}>{SORTS.find((x) => x.id === sort)!.why}. Tap a wallet for its positions.</Text>
      {me && <View style={st.me}><Text style={T.body}>You are <Text style={{ fontWeight: '700' }}>#{me.rank}</Text> · {sort === 'apr' ? `${pct(me.value, 1)} a year` : `${usdShort(me.value)} a day`}</Text></View>}
      <View style={st.list}>
        {q.isLoading ? [0, 1, 2, 3, 4].map((i) => <View key={i} style={st.row}><Sk w={22} /><Sk w={150} /><View style={{ flex: 1 }} /><Sk w={56} h={18} /></View>)
          : q.error ? <Text style={[T.dim, { padding: 16 }]}>The board could not be read right now.</Text>
          : !rows.length ? <Text style={[T.dim, { padding: 16 }]}>Nobody on the board right now.</Text>
          : rows.map((r) => <WalletRow key={r.account} r={r} sort={sort} me={!!me && me.account === r.account} open={open === r.account} onToggle={() => setOpen(open === r.account ? null : r.account)} liteByKey={liteByKey} />)}
      </View>
    </View>
  )
}

function WalletRow({ r, sort, me, open, onToggle, liteByKey }: { r: BoardWallet; sort: BoardSort; me: boolean; open: boolean; onToggle: () => void; liteByKey: Map<string, LiteRow> }) {
  return (
    <View style={[st.item, me && { backgroundColor: C.priBg }]}>
      <Pressable onPress={onToggle} style={st.row}>
        <Text style={{ width: 26, color: MEDAL[r.rank - 1] ?? C.tx50, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{r.rank}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.tx, fontWeight: '600' }} numberOfLines={1}>{r.label || shortAddr(r.account)}</Text>
          <Text style={[T.dim, { fontSize: 12 }]}>{r.positions} position{r.positions === 1 ? '' : 's'} · on {usdShort(r.navUsd)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[T.ok, { fontVariant: ['tabular-nums'] }]}>{sort === 'apr' ? pct(r.value, 1) : usdShort(r.value)}</Text>
          <Text style={[T.dim, { fontSize: 11 }]}>{sort === 'apr' ? 'a year' : 'a day'}</Text>
        </View>
      </Pressable>
      {open && <WalletPositions account={r.account} liteByKey={liteByKey} />}
    </View>
  )
}

function WalletPositions({ account, liteByKey }: { account: string; liteByKey: Map<string, LiteRow> }) {
  const q = useAccountPnlBook(account)
  const ps = q.data ? boardPositions(q.data, (k) => liteByKey.get(k.toLowerCase())?.title ?? null) : []
  if (q.isLoading) return <ActivityIndicator style={{ padding: 12 }} color={C.tx50} />
  if (!ps.length) return <Text style={[T.dim, { padding: 12 }]}>No position with a record yet. The index draws each one within a few hours of opening.</Text>
  return (
    <View style={{ paddingHorizontal: 12, paddingBottom: 10, gap: 8 }}>
      {ps.map((p) => {
        const row = liteByKey.get(p.strategyKey.toLowerCase())
        return (
          <Pressable key={p.key} disabled={!row} onPress={() => row && openStrategy(row.s)} style={st.pos}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.tx, fontWeight: '600' }} numberOfLines={1}>{p.title}{row ? ' ›' : ''}</Text>
              <Text style={[T.dim, { fontSize: 12 }]} numberOfLines={1}>{p.sub}{p.equityUsd != null ? ` · ${usdShort(p.equityUsd)} in it` : ''}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: p.pnlUsd >= 0 ? C.ok : C.bad, fontWeight: '700' }}>{p.pnlUsd >= 0 ? '+' : '−'}{usd(Math.abs(p.pnlUsd))}</Text>
              {p.aprPct != null && <Text style={[T.dim, { fontSize: 11 }]}>{pct(p.aprPct, 1)} a year</Text>}
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

const st = StyleSheet.create({
  list: { backgroundColor: C.b200, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  item: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12 },
  pos: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.b300, borderRadius: 10, padding: 10 },
  me: { backgroundColor: C.priBg, borderRadius: 12, padding: 12 },
})
