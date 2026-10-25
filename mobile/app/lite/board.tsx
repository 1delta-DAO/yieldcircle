import { ScrollView } from 'react-native'
import { WalletBoard } from '../../src/ui/board'

/** Lite's leaderboard: who earns, read off the chain. */
export default function LiteBoard() {
  return <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}><WalletBoard /></ScrollView>
}
