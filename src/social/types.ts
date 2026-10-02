/** Wire shapes of the social service (`pos-indexer/packages/social`). */

/**
 * What a thread can hang on. `curator` (pos-indexer tickets/0013) joins the
 * four originals: a desk's page needs the same comment surface a market has,
 * and the key is its curator id. `asset` (tickets/0026) is keyed by the asset
 * GROUP verbatim — the thread is about the money, across every chain.
 */
export type SubjectKind = 'market' | 'event' | 'wallet' | 'position' | 'curator' | 'asset'

export interface Profile {
  account: string
  handle: string | null
  displayName: string | null
  bio: string | null
  /** either a real URL or a `yc1:` character spec — see `identity/character.tsx` */
  avatarUrl: string | null
  tags: string[]
  visibility: 'public' | 'unlisted'
  updatedAt?: string
  /** X handle, once the link worker has verified it (social.x_links) */
  xHandle?: string | null
  /** set when this account is a linked member and the profile shown is its PRIMARY's (docs/wallet-links.md) */
  resolvedFrom?: string | null
  /**
   * Badges the index minted, not self-claimed. The service answers
   * `{tag, evidence}[]`; `normaliseProfile` flattens it to the tag names, and
   * the evidence stays available on `systemTagEvidence`.
   */
  systemTags?: string[]
  systemTagEvidence?: { tag: string; evidence: unknown }[]
}
export interface ProfileResponse { account: string; profile: Profile | null; follows: Follow[] }

export interface Follow { targetKind: 'wallet' | 'market' | 'curator'; target: string; createdAt?: string }
export interface Follower { account: string; createdAt?: string }

export interface Message {
  id: number
  subjectKind: SubjectKind
  subjectKey: string
  parentId: number | null
  author: string
  body: string
  signedAt: string
  createdAt?: string
  deleted?: boolean
  /** USD the author actually holds in the market this thread is about, at write time */
  authorStake?: number | null
}
/** The service answers reaction counts as an object, `{ like: 3, risky: 1 }`. */
export type Reactions = Record<string, number>
export interface Thread { subjectKind: SubjectKind; subjectKey: string; messages: Message[]; reactions: Reactions }
export interface ThreadSummary { subjectKind: SubjectKind; subjectKey: string; n: number; lastAt: string; lastBody?: string }

export interface TypedData { domain: Record<string, unknown>; types: Record<string, { name: string; type: string }[]> }
