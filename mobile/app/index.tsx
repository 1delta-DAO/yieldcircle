import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useCapabilities } from 'wagmi'
import { AppKitButton } from '@reown/appkit-react-native'
import { fetchEarn } from '@yieldcircle/core/sdk/api'
import { classifyEarn, type SimpleStrategy } from '@yieldcircle/core/model/strategies'
import { DEFAULTS } from '@yieldcircle/core/model/settings'
import { WC_PROJECT_ID } from '../src/env'

/**
 * The first screen is a probe, not the product: it proves the three things the phone app rests on —
 * a wallet connects (and comes back), the wallet says what it can batch, and core runs on Hermes.
 */
export default function Home() {
  return (
    <SafeAreaView style={s.page} edges={['top']}>
      <ScrollView contentContainerStyle={s.body}>
        <Text style={s.h1}>YieldCircle</Text>
        {!WC_PROJECT_ID && <Text style={s.warn}>EXPO_PUBLIC_WC_PROJECT_ID is not set (mobile/.env): no wallet can connect.</Text>}
        <AppKitButton />
        <Capabilities />
        <Earn />
      </ScrollView>
    </SafeAreaView>
  )
}

/**
 * What the connected wallet reports over WalletConnect for EIP-5792 (`wallet_getCapabilities`):
 * whether `wallet_sendCalls` can batch atomically on this chain — the open question for the
 * one-signature ladder (`useLadder.ts` on the web), answered per wallet.
 */
function Capabilities() {
  const { address, chainId, connector } = useAccount()
  const caps = useCapabilities({ account: address, query: { enabled: !!address, retry: false } })
  if (!address) return null
  const here = chainId != null ? (caps.data as Record<number, Record<string, unknown>> | undefined)?.[chainId] : undefined
  const atomic = (here?.atomic as { status?: string } | undefined)?.status
  return (
    <View style={s.card}>
      <Text style={s.h2}>Wallet capabilities</Text>
      <Text style={s.dim}>{connector?.name ?? 'wallet'} · chain {chainId}</Text>
      {caps.isLoading ? <ActivityIndicator /> : caps.error ? (
        <Text style={s.dim}>No EIP-5792: {caps.error.message.split('\n')[0]}. Steps go one transaction at a time.</Text>
      ) : (
        <>
          <Text style={s.big}>atomic batch: {atomic ?? 'not reported'}</Text>
          <Text style={s.mono}>{JSON.stringify(here ?? caps.data ?? null, null, 1)}</Text>
        </>
      )}
      <Pressable onPress={() => caps.refetch()}><Text style={s.link}>Ask again</Text></Pressable>
    </View>
  )
}

/** Base's deposits through core: the allocator client, the curation and the default floors. */
function Earn() {
  const q = useQuery({
    queryKey: ['earn', '8453'],
    queryFn: async () => {
      const r = await fetchEarn({ chainIds: ['8453'], count: 200, minTvlUsd: DEFAULTS.minTvlUsd })
      return r.items
        .map((m) => classifyEarn(m).s)
        .filter((x): x is SimpleStrategy => !!x)
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 15)
    },
  })
  return (
    <View style={s.card}>
      <Text style={s.h2}>Earn on Base</Text>
      {q.isLoading && <ActivityIndicator />}
      {q.error && <Text style={s.warn}>{q.error.message}</Text>}
      {q.data?.map((x) => (
        <View key={x.id} style={s.row}>
          <Text style={s.cell} numberOfLines={1}>{x.asset} · {x.venue}</Text>
          <Text style={s.rate}>{x.rate.toFixed(2)}%</Text>
        </View>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000' },
  body: { padding: 16, gap: 16 },
  h1: { color: '#fff', fontSize: 28, fontWeight: '700' },
  h2: { color: '#fff', fontSize: 17, fontWeight: '600', marginBottom: 6 },
  card: { backgroundColor: '#111', borderRadius: 14, padding: 14, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 12 },
  cell: { color: '#ddd', flex: 1 },
  rate: { color: '#7ee2a8', fontVariant: ['tabular-nums'] },
  big: { color: '#fff', fontSize: 15 },
  dim: { color: '#888' },
  warn: { color: '#f5a524' },
  mono: { color: '#aaa', fontFamily: 'Courier', fontSize: 11 },
  link: { color: '#8ab4ff', marginTop: 4 },
})
