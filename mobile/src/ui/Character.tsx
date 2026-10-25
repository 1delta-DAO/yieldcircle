import React from 'react'
import { Image, StyleSheet, View } from 'react-native'
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Line, Path, Rect } from 'react-native-svg'
import { CharacterArt, pictureUrl, specFor, unearned, type Prims, type Spec } from '@yieldcircle/app/identity/character'
import { labelFor, shortAddr } from '@yieldcircle/core/identity/name'
import { C } from '../theme'
import { Txt } from './Txt'

const RNSVG: Prims = { Circle, Path, G, Rect, Line, Ellipse, Defs, ClipPath }

/** A wallet's face (the web's `Character`): the shared drawing on react-native-svg, or the profile's picture. */
export function Character({ addr, avatarUrl, size = 32, spec }: { addr: string; avatarUrl?: string | null; size?: number; spec?: Spec }) {
  const pic = spec ? null : pictureUrl(avatarUrl)
  const [broken, setBroken] = React.useState<string | null>(null)
  // one clip per face: several share a screen
  const clipId = 'chr' + React.useId().replace(/[^a-zA-Z0-9]/g, '')
  if (pic && broken !== pic) return <Image source={{ uri: pic }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.b300 }} onError={() => setBroken(pic)} />
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <CharacterArt s={spec ?? specFor(addr, avatarUrl)} P={RNSVG} clipId={clipId} />
    </Svg>
  )
}

/** The pill a generated name wears (the web's `AutoTag`, `.pill.auto`). */
export function AutoTag() {
  return <View style={st.auto}><Txt s={9} w={500} c={C.tx40} lh={13.5} style={{ letterSpacing: 0.18 }}>auto</Txt></View>
}

/**
 * Who a wallet is (the web's `Who`, `.who`): its face, its name — the profile's, the index's label,
 * or the generated one with `auto` — and a line under it.
 */
export function Who({ account, profile, size = 28, sub, idx }: { account: string; profile?: { handle?: string | null; displayName?: string | null; avatarUrl?: string | null; systemTags?: string[] } | null; size?: number; sub?: React.ReactNode; idx?: { accountKind?: string; accountLabel?: string | null } | null }) {
  const name = labelFor(account, profile, idx)
  const spec = specFor(account, profile?.avatarUrl)
  const bad = profile?.avatarUrl ? unearned(spec, profile.systemTags ?? []) : []
  return (
    <View style={st.who}>
      <Character addr={account} avatarUrl={profile?.avatarUrl} size={size} />
      <View style={{ flexShrink: 1 }}>
        <Txt s={13.5} w={500} lh={16.2} numberOfLines={1}>{name.label}{bad.length > 0 ? ' !' : ''}</Txt>
        {sub != null ? <Txt s={10.5} c={C.tx40} lh={12.6} numberOfLines={1}>{sub}</Txt> : name.generated ? <Txt s={10.5} c={C.tx40} lh={12.6}>{shortAddr(account)}</Txt> : null}
      </View>
      {name.generated && <AutoTag />}
    </View>
  )
}

const st = StyleSheet.create({
  who: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  auto: { backgroundColor: '#212128', borderWidth: 1, borderStyle: 'dashed', borderColor: C.line2, borderRadius: 999, paddingHorizontal: 5 },
})
