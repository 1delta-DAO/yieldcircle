/**
 * The social service: public reads, signed writes. One `POST /write` takes
 * every kind of write; the envelope's `primaryType` says which it is and the
 * server recovers the signer from the signature — there is no session to hold
 * and nothing to log out of.
 */
import { SOCIAL_BASE_URL } from '../config/backend'
import { normAddr } from '../model/address'
import type { Follow, Follower, Profile, ProfileResponse, SubjectKind, Thread, ThreadSummary, TypedData } from './types'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(SOCIAL_BASE_URL + path, init)
  const j = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new Error(j.error || `${path} → ${r.status}`)
  return j
}
const post = (path: string, body: unknown) =>
  ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as RequestInit

/**
 * The service stores system tags as `{tag, evidence}` rows and answers them
 * that way; everything here wants the names. Flattened once, on the way in.
 */
export function normaliseProfile(p: Profile | null): Profile | null {
  if (!p) return null
  const raw = (p.systemTags ?? []) as unknown[]
  if (!raw.length) return p
  const names = raw.map((t) => (typeof t === 'string' ? t : (t as { tag?: string })?.tag)).filter((x): x is string => !!x)
  return { ...p, systemTags: names, systemTagEvidence: raw as { tag: string; evidence: unknown }[] }
}

export const typedData = () => call<TypedData>('/typed-data')
export const thread = (kind: SubjectKind, key: string) => call<Thread>(`/threads/${kind}/${encodeURIComponent(key)}`)
export const recentThreads = (limit = 40) => call<{ threads: ThreadSummary[] }>(`/threads?limit=${limit}`)

/** Batch message counts — ONE request for a whole list view. `{ kind: { key: n } }`. */
export const counts = (subjects: { kind: SubjectKind; key: string }[]) =>
  call<{ counts: Record<string, Record<string, number>> }>('/counts', post('/counts', { subjects }))

export const profile = async (account: string): Promise<ProfileResponse> => {
  const r = await call<ProfileResponse>(`/profiles/${account}`)
  return { ...r, profile: normaliseProfile(r.profile) }
}
/**
 * Batch profiles, so a 40-row feed costs one request and not forty. Falls back
 * to single reads where the service does not have the route yet (it is item 2
 * of what the index owes this app — docs/social.md §9).
 */
export async function profiles(accounts: string[]): Promise<Record<string, Profile | null>> {
  // the service verifies 0x authors only (ADDR regex server-side): a base58
  // account in the batch would 400 the WHOLE request and cost every EVM
  // profile on the page, so Solana wallets resolve to null — until the
  // deployed service is VM-aware (SOCIAL_LINKS_READY); then they ride along
  // and come back wearing their primary's profile (docs/wallet-links.md §6)
  const want = [...new Set(accounts.map((a) => normAddr(a)))].filter((a) => SOCIAL_LINKS_READY || /^0x[0-9a-f]{40}$/.test(a))
  if (!want.length) return {}
  try {
    const r = await call<{ profiles: Record<string, Profile | null> }>('/profiles', post('/profiles', { accounts: want }))
    return Object.fromEntries(Object.entries(r.profiles ?? {}).map(([k, v]) => [k, normaliseProfile(v)]))
  } catch {
    const rows = await Promise.all(want.map(async (a) => [a, await profile(a).then((p) => p.profile).catch(() => null)] as const))
    return Object.fromEntries(rows)
  }
}

export const follows = (account: string) => call<{ account: string; follows: Follow[] }>(`/follows/${account}`)
export const followers = (account: string) => call<{ account: string; followers: Follower[] }>(`/followers/${account}`)

/**
 * Link an X account the free way: the wallet's signed `XLink` envelope plus a
 * public post that quotes the address and the nonce. The service reads the
 * post back itself through X's oEmbed endpoint — the client is never believed
 * about what it says.
 */
export const xLinkByPost = (signed: unknown, postUrl: string) =>
  call<{ ok?: boolean; xHandle?: string; method?: string }>('/x-link', post('/x-link', { signed, postUrl }))
/** The wording both halves must agree on, served rather than hardcoded. */
export const xProofText = (account: string, nonce: string) =>
  call<{ nonce: string; text: string }>(`/x-proof-text?account=${account}&nonce=${encodeURIComponent(nonce)}`)
export const xUnlink = (signed: unknown) =>
  call<{ ok?: boolean }>('/x-link', post('/x-link', { signed }))

// ---------------------------------------------------------------- ratings

/**
 * What other wallets SAY about a thing, weighted by what the ledger says they
 * hold (pos-indexer docs/community-ratings.md).
 *
 * The vocabulary is CLOSED and versioned and comes from the service, because
 * a client that hardcodes the list ships a vocabulary that can drift from the
 * one writes are validated against.
 *
 * Three rules this app inherits and must not break:
 *   1. zero ratings renders as zero ratings, in words — never as a tick;
 *   2. `contested` is shown as contested, not collapsed to a number;
 *   3. every weight expands to its components, because a ranking nobody can
 *      check is an opinion.
 */
export type RatingSubjectKind = 'asset' | 'market' | 'lender' | 'issuer' | 'account' | 'curator'
export interface RatingLabel {
  key: string
  group: string
  mutex: boolean
  polarity: 1 | 0 | -1
  subjects: RatingSubjectKind[]
  evidence: 'required' | 'optional' | 'none'
  halfLifeDays: number | null
  expiresHours?: number
  emoji?: string
  title: string
  meaning: string
}
export interface RatingVote {
  account: string
  label: string
  emoji?: string
  polarity: number
  signedAt: string
  evidenceUrl: string | null
  note: string | null
  holder: boolean
  /** a positive claim from a holder: talking their book. Shown, never silently re-weighted. */
  ownBook: boolean
  stakeUsd: number | null
  tenureDays: number | null
  accountKind: string | null
  accountLabel: string | null
  weight: number
  decay: number
  components: Record<string, number>
}
export interface RatingLabelAgg {
  label: string
  group: string
  polarity: number
  emoji?: string
  title: string
  wallets: number
  weight: number
  weightHolders: number
  weightNonHolders: number
  walletsHolders: number
  topWalletShare: number
  medianTenureDays: number | null
  newestAt: string
  evidence: { account: string; url: string; note: string | null }[]
  zeroWeightWallets: number
}
export interface RatingGroupAgg {
  group: string
  status: 'none' | 'claimed' | 'contested' | 'consensus'
  top: string | null
  topShare: number
  opposingShare: number
  wallets: number
  weight: number
  labels: string[]
}
export interface RatingAggregate {
  subjectKind: string
  subjectKey: string
  labels: RatingLabelAgg[]
  groups: RatingGroupAgg[]
  totals: { wallets: number; weight: number; holders: number; zeroWeightWallets: number }
  labelsVersion: number
  /** the same votes restricted to the wallets you follow — empty when you follow nobody, never the global set */
  byFollowed: Record<string, { wallets: number; weight: number }> | null
  votes: RatingVote[]
}
export interface RatingCount {
  wallets: number
  labels: Record<string, { wallets: number; polarity: number; emoji?: string; newestAt: string }>
}

export const ratingLabels = () =>
  call<{ version: number; subjectKinds: RatingSubjectKind[]; labels: RatingLabel[] }>('/rating-labels')
export const ratings = (kind: RatingSubjectKind, key: string, follower?: string) =>
  call<RatingAggregate>(`/ratings/${kind}/${encodeURIComponent(key)}${follower ? `?follower=${follower}` : ''}`)
/** Batch, for a list view: COUNTS, not weights — the weighted verdict lives on the subject's own page. */
export const ratingCounts = (subjects: { kind: RatingSubjectKind; key: string }[]) =>
  call<{ counts: Record<string, Record<string, RatingCount>> }>('/ratings/counts', post('/ratings/counts', { subjects }))
export const ratingsTop = (kind: RatingSubjectKind, label: string, limit = 25) =>
  call<{ kind: string; label: string; subjects: { subjectKind: string; subjectKey: string; label: string; wallets: number; weight: number; walletsHolders: number; status: string }[] }>(
    `/ratings/top?kind=${kind}&label=${label}&limit=${limit}`,
  )
export const ratingsBy = (account: string, limit = 50) =>
  call<{ account: string; ratings: { subjectKind: string; subjectKey: string; label: string; emoji?: string; polarity: number; evidenceUrl: string | null; note: string | null; signedAt: string; active: boolean }[] }>(
    `/ratings/by/${account}?limit=${limit}`,
  )

export interface WriteResult { ok?: boolean; id?: number | null; duplicate?: boolean; authorStake?: number | null; profile?: Profile | null; follows?: Follow[] }
export const write = (primaryType: string, message: Record<string, unknown>, signature: string) =>
  call<WriteResult>('/write', post('/write', { primaryType, message, signature }))

// ---------------------------------------------------------------- subject keys
/** A ledger row: `chainId:txHash:logIndex:seq` (position-store 0003_social.sql). */
export const eventKey = (e: { chainId: string; txHash: string; logIndex: number; seq: number }) =>
  `${e.chainId}:${e.txHash}:${e.logIndex}:${e.seq}`
/**
 * A position: `chain|wallet|marketUid|side|posId`. Computable client-side
 * WITHOUT waiting for the indexer — which is why a comment written at
 * execution time is posted here and not against an event key, whose
 * `logIndex` nobody knows until the log is decoded.
 */
export const positionKey = (x: { chainId: string; account: string; marketUid: string; side: string; posId?: string | null }) =>
  `${x.chainId}|${normAddr(x.account)}|${x.marketUid}|${x.side}|${x.posId ?? ''}`
/** A market uid is stored VERBATIM: its protocol segment is case-significant. */
export const marketKey = (uid: string) => uid
/** hex lowered, base58 verbatim (docs/solana.md §F: the key choice is agreed with social before the first Solana thread) */
export const walletKey = (a: string) => normAddr(a)

// ---------------------------------------------------------------- wallet links (docs/wallet-links.md)
/**
 * On since 2026-10-04: the deployed social service answers `/wallet-link`,
 * `/wallet-links/:a`, `WalletLink` in `/typed-data` and base58 accounts in
 * the profile batch. Gates the Profile section, the cluster-aware `isMe`,
 * and base58 accounts in the profile batch — flip back off if it regresses.
 */
export const SOCIAL_LINKS_READY = true

export interface WalletLinks {
  primary: string
  members: { account: string; vm: 'evm' | 'svm'; linkedAt: string }[]
}
/** The cluster from any of its addresses; an unlinked address answers itself, alone. */
export const walletLinks = (account: string) =>
  call<WalletLinks>(`/wallet-links/${encodeURIComponent(normAddr(account))}`)
/** Both halves of a link — the service matches them on the nonce and refuses mismatches in words. */
export const postWalletLink = (primary: unknown, member: unknown) =>
  call<WalletLinks>('/wallet-link', post('/wallet-link', { primary, member }))
/** One half, either role: consent withdrawn by either party ends the claim. */
export const postWalletUnlink = (half: unknown) =>
  call<{ ok: boolean }>('/wallet-link', post('/wallet-link', { half }))
