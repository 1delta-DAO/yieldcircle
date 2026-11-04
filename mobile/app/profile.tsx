import React from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { useAccount } from 'wagmi'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppKit } from '@reown/appkit-react-native'
import { labelFor, shortAddr } from '@yieldcircle/core/identity/name'
import { liteWidened } from '@yieldcircle/core/model/lite'
import { useSettings } from '@yieldcircle/app/state/Settings'
import { useSession } from '@yieldcircle/app/session'
import { useBook } from '@yieldcircle/app/book'
import { useProfile } from '@yieldcircle/app/social/queries'
import { useSocialWrite } from '@yieldcircle/app/social/sign'
import { TELEGRAM_BLUE, TELEGRAM_D, TELEGRAM_URL, X_D, X_URL } from '@yieldcircle/design/brand/links'
import { setMode, useMode, type Mode } from '../src/mode'
import { useChains } from '../src/chains'
import { usePaper } from '../src/paper'
import { disconnectSol, useSolAccount } from '../src/solana'
import { C } from '../src/theme'
import { Btn, Seg } from '../src/ui/bits'
import { Character } from '../src/ui/Character'
import { Filters } from '../src/ui/Filters'
import { ChainList, useChainLabel } from '../src/ui/ChainChip'
import { IconBack } from '../src/ui/icons'
import { PAPER, PaperAccount } from '../src/ui/paper'
import { LinkedWallets, PendingChanges } from '../src/ui/social'
import { Txt } from '../src/ui/Txt'

/**
 * Profile and settings, behind the face top-left (the web's `ProfileSheet`): who you are, your name
 * and face, your wallets under one profile, what waits for a signature, Lite / Pro, and the settings
 * every list reads — chains, filters (Lite's four in Lite, all of them in Pro) and slippage — and the
 * paper account (optional: in use, or stepped aside for the wallet). Folded, each says its value.
 * Your money is behind the chip top-right (You).
 */
export default function Profile() {
  const insets = useSafeAreaInsets()
  const { isConnected, viewAs } = useSession()
  const b = useBook()
  const { account: author } = useSocialWrite()
  const paper = usePaper()
  const wallet = useAccount()
  const mode = useMode()
  const { st: cur, widened } = useSettings()
  const { allChains } = useChains()
  const chainState = useChainLabel()
  const p = useProfile(b.account).data?.profile ?? null
  const lite = mode === 'lite'
  const n = lite ? liteWidened(cur) : widened
  const own = isConnected && !viewAs
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[st.bar, { paddingTop: insets.top, height: 60 + insets.top }]}>
        <Pressable onPress={() => router.back()} hitSlop={6} style={st.back} accessibilityLabel="Back"><IconBack color={C.tx70} /></Pressable>
        <Txt s={16} w={600}>Profile and settings</Txt>
      </View>
      <ScrollView contentContainerStyle={[st.page, { paddingBottom: insets.bottom + 40 }]}>
        {/* who you are */}
        <View style={st.head}>
          {b.account ? <>
            <Character addr={b.account} avatarUrl={p?.avatarUrl} size={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt s={17} w={700} numberOfLines={1}>{labelFor(b.account, p).label}</Txt>
              <Txt s={12.5} c={C.tx50} numberOfLines={1}>{p?.handle && p.displayName ? `@${p.handle} · ` : ''}{shortAddr(b.account)}{viewAs ? ' · viewing as' : ''}</Txt>
            </View>
          </> : <Txt s={13} c={C.tx70} lh={19} style={{ flex: 1 }}>Connect a wallet to have a name and face, follow people and see your own money.</Txt>}
        </View>

        <View style={st.group}>
          {/* paper in use is the account; otherwise the wallet, connected or not (paper stays signed in below) */}
          {paper.active && paper.session ? (
            <View style={st.row}>
              <View style={st.paperPill}><Txt s={11} w={600} c={PAPER.fg} lh={16.5}>paper</Txt></View>
              <Txt s={14} style={{ flex: 1 }} numberOfLines={1}>{paper.session.name}</Txt>
              {wallet.isConnected
                ? <Btn sm kind="plain" title="Use my wallet" onPress={() => paper.use(false)} />
                : <Btn sm kind="plain" title="Sign out" onPress={paper.signOut} />}
            </View>
          ) : <Wallets />}
          {own && <Link label="Edit your name and face" onPress={() => router.push('/me')} />}
        </View>

        {author && !viewAs && <Fold label="Your wallets" state="one profile across your addresses" on={false}><View style={{ padding: 14, paddingTop: 0 }}><LinkedWallets account={author} /></View></Fold>}
        {author && !viewAs && <View style={{ marginTop: 12 }}><PendingChanges onEdit={() => router.push('/me')} /></View>}

        <Txt s={16} w={600} style={st.h}>Settings</Txt>
        <View style={{ gap: 10 }}>
          <Fold label="Chains" state={chainState} on={!allChains}>
            <ChainList />
          </Fold>
          <Fold label={lite ? 'What Lite shows' : 'Filters'} state={n ? `${n} widened` : 'Curated'} on={n > 0}><Filters lite={lite} /></Fold>
        </View>

        <View style={[st.group, { borderWidth: 1, borderColor: PAPER.line }]}><PaperAccount walletConnected={wallet.isConnected} /></View>

        <ModeSwitch mode={mode} />
        <Socials />
      </ScrollView>
    </View>
  )
}

/** A setting that says its value while closed (the web's `.ps-fold`). */
function Fold({ label, state, on, children }: { label: string; state: string; on: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <View style={[st.group, { marginTop: 0 }]}>
      <Pressable onPress={() => setOpen((o) => !o)} style={st.row} accessibilityState={{ expanded: open }}>
        <Txt s={14} style={{ flexShrink: 0 }}>{label}</Txt>
        <Txt s={13} c={on ? C.primary : C.tx50} numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>{state}</Txt>
        <Txt c={C.tx40}>{open ? '⌃' : '⌄'}</Txt>
      </Pressable>
      {open && children}
    </View>
  )
}

/**
 * The wallets, one per VM as on the web: an EVM one (wagmi) and a Solana one (`src/solana.ts`).
 * Connect opens AppKit's wallet list either way — a wallet holding both (Trust, Phantom over
 * WalletConnect) connects both in one session; Phantom and Solflare connect Solana beside the EVM one.
 */
function Wallets() {
  const { open, disconnect } = useAppKit()
  const evm = useAccount()
  const sol = useSolAccount()
  const add = () => open({ view: 'Connect' })
  return <>
    <WalletRow vm="EVM" address={evm.address?.toLowerCase()} wallet={evm.connector?.name} onConnect={add} onDisconnect={() => disconnect('eip155')} />
    <WalletRow vm="Solana" address={sol.account?.address} wallet={sol.wallet} onConnect={add} onDisconnect={() => void disconnectSol()} />
    {sol.viaEvm && <Txt s={12} c={C.tx50} lh={17} style={{ paddingHorizontal: 14, paddingBottom: 12 }}>One session carries both: disconnecting one disconnects the other.</Txt>}
    {!!evm.address !== !!sol.account && <Txt s={12} c={C.tx50} lh={17} style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
      {evm.address ? 'Add Phantom or Solflare for Solana, beside this wallet.' : 'Add an EVM wallet beside this one for every other chain.'}
    </Txt>}
  </>
}

function WalletRow({ vm, address, wallet, onConnect, onDisconnect }: { vm: string; address?: string; wallet?: string; onConnect: () => void; onDisconnect: () => void }) {
  return (
    <View style={st.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt s={14} w={600}>{vm}</Txt>
        <Txt s={12.5} c={C.tx50} numberOfLines={1}>{address ? `${shortAddr(address)}${wallet ? ` · ${wallet}` : ''}` : 'not connected'}</Txt>
      </View>
      {address ? <Btn sm kind="plain" title="Disconnect" onPress={onDisconnect} /> : <Btn sm title="Connect" onPress={onConnect} />}
    </View>
  )
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[st.row, st.line]} accessibilityRole="link">
      <Txt s={14} style={{ flex: 1 }}>{label}</Txt><Txt c={C.tx40}>›</Txt>
    </Pressable>
  )
}

/** The community links (the design's `Socials`): Telegram as a pill in its own blue, X as an icon. */
function Socials() {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 24 }}>
      <Pressable onPress={() => void Linking.openURL(TELEGRAM_URL)} accessibilityRole="link" style={st.tg}>
        <Svg width={18} height={18} viewBox="0 0 24 24"><Path d={TELEGRAM_D} fill={TELEGRAM_BLUE} /></Svg>
        <Txt s={13} w={600}>Join the community on Telegram</Txt>
      </Pressable>
      <Pressable onPress={() => void Linking.openURL(X_URL)} accessibilityRole="link" accessibilityLabel="YieldCircle on X" style={st.x}>
        <Svg width={15} height={15} viewBox="0 0 24 24"><Path d={X_D} fill={C.tx} /></Svg>
      </Pressable>
    </View>
  )
}

/** Lite / Pro (the web's ModeSwitch): saved, and `/` opens the saved one. */
function ModeSwitch({ mode }: { mode: Mode }) {
  const choose = (m: Mode) => { setMode(m); if (router.canDismiss()) router.dismissAll(); router.replace(m === 'pro' ? '/pro' : '/lite') }
  return (
    <View style={{ alignItems: 'center', gap: 12, marginTop: 28 }}>
      <Seg items={[{ id: 'lite', word: 'Lite' }, { id: 'pro', word: 'Pro' }]} value={mode} onChange={choose} />
      <Txt s={12.5} c={C.tx50} style={{ textAlign: 'center' }}>{mode === 'lite' ? 'The best rates in plain words. Pro has every venue, chain, tier and borrowing.' : 'Every venue, chain, tier and borrowing. Lite has the best rates in plain words.'}</Txt>
      <Pressable onPress={() => router.push('/probe')}><Txt s={12} c={C.tx40}>Wallet probe ›</Txt></Pressable>
    </View>
  )
}

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.86)', borderBottomWidth: 1, borderBottomColor: '#1a1a1f' },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  page: { paddingHorizontal: 16, paddingTop: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  h: { letterSpacing: -0.16, marginTop: 28, marginBottom: 10 },
  group: { backgroundColor: C.b200, borderRadius: 12, overflow: 'hidden', marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 10, paddingHorizontal: 14 },
  line: { borderTopWidth: 1, borderTopColor: C.line },
  tg: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.b200 },
  x: { width: 40, height: 40, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.b200, alignItems: 'center', justifyContent: 'center' },
  paperPill: { backgroundColor: PAPER.bg, borderWidth: 1, borderColor: PAPER.line, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
})
