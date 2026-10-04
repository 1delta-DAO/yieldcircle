/**
 * Signing a social write. The wallet IS the account (PLAN §5.3): every write
 * is an EIP-712 message whose `author` is the signer, stored with its
 * signature, so anyone can re-verify it later. No sessions, no passwords.
 *
 * The domain has no chainId on purpose — a thread on an Arbitrum position is
 * signed by the same wallet the same way, and a wallet on the wrong network
 * never has to switch to leave a comment.
 */
import { useAccount, useSignTypedData } from 'wagmi'
import { base58Encode, isSolAddr } from '../model/address'
import { solSignMessage } from '../wallet/solana'
import * as api from './api'
import type { RatingSubjectKind } from './api'
import type { SubjectKind } from './types'

export const DOMAIN = { name: '1delta social', version: '1' } as const

export const TYPES = {
  Message: [
    { name: 'author', type: 'address' },
    { name: 'subjectKind', type: 'string' },
    { name: 'subjectKey', type: 'string' },
    { name: 'parentId', type: 'uint256' },
    { name: 'body', type: 'string' },
    { name: 'nonce', type: 'string' },
    { name: 'signedAt', type: 'uint256' },
  ],
  Profile: [
    { name: 'author', type: 'address' },
    { name: 'handle', type: 'string' },
    { name: 'displayName', type: 'string' },
    { name: 'bio', type: 'string' },
    { name: 'avatarUrl', type: 'string' },
    { name: 'tags', type: 'string[]' },
    { name: 'visibility', type: 'string' },
    { name: 'nonce', type: 'string' },
    { name: 'signedAt', type: 'uint256' },
  ],
  Reaction: [
    { name: 'author', type: 'address' },
    { name: 'subjectKind', type: 'string' },
    { name: 'subjectKey', type: 'string' },
    { name: 'kind', type: 'string' },
    { name: 'action', type: 'string' },
    { name: 'nonce', type: 'string' },
    { name: 'signedAt', type: 'uint256' },
  ],
  Follow: [
    { name: 'author', type: 'address' },
    { name: 'targetKind', type: 'string' },
    { name: 'target', type: 'string' },
    { name: 'action', type: 'string' },
    { name: 'nonce', type: 'string' },
    { name: 'signedAt', type: 'uint256' },
  ],
  Delete: [
    { name: 'author', type: 'address' },
    { name: 'messageId', type: 'uint256' },
    { name: 'nonce', type: 'string' },
    { name: 'signedAt', type: 'uint256' },
  ],
  XLink: [
    { name: 'author', type: 'address' },
    { name: 'nonce', type: 'string' },
    { name: 'action', type: 'string' },
    { name: 'signedAt', type: 'uint256' },
  ],
  /**
   * One half of a wallet link (docs/wallet-links.md): "this other address
   * and I are one person", signed by BOTH sides and matched on the nonce.
   * A base58 author signs the same fields ed25519 over the canonical JSON
   * (`signSolanaEnvelope` below). Additive, like every type before it.
   */
  WalletLink: [
    { name: 'author', type: 'address' },
    { name: 'other', type: 'string' },
    { name: 'otherVm', type: 'string' },
    { name: 'role', type: 'string' },
    { name: 'action', type: 'string' },
    { name: 'nonce', type: 'string' },
    { name: 'signedAt', type: 'uint256' },
  ],
  /**
   * A claim about a SUBJECT — an asset, a market, a lender, an issuer, a
   * curator or an account. Additive: a new type leaves every other type's
   * struct hash alone, so every signature already stored still verifies.
   */
  Rating: [
    { name: 'author', type: 'address' },
    { name: 'subjectKind', type: 'string' },
    { name: 'subjectKey', type: 'string' },
    { name: 'label', type: 'string' },
    { name: 'action', type: 'string' },
    { name: 'evidenceUrl', type: 'string' },
    { name: 'note', type: 'string' },
    { name: 'nonce', type: 'string' },
    { name: 'signedAt', type: 'uint256' },
  ],
  /**
   * The pending queue, signed once (docs/social.md §17): follows and at most
   * one profile edit. The ops are `Follow` / `Profile` minus the envelope
   * fields, which the batch carries once; the service applies all or none.
   */
  FollowOp: [
    { name: 'targetKind', type: 'string' },
    { name: 'target', type: 'string' },
    { name: 'action', type: 'string' },
  ],
  ProfileOp: [
    { name: 'handle', type: 'string' },
    { name: 'displayName', type: 'string' },
    { name: 'bio', type: 'string' },
    { name: 'avatarUrl', type: 'string' },
    { name: 'tags', type: 'string[]' },
    { name: 'visibility', type: 'string' },
  ],
  Batch: [
    { name: 'author', type: 'address' },
    { name: 'follows', type: 'FollowOp[]' },
    { name: 'profile', type: 'ProfileOp[]' },
    { name: 'nonce', type: 'string' },
    { name: 'signedAt', type: 'uint256' },
  ],
} as const
/** The op structs are only ever nested inside a `Batch`, never signed alone. */
export type PrimaryType = Exclude<keyof typeof TYPES, 'FollowOp' | 'ProfileOp'>
export type FollowOp = { targetKind: 'wallet' | 'market' | 'curator'; target: string; action: 'follow' | 'unfollow' }
export type ProfileOp = { handle: string; displayName: string; bio: string; avatarUrl: string; tags: string[]; visibility: 'public' | 'unlisted' }

const nonce = () => {
  const b = new Uint8Array(12)
  crypto.getRandomValues(b)
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}
/** The server rejects a signature more than 10 minutes from now, so this is stamped at sign time. */
const now = () => Math.floor(Date.now() / 1000)

/**
 * One hook for every write. The message is built here so `author`, `nonce` and
 * `signedAt` can never be forgotten at a call site, and the result is already
 * posted — a caller awaits the write, not the signature.
 */
export interface Envelope { primaryType: PrimaryType; message: Record<string, unknown>; signature: string }

/**
 * The SOLANA signer (docs/solana.md §F): ed25519 over the JSON-canonical,
 * domain-separated form of the same typed payload. **Not wired into `send`
 * yet** — the social service verifies EIP-712 over a `0x` author only
 * (`packages/social`: `hexToBuf` on accounts, the ADDR regex), so a write
 * signed this way is refused today. It exists so the payload shape is agreed
 * and pinned before the first Solana thread is written; when the service
 * accepts ed25519 identities, `sign` below picks the signer by the author's
 * VM and nothing else changes.
 */
export async function signSolanaEnvelope<T extends PrimaryType>(primaryType: T, message: Record<string, unknown>): Promise<Envelope> {
  const sig = await solSignMessage(canonicalJson({ domain: DOMAIN, primaryType, message }))
  return { primaryType, message, signature: base58Encode(sig) }
}
/** Deterministic JSON: object keys sorted at every depth, arrays kept in order. The exact form the verifier must reproduce. */
function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']'
  if (v && typeof v === 'object')
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson((v as Record<string, unknown>)[k])).join(',') + '}'
  return JSON.stringify(v)
}

export function useSocialWrite() {
  const { address } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()
  /** Sign only. Used where the envelope travels somewhere other than `/write`. */
  async function sign<T extends PrimaryType>(primaryType: T, fields: Record<string, unknown>): Promise<Envelope> {
    if (!address) throw new Error('connect a wallet to post')
    // fields may carry their own `nonce` (the X link worker issues one and
    // both halves must quote it); otherwise one is generated here
    const message = { author: address.toLowerCase(), ...fields, nonce: (fields.nonce as string) || nonce(), signedAt: now() }
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
    account: address?.toLowerCase(),
    /** post a comment; `parentId` 0 is top level */
    message: (subjectKind: SubjectKind, subjectKey: string, body: string, parentId = 0) =>
      send('Message', { subjectKind, subjectKey, parentId, body }),
    react: (subjectKind: SubjectKind, subjectKey: string, kind: string, on: boolean) =>
      send('Reaction', { subjectKind, subjectKey, kind, action: on ? 'add' : 'remove' }),
    follow: (targetKind: 'wallet' | 'market' | 'curator', target: string, on: boolean) =>
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
    xLink: (linkNonce: string, action: 'link' | 'unlink'): Promise<Envelope> => sign('XLink', { nonce: linkNonce, action }),
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
      const memberHalf = await signSolanaEnvelope('WalletLink', {
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
      const half = await signSolanaEnvelope('WalletLink', {
        author: member, other: primary, otherVm: 'evm', role: 'member', action: 'unlink', nonce: nonce(), signedAt: now(),
      })
      return api.postWalletUnlink(half)
    },
  }
}
export type SocialWriter = ReturnType<typeof useSocialWrite>
