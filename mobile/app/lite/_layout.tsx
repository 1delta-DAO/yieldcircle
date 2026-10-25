import { Tabs } from 'expo-router'
import { tabsProps } from '../../src/ui/tabs'

/** Lite: three tabs, as on the web — Home · Earn · Board. You is behind the balance chip. */
export default function LiteTabs() {
  return (
    <Tabs {...tabsProps(false)}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="earn" options={{ title: 'Earn' }} />
      <Tabs.Screen name="board" options={{ title: 'Board' }} />
    </Tabs>
  )
}
