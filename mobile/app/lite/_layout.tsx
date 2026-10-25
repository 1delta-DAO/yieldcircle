import { Tabs } from 'expo-router'
import { glyph, tabOptions } from '../../src/ui/tabs'

/** Lite: three tabs, as on the web — Home · Earn · Board. You is behind the balance chip. */
export default function LiteTabs() {
  return (
    <Tabs screenOptions={tabOptions}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: glyph('⌂') }} />
      <Tabs.Screen name="earn" options={{ title: 'Earn', tabBarIcon: glyph('%') }} />
      <Tabs.Screen name="board" options={{ title: 'Board', tabBarIcon: glyph('≡') }} />
    </Tabs>
  )
}
