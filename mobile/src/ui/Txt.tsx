import React from 'react'
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native'
import { family, type Weight } from '../fonts'
import { C } from '../theme'

/**
 * Every word on the phone: the web's Plex at a size, a weight and a colour, its line height the
 * web's 1.45 unless given. `mono` is the web's `var(--mono)` (figures, codes).
 */
export function Txt({ s = 14, w = 400, c = C.tx, mono, lh, style, ...rest }: TextProps & { s?: number; w?: Weight; c?: string; mono?: boolean; lh?: number; style?: StyleProp<TextStyle> }) {
  return <Text {...rest} style={[{ fontFamily: family(w, mono), fontSize: s, lineHeight: lh ?? Math.round(s * 1.45), color: c }, style]} />
}
