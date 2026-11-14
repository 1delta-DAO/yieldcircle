import { ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Board } from '../../src/ui/board'

/** Pro's board: the same wallet board for now; Pro's strategies view and filters come next. */
export default function ProBoard() {
  // room for the activity pill while it shows (src/ui/TabBar.tsx)
  const { bottom } = useSafeAreaInsets()
  return <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40 + bottom }}><Board /></ScrollView>
}
