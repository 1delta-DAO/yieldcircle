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
import { base58Encode } from '../model/address'
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
} as const
export type PrimaryType = keyof typeof TYPES

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
    profile: (p: { handle: string; displayName: string; bio: string; avatarUrl: string; tags: string[]; visibility: 'public' | 'unlisted' }) =>
      send('Profile', p),
    /**
     * The wallet half of linking an X account. It is NOT posted to `/write`:
     * the social service only stores the link once it also has the X identity,
     * which only the worker can observe, so the envelope is returned and the
     * caller hands it over.
     */
    xLink: (linkNonce: string, action: 'link' | 'unlink'): Promise<Envelope> => sign('XLink', { nonce: linkNonce, action }),
  }
}
export type SocialWriter = ReturnType<typeof useSocialWrite>
