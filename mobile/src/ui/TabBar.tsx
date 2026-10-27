import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import type { Tabs } from 'expo-router'
import type React from 'react'
import { C } from '../theme'
import { IconBoard, IconBorrow, IconEarn, IconFeed, IconHome, IconSearch } from './icons'
import { Txt } from './Txt'

/** What expo-router's `Tabs` hands a custom bar (react-navigation's BottomTabBarProps, which expo-router bundles). */
export type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0]

const ICONS = { index: IconHome, feed: IconFeed, earn: IconEarn, borrow: IconBorrow, board: IconBoard } as const

/**
 * The web's bottom tab bar (app.css `.tabbar` + the refit at its end): icon over word, the active
 * one in the primary colour with its icon on a pill. Lite's ends on a round search button after the
 * tabs (docs/lite-social-search.md §4.1): Pro's search is in its top bar.
 */
export function TabBar({ state, descriptors, navigateToTab, insets, search }: TabBarProps & { search?: boolean }) {
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
      {search && (
        <View style={st.searchSlot}>
          <Pressable onPress={() => router.push('/search')} style={({ pressed }) => [st.search, pressed && { backgroundColor: C.b400 }]} accessibilityLabel="Search" accessibilityRole="search">
            <IconSearch color={C.tx70} size={20} />
          </Pressable>
        </View>
      )}
    </View>
  )
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', paddingHorizontal: 8, backgroundColor: 'rgba(0,0,0,0.92)', borderTopWidth: 1, borderTopColor: C.line },
  item: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2 },
  searchSlot: { width: 64, alignItems: 'center', justifyContent: 'center' },
  search: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: C.b300, borderWidth: 1, borderColor: C.line },
  icon: { width: 48, height: 28, paddingVertical: 4, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
})
