import { ScrollView } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { Board } from '../../src/ui/board'

/** Lite's leaderboard: who earns, read off the chain. */
export default function LiteBoard() {
  const p = useLocalSearchParams<{ by?: string; t?: string }>()
  return <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40 }}><Board key={`${p.by}|${p.t}`} by0={p.by} t0={p.t} /></ScrollView>
}
