import { C } from '../theme'
import { TopBar } from './TopBar'

/** Both tab navigators: the web's top bar, the page black under it. The bottom bar is the app's, not theirs (`AppTabBar`). */
export const tabsProps = (pro: boolean) => ({
  tabBar: () => null,
  screenOptions: { header: () => <TopBar pro={pro} />, sceneStyle: { backgroundColor: C.bg } },
})
