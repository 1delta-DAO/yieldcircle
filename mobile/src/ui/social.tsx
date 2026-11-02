import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { normAddr } from '@yieldcircle/core/model/address'
import { labelFor, shortAddr } from '@yieldcircle/core/identity/name'
import { parseLoopKey } from '@yieldcircle/core/model/uid'
import { describeBundle, headlineUsd } from '@yieldcircle/core/model/moves'
import { ago, usdShort } from '@yieldcircle/core/model/format'
import { subjectOf, type TxBundle } from '@yieldcircle/core/index/types'
import type { LiteRow } from '@yieldcircle/core/model/lite'
import type { Follow, Profile } from '@yieldcircle/core/social/types'
import { useSession } from '@yieldcircle/app/session'
import { useAccountEntity } from '@yieldcircle/app/index/queries'
import { useMyFollows, useProfile, useProfiles, useSocialRefresh, useWalletLinks } from '@yieldcircle/app/social/queries'
import { entryKey, useBatchSupported, usePending } from '@yieldcircle/app/social/pending'
import { useSocialWrite } from '@yieldcircle/app/social/sign'
import { C } from '../theme'
import { Btn, Seg, Sk } from './bits'
import { useChains } from '../chains'
import { useLiteMoves, useMoveReasons } from '@yieldcircle/app/liteMoves'
import { useUnseen, writeSeen } from '@yieldcircle/app/social/seen'
import { Who } from './Character'
import { openStrategy, openWallet } from './lite'
import { Txt } from './Txt'

/** A refused or failed write, in the words a person reads: a closed wallet prompt is "signature rejected". */
export const writeError = (e: unknown) => {
  const m = (e as Error)?.message ?? 'failed'
  return /rejected|denied/i.test(m) ? 'signature rejected' : m.slice(0, 120)
}

/**
 * Follow (the web's `FollowButton`): no wallet prompt — the follow joins the pending queue and is
 * signed later with everything else from You (docs/social.md §17). A service without `Batch` signs
 * it on the spot, as before. Your own address has none. `quiet` where something else on the row is the
 * primary action (a list of people): outlined, not filled.
 */
export function FollowButton({ kind, target, sm = true, quiet }: { kind: Follow['targetKind']; target: string; sm?: boolean; quiet?: boolean }) {
  const { account, follow } = useSocialWrite()
  const f = useMyFollows(account)
  const pending = usePending()
  const batched = useBatchSupported()
  const refresh = useSocialRefresh()
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)
  const on = f.isFollowing(kind, target)
  const queued = f.isPending(kind, target)
  if (kind === 'wallet' && account && normAddr(target) === account) return null
  const go = async () => {
    if (!account) { setErr('connect a wallet to follow'); return }
    if (batched) { pending.stageFollow(kind, target, !on, f.serverFollowing(kind, target)); return }
    setBusy(true); setErr(null)
    try { await follow(kind, target, !on); refresh.follows(account) }
    catch (x) { setErr(writeError(x)) }
    finally { setBusy(false) }
  }
  const fault = err ?? pending.queue.errors[entryKey(kind, target)]
  return (
    <View style={{ alignItems: 'flex-end', gap: 3 }}>
      <Btn sm={sm} kind={on || quiet ? 'plain' : 'pri'} disabled={busy} title={busy ? '…' : on ? 'Following' : 'Follow'} onPress={() => void go()} />
      {fault ? <Txt s={11} c={C.bad} numberOfLines={2} style={{ maxWidth: 160, textAlign: 'right' }}>{fault}</Txt>
        : queued ? <Txt s={11} c={C.tx40}>not signed yet</Txt> : null}
    </View>
  )
}

/**
 * Move rows (the web's Lite `Moves`): what they did · the money · when, and a Copy when Lite carries
 * the strategy; under it the mover's own reason (Say why). `hideWho` on a wallet's own page, where
 * every move is theirs; `showFollow` (Everyone) offers a Follow on a mover you do not follow yet.
 */
export function Moves({ txs, hideWho, showFollow }: { txs: { t: TxBundle; r: LiteRow | null }[]; hideWho?: boolean; showFollow?: boolean }) {
  const { account } = useSession()
  const f = useMyFollows(account)
  const { profile } = useProfiles(hideWho ? [] : txs.map((x) => subjectOf(x.t).account).filter(Boolean))
  const said = useMoveReasons(txs)
  return (
    <View>
      {txs.map(({ t, r }, i) => {
        const d = describeBundle(t)
        const who = subjectOf(t).account
        const why = r ? said(r.s, who) : null
        const follow = showFollow && !!who && !f.isFollowing('wallet', who)
        const what = r ? r.title : t.legs[0]?.symbol ?? ''
        const usd = headlineUsd(t).usd
        const tone = d.cls === 'k-in' ? C.ok : d.cls === 'k-out' || d.cls === 'k-liq' ? C.bad : d.cls === 'k-borrow' ? C.warn : C.tx70
        const line = <Txt s={13} c={C.tx70} numberOfLines={1}><Txt s={13} w={600} c={tone}>{d.verb}</Txt> {what}</Txt>
        return (
          <View key={`${t.chainId}:${t.txHash}`} style={i > 0 && st.line}>
          <View style={st.move}>
            {hideWho ? <View style={{ flex: 1 }}>{line}</View> : (
              <Pressable onPress={() => openWallet(who)} style={{ flex: 1 }}>
                <Who account={who} profile={profile(who)} idx={subjectOf(t)} size={24} sub={`${d.verb} ${what}`} />
              </Pressable>
            )}
            <View style={{ alignItems: 'flex-end' }}>
              <Txt s={13} w={600}>{usd != null ? usdShort(Math.abs(usd)) : '–'}</Txt>
              <Txt s={11} c={C.tx40}>{ago(t.blockTs)}</Txt>
            </View>
            {follow && <FollowButton kind="wallet" target={who} quiet />}
            {r && normAddr(who) !== normAddr(account ?? '') ? <Btn sm title="Copy" onPress={() => openStrategy(r.s, { copy: who })} /> : <View style={{ width: 52 }} />}
          </View>
          {why && <Txt s={12.5} c={C.tx70} lh={18} numberOfLines={2} style={st.why}>“{why.body}”</Txt>}
          </View>
        )
      })}
    </View>
  )
}

/**
 * Lite's moves (the web's `LiteMoves`, Home and You): the people you follow, or the wallets with the
 * best rates — the shared `useLiteMoves` decides which and what is kept. `followingOnly` (You): no
 * Everyone, and nothing at all without follows. Their moves on screen count as seen: the Home dot goes.
 */
export function LiteMoves({ rows, account, limit = 8, title, followingOnly }: { rows: LiteRow[]; account: string | undefined; limit?: number; title?: string; followingOnly?: boolean }) {
  const { allChains, chainIds } = useChains()
  const { tab, setTab, has, txs, loading } = useLiteMoves({ rows, account, limit, chains: allChains ? undefined : chainIds.join(','), followingOnly })
  React.useEffect(() => { if (tab === 'following' && txs.length) writeSeen(Date.now()) }, [tab, txs.length])
  if (followingOnly && !has) return null
  const empty = tab === 'following' && !has
    ? account ? 'Follow someone and their moves show here, with a Copy on each. Everyone shows the wallets with the best rates.' : 'Connect a wallet to follow people. Everyone shows what the wallets with the best rates do.'
    : !txs.length ? tab === 'following' ? 'Nothing from them yet.' : 'No move to copy from the best rates right now.' : null
  return (
    <View style={{ marginTop: 26 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <Txt s={16} w={600} style={{ letterSpacing: -0.16, flex: 1 }}>{title ?? (tab === 'following' ? 'People you follow' : 'Moves by the best rates')}</Txt>
        {!followingOnly && <Seg items={[{ id: 'following', word: 'Following' }, { id: 'everyone', word: 'Everyone' }]} value={tab} onChange={setTab} />}
      </View>
      <View style={st.card}>
        {loading ? <View style={{ padding: 14 }}><Sk w={200} /></View>
          : empty ? <Txt s={13} c={C.tx50} lh={19} style={{ padding: 14 }}>{empty}</Txt>
          : <Moves txs={txs} showFollow={tab === 'everyone'} />}
      </View>
    </View>
  )
}

/** The dot on Lite's Home tab: moves by the people you follow since you last saw them. */
export function HomeDot() {
  return useUnseen() > 0 ? <View style={st.dot} accessibilityLabel="New from people you follow" /> : null
}

/**
 * What is waiting for a signature (the web's `PendingChanges`, docs/social.md §17): follows and a
 * profile edit made without a wallet prompt. One button signs them all as one `Batch`; the service
 * applies all of it or none, and marks what it refused.
 */
export function PendingChanges({ onEdit }: { onEdit: () => void }) {
  const pending = usePending()
  const { queue: q, count } = pending
  const names = useProfiles(q.follows.filter((f) => f.targetKind === 'wallet').map((f) => f.target))
  if (!count) return null
  const what = [q.follows.length && `${q.follows.length} follow${q.follows.length === 1 ? '' : 's'}`, q.profile && 'profile'].filter(Boolean).join(' · ')
  return (
    <View style={st.pend}>
      <View style={st.row}><Txt s={14} w={600} style={{ flex: 1 }}>Pending changes</Txt><Txt s={12.5} c={C.tx50}>{what}</Txt></View>
      {q.profile && (
        <PendRow tag="Edit" tone={C.primary} label="Your profile" err={q.errors.profile} onPress={onEdit} onDrop={pending.dropProfile} />
      )}
      {q.follows.map((f) => {
        const k = entryKey(f.targetKind, f.target)
        const loop = f.targetKind === 'strategy' ? parseLoopKey(f.target) : null
        const label = f.targetKind === 'wallet' ? labelFor(f.target, names.profile(f.target)).label
          : f.targetKind === 'market' ? f.target.split(':')[0]
          : loop ? `a loop on ${loop.long.split(':')[0]}`
          : f.target
        return (
          <PendRow key={k} tag={f.action === 'follow' ? 'Follow' : 'Unfollow'} tone={f.action === 'follow' ? C.ok : C.warn} label={label} err={q.errors[k]}
            onPress={f.targetKind === 'wallet' ? () => openWallet(f.target) : undefined} onDrop={() => pending.dropFollow(f.targetKind, f.target)} />
        )
      })}
      {q.errors.batch && <Txt s={12.5} c={C.bad}>{q.errors.batch}</Txt>}
      <Btn wide disabled={pending.applying} title={pending.applying ? 'Signing…' : `Sign & apply ${count === 1 ? 'it' : `all ${count}`}`} onPress={() => void pending.apply()} />
      <Txt s={12} c={C.tx50}>One signature for all of it, no gas. Until then, only you see these.</Txt>
    </View>
  )
}
function PendRow({ tag, tone, label, err, onPress, onDrop }: { tag: string; tone: string; label: string; err?: string; onPress?: () => void; onDrop: () => void }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={st.row}>
        <Txt s={13} w={600} c={tone}>{tag}</Txt>
        <Pressable onPress={onPress} disabled={!onPress} style={{ flex: 1 }}><Txt s={13} numberOfLines={1}>{label}</Txt></Pressable>
        <Pressable onPress={onDrop} hitSlop={10} accessibilityLabel={`Drop ${tag} ${label}`}><Txt s={18} c={C.tx50}>×</Txt></Pressable>
      </View>
      {err && <Txt s={11.5} c={C.bad}>{err}</Txt>}
    </View>
  )
}

/**
 * The group on a profile page (the web's `ProfileWallets`): the wallets that signed a link to one
 * profile, and apart from them — said as such — a group YieldCircle made from public evidence.
 * Nothing for an address with neither.
 */
export function ProfileWallets({ addr }: { addr: string }) {
  const a = normAddr(addr) ?? addr
  const links = useWalletLinks(a).data
  const primary = links?.primary ?? a
  const p = useProfile(primary).data?.profile ?? null
  const entity = useAccountEntity(a.startsWith('0x') ? a : undefined).data ?? null
  const curated = entity && entity.addresses.length > 1 ? entity : null
  const members = links?.members.map((m) => m.account) ?? []
  if (!members.length && !curated) return null
  return (
    <View style={{ gap: 8 }}>
      {curated && (
        <View style={{ gap: 6 }}>
          <Txt s={12} c={curated.kind === 'exploiter' ? C.warn : C.tx50}>
            <Txt s={12} w={600} c={curated.kind === 'exploiter' ? C.warn : C.tx70}>{curated.name}</Txt> · {curated.addresses.length} wallets · grouped by YieldCircle from public evidence, not signed by them
          </Txt>
          <Chips addrs={curated.addresses.map((w) => w.address.toLowerCase())} here={a} />
        </View>
      )}
      {members.length > 0 && <Signed a={a} primary={primary} p={p} members={members} />}
    </View>
  )
}
function Signed({ a, primary, p, members }: { a: string; primary: string; p: Profile | null; members: string[] }) {
  const all = [primary, ...members]
  return (
    <View style={{ gap: 6 }}>
      <Txt s={12} c={C.tx50}>{primary === a ? `${all.length} wallets, one profile` : `One of ${labelFor(primary, p).label}’s ${all.length} wallets`} · each signed</Txt>
      <Chips addrs={all} here={a} primary={primary} />
    </View>
  )
}
function Chips({ addrs, here, primary }: { addrs: string[]; here: string; primary?: string }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {addrs.map((w) => (
        <Pressable key={w} onPress={() => w !== here && openWallet(w)} style={[st.chip, w === here && { borderColor: C.primary }]}>
          <Txt s={12} c={w === here ? C.tx : C.tx70} style={{ fontVariant: ['tabular-nums'] }}>{shortAddr(w)}</Txt>
          {w === primary && <Txt s={10.5} c={C.tx40}>profile</Txt>}
        </Pressable>
      ))}
    </View>
  )
}

/**
 * The connected wallet's wallets under one profile (the web's `LinkedWallets`, tickets/0021): the
 * signed links with Unlink. Adding one needs the other wallet's key beside this one — a Solana
 * wallet on the web — and the phone holds one wallet, so adding is the web's for now.
 */
export function LinkedWallets({ account }: { account: string }) {
  const me = normAddr(account) ?? account
  const links = useWalletLinks(me)
  const { unlinkWallet } = useSocialWrite()
  const refresh = useSocialRefresh()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [err, setErr] = React.useState<string | null>(null)
  const primary = links.data?.primary ?? me
  const primaryName = labelFor(primary, useProfile(primary).data?.profile ?? null).label
  const unlink = async (m: string) => {
    setBusy(m); setErr(null)
    try { await unlinkWallet(m, primary); refresh.links() }
    catch (e) { setErr(writeError(e)) }
    finally { setBusy(null) }
  }
  if (links.isLoading) return <Txt s={12.5} c={C.tx50}>Reading your wallets…</Txt>
  const members = links.data?.members ?? []
  if (primary !== me) return (
    <View style={{ gap: 10 }}>
      <Txt s={13} c={C.tx70} lh={19}>{shortAddr(me)} is one of {primaryName}’s wallets. Wallets are added from {shortAddr(primary)}, the profile’s own.</Txt>
      <Btn sm kind="plain" disabled={!!busy} title={busy === me ? 'Signing…' : `Unlink ${shortAddr(me)}`} onPress={() => void unlink(me)} />
      {err && <Txt s={12.5} c={C.bad}>{err}</Txt>}
    </View>
  )
  return (
    <View style={{ gap: 8 }}>
      {members.length ? members.map((m) => (
        <View key={m.account} style={st.row}>
          <Pressable onPress={() => openWallet(m.account)} style={{ flex: 1 }}><Txt s={13} style={{ fontVariant: ['tabular-nums'] }}>{shortAddr(m.account)}{m.account.startsWith('0x') ? '' : ' · Solana'}</Txt></Pressable>
          <Btn sm kind="plain" disabled={!!busy} title={busy === m.account ? 'Signing…' : 'Unlink'} onPress={() => void unlink(m.account)} />
        </View>
      )) : <Txt s={13} c={C.tx50}>No linked wallets yet.</Txt>}
      {err && <Txt s={12.5} c={C.bad}>{err}</Txt>}
      <Txt s={12} c={C.tx50} lh={17}>Linking another wallet takes a signature from each, so it starts on the web, where both can be connected. Linking is public, and unlinking later does not undo what others saw.</Txt>
    </View>
  )
}

const st = StyleSheet.create({
  move: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  why: { paddingHorizontal: 14, paddingBottom: 10, marginTop: -4, fontStyle: 'italic' },
  card: { backgroundColor: C.b200, borderRadius: 12, overflow: 'hidden' },
  dot: { position: 'absolute', top: 2, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary },
  line: { borderTopWidth: 1, borderTopColor: '#1a1a1f' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pend: { backgroundColor: C.b200, borderRadius: 12, padding: 14, gap: 10, borderWidth: 1, borderColor: C.primary },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1, borderColor: C.line2, paddingVertical: 4, paddingHorizontal: 9, backgroundColor: C.b300 },
})
