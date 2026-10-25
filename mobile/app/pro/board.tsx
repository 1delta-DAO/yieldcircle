import { ScrollView } from 'react-native'
import { Board } from '../../src/ui/board'

/** Pro's board: the same wallet board for now; Pro's strategies view and filters come next. */
export default function ProBoard() {
  return <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40 }}><Board /></ScrollView>
}
