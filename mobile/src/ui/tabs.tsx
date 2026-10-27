import { C } from '../theme'
import { TabBar, type TabBarProps } from './TabBar'
import { TopBar } from './TopBar'

/** Both tab bars: the web's top bar and bottom bar, the page black under them. */
export const tabsProps = (pro: boolean) => ({
  tabBar: (p: TabBarProps) => <TabBar {...p} search={!pro} />,
  screenOptions: { header: () => <TopBar pro={pro} />, sceneStyle: { backgroundColor: C.bg } },
})
