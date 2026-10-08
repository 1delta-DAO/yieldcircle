/**
 * One search box for everything the app and the index name (pos-indexer tickets/0053):
 * people and wallets (signed profiles, ENS / Basenames, .sol / .skr names, Solana KOL lists, explorer
 * tags, the names the index gave), vaults, curators, protocols, assets, markets, issuers — plus
 * the chains and pages of this app and the "Earn on X" rows of the menu.
 *
 * Results come BY CATEGORY: a chip row of the categories that matched, with a count each
 * (capped at 99+), then up to four rows per category and "see all N"; a chip shows that one
 * category, 25 deep. One line of facts per row and ONE number that matters — no action icons.
 *
 * Two tiers, so the browse kinds never wait on the network:
 *   - the CATALOG (`/find/catalog`: protocols, named desks, vaults ≥ $10k, the asset book,
 *     issuers) is loaded when the box is first focused, kept in localStorage, and searched
 *     here on every keystroke with the server's own ranking (`search/rank.ts` is a copy);
 *   - `/find` fills in wallets, markets and the long tail 120 ms after typing stops, every
 *     superseded request aborted, the last answer kept on screen until the next lands.
 * A row already shown never jumps when the server answers: server-only rows append below it
 * unless they clearly outrank it.
 *
 * Each row says what kind of claim names it (known · explorer tag · ENS · Basename · signed ·
 * X · registry · candidate): a name is not an identity, and `hsaka.eth` is not Hsaka.
 */
import React from 'react'
import { useQuery } from '@tanstack/react-query'
import * as idx from '../index/api'
import type { FindCatalogDoc, FindHit, FindKind } from '../index/api'
import { GROUPS, nameOf } from '../model/assets'
import { marketHref, tokenHref, useApp, walletHref } from '../state/AppState'
import { feedHash } from '../state/feedLink'
import { CHAINS, useRateHistory } from '../sdk/queries'
import { steadyRate } from '../model/rateHistory'
import type { Strategy } from '../model/strategies'
import { Avg30 } from './Spark'
import { useMyFollows } from '../social/queries'
import { useMenu } from './useMenu'
import { GroupIcon, Popover, ProtocolLogo, StratMark, Tok, pct, protocolIconUrls, usdShort } from './bits'
import { ChainMark } from './ChainMark'
import { Character } from '../identity/character'
import { shortAddr } from '../identity/name'
import { bareEns, CHAIN_WORDS, parseFind, rankFind, termsOf, type FindDoc, type FindQuery } from '../search/rank'

type Kind = FindKind | 'chain' | 'page' | 'earn'
interface Row {
  id: string
  kind: Kind
  href: string
  title: string
  sub?: React.ReactNode
  icon: React.ReactNode
  metric?: React.ReactNode
  chip?: string | null
  score: number
  /** a doc the index counts opens of */
  docId?: string
  /** what a recent pick needs to be drawn again */
  memo?: Recent
}
interface Recent { id: string; kind: Kind; title: string; href: string; key?: string; sym?: string; icon?: string | null }

const MIN = 60_000
const PER_ALL = 4
const PER_ONE = 25
const DEBOUNCE_MS = 120
const CATALOG_KINDS: FindKind[] = ['protocol', 'curator', 'vault', 'asset', 'issuer']
/** the chip order — fixed, so chips never jump while typing */
const KIND_ORDER: Kind[] = ['earn', 'wallet', 'vault', 'protocol', 'asset', 'market', 'curator', 'issuer', 'chain', 'page']
const KIND_LABEL: Record<Kind, string> = {
  earn: 'Earn', wallet: 'Wallets', vault: 'Vaults', protocol: 'Protocols', asset: 'Assets', market: 'Markets',
  curator: 'Curators', issuer: 'Issuers', chain: 'Chains', page: 'Pages',
}
const PAGES: { title: string; href: string; words: string }[] = [
  { title: 'Earn', href: '#/earn', words: 'earn explore catalogue strategies menu' },
  { title: 'Board', href: '#/board', words: 'leaderboard board earners ranking top yield apr' },
  { title: 'Asset book', href: '#/t', words: 'asset book tokens assets lent' },
  { title: 'Alerts', href: '#/alerts', words: 'alerts notifications away' },
  { title: 'Your profile', href: '#/me', words: 'profile me settings name' },
]
const RECENT_KEY = 'yc.search.recent'
const CATALOG_KEY = 'yc.search.catalog'

const ls = {
  get<T>(k: string): T | undefined {
    try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : undefined } catch { return undefined }
  },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private window, full quota */ } },
}

/** the claim a matched term is, in words; null = the subtitle already says it */
function claimOf(h: FindHit): string | null {
  if (h.match.typo) return 'did you mean'
  if (h.kind === 'curator') return h.flags.candidate ? 'candidate' : h.flags.verified ? 'registry' : null
  if (h.kind !== 'wallet') return null
  const s = h.match.source
  const t = h.match.term.toLowerCase()
  const ensWord = t.endsWith('.base.eth') ? 'Basename' : t.endsWith('.bnb') ? 'Space ID' : 'ENS'
  return ({
    seed: 'known', signed: 'signed', x: 'X', farcaster: 'Farcaster', tag: 'explorer tag', label: 'contract name',
    index: 'index label', primary: ensWord, ens: 'ENS', basename: 'Basename', address: null,
    'ens-text': 'X via ENS', dataset: 'label set',
    // the Solana index: a wallet's own primary .sol and the owner of a typed one, two KOL lists, a Seeker's .skr
    sns: 'SNS', 'sns-owner': 'SNS', kolscan: 'kolscan', gmgn: 'GMGN', skr: 'Seeker',
  } as Record<string, string | null>)[s] ?? null
}

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const str = (x: unknown) => (typeof x === 'string' && x ? x : undefined)

/** where a hit opens */
function hrefOf(h: Pick<FindHit, 'kind' | 'key' | 'flags'>): string {
  switch (h.kind) {
    case 'wallet': return walletHref(h.key)
    case 'vault': return walletHref(str(h.flags.address) ?? h.key.split(':')[2] ?? h.key)
    case 'curator': return `#/c/${encodeURIComponent(h.key)}`
    case 'asset': return tokenHref(h.key)
    case 'market': return marketHref(h.key)
    case 'protocol': return feedHash('everyone', { chains: [], protocols: [h.key], issuers: [], match: 'any', curator: undefined })
    case 'issuer': return feedHash('everyone', { chains: [], protocols: [], issuers: [h.key], match: 'any', curator: undefined })
  }
}

function iconOf(h: Pick<FindHit, 'kind' | 'key' | 'title' | 'icon' | 'flags'>, size = 24): React.ReactNode {
  switch (h.kind) {
    case 'wallet': return <Character addr={h.key} size={size} />
    case 'vault': return <StratMark sym={str(h.flags.assetSymbol) ?? h.title} venueKey={h.key.split(':')[0]} brand={h.title} size={size} />
    case 'market': return <StratMark sym={str(h.flags.symbol) ?? h.title} logo={h.icon ?? undefined} venueKey={str(h.flags.protocol) ?? h.key.split(':')[0]} brand={str(h.flags.lender) ?? h.title} size={size} />
    case 'asset': return <Tok sym={h.title} logo={h.icon ?? undefined} size={size} />
    case 'protocol': return <span className="sr-logo"><ProtocolLogo urls={protocolIconUrls(h.key, h.icon)} name={h.title} /></span>
    case 'curator': return h.icon ? <img className="sr-img" src={h.icon} alt="" width={size} height={size} loading="lazy" /> : <span className="sr-ic">◇</span>
    case 'issuer': return <span className="sr-ic">{h.title.slice(0, 1).toUpperCase()}</span>
  }
}

/** the one number a row shows, per kind */
function metricOf(h: FindHit): React.ReactNode {
  const w = h.weightUsd > 0 ? usdShort(h.weightUsd) : null
  const apr = (x: unknown) => (num(x) != null ? <span className="ok">{pct(num(x))}</span> : null)
  switch (h.kind) {
    case 'wallet': return w ? <>{w} <small>held</small></> : null
    case 'vault': return <>{w && <>{w} <small>TVL</small></>}{w && num(h.flags.apr) != null && ' · '}{apr(h.flags.apr)}</>
    case 'market': return <>{w && <>{w}</>}{w && num(h.flags.apr) != null && ' · '}{apr(h.flags.apr)}</>
    case 'asset': return <>{w && <>{w} <small>lent</small></>}{w && num(h.flags.bestApr) != null && ' · '}{apr(h.flags.bestApr)}</>
    case 'protocol': return w ? <>{w} <small>TVL</small></> : null
    case 'curator': return w ? <>{w} <small>AUM</small></> : null
    case 'issuer': return w ? <>{w} <small>lent</small></> : null
  }
}

const ACCOUNT_KIND: Record<string, string> = { safe: 'Safe', cex: 'exchange', router: 'router', deployer: 'deployer', protocol: 'protocol', curator: 'curator', dex: 'DEX', wrapper: 'wrapper', contract: 'contract' }
function subOf(h: FindHit): React.ReactNode {
  const chains = h.chainIds.slice(0, 4)
  // a wallet's and a desk's claim is the chip; the line under it says what the thing is
  const sub = h.kind === 'wallet' ? ACCOUNT_KIND[str(h.flags.accountKind) ?? ''] ?? null
    : h.kind === 'curator' ? (num(h.flags.vaults) ? `${h.flags.vaults} vault${h.flags.vaults === 1 ? '' : 's'}` : 'curator')
    // a market's title already names its lender
    : h.kind === 'market' ? (num(h.flags.debtUsd) ? `${usdShort(num(h.flags.debtUsd))} borrowed` : 'lending market')
    : h.subtitle
  return (
    <>
      {sub && <span>{sub}</span>}
      {h.kind === 'wallet' && <span className="sr-addr">{shortAddr(h.key)}</span>}
      {chains.length > 0 && (
        <span className="sr-chains">{chains.map((c) => <ChainMark key={c} chainId={c} size={12} />)}{h.chainIds.length > 4 && <small>+{h.chainIds.length - 4}</small>}</span>
      )}
    </>
  )
}

function rowOf(h: FindHit): Row {
  const href = hrefOf(h)
  return {
    id: h.docId, kind: h.kind, href, title: h.title, sub: subOf(h), icon: iconOf(h), metric: metricOf(h),
    chip: claimOf(h), score: h.score, docId: h.docId,
    memo: { id: h.docId, kind: h.kind, title: h.title, href, key: h.key, sym: str(h.flags.assetSymbol) ?? str(h.flags.symbol), icon: h.icon },
  }
}

/** bold the words the query matched, at word starts */
function Marked({ text, words }: { text: string; words: string[] }) {
  const lo = text.toLowerCase()
  for (const w of [...words].sort((a, b) => b.length - a.length)) {
    if (!w) continue
    let at = -1
    for (let i = lo.indexOf(w); i >= 0; i = lo.indexOf(w, i + 1)) if (i === 0 || /[\s._\-/:()@]/.test(lo[i - 1])) { at = i; break }
    if (at >= 0) return <>{text.slice(0, at)}<mark>{text.slice(at, at + w.length)}</mark>{text.slice(at + w.length)}</>
  }
  return <>{text}</>
}

/** the catalog, as `rankFind` docs; the title is the doc's own name */
function toDocs(docs: FindCatalogDoc[]): FindDoc[] {
  return docs.map((d) => ({
    docId: `${d.kind}:${d.key}`, kind: d.kind, key: d.key, title: d.title, subtitle: d.subtitle, icon: d.icon,
    chainIds: d.chainIds, weightUsd: d.weightUsd, flags: d.flags,
    terms: [...termsOf(d.title, 'index', true), ...d.terms.flatMap(([t, s, p]) => termsOf(t, s, p))],
  }))
}

/** every word of the query starts some term of the doc (a chain word may be the doc's chain instead) */
function searchCatalog(q: Extract<FindQuery, { type: 'text' }>, docs: FindDoc[]): FindHit[] {
  if (q.handle || q.addressPrefix) return []
  const cand = docs.filter((d) =>
    q.tokens.every((t) =>
      (t.chainId && d.chainIds.includes(t.chainId)) ||
      d.terms.some((x) => x.term_key.startsWith(t.key) || bareEns(x.term_key) === t.key)))
  return rankFind(q, cand)
}

/** catalog rows first and in place; a server-only row is appended, or placed above one it clearly outranks */
function merge(local: FindHit[], server: FindHit[]): FindHit[] {
  const out = [...local]
  const seen = new Set(local.map((h) => h.docId))
  for (const h of server) {
    if (seen.has(h.docId)) continue
    seen.add(h.docId)
    const i = out.findIndex((x) => x.score + 5 < h.score)
    if (i < 0) out.push(h)
    else out.splice(i, 0, h)
  }
  return out
}

export function Search() {
  const box = React.useRef<HTMLDivElement>(null)
  const input = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const [q, setQ] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [armed, setArmed] = React.useState(false)
  const [tab, setTab] = React.useState<Kind | 'all'>('all')
  const [at, setAt] = React.useState(0)
  const [recent, setRecent] = React.useState<Recent[]>(() => ls.get<Recent[]>(RECENT_KEY) ?? [])
  const needle = q.trim()
  const [debounced, setDebounced] = React.useState('')
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(needle), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [needle])

  // "/" and ⌘K / Ctrl-K focus the box from anywhere that is not already a text field
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const k = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      if (!k && (e.key !== '/' || e.metaKey || e.ctrlKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return
      e.preventDefault()
      input.current?.focus()
    }
    addEventListener('keydown', h)
    return () => removeEventListener('keydown', h)
  }, [])

  const { signer } = useApp()
  const follows = useMyFollows(armed ? signer : undefined)
  const menu = useMenu()
  // the menu's 30-day history: an "up to" here is ranked on the steady rate, like the Earn digest
  const histGet = useRateHistory(menu.all, armed && menu.settled)
  const catalog = useQuery({
    enabled: armed,
    queryKey: ['find-catalog'],
    queryFn: async () => {
      const c = await idx.findCatalog()
      ls.set(CATALOG_KEY, { at: Date.now(), c })
      return c
    },
    initialData: () => ls.get<{ at: number; c: Awaited<ReturnType<typeof idx.findCatalog>> }>(CATALOG_KEY)?.c,
    initialDataUpdatedAt: () => ls.get<{ at: number }>(CATALOG_KEY)?.at,
    staleTime: 10 * MIN,
    retry: false,
  })
  const docs = React.useMemo(() => toDocs(catalog.data?.docs ?? []), [catalog.data])

  const parsed = React.useMemo(() => parseFind(needle), [needle])
  const serverKind = tab === 'all' || tab === 'earn' || tab === 'chain' || tab === 'page' ? undefined : tab
  const ask = armed && debounced.length >= 1 && parsed.type !== 'tx'
  // the All answer always: it carries every category's count, so the chips hold while a tab is open
  const server = useQuery({
    enabled: ask,
    queryKey: ['find', debounced, 'all'],
    queryFn: ({ signal }) => idx.find({ q: debounced, per: PER_ALL }, signal),
    staleTime: 30_000,
    retry: false,
    placeholderData: (prev) => prev,
    // the index is asking Blockscout about this name: one more look once it has answered
    refetchInterval: (query) => (query.state.data?.remote === 'pending' && query.state.dataUpdateCount < 4 ? 1500 : false),
  })
  // …and a category tab's own, 25 deep
  const deep = useQuery({
    enabled: ask && !!serverKind,
    queryKey: ['find', debounced, serverKind],
    queryFn: ({ signal }) => idx.find({ q: debounced, kinds: serverKind, per: PER_ONE }, signal),
    staleTime: 30_000,
    retry: false,
    placeholderData: (prev) => prev,
  })
  const answer = server.data
  const settled = answer && answer.q === needle
  const deepAnswer = deep.data && deep.data.q === needle && serverKind ? deep.data : undefined

  // ---- the rows, per kind
  const groups = React.useMemo(() => {
    const by = new Map<Kind, { rows: Row[]; count: number; top: number }>()
    const put = (kind: Kind, rows: Row[], count = rows.length) => {
      if (rows.length) by.set(kind, { rows, count: Math.max(count, rows.length), top: Math.max(...rows.map((r) => r.score)) })
    }
    if (!needle) return by
    const lo = needle.toLowerCase()

    if (parsed.type === 'address') {
      put('wallet', [{ id: `w:${parsed.address}`, kind: 'wallet', href: walletHref(parsed.address), title: shortAddr(parsed.address), sub: 'open this wallet', icon: <Character addr={parsed.address} size={24} />, score: 50 }])
    }
    if (parsed.type === 'uid') {
      put('market', [{ id: `m:${parsed.uid}`, kind: 'market', href: marketHref(parsed.uid), title: parsed.uid.split(':')[0], sub: 'open this market', icon: <span className="sr-ic">◎</span>, score: 50 }])
    }

    // the menu: one "Earn on X" row per asset it can earn on, with the best it pays
    if (parsed.type === 'text') {
      // `rate` RANKS (today's, or the 30-day mean when today's is a spike); `s` is the row it came from
      const best = new Map<string, { group: string; rate: number; n: number; s: Strategy }>()
      for (const s of menu.all) {
        if (!s.asset.toLowerCase().startsWith(lo) && !nameOf(s.asset).toLowerCase().split(/\s+/).some((w) => w.startsWith(lo))) continue
        const cur = best.get(s.asset), r = steadyRate(s, histGet)
        best.set(s.asset, cur && cur.rate >= r ? { ...cur, n: cur.n + 1 } : { group: s.group, rate: r, n: (cur?.n ?? 0) + 1, s })
      }
      const earn: Row[] = [...best].sort((x, y) => Number(x[0].toLowerCase() !== lo) - Number(y[0].toLowerCase() !== lo) || y[1].rate - x[1].rate).slice(0, 5)
        .map(([asset, b]) => ({ id: `e:${asset}`, kind: 'earn', href: `#/${b.group}?u=${encodeURIComponent(asset)}`, title: `Earn on ${nameOf(asset)}`, sub: <>{b.n} strateg{b.n === 1 ? 'y' : 'ies'}</>, icon: <Tok sym={asset} size={24} />, metric: <>up to <span className="ok">{pct(b.s.rate)}</span><Avg30 s={b.s} get={histGet} prefix=" · 30d " /></>, score: asset.toLowerCase() === lo ? 45 : 25 }))
      for (const g of GROUPS) if (g.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(lo)) || g.id.toLowerCase() === lo)
        earn.push({ id: `g:${g.id}`, kind: 'earn', href: `#/${g.id}`, title: g.name, sub: g.desc, icon: <GroupIcon id={g.id} color={g.color} size={24} />, score: 20 })
      put('earn', earn)

      // chains and pages: this app's, searched here
      const chains: Row[] = CHAINS.filter((c) => c.label.toLowerCase().startsWith(lo) || Object.entries(CHAIN_WORDS).some(([w, id]) => id === c.id && w === lo))
        .map((c) => ({ id: `c:${c.id}`, kind: 'chain', href: feedHash('everyone', { chains: [c.id], protocols: [], issuers: [], match: 'any', curator: undefined }), title: c.label, sub: 'chain · the feed on it', icon: <ChainMark chainId={c.id} size={22} />, score: c.label.toLowerCase() === lo ? 30 : 15 }))
      put('chain', chains)
      const pages: Row[] = PAGES.filter((p) => p.words.split(' ').some((w) => w.startsWith(lo)))
        .map((p) => ({ id: `p:${p.href}`, kind: 'page', href: p.href, title: p.title, sub: 'page', icon: <span className="sr-ic">→</span>, score: 10 }))
      put('page', pages)
    }

    // the index: catalog kinds searched here at once, merged with the server's answer when it lands
    const local = parsed.type === 'text' ? searchCatalog(parsed, docs) : []
    const serverBy = new Map((settled ? answer.groups : []).map((g) => [g.kind, g]))
    const deepBy = new Map((deepAnswer?.groups ?? []).map((g) => [g.kind, g]))
    for (const kind of ['wallet', 'vault', 'protocol', 'asset', 'market', 'curator', 'issuer'] as FindKind[]) {
      const mine = CATALOG_KINDS.includes(kind) ? local.filter((h) => h.kind === kind) : []
      const theirs = serverBy.get(kind)
      const more = deepBy.get(kind)
      const hits = merge(merge(mine, theirs?.hits ?? []), more?.hits ?? [])
      put(kind, hits.map(rowOf), Math.max(theirs?.count ?? 0, more?.count ?? 0, mine.length))
    }
    return by
  }, [needle, parsed, menu.all, docs, answer, settled, deepAnswer, histGet])

  const bestRow: Row | null = React.useMemo(() => {
    if (!needle || tab !== 'all') return null
    const b = settled ? answer.best : null
    if (b) return rowOf(b)
    // before the server answers: an exact catalog hit is as good as its best
    const top = [...groups.values()].flatMap((g) => g.rows).sort((a, b) => b.score - a.score)
    return top[0] && top[0].score >= 40 && (!top[1] || top[0].score - top[1].score >= 4) ? top[0] : null
  }, [needle, tab, settled, answer, groups])

  // ---- what is on screen: All = best + sections by their top score; a chip = that kind
  const sections = React.useMemo(() => {
    const list = [...groups.entries()].map(([kind, g]) => ({ kind, ...g }))
    if (tab !== 'all') return list.filter((s) => s.kind === tab).map((s) => ({ ...s, rows: s.rows.slice(0, PER_ONE) }))
    return list
      .sort((a, b) => b.top - a.top)
      .map((s) => ({ ...s, rows: s.rows.filter((r) => r.id !== bestRow?.id).slice(0, PER_ALL) }))
      .filter((s) => s.rows.length)
  }, [groups, tab, bestRow])
  const flat = React.useMemo(() => [...(bestRow ? [bestRow] : []), ...sections.flatMap((s) => s.rows)], [bestRow, sections])
  const chips = KIND_ORDER.filter((k) => groups.has(k))
  const waiting = needle.length >= 1 && (!settled || server.isFetching) && parsed.type === 'text'

  React.useEffect(() => setAt(0), [needle, tab])
  React.useEffect(() => { if (tab !== 'all' && needle && !groups.has(tab) && !waiting) setTab('all') }, [tab, groups, needle, waiting])
  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [at])

  const pick = (r: Row | undefined) => {
    if (!r) return
    if (r.docId) idx.findClick(r.docId)
    if (r.memo || r.kind === 'chain' || r.kind === 'page' || r.kind === 'earn') {
      const m: Recent = r.memo ?? { id: r.id, kind: r.kind, title: r.title, href: r.href }
      const next = [m, ...recent.filter((x) => x.id !== m.id)].slice(0, 8)
      setRecent(next)
      ls.set(RECENT_KEY, next)
    }
    location.hash = r.href
    setQ('')
    setTab('all')
    setOpen(false)
    input.current?.blur()
  }

  // ---- the empty box: recent picks and what you follow, no request
  const idle: Row[] = React.useMemo(() => {
    if (needle) return []
    const rows: Row[] = recent.map((m) => ({
      id: `r:${m.id}`, kind: m.kind, href: m.href, title: m.title, sub: KIND_LABEL[m.kind].replace(/s$/, '').toLowerCase(), score: 0,
      icon: m.kind === 'wallet' && m.key ? <Character addr={m.key} size={24} />
        : m.sym || m.kind === 'asset' ? <Tok sym={m.sym ?? m.title} logo={m.icon ?? undefined} size={24} />
        : <span className="sr-ic">↺</span>,
    }))
    const fw: Row[] = [
      ...follows.wallets.slice(0, 4).map((a) => ({ id: `f:${a}`, kind: 'wallet' as Kind, href: walletHref(a), title: shortAddr(a), sub: 'following', icon: <Character addr={a} size={24} />, score: 0 })),
      ...follows.curators.slice(0, 2).map((c) => ({ id: `f:${c}`, kind: 'curator' as Kind, href: `#/c/${encodeURIComponent(c)}`, title: c, sub: 'following · curator', icon: <span className="sr-ic">◇</span>, score: 0 })),
      ...follows.markets.slice(0, 2).map((u) => ({ id: `f:${u}`, kind: 'market' as Kind, href: marketHref(u), title: u.split(':')[0].replace(/_[0-9A-F]{8,}$/i, ''), sub: 'following · market', icon: <span className="sr-ic">◎</span>, score: 0 })),
    ]
    return [...rows, ...fw]
  }, [needle, recent, follows.wallets, follows.curators, follows.markets])
  const visible = needle ? flat : idle

  const words = parsed.type === 'text' ? parsed.tokens.map((t) => t.key) : []
  // a render function, not a component: a component defined here would remount every row per keystroke
  const row = (r: Row, i: number) => (
    <a key={r.id} href={r.href} role="option" aria-selected={i === at} className="sr"
      onMouseEnter={() => setAt(i)} onClick={(e) => { e.preventDefault(); pick(r) }}>
      <span className="sr-icon">{r.icon}</span>
      <span className="sr-t">
        <b><Marked text={r.title} words={words} />{r.chip && <span className="sr-claim">{r.chip}</span>}</b>
        {r.sub && <small>{r.sub}</small>}
      </span>
      {r.metric && <span className="sr-m">{r.metric}</span>}
    </a>
  )

  let i = 0
  return (
    <div ref={box} className="search" role="search">
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden className="s-glass"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m10.4 10.4 3.4 3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      <input ref={input} type="search" value={q} placeholder="Search wallets, vaults, protocols, assets…" aria-label="Search"
        aria-expanded={open} aria-controls="search-results" autoComplete="off" spellCheck={false}
        onFocus={() => { setArmed(true); setOpen(true) }}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAt((n) => Math.min(n + 1, visible.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((n) => Math.max(n - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); pick(visible[at] ?? bestRow ?? undefined) }
          else if (e.key === 'Tab' && needle && chips.length) {
            e.preventDefault()
            const order: (Kind | 'all')[] = ['all', ...chips]
            const n = order.indexOf(tab)
            setTab(order[(n + (e.shiftKey ? order.length - 1 : 1)) % order.length])
          } else if (e.key === 'Escape') { setOpen(false); input.current?.blur() }
        }} />
      {q && <button type="button" className="s-clear" aria-label="Clear" onClick={() => { setQ(''); setTab('all'); input.current?.focus() }}>×</button>}
      <Popover anchor={box} open={open && (!!needle || idle.length > 0)} onClose={() => setOpen(false)} width={460} align="left">
        <div className="sbox">
          {needle && chips.length > 0 && (
            <div className="s-chips" role="tablist" aria-label="Categories">
              <button type="button" role="tab" aria-selected={tab === 'all'} className="s-chip" onClick={() => setTab('all')}>All</button>
              {chips.map((k) => {
                const g = groups.get(k)!
                const loading = waiting && (k === 'wallet' || k === 'market')
                return (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} className="s-chip" onClick={() => setTab(k)}>
                    {KIND_LABEL[k]} <span className="s-n">{loading ? '…' : g.count >= 100 ? '99+' : g.count}</span>
                  </button>
                )
              })}
            </div>
          )}
          <div ref={listRef} id="search-results" className="sresults" role="listbox" aria-label="Results">
            {!needle && idle.length > 0 && (
              <>
                {recent.length > 0 && <div className="s-sec">Recent</div>}
                {idle.slice(0, recent.length).map((r) => row(r, i++))}
                {idle.length > recent.length && <div className="s-sec">Following</div>}
                {idle.slice(recent.length).map((r) => row(r, i++))}
              </>
            )}
            {needle && bestRow && (
              <>
                <div className="s-sec">Best match</div>
                {row(bestRow, i++)}
              </>
            )}
            {needle && sections.map((s) => (
              <React.Fragment key={s.kind}>
                <div className="s-sec">
                  <span>{KIND_LABEL[s.kind]}</span>
                  {tab === 'all' && s.count > s.rows.length && (
                    <button type="button" className="s-more" onClick={() => setTab(s.kind)}>see all {s.count >= 100 ? '99+' : s.count} →</button>
                  )}
                </div>
                {s.rows.map((r) => row(r, i++))}
              </React.Fragment>
            ))}
            {needle && !flat.length && (
              <div className="sr-none">
                {waiting || catalog.isFetching ? 'Looking…'
                  : parsed.type === 'tx' ? <>A transaction hash — open it from the wallet that sent it.</>
                  : <>Nothing named “{needle}” in the index. A wallet is also found by its address.</>}
              </div>
            )}
            {needle && settled && answer.fuzzy && flat.length > 0 && <div className="sr-note">Nothing matched as typed — these are close spellings.</div>}
          </div>
        </div>
      </Popover>
    </div>
  )
}
