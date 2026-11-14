import { Tabs } from 'expo-router'
import { tabsProps } from '../../src/ui/tabs'

/** Lite: two tabs — Earn · Board. Earn is where the app opens: the phone has no Home (the web's `#/lite/` lands here). You is behind the balance chip. */
export default function LiteTabs() {
  return (
    <Tabs {...tabsProps(false)}>
      <Tabs.Screen name="index" options={{ title: 'Earn' }} />
      <Tabs.Screen name="board" options={{ title: 'Board' }} />
    </Tabs>
  )
}
