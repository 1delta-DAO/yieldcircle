import { Tabs } from 'expo-router'
import { glyph, tabOptions } from '../../src/ui/tabs'

/** Pro: the web's five tabs — Home · Feed · Earn · Borrow · Board. */
export default function ProTabs() {
  return (
    <Tabs screenOptions={tabOptions}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: glyph('⌂') }} />
      <Tabs.Screen name="feed" options={{ title: 'Feed', tabBarIcon: glyph('☰') }} />
      <Tabs.Screen name="earn" options={{ title: 'Earn', tabBarIcon: glyph('%') }} />
      <Tabs.Screen name="borrow" options={{ title: 'Borrow', tabBarIcon: glyph('⇄') }} />
      <Tabs.Screen name="board" options={{ title: 'Board', tabBarIcon: glyph('≡') }} />
    </Tabs>
  )
}
