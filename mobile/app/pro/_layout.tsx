import { Tabs } from 'expo-router'
import { tabsProps } from '../../src/ui/tabs'

/** Pro: the web's five tabs — Home · Feed · Earn · Borrow · Board. */
export default function ProTabs() {
  return (
    <Tabs {...tabsProps(true)}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
      <Tabs.Screen name="earn" options={{ title: 'Earn' }} />
      <Tabs.Screen name="borrow" options={{ title: 'Borrow' }} />
      <Tabs.Screen name="board" options={{ title: 'Board' }} />
    </Tabs>
  )
}
