import { ScrollView } from 'react-native'
import { Board } from '../../src/ui/board'

/** Lite's leaderboard: who earns, read off the chain. */
export default function LiteBoard() {
  return <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40 }}><Board /></ScrollView>
}
