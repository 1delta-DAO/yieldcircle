import React from 'react'
import { Platform, Pressable, StyleSheet, View } from 'react-native'
import { router, usePathname, type Href } from 'expo-router'
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context'
import { C } from '../theme'
import { useMode, type Mode } from '../mode'
import { IconBoard, IconBorrow, IconEarn, IconFeed, IconHome, IconSearch } from './icons'
import { Txt } from './Txt'
import { HomeDot } from './social'

type Tab = { href: string; label: string; Icon: typeof IconHome }
const TABS: Record<Mode, Tab[]> = {
  lite: [
    { href: '/lite', label: 'Home', Icon: IconHome },
    { href: '/lite/earn', label: 'Earn', Icon: IconEarn },
    { href: '/lite/board', label: 'Board', Icon: IconBoard },
  ],
  pro: [
    { href: '/pro', label: 'Home', Icon: IconHome },
    { href: '/pro/feed', label: 'Feed', Icon: IconFeed },
    { href: '/pro/earn', label: 'Earn', Icon: IconEarn },
    { href: '/pro/borrow', label: 'Borrow', Icon: IconBorrow },
    { href: '/pro/board', label: 'Board', Icon: IconBoard },
  ],
}

/**
 * Where the bar steps aside: the ticket (a sheet over the page) and the paper sign-in (a flow
 * with one way out) — a task with its own close, as a checkout hides an app's tabs. iOS presents
 * the ticket natively over the whole window, bar included, so there it stays put underneath and
 * the page behind the sheet does not jump.
 */
const sheet = (path: string) => path.startsWith('/strategy')
const flow = (path: string) => path === '/paper' || (Platform.OS !== 'ios' && sheet(path))

/**
 * The web's bottom tab bar (app.css `.tabbar` + the refit at its end): icon over word, the active
 * one in the primary colour with its icon on a pill. Lite's ends on a round search button after the
 * tabs (docs/lite-social-search.md §4.1): Pro's search is in its top bar. Lite's Home carries a dot
 * while the people you follow have moves you have not seen.
 *
 * One bar under the whole app, not the tab navigator's: a wallet's page, You, a position, search and
 * settings are pushed over the tabs, and with the navigator's bar they covered it — the one way
 * home was the back arrow. Here it stays on every page (iOS's and Material's rule: the bar is the
 * anchor, hidden only for a modal task, `flow`). On a pushed page the tab it was opened from stays
 * lit, and a tap on any tab closes what was pushed and lands on that tab's root.
 */
export function AppTabBar({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const saved = useMode()
  const insets = useSafeAreaInsets()
  // the shell and tab last stood on: a pushed page (`/w/…`) belongs to neither by its path
  const last = React.useRef<{ mode: Mode; tab: string }>({ mode: saved, tab: `/${saved}` })
  const shell: Mode | null = path === '/lite' || path.startsWith('/lite/') ? 'lite' : path === '/pro' || path.startsWith('/pro/') ? 'pro' : null
  if (shell) last.current = { mode: shell, tab: TABS[shell].find((t) => t.href === path)?.href ?? `/${shell}` }
  const mode = shell ?? last.current.mode
  const show = !flow(path)
  const go = (href: string) => {
    if (router.canDismiss()) router.dismissAll()
    if (href !== path) router.navigate(href as Href)
  }
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* the bar takes the home indicator's inset: the pages above it have none at their foot (the ticket, over the bar, keeps it) */}
      <SafeAreaInsetsContext.Provider value={show && !sheet(path) ? { ...insets, bottom: 0 } : insets}>{children}</SafeAreaInsetsContext.Provider>
      {show && (
        <View style={[st.bar, { paddingBottom: insets.bottom }]}>
          {TABS[mode].map(({ href, label, Icon }, i) => {
            const on = path !== '/search' && last.current.tab === href
            const color = on ? C.primary : C.tx50
            return (
              <Pressable key={href} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label} onPress={() => go(href)} style={st.item}>
                <View style={[st.icon, on && { backgroundColor: C.priBg }]}><Icon color={color} />{mode === 'lite' && i === 0 && <HomeDot />}</View>
                <Txt s={11} w={600} c={color} lh={16}>{label}</Txt>
              </Pressable>
            )
          })}
          {/* set apart from the tabs by a hairline: a button that opens search, not a fourth place (docs/lite-design-review.md §3.6) */}
          {mode === 'lite' && <View style={st.rule} />}
          {mode === 'lite' && (
            <View style={st.searchSlot}>
              <Pressable onPress={() => { if (path !== '/search') router.push('/search') }} style={({ pressed }) => [st.search, path === '/search' && st.searchOn, pressed && { backgroundColor: C.b400 }]} accessibilityLabel="Search" accessibilityRole="search">
                <IconSearch color={path === '/search' ? C.primary : C.tx70} size={20} />
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', paddingHorizontal: 8, backgroundColor: 'rgba(0,0,0,0.92)', borderTopWidth: 1, borderTopColor: C.line },
  item: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2 },
  rule: { width: 1, height: 28, alignSelf: 'center', backgroundColor: C.line2 },
  searchSlot: { width: 63, alignItems: 'center', justifyContent: 'center' },
  search: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: C.b300, borderWidth: 1, borderColor: C.line },
  searchOn: { borderColor: C.primary },
  icon: { width: 48, height: 28, paddingVertical: 4, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
})
