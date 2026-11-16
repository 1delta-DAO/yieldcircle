import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CHAINS } from '@yieldcircle/app/sdk/queries'
import { usdShort } from '@yieldcircle/core/model/format'
import { leverTag } from '@yieldcircle/core/model/lite'
import type { HistoryGet } from '@yieldcircle/core/model/rateHistory'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { C } from '../theme'
import { Face, Pill, Rate, RiskDot, T } from './bits'
import { openStrategy } from './lite'

const chainLabel = (id: string) => CHAINS.find((c) => c.id === id)?.label ?? id

/** Pro's row: the symbols, the venue and chain, size — every venue, not Lite's one-per-thing. */
export function ProRow({ s, get, yoursUsd }: { s: Strategy; get: HistoryGet; /** what the reader holds in it: the row says so */ yoursUsd?: number }) {
  return (
    <Pressable onPress={() => openStrategy(s)} style={({ pressed }) => [st.row, pressed && { backgroundColor: C.b300 }]}>
      <Face s={s} />
      <View style={{ flex: 1, minWidth: 80, gap: 2 }}>
        <Text style={{ color: C.tx, fontWeight: '700' }} numberOfLines={1}>{s.kind === 'loop' ? `${s.holds} / ${s.debt}` : s.assetSymbol}</Text>
        <Text style={[T.dim, { fontSize: 12 }]} numberOfLines={1}>{s.venue} · {chainLabel(s.chainId)} · {usdShort(s.tvlUsd)}</Text>
        {/* the pills under the text, as in Lite's row: beside it they took the name's width */}
        {((!!yoursUsd && yoursUsd > 0) || s.kind === 'loop') && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 3 }}>
            {!!yoursUsd && yoursUsd > 0 && <Pill tone="ok">yours {usdShort(yoursUsd)}</Pill>}
            {s.kind === 'loop' && <Pill tone="pri">{leverTag(s.tiers.balanced)}</Pill>}
          </View>
        )}
      </View>
      <RiskDot r={s.risk} />
      <Rate s={s} get={get} style={{ minWidth: 58, textAlign: 'right' }} />
    </Pressable>
  )
}

/** A tab that is not on the phone yet: says so, and where it is today. */
export function NotYet({ what, why }: { what: string; why: string }) {
  return (
    <View style={{ padding: 24, gap: 10 }}>
      <Text style={T.h2}>{what} comes next on the phone</Text>
      <Text style={T.dim70}>{why}</Text>
      <Text style={T.dim}>It is on the web today, with the same rows and the same wallets.</Text>
    </View>
  )
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
})
