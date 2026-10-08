/**
 * A COPY of pos-indexer's `packages/position-store/src/search.ts` (tickets/0053):
 * the key, the terms, the query parse and the ranking `/find` uses, so the
 * catalog searched here in the browser ranks exactly like the server. Do not
 * edit it here — change it there (its tests are the contract), then
 * `pnpm search-rank --write`; `pnpm search-rank` says whether the two agree.
 */
/**
 * One search over everything the index names (tickets/0053 → docs/search.md):
 * the PURE half — keys, terms, query parsing, ranking. The SQL lives in
 * `searchIndex.ts` (the build) and `searchQuery.ts` (the read).
 *
 * The rule a client's catalog search and the server's must share is all
 * here and has no I/O, so yieldcircle carries a copy and both are pinned by
 * the same vectors (`test/search.test.ts`).
 */

export const SEARCH_KINDS = [
  'wallet',
  'vault',
  'curator',
  'protocol',
  'asset',
  'market',
  'issuer',
] as const
export type SearchKind = (typeof SEARCH_KINDS)[number]

/** the kinds `/find/catalog` ships whole to the browser: few, and browsed by name */
export const CATALOG_KINDS: SearchKind[] = [
  'protocol',
  'curator',
  'vault',
  'asset',
  'issuer',
]

/**
 * What a term IS, strongest claim first. A wallet's name is only as good as
 * whoever said it: ours with evidence (`seed`), the holder's own signature
 * (`signed`, `x` proved by a post), the holder's own reverse record
 * (`primary`), a third party's tag, an index label, and last a forward
 * ENS / Basename hit — a fact about a STRING (`hsaka.eth` is not Hsaka).
 */
export const TERM_SOURCES = [
  'seed',
  'registry',
  'signed',
  'x',
  'primary',
  'ens-text',
  'farcaster',
  'tag',
  'dataset',
  'label',
  'index',
  'ens',
  'basename',
  'address',
  // the Solana index (apps/sol-indexer, docs/sol-names.md)
  'sns',
  'kolscan',
  'gmgn',
  'sns-owner',
] as const
export type TermSource = (typeof TERM_SOURCES)[number]

const SOURCE_PRIOR: Record<string, number> = {
  seed: 1,
  registry: 1,
  signed: 0.95,
  x: 0.9,
  primary: 0.8,
  index: 0.8,
  'ens-text': 0.75,
  farcaster: 0.7,
  tag: 0.7,
  dataset: 0.65,
  label: 0.5,
  context: 0.3,
  ens: 0.4,
  basename: 0.4,
  address: 0.5,
  // Solana: the wallet's own primary .sol (= `primary`), two KOL lists whose
  // rows the wallet's owner submitted (between `tag` and `dataset`), and a
  // forward hit — who owns a .sol domain today (= `ens`)
  sns: 0.8,
  kolscan: 0.7,
  gmgn: 0.65,
  'sns-owner': 0.4,
}

/** a nudge between kinds for an otherwise equal match: the browse kinds first */
const KIND_PRIOR: Record<SearchKind, number> = {
  protocol: 1.2,
  curator: 1,
  asset: 1,
  issuer: 0.6,
  vault: 0.4,
  wallet: 0,
  market: -0.3,
}

/**
 * The key a term and a query are compared on: NFKD with the accents
 * dropped, lower-case, a leading `@` and trailing dots gone, the tag
 * service's HTML entities decoded, whitespace collapsed.
 */
export function searchKey(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .trim()
    .replace(/^@+/, '')
    .replace(/\.+$/, '')
    .replace(/\s+/g, ' ')
}

/** `vitalik.eth` / `jesse.base.eth` / `cooper.bnb` / `toly.sol` → the name without its namespace */
export const bareEns = (key: string): string =>
  key.replace(/\.(base\.eth|eth|bnb|sol)$/, '')

/** a word boundary inside a name: space and the separators people type past */
const WORD = /[\s._\-/:()|,+]+/

export interface TermRow {
  term_key: string
  term: string
  /**
   * the claim; `context` = a related thing's name (a vault's curator,
   * provider or underlying, a market's lender, an asset's issuer) — it finds
   * the doc, but never as an exact match: "steakhouse" is the desk, not
   * every vault it runs
   */
  source: string
  /** the doc's own whole name */
  primary_: boolean
  /** a later-word tail of a name (`hayes 2`): a word match, never exact */
  tail: boolean
}

/**
 * The keys a name is found under: the whole name, the bare ENS label, and
 * every later word onwards (`arthur hayes 2` → `hayes 2`; a one-character
 * tail is dropped, `2` would match everything). `primary` marks the WHOLE
 * name of the doc itself; aliases and tails are not primary.
 */
export function termsOf(
  name: string | null | undefined,
  source: string,
  primary = false,
): TermRow[] {
  if (!name) return []
  const term = name.trim().slice(0, 200)
  const key = searchKey(term)
  if (key.length < 1) return []
  const out = new Map<string, TermRow>()
  const add = (k: string, p: boolean, tail: boolean) => {
    const kk = k.trim()
    if (kk.length < 2 && kk !== key) return
    if (!kk) return
    const cur = out.get(kk)
    if (!cur || (!tail && cur.tail) || (p && !cur.primary_))
      out.set(kk, { term_key: kk, term, source, primary_: p, tail })
  }
  add(key, primary, false)
  const bare = bareEns(key)
  if (bare !== key) add(bare, primary, false)
  // every later word on, cut at the separators — inside the bare name: the
  // `.eth` / `.base.eth` namespace is not a word (`eth` would otherwise
  // find every ENS wallet)
  const re = new RegExp(WORD.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(bare))) {
    const tail = bare.slice(m.index + m[0].length)
    if (tail.length >= 2) add(tail, false, true)
  }
  return [...out.values()]
}

/** an address as a term: found by its full form and by any prefix of it */
export function addressTerm(address: string): TermRow {
  const a = address.toLowerCase()
  return {
    term_key: a,
    term: a,
    source: 'address',
    primary_: false,
    tail: false,
  }
}

// ---- chains -----------------------------------------------------------------

/**
 * The chains a query may name (`aave usdc base`): a SOFT token — a doc
 * satisfies it by being on the chain OR by having a term that starts with
 * it, so "base" still finds `jesse.base.eth` and a vault named Base.
 */
export const CHAIN_WORDS: Record<string, string> = {
  ethereum: '1',
  eth: '1',
  mainnet: '1',
  base: '8453',
  arbitrum: '42161',
  arb: '42161',
  bnb: '56',
  bsc: '56',
  avalanche: '43114',
  avax: '43114',
  optimism: '10',
  op: '10',
  hyperevm: '999',
  hyperliquid: '999',
  hype: '999',
  monad: '143',
  plasma: '9745',
  polygon: '137',
  matic: '137',
  arc: '5042',
  robinhood: '4663',
  tempo: '4217',
  stable: '988',
  plume: '98866',
}

export const CHAIN_NAMES: Record<string, string> = {
  '1': 'Ethereum',
  '8453': 'Base',
  '42161': 'Arbitrum',
  '56': 'BNB',
  '43114': 'Avalanche',
  '10': 'Optimism',
  '999': 'HyperEVM',
  '143': 'Monad',
  '9745': 'Plasma',
  '137': 'Polygon',
  '5042': 'Arc',
  '4663': 'Robinhood',
  '4217': 'Tempo',
  '988': 'Stable',
  '98866': 'Plume',
}

// ---- the query --------------------------------------------------------------

export interface FindToken {
  /** the token's key; a doc matches when one of its terms starts with it */
  key: string
  /** set when the token names a chain: also satisfied by `chain_ids` */
  chainId: string | null
}

export type FindQuery =
  | { type: 'empty' }
  | { type: 'address'; address: string }
  | { type: 'tx'; hash: string }
  | { type: 'uid'; uid: string }
  | {
      type: 'text'
      /** the whole query, keyed (exact-match comparisons) */
      key: string
      tokens: FindToken[]
      /** the longest token that is not a chain word: the one probed by prefix */
      anchor: string
      /** `@handle`: the social sources only */
      handle: boolean
      /** `0x…` shorter than an address: a prefix of one */
      addressPrefix: boolean
    }

/**
 * What the box was given. An address, a tx hash and a market uid are routed
 * (the client opens them; `/find` still looks an address up, because a
 * vault's or a desk's address should show AS that thing). Everything else
 * is words, at most 6 of them, 80 characters.
 */
export function parseFind(raw: string): FindQuery {
  const s = raw.trim().slice(0, 80)
  if (!s) return { type: 'empty' }
  if (/^0x[0-9a-fA-F]{40}$/.test(s))
    return { type: 'address', address: s.toLowerCase() }
  if (/^0x[0-9a-fA-F]{64}$/.test(s))
    return { type: 'tx', hash: s.toLowerCase() }
  // a uid's chain id may be a string (`solana`); the uid keeps its case
  if (/^[^\s:]+:[^\s:]+:[^\s]+$/.test(s)) return { type: 'uid', uid: s }
  // base58, case kept: 32–44 characters is a Solana address, 86–88 a signature
  if (
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s) &&
    /[A-Z]/.test(s) &&
    /[a-z0-9]/.test(s)
  )
    return { type: 'address', address: s }
  if (/^[1-9A-HJ-NP-Za-km-z]{86,88}$/.test(s)) return { type: 'tx', hash: s }
  const handle = s.startsWith('@')
  const key = searchKey(s)
  if (!key) return { type: 'empty' }
  const addressPrefix = /^0x[0-9a-f]{2,39}$/.test(key)
  const words = key.split(' ').filter(Boolean).slice(0, 6)
  const tokens: FindToken[] = words.map((w) => ({
    key: w,
    chainId: words.length > 1 ? (CHAIN_WORDS[w] ?? null) : null,
  }))
  const plain = tokens.filter((t) => !t.chainId)
  const anchor = (plain.length ? plain : tokens).reduce((a, b) =>
    b.key.length > a.key.length ? b : a,
  ).key
  return { type: 'text', key, tokens, anchor, handle, addressPrefix }
}

// ---- ranking ----------------------------------------------------------------

export interface FindDoc {
  docId: string
  kind: SearchKind
  key: string
  title: string
  subtitle: string | null
  icon: string | null
  chainIds: string[]
  weightUsd: number
  flags: Record<string, unknown>
  /** the doc's terms that matched (or all of them; `rankFind` picks) */
  terms: TermRow[]
  /** a trigram hit's similarity, when the doc came from the typo fallback */
  similarity?: number
  /** the term_key the trigram matched best */
  typoTerm?: string
  clicks?: number
}

export interface FindHit {
  docId: string
  kind: SearchKind
  key: string
  title: string
  subtitle: string | null
  icon: string | null
  chainIds: string[]
  weightUsd: number
  flags: Record<string, unknown>
  /** the term that answered, as its source spells it, and the claim it is */
  match: { term: string; source: string; exact: boolean; typo: boolean }
  score: number
}

/**
 * How well one term answers the query: 4 the doc's own name exactly, 3 an
 * alias exactly (a symbol, another name the doc goes by), 2 the start of the
 * doc's own name, 1.8 a whole later word or related name (`Maple USDC` for
 * "usdc"), 1.5 the start of an alias, 1 the start of a later word, 0 none.
 * A tail or a `context` term is never exact.
 */
export function termClass(q: string, t: TermRow): number {
  const k = t.term_key
  if (!k.startsWith(q) && bareEns(k) !== q) return 0
  if (t.tail || t.source === 'context')
    return k === q || k.startsWith(`${q} `) ? 1.8 : 1
  if (k === q || bareEns(k) === q) return t.primary_ ? 4 : 3
  return t.primary_ ? 2 : 1.5
}

/** the money behind a doc, per decade: $1bn is +10.8, $1m +7.2, $1k +3.6 */
export const WEIGHT_PER_DECADE = 1.2

/**
 * Score every doc against the query and order them. Match class first (an
 * exact name beats a prefix beats a word), then the strength of the claim,
 * a small nudge per kind, the money the index sees behind it (log-scaled,
 * `WEIGHT_PER_DECADE`) and what people open. A typo hit (trigram) ranks
 * below every real prefix match.
 */
export function rankFind(
  q: Extract<FindQuery, { type: 'text' }>,
  docs: FindDoc[],
): FindHit[] {
  const plain = q.tokens.filter((t) => !t.chainId).map((t) => t.key)
  const phrase = plain.join(' ') || q.key
  const hits: FindHit[] = []
  for (const d of docs) {
    let best: TermRow | null = null
    let cls = 0
    for (const t of d.terms) {
      // the whole phrase first; failing that, the anchor token
      const c = Math.max(
        termClass(phrase, t),
        plain.length > 1 ? Math.min(termClass(q.anchor, t), 1) : 0,
      )
      const better =
        c > cls ||
        (c === cls &&
          c > 0 &&
          best &&
          (SOURCE_PRIOR[t.source] ?? 0.5) > (SOURCE_PRIOR[best.source] ?? 0.5))
      if (better) {
        cls = c
        best = t
      }
    }
    const typo = cls === 0 && d.similarity != null
    if (!best && typo)
      best = d.terms.find((t) => t.term_key === d.typoTerm) ?? null
    if (!best) best = d.terms[0] ?? null
    if (!best) continue
    const effective = typo ? 0.5 * (d.similarity ?? 0) : cls
    if (effective <= 0) continue
    // a chain the query named, and the doc is on it ("gauntlet usdc base")
    const onChain = q.tokens.some(
      (t) => t.chainId && d.chainIds.includes(t.chainId),
    )
    const score =
      effective * 10 +
      (onChain ? 3 : 0) +
      (SOURCE_PRIOR[best.source] ?? 0.5) * 2 +
      (KIND_PRIOR[d.kind] ?? 0) +
      Math.log10(1 + Math.max(d.weightUsd, 0)) * WEIGHT_PER_DECADE +
      Math.log10(1 + (d.clicks ?? 0)) * 0.5
    hits.push({
      docId: d.docId,
      kind: d.kind,
      key: d.key,
      title: d.title,
      subtitle: d.subtitle,
      icon: d.icon,
      chainIds: d.chainIds,
      weightUsd: d.weightUsd,
      flags: d.flags,
      match: {
        term: best.term,
        source: best.source,
        exact: cls >= 3,
        typo,
      },
      score: Math.round(score * 100) / 100,
    })
  }
  return hits.sort(
    (a, b) =>
      b.score - a.score ||
      b.weightUsd - a.weightUsd ||
      a.docId.localeCompare(b.docId),
  )
}

/**
 * The hit Enter opens without a choice: the top one, when it is an exact
 * name or clears the runner-up by a clear margin. Otherwise none — guessing
 * between two near-equal answers is worse than showing both.
 */
export function bestOf(hits: FindHit[]): FindHit | null {
  const [a, b] = hits
  if (!a || a.match.typo) return null
  if (!b) return a
  if (a.match.exact && !b.match.exact) return a
  return a.score - b.score >= 4 ? a : null
}

/** group ranked hits per kind in the fixed display order, `per` each */
export function groupHits(
  hits: FindHit[],
  counts: Map<string, number>,
  per: number,
): { kind: SearchKind; count: number; hits: FindHit[] }[] {
  const out: { kind: SearchKind; count: number; hits: FindHit[] }[] = []
  for (const kind of SEARCH_KINDS) {
    const of = hits.filter((h) => h.kind === kind)
    if (!of.length) continue
    out.push({
      kind,
      count: Math.max(counts.get(kind) ?? 0, of.length),
      hits: of.slice(0, per),
    })
  }
  return out
}
