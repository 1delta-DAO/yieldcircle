import React from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { pct, usd } from '@yieldcircle/core/model/format'
import { useAssetPage } from '@yieldcircle/app/about'
import { useNav } from '@yieldcircle/app/nav'
import { C } from '../../src/theme'
import { Sk, Tok } from '../../src/ui/bits'
import { IconBack } from '../../src/ui/icons'
import { FoldSec } from '../../src/ui/Fold'
import { LiteRowSk, LiteRowView } from '../../src/ui/lite'
import { AssetAboutCard, IssuerCardView, SimilarAssets } from '../../src/ui/about'
import { Txt } from '../../src/ui/Txt'

/**
 * An asset (the web's `LiteAsset`, docs/assets.md): what it is, who issues it (the company behind
 * it, where a profile is written), where Lite can put it to work, and what else earns the same way.
 * Every market, holder and day of it is the web's Pro page.
 */
export default function AssetScreen() {
  const insets = useSafeAreaInsets()
  const nav = useNav()
  const group = String(useLocalSearchParams<{ group: string }>().group ?? '')
  const p = useAssetPage(group)
  const { d, facts: f } = p
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[st.bar, { paddingTop: insets.top, height: 60 + insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={6} style={st.back} accessibilityLabel="Back"><IconBack color={C.tx70} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={[st.page, { paddingBottom: insets.bottom + 40 }]}>
        <View style={st.head}>
          <Tok sym={p.sym} logo={p.logo} size={48} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt s={22} w={700} lh={28} numberOfLines={2}>{p.name}{p.name !== p.sym ? <Txt s={22} c={C.tx50}> · {p.sym}</Txt> : null}</Txt>
            {f.what ? <Txt s={13.5} c={C.tx70} lh={19}>{f.what}</Txt> : p.loading ? <Sk w={200} /> : null}
          </View>
        </View>

        <View style={st.stats}>
          <Stat v={d?.price ? usd(d.price.usd) : p.a.isLoading ? null : '–'} s={`price${d?.price?.change24hPct != null ? ` · ${d.price.change24hPct >= 0 ? '+' : ''}${pct(d.price.change24hPct)} today` : ''}`} />
          <Stat v={d?.intrinsicApr != null ? pct(d.intrinsicApr) : '–'} s={d?.intrinsicApr != null ? 'a year, by holding it' : 'earns nothing by itself'} ok={!!d?.intrinsicApr} />
          {!!f.earns && <Stat v={f.earns.name} s="how it earns" />}
        </View>

        {(!!f.body || f.facts.length > 0 || !!f.earns) && <FoldSec id="lite.asset.what" title="What it is"><AssetAboutCard f={f} /></FoldSec>}
        {!!f.issuer && <FoldSec id="lite.asset.issuer" title="Issuer"><IssuerCardView c={f.issuer} /></FoldSec>}

        <FoldSec id="lite.asset.earn" title={`Earn with ${p.sym}`}>
          <View style={st.card}>
            {p.rows.length ? p.rows.map((r) => <LiteRowView key={r.s.id} r={r} get={p.L.get} proof={p.L.proof(r.s)} />)
              : p.L.b.isLoading ? <LiteRowSk />
              : <Txt s={14} c={C.tx50} lh={20} style={{ padding: 16 }}>Lite lists nothing that holds {p.sym} today. Pro has every market that takes it.</Txt>}
          </View>
        </FoldSec>

        {p.similar.length > 0 && <FoldSec id="lite.asset.similar" title="Similar assets"><SimilarAssets list={p.similar} /></FoldSec>}

        <Pressable onPress={() => nav.pro(`#/t/${encodeURIComponent(p.key)}`)} style={{ marginTop: 24, alignItems: 'center' }}><Txt s={13} c={C.tx50}>Every market, holder and day of {p.sym}, in Pro ›</Txt></Pressable>
      </ScrollView>
    </View>
  )
}

function Stat({ v, s, ok }: { v: string | null; s: string; ok?: boolean }) {
  return (
    <View style={st.stat}>
      {v == null ? <Sk w={60} h={20} /> : <Txt s={18} w={600} c={ok ? C.ok : C.tx} numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ['tabular-nums'] }}>{v}</Txt>}
      <Txt s={12} c={C.tx50} lh={16}>{s}</Txt>
    </View>
  )
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.86)', borderBottomWidth: 1, borderBottomColor: '#1a1a1f' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  page: { paddingHorizontal: 16, paddingTop: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  card: { backgroundColor: C.b200, borderRadius: 12, overflow: 'hidden' },
  stats: { flexDirection: 'row', gap: 1, marginTop: 16, borderRadius: 12, overflow: 'hidden', backgroundColor: C.line },
  stat: { flex: 1, gap: 2, paddingVertical: 14, paddingHorizontal: 12, backgroundColor: C.b200 },
})
