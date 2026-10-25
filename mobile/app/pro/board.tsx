import { ScrollView } from 'react-native'
import { WalletBoard } from '../../src/ui/board'

/** Pro's board: the same wallet board for now; Pro's strategies view and filters come next. */
export default function ProBoard() {
  return <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}><WalletBoard /></ScrollView>
}
