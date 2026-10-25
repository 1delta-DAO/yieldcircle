import { Pressable, StyleSheet, View } from 'react-native'
import type { Tabs } from 'expo-router'
import type React from 'react'
import { C } from '../theme'
import { IconBoard, IconBorrow, IconEarn, IconFeed, IconHome } from './icons'
import { Txt } from './Txt'

/** What expo-router's `Tabs` hands a custom bar (react-navigation's BottomTabBarProps, which expo-router bundles). */
export type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0]

const ICONS = { index: IconHome, feed: IconFeed, earn: IconEarn, borrow: IconBorrow, board: IconBoard } as const

/**
 * The web's bottom tab bar (app.css `.tabbar` + the refit at its end): icon over word, the active
 * one in the primary colour with its icon on a pill.
 */
export function TabBar({ state, descriptors, navigateToTab, insets }: TabBarProps) {
  return (
    <View style={[st.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((r, i) => {
        const on = state.index === i
        const color = on ? C.primary : C.tx50
        const Icon = ICONS[r.name as keyof typeof ICONS] ?? IconHome
        const label = descriptors[r.key].options.title ?? r.name
        return (
          <Pressable
            key={r.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => { if (!on) navigateToTab(r.key) }}
            style={st.item}
          >
            <View style={[st.icon, on && { backgroundColor: C.priBg }]}><Icon color={color} /></View>
            <Txt s={11} w={600} c={color} lh={16}>{label}</Txt>
          </Pressable>
        )
      })}
    </View>
  )
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', paddingHorizontal: 8, backgroundColor: 'rgba(0,0,0,0.92)', borderTopWidth: 1, borderTopColor: C.line },
  item: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2 },
  icon: { width: 48, height: 28, paddingVertical: 4, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
})
