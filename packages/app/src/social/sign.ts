/**
 * Signing a social write (the message shapes are core's, `social/envelope.ts`).
 * The wallet IS the account: every write is signed by its author and posted
 * with its signature. A Solana author signs through the app's `Platform`.
 */
import { useAccount, useSignTypedData } from 'wagmi'
import { base58Encode, isSolAddr } from '@yieldcircle/core/model/address'
import * as api from '@yieldcircle/core/social/api'
import type { RatingSubjectKind } from '@yieldcircle/core/social/api'
import type { Follow, SubjectKind } from '@yieldcircle/core/social/types'
import { DOMAIN, TYPES, canonicalJson, nonce, now, type Envelope, type FollowOp, type PrimaryType, type ProfileOp } from '@yieldcircle/core/social/envelope'
import { usePlatform, type Platform } from '../platform'

export * from '@yieldcircle/core/social/envelope'

/**
 * The SOLANA signer (docs/solana.md §F): ed25519 over the JSON-canonical,
 * domain-separated form of the same typed payload. The social service
 * verifies it for every primaryType on `/write` (`packages/social`
 * `envelope.ts`, tickets/0056 W6.1); `sign` below picks it when the author
 * is the Solana wallet.
 */
export async function signSolanaEnvelope<T extends PrimaryType>(solSignMessage: Platform['solSignMessage'], primaryType: T, message: Record<string, unknown>): Promise<Envelope> {
  const sig = await solSignMessage(canonicalJson({ domain: DOMAIN, primaryType, message }))
  return { primaryType, message, signature: base58Encode(sig) }
}
/**
 * One hook for every write. The message is built here so `author`, `nonce` and
 * `signedAt` can never be forgotten at a call site, and the result is already
 * posted — a caller awaits the write, not the signature.
 */
export function useSocialWrite() {
  const { address: wallet, connector } = useAccount()
  const platform = usePlatform()
  // a key the app holds (the phone's paper account) signs when no wallet is connected
  const local = platform.useLocalSigner?.() ?? null
  const address = wallet ?? (local?.address as `0x${string}` | undefined)
  const sol = platform.useSol().account?.address
  const solSign = <T extends PrimaryType>(primaryType: T, message: Record<string, unknown>) => signSolanaEnvelope(platform.solSignMessage, primaryType, message)
  const { signTypedDataAsync } = useSignTypedData()
  // the social identity: the EVM wallet when there is one (it owns the
  // profile a Solana wallet links into), else the Solana wallet on its own
  const author = address?.toLowerCase() ?? sol
  /** Sign only. Used where the envelope travels somewhere other than `/write`. */
  async function sign<T extends PrimaryType>(primaryType: T, fields: Record<string, unknown>): Promise<Envelope> {
    if (!author) throw new Error('connect a wallet to post')
    // fields may carry their own `nonce` (the X link worker issues one and
    // both halves must quote it); otherwise one is generated here
    const message = { author, ...fields, nonce: (fields.nonce as string) || nonce(), signedAt: now() }
    if (!address) return solSign(primaryType, message)
    if (!wallet && local) return { primaryType, message, signature: await local.signTypedData({ domain: DOMAIN, types: TYPES, primaryType, message }) }
    // a wallet in another app shows the request only once it is in front: brought forward here,
    // before the first await, while the tap is still live (a no-op for a wallet in this page)
    platform.openWallet(connector?.id)
    // viem types the message against the chosen primaryType; the writer's
    // public methods below are what keeps the call sites honest
    const signature = await signTypedDataAsync({
      domain: DOMAIN,
      types: TYPES,
      primaryType,
      message,
    } as never)
    return { primaryType, message, signature }
  }
  const send = async <T extends PrimaryType>(primaryType: T, fields: Record<string, unknown>): Promise<api.WriteResult> => {
    const e = await sign(primaryType, fields)
    return api.write(e.primaryType, e.message, e.signature)
  }
  return {
    /** the author every write is signed as: hex lowered, or the Solana base58 verbatim */
    account: author,
    /** post a comment; `parentId` 0 is top level */
    message: (subjectKind: SubjectKind, subjectKey: string, body: string, parentId = 0) =>
      send('Message', { subjectKind, subjectKey, parentId, body }),
    react: (subjectKind: SubjectKind, subjectKey: string, kind: string, on: boolean) =>
      send('Reaction', { subjectKind, subjectKey, kind, action: on ? 'add' : 'remove' }),
    follow: (targetKind: Follow['targetKind'], target: string, on: boolean) =>
      send('Follow', { targetKind, target, action: on ? 'follow' : 'unfollow' }),
    /**
     * Say something about a subject. Everyone may write — a wallet the index
     * has never seen is stored and counts ZERO — because refusing the unknown
     * would make this a members' club and would hide the first sighting of an
     * exploit. `evidenceUrl` is required by the service for the accusatory
     * labels and refused for the conviction ones.
     */
    rate: (
      subjectKind: RatingSubjectKind,
      subjectKey: string,
      label: string,
      o: { evidenceUrl?: string; note?: string; remove?: boolean } = {},
    ) =>
      send('Rating', {
        subjectKind,
        subjectKey,
        label,
        action: o.remove ? 'remove' : 'add',
        evidenceUrl: o.evidenceUrl ?? '',
        note: o.note ?? '',
      }),
    remove: (messageId: number) => send('Delete', { messageId }),
    /**
     * An alert rule (pos-indexer docs/alerts.md). The service validates
     * `params` per kind and answers a 400 that names the field; a newer
     * `set` of the same `ruleId` replaces the rule and starts a fresh episode.
     */
    alertRule: (ruleId: string, kind: string, params: Record<string, unknown>, action: 'set' | 'remove' | 'pause' | 'resume' = 'set') =>
      send('AlertRule', { ruleId, kind, params: JSON.stringify(params), action }),
    /** The wallet half of a Telegram link; the chat completes it with `/start <linkNonce>` within the hour. */
    telegramLink: (linkNonce: string, action: 'link' | 'unlink') => send('TelegramLink', { linkNonce, action }),
    profile: (p: ProfileOp) => send('Profile', p),
    /** The pending queue in one signature (`social/pending.ts` builds it). */
    batch: (follows: FollowOp[], profile: ProfileOp | null) =>
      send('Batch', { follows, profile: profile ? [profile] : [] }),
    /**
     * The wallet half of linking an X account. It is NOT posted to `/write`:
     * the social service only stores the link once it also has the X identity,
     * which only the worker can observe, so the envelope is returned and the
     * caller hands it over.
     */
    xLink: (linkNonce: string, action: 'link' | 'unlink'): Promise<Envelope> => {
      // `/x-link` verifies EIP-712 only: its proof text quotes a `0x` address
      if (!address) throw new Error('connect an EVM wallet to link X')
      return sign('XLink', { nonce: linkNonce, action })
    },
    /**
     * Link another wallet to THIS one's profile (docs/wallet-links.md): the
     * connected EVM wallet signs the primary half, the member — a Solana
     * address in v1, the one wallet the app can hold beside wagmi's — signs
     * its own half ed25519, same nonce, each naming the other. Both are
     * posted together; the service refuses anything mismatched in words.
     */
    linkWallet: async (member: string): Promise<api.WalletLinks> => {
      if (!address) throw new Error('connect the wallet that owns the profile first')
      // the member half is signed by the member's own key; the one non-wagmi
      // wallet this app holds is the Solana one, so that is what v1 can link
      if (!isSolAddr(member)) throw new Error('only a Solana wallet can be linked from this app today')
      const n = nonce()
      const primary = await sign('WalletLink', { other: member, otherVm: 'svm', role: 'primary', action: 'link', nonce: n })
      const memberHalf = await solSign('WalletLink', {
        author: member, other: address.toLowerCase(), otherVm: 'evm', role: 'member', action: 'link', nonce: n, signedAt: now(),
      })
      return api.postWalletLink(primary, memberHalf)
    },
    /** Unlink is one-sided: whichever of the two keys is at hand withdraws the claim. */
    unlinkWallet: async (member: string, primary: string): Promise<{ ok: boolean }> => {
      if (address && address.toLowerCase() === primary) {
        const half = await sign('WalletLink', { other: member, otherVm: isSolAddr(member) ? 'svm' : 'evm', role: 'primary', action: 'unlink', nonce: nonce() })
        return api.postWalletUnlink(half)
      }
      // an EVM member withdrawing itself: its own key, the member role
      if (address && address.toLowerCase() === member) {
        const half = await sign('WalletLink', { other: primary, otherVm: isSolAddr(primary) ? 'svm' : 'evm', role: 'member', action: 'unlink', nonce: nonce() })
        return api.postWalletUnlink(half)
      }
      const half = await solSign('WalletLink', {
        author: member, other: primary, otherVm: 'evm', role: 'member', action: 'unlink', nonce: nonce(), signedAt: now(),
      })
      return api.postWalletUnlink(half)
    },
  }
}
export type SocialWriter = ReturnType<typeof useSocialWrite>
