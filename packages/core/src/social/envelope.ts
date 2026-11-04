/**
 * The shape of a social write; the hook that signs one is
 * `@yieldcircle/app/social/sign`. The wallet IS the account (PLAN §5.3): every write
 * is an EIP-712 message whose `author` is the signer, stored with its
 * signature, so anyone can re-verify it later. No sessions, no passwords.
 *
 * The domain has no chainId on purpose — a thread on an Arbitrum position is
 * signed by the same wallet the same way, and a wallet on the wrong network
 * never has to switch to leave a comment.
 */
import type { Follow, Profile } from './types'

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
   * (`signSolanaEnvelope`, `@yieldcircle/app/social/sign`). Additive, like every type before it.
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
   * An alert rule (pos-indexer docs/alerts.md): `params` is the rule's JSON,
   * validated per kind by the service; `action` set | remove | pause | resume.
   */
  AlertRule: [
    { name: 'author', type: 'address' },
    { name: 'ruleId', type: 'string' },
    { name: 'kind', type: 'string' },
    { name: 'params', type: 'string' },
    { name: 'action', type: 'string' },
    { name: 'nonce', type: 'string' },
    { name: 'signedAt', type: 'uint256' },
  ],
  /**
   * The wallet half of a Telegram link: the bot binds the chat that sends
   * `/start <linkNonce>` within an hour. `unlink` removes the channel.
   */
  TelegramLink: [
    { name: 'author', type: 'address' },
    { name: 'linkNonce', type: 'string' },
    { name: 'action', type: 'string' },
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
export type FollowOp = { targetKind: Follow['targetKind']; target: string; action: 'follow' | 'unfollow' }
export type ProfileOp = { handle: string; displayName: string; bio: string; avatarUrl: string; tags: string[]; visibility: 'public' | 'unlisted' }

export const nonce = () => {
  const b = new Uint8Array(12)
  crypto.getRandomValues(b)
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}
/** The server rejects a signature more than 10 minutes from now, so this is stamped at sign time. */
export const now = () => Math.floor(Date.now() / 1000)

/** A signed write, as the service takes it. */
export interface Envelope { primaryType: PrimaryType; message: Record<string, unknown>; signature: string }

/** Deterministic JSON: object keys sorted at every depth, arrays kept in order. The exact form the verifier must reproduce. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']'
  if (v && typeof v === 'object')
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson((v as Record<string, unknown>)[k])).join(',') + '}'
  return JSON.stringify(v)
}

/** A signed profile in the shape it is signed in, so an editor's draft can be compared with it. */
export const profileOpOf = (p: Profile | null): ProfileOp | null => p && {
  handle: p.handle ?? '', displayName: p.displayName ?? '', bio: p.bio ?? '', avatarUrl: p.avatarUrl ?? '',
  tags: p.tags ?? [], visibility: p.visibility === 'unlisted' ? 'unlisted' : 'public',
}

/** The nonce an X link quotes in both halves, the signature and the public post: short enough to read in a post. */
export const xLinkNonce = () => {
  const b = new Uint8Array(5)
  crypto.getRandomValues(b)
  return 'yc-' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}
