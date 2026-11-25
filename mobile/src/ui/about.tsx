import React from 'react'
import { Linking, Pressable, StyleSheet, View } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import type { AboutPart, AssetFacts, Fact, IssuerCard, Link, SimilarAsset } from '@yieldcircle/core/model/assetAbout'
import { usdShort } from '@yieldcircle/core/model/format'
import type { Strategy } from '@yieldcircle/core/model/strategies'
import { useStrategyAbout } from '@yieldcircle/app/about'
import { C } from '../theme'
import { Tok } from './bits'
import { openAsset } from './lite'
import { Txt } from './Txt'

/**
 * What an asset is and who issues it (the web's `ui/lite/LiteAsset.tsx`, core's `model/assetAbout.ts`):
 * the issuer card, the asset's card, similar assets, and the strategy sheet's section.
 */

const P = { stroke: C.tx50, strokeWidth: 1.3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }
function FactIcon({ icon }: { icon: Fact['icon'] }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      {icon === 'country' ? <><Circle cx={8} cy={8} r={6} {...P} /><Path d="M2 8h12M8 2c1.8 1.7 2.6 3.7 2.6 6S9.8 12.3 8 14M8 2C6.2 3.7 5.4 5.7 5.4 8s.8 4.3 2.6 6" {...P} /></>
        : icon === 'platform' ? <><Rect x={2} y={3} width={12} height={8.5} rx={1.2} {...P} /><Path d="M5.5 14h5M8 11.5V14" {...P} /></>
        : icon === 'regulator' ? <Path d="M8 1.8 13 4v3.6c0 3-2.1 5.4-5 6.6-2.9-1.2-5-3.6-5-6.6V4z" {...P} />
        : icon === 'backing' ? <Path d="M3 6.5 8 3l5 3.5M4 6.5v5.5M8 6.5v5.5M12 6.5v5.5M2.5 13.5h11" {...P} />
        : icon === 'yield' ? <Path d="M2 12l4-4 3 3 5-6M10.5 5H14v3.5" {...P} />
        : icon === 'exit' ? <Path d="M9.5 3H13v10H9.5M7 5l-3 3 3 3M4 8h7" {...P} />
        : icon === 'kind' ? <><Circle cx={8} cy={5.5} r={2.5} {...P} /><Path d="M3 14c.6-2.6 2.6-4 5-4s4.4 1.4 5 4" {...P} /></>
        : <Path d="M2.5 14V3.5h6V14M8.5 7h5v7M1.5 14h13M4.5 6h2M4.5 8.5h2M4.5 11h2" {...P} />}
    </Svg>
  )
}

export function Facts({ facts }: { facts: Fact[] }) {
  return (
    <View>
      {facts.map((x, i) => (
        <View key={x.k} style={[st.fact, i > 0 && st.dash]}>
          <View style={st.factK}><FactIcon icon={x.icon} /><Txt s={13} c={C.tx50}>{x.k}</Txt></View>
          <Txt s={13.5} w={500} lh={19}>{x.v}</Txt>
        </View>
      ))}
    </View>
  )
}

function Links({ links }: { links: Link[] }) {
  if (!links.length) return null
  return (
    <View style={{ gap: 6 }}>
      {links.map((l) => (
        <Pressable key={l.url} onPress={() => void Linking.openURL(l.url)} style={({ pressed }) => [st.link, pressed && { backgroundColor: C.b400 }]} accessibilityRole="link">
          <Txt s={13.5} w={600} style={{ flex: 1 }}>{l.label}</Txt><Txt c={C.tx50}>↗</Txt>
        </Pressable>
      ))}
    </View>
  )
}

/** The company behind an asset: name, entity · structure, the legal rows, the links. */
export function IssuerCardView({ c }: { c: IssuerCard }) {
  return (
    <View style={st.card}>
      <View style={{ gap: 2 }}>
        <Txt s={16} w={700}>{c.name}</Txt>
        {!!c.sub && <Txt s={12.5} c={C.tx50} lh={17}>{c.sub}</Txt>}
      </View>
      {!!c.about && <Txt s={13.5} c={C.tx70} lh={20}>{c.about}</Txt>}
      {c.facts.length > 0 && <Facts facts={c.facts} />}
      <Links links={c.links} />
      {!c.profiled && <Txt s={12} c={C.tx40}>No company details written for {c.name} yet.</Txt>}
      {!!c.checked && <Txt s={12} c={C.tx40}>checked {c.checked}</Txt>}
    </View>
  )
}

/** What the asset is: the note's words and rows, how it earns, its own links. */
export function AssetAboutCard({ f }: { f: AssetFacts }) {
  return (
    <View style={st.card}>
      {!!(f.body ?? f.what) && <Txt s={14} lh={21}>{f.body ?? f.what}</Txt>}
      {!!f.caveat && <Txt s={13} c={C.warn} lh={19}>Unverified: {f.caveat}</Txt>}
      {f.facts.length > 0 && <Facts facts={f.facts} />}
      {!!f.earns && <Txt s={13.5} c={C.tx70} lh={20}><Txt s={13.5} w={700}>{f.earns.name}.</Txt> {f.earns.how} <Txt s={13.5} c={C.tx50}>{f.earns.risk}</Txt></Txt>}
      <Links links={f.links} />
      {!!f.checked && <Txt s={12} c={C.tx40}>checked {f.checked}{f.confidence && f.confidence !== 'high' ? ` · ${f.confidence} confidence` : ''}</Txt>}
    </View>
  )
}

/** Two to a row, each opening its own page. */
export function SimilarAssets({ list }: { list: SimilarAsset[] }) {
  return (
    <View style={st.grid}>
      {list.map((x) => (
        <Pressable key={x.group} onPress={() => openAsset(x.group)} style={({ pressed }) => [st.sim, pressed && { backgroundColor: C.b300 }]} accessibilityRole="button">
          <View style={st.simH}>
            <Tok sym={x.symbol} logo={x.logo} size={30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt s={14} w={700} numberOfLines={1}>{x.symbol}</Txt>
              {!!x.issuer && <Txt s={12} c={C.tx50} numberOfLines={1}>{x.issuer}</Txt>}
            </View>
          </View>
          <View>
            <Txt s={11.5} c={C.tx50}>Largest market</Txt>
            <Txt s={14} w={600}>{usdShort(x.largestUsd)}</Txt>
          </View>
        </Pressable>
      ))}
    </View>
  )
}

/** `Signum Ltd., Cayman Islands`: the entity and where it sits, where a profile says. */
const byLine = (c: IssuerCard) => c.facts.filter((y) => y.icon === 'entity' || y.icon === 'country').map((y) => y.v).join(', ')

/**
 * The sheet's asset-strategy section (the web's `LiteAbout`): what it holds, with who issues it,
 * and what it borrows, folded under one line, each asset opening its page. How it earns is the
 * sheet's own section above (`How`), so it is not said twice.
 */
export function StrategyAbout({ s }: { s: Strategy }) {
  const parts = useStrategyAbout(s).filter((x) => x.role !== 'how')
  const [open, setOpen] = React.useState(false)
  if (!parts.length) return null
  const held = parts.find((x) => x.role === 'holds' || x.role === 'deposit')
  const who = held?.facts?.issuer?.name
  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: C.line }}>
      <Pressable onPress={() => setOpen(!open)} style={st.fold} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={{ flex: 1 }}>
          <Txt w={700}>What it is</Txt>
          <Txt s={11.5} c={C.tx50}>{[held?.symbol && `${held.symbol}${who ? ` by ${who}` : ''}`, parts.some((x) => x.role === 'borrows') && 'what it borrows'].filter(Boolean).join(' · ')}</Txt>
        </View>
        <Txt c={C.tx50}>{open ? '▴' : '▾'}</Txt>
      </Pressable>
      {open && parts.map((x, i) => <Part key={x.role} x={x} first={i === 0} />)}
    </View>
  )
}
function Part({ x, first }: { x: AboutPart; first: boolean }) {
  const f = x.facts
  return (
    <View style={[st.part, !first && { borderTopWidth: 1, borderTopColor: C.line }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{!!x.symbol && <Tok sym={x.symbol} logo={x.logo} size={16} />}<Txt s={12.5} w={600} c={C.tx50}>{x.title}</Txt></View>
      {!!f?.what && <Txt s={13.5} lh={19}>{f.what}</Txt>}
      {x.lines.map((l) => <Txt key={l} s={13} c={C.tx70} lh={19}>{l}</Txt>)}
      {!!f && f.facts.length > 0 && <Facts facts={f.facts} />}
      {!!f?.issuer && <Txt s={13} c={C.tx70} lh={19}>Issued by <Txt s={13} w={700}>{f.issuer.name}</Txt>{byLine(f.issuer) ? ` · ${byLine(f.issuer)}` : ''}</Txt>}
      {!!x.group && <Pressable onPress={() => openAsset(x.group!)} hitSlop={8}><Txt s={13.5} w={600} c={C.primary}>About {x.symbol} ›</Txt></Pressable>}
    </View>
  )
}

const st = StyleSheet.create({
  card: { backgroundColor: C.b200, borderRadius: 12, padding: 16, gap: 12 },
  fact: { paddingVertical: 9, gap: 3 },
  dash: { borderTopWidth: 1, borderTopColor: C.line, borderStyle: 'dashed' },
  factK: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 14, borderRadius: 10, backgroundColor: C.b300 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sim: { flexBasis: '47%', flexGrow: 1, backgroundColor: C.b200, borderRadius: 12, padding: 14, gap: 12 },
  simH: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  fold: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10 },
  part: { gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
})
