import { Tabs } from 'expo-router'
import { tabsProps } from '../../src/ui/tabs'

/** Pro: the web's tabs without Home — Earn · Feed · Borrow · Board. Earn is where it opens. */
export default function ProTabs() {
  return (
    <Tabs {...tabsProps(true)}>
      <Tabs.Screen name="index" options={{ title: 'Earn' }} />
      <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
      <Tabs.Screen name="borrow" options={{ title: 'Borrow' }} />
      <Tabs.Screen name="board" options={{ title: 'Board' }} />
    </Tabs>
  )
}
