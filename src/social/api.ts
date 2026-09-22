/**
 * The social service: public reads, signed writes. One `POST /write` takes
 * every kind of write; the envelope's `primaryType` says which it is and the
 * server recovers the signer from the signature — there is no session to hold
 * and nothing to log out of.
 */
import { SOCIAL_BASE_URL } from '../config/backend'
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
  const want = [...new Set(accounts.map((a) => a.toLowerCase()))].filter(Boolean)
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
  `${x.chainId}|${x.account.toLowerCase()}|${x.marketUid}|${x.side}|${x.posId ?? ''}`
/** A market uid is stored VERBATIM: its protocol segment is case-significant. */
export const marketKey = (uid: string) => uid
export const walletKey = (a: string) => a.toLowerCase()
