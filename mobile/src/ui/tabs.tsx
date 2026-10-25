import { Text, type ColorValue } from 'react-native'
import { C } from '../theme'
import { BalanceChip } from './BalanceChip'

/** One look for both tab bars: the brand's dark, the balance chip top right. */
export const tabOptions = {
  headerStyle: { backgroundColor: C.bg },
  headerTintColor: C.tx,
  headerShadowVisible: false,
  headerTitleStyle: { fontWeight: '700' as const },
  headerRight: () => <BalanceChip />,
  tabBarStyle: { backgroundColor: C.b200, borderTopColor: C.line },
  tabBarActiveTintColor: C.primary,
  tabBarInactiveTintColor: C.tx50,
  sceneStyle: { backgroundColor: C.bg },
}

/** A tab's mark: a glyph, no icon font to load. */
export const glyph = (g: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18, fontWeight: '700' }}>{g}</Text>
