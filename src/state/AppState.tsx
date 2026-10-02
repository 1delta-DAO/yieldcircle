import React from 'react'
import { useAccount } from 'wagmi'
import { isAddr, normAddr } from '../model/address'
import { useSolWallet } from '../wallet/solana'
import { CHAINS } from '../sdk/queries'
import { readFeedLink } from './feedLink'

/**
 * Route = the hash. The catalogue's routes are unchanged; the social ones are
 * new segments beside them, so every social object is a URL and back, forward
 * and a pasted link all work without a router.
 *
 *   #/                       the home: pulse · hot · the feed  (?t=following|everyone|menu, filters: see feedLink.ts)
 *   #/earn                   the catalogue, by asset
 *   #/USD?u=USDC&s=<id>&k=loop   asset page + ticket
 *   #/w/0x…                  a wallet
 *   #/m/<uid>                a market          (uid is percent-encoded: it has colons)
 *   #/board                  the earners board (?t=day|apr&by=wallet)
 *   #/me                     profile editor
 *   #/alerts                 what happened while you were away
 *   #/t                      the asset book (every token the index lends)
 *   #/t/<group>              one asset (group percent-encoded: `Lista Staked BNB::slisBNB`)
 *
 * Two old heads are still read, so links already out in the world land:
 * `#/feed` is the home (the feed moved onto it) and `#/explore` is `#/earn`.
 */
export type Mode = 'add' | 'reduce' | 'close' | 'manage'
export type View = 'home' | 'earn' | 'group' | 'wallet' | 'market' | 'board' | 'me' | 'alerts' | 'curator' | 'token'
export interface Route {
  view: View
  group?: string
  u: string
  s?: string
  k: 'simple' | 'loop' | undefined
  m?: Mode
  /** a running position the catalogue has no row for — its `Holding.key`, managed from the position alone */
  h?: string
  /** #/w/<addr> */
  addr?: string
  /** #/c/<curatorId> — a desk (pos-indexer tickets/0013) */
  curatorId?: string
  /** #/m/<uid> */
  uid?: string
  /** #/t/<group> — an asset group key, case-significant; absent on `#/t` (the asset book) */
  token?: string
  /** feed tab / board window — a plain `?t=` so a link carries it */
  t?: string
  /** the board's unit: a position, or a whole wallet (`?by=wallet`) */
  by?: string
  /** who is being copied, when the ticket was opened from a feed card */
  copy?: string
}
const GROUP_IDS = new Set(['USD', 'ETH', 'BTC', 'MORE'])

export function parseRoute(hash = location.hash): Route {
  const h = hash.replace(/^#\/?/, '')
  const [path, q] = h.split('?')
  const p = new URLSearchParams(q ?? '')
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent)
  const m = p.get('m')
  const base = {
    u: p.get('u') ?? 'all',
    s: p.get('s') ?? undefined,
    h: p.get('h') ?? undefined,
    k: p.get('k') === 'loop' ? ('loop' as const) : p.get('k') === 'simple' ? ('simple' as const) : undefined,
    m: m === 'reduce' || m === 'close' || m === 'manage' ? (m as Mode) : m === 'add' ? ('add' as Mode) : undefined,
    t: p.get('t') ?? undefined,
    by: p.get('by') ?? undefined,
    copy: p.get('copy') ?? undefined,
  }
  const head = seg[0]
  if (head === 'earn' || head === 'explore') return { view: 'earn', ...base }
  if (head === 'board') return { view: 'board', ...base }
  if (head === 'me') return { view: 'me', ...base }
  if (head === 'alerts') return { view: 'alerts', ...base }
  // hex is canonically lower; a base58 wallet keeps its case — it IS the address
  if (head === 'w' && seg[1] && isAddr(seg[1])) return { view: 'wallet', addr: normAddr(seg[1]), ...base }
  if (head === 'm' && seg[1]) return { view: 'market', uid: seg.slice(1).join('/'), ...base }
  // a desk id is a registry slug or `cand:<chain>:<address>` — the colons survive the hash
  if (head === 'c' && seg[1]) return { view: 'curator', curatorId: decodeURIComponent(seg.slice(1).join('/')), ...base }
  // an asset group can itself be `ETH` or `USD`, so it lives under its own segment, never in `group`
  if (head === 't') return { view: 'token', token: seg[1] ? seg.slice(1).join('/') : undefined, ...base }
  if (head && GROUP_IDS.has(head)) return { view: 'group', group: head, ...base }
  return { view: 'home', ...base }
}

export function go(path: string, params: Record<string, string | undefined | null> = {}) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '' && v !== 'all' && !(k === 'k' && v === 'simple')) q.set(k, v)
  const s = q.toString()
  location.hash = '#/' + path + (s ? '?' + s : '')
}
/** A market uid carries colons and dots, so it is encoded — and its case is significant, never lowered. */
export const marketHref = (uid: string) => `#/m/${encodeURIComponent(uid)}`
export const walletHref = (a: string) => `#/w/${normAddr(a)}`
/** An asset page. The group key is case-significant and may carry spaces and colons. */
export const tokenHref = (group: string) => `#/t/${encodeURIComponent(group)}`

/**
 * A feed link followed in a tab that is already open — pasted, or Back onto a
 * feed view — sets the chains in the SAME listener that moves the route, so
 * both land in one render and the feed mounts already scoped. A listener of
 * its own would run after this one, when the feed has already rendered, and
 * mirrored the old chains into the address.
 */
let followLinkChains: ((c: string[]) => void) | null = null
export function useRoute(): Route {
  const [r, setR] = React.useState(parseRoute)
  React.useEffect(() => {
    const h = () => {
      const link = readFeedLink()
      if (link) followLinkChains?.(link.chains)
      setR(parseRoute())
    }
    addEventListener('hashchange', h)
    return () => removeEventListener('hashchange', h)
  }, [])
  return r
}

interface AppCtx {
  /**
   * The chains in scope. EMPTY means every chain the app offers — "all" is
   * the absence of a filter rather than a value, so a new chain is in scope
   * the day it is added and nobody's stored selection silently excludes it.
   */
  chains: string[]
  setChains: (c: string[]) => void
  toggleChain: (c: string) => void
  /** every selected chain, resolved — never empty */
  chainIds: string[]
  /** true when nothing is filtered out */
  allChains: boolean
  /** what to call the current scope in a sentence */
  chainLabelFor: () => string
  /**
   * A link just set the chains. The selection is global — one world, every
   * page agreeing — so a sent view changes it rather than hiding a second
   * chain filter on the feed; `prev` is what the reader had, for Undo.
   */
  chainsFromLink: { prev: string[] } | null
  dismissLinkChains: (undo?: boolean) => void
  /** connected address, or the "view as" address */
  account: string | undefined
  /** the CONNECTED wallet only — the one that can sign, and the one whose positions never come from the index */
  signer: string | undefined
  /** the connected SOLANA wallet — one account per VM (docs/solana.md §5); a page's chain decides which is "you" */
  solSigner: string | undefined
  viewAs: string | undefined
  setViewAs: (a: string | undefined) => void
  isConnected: boolean
}
const Ctx = React.createContext<AppCtx | null>(null)
const LS = 'yieldcircle.chains'
const OLD_LS = 'yieldcircle.chain'
const ALL = () => CHAINS.map((c) => c.id)
/** the stored selection, dropping any chain this build no longer offers */
function readChains(): string[] {
  try {
    const raw = localStorage.getItem(LS)
    if (raw) return (JSON.parse(raw) as string[]).filter((c) => ALL().includes(c))
    // the single-select selection this replaced
    const one = localStorage.getItem(OLD_LS)
    return one && one !== 'all' && ALL().includes(one) ? [one] : []
  } catch { return [] }
}
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
/** the page load: a feed link's chains, when it carries any filter, over the stored ones */
function initChains(): { chains: string[]; fromLink: { prev: string[] } | null } {
  const stored = readChains()
  const link = readFeedLink()
  if (!link || sameSet(link.chains, stored)) return { chains: stored, fromLink: null }
  return { chains: link.chains, fromLink: { prev: stored } }
}
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [init] = React.useState(initChains)
  const [chains, setChainsRaw] = React.useState<string[]>(init.chains)
  const [chainsFromLink, setChainsFromLink] = React.useState(init.fromLink)
  const store = (next: string[]) => { try { localStorage.setItem(LS, JSON.stringify(next)) } catch { /* private mode */ } }
  // a link's chains are kept like a pick in the profile sheet would be
  React.useEffect(() => { if (init.fromLink) store(init.chains) }, [init])
  const apply = (c: string[]) => {
    const next = c.length === CHAINS.length ? [] : c
    setChainsRaw(next)
    store(next)
  }
  /** a pick of the reader's own: whatever a link set is theirs now, nothing left to undo */
  const setChains = (c: string[]) => { apply(c); setChainsFromLink(null) }
  const adoptLinkChains = (c: string[]) => {
    if (sameSet(c, chains)) return
    // a second link before Undo keeps the FIRST prev — Undo goes back to what the reader chose
    setChainsFromLink((cur) => cur ?? { prev: chains })
    apply(c)
  }
  const dismissLinkChains = (undo = false) => {
    if (undo && chainsFromLink) apply(chainsFromLink.prev)
    setChainsFromLink(null)
  }
  // read by `useRoute`'s listener; kept current so it compares against the chains on screen
  followLinkChains = adoptLinkChains
  const toggleChain = (c: string) =>
    setChains(chains.includes(c) ? chains.filter((x) => x !== c) : [...(chains.length ? chains : []), c])
  const [viewAs, setViewAs] = React.useState<string | undefined>(() => new URLSearchParams(location.search).get('as') ?? undefined)
  const { address, isConnected } = useAccount()
  const sol = useSolWallet()
  const chainIds = chains.length ? chains : ALL()
  const allChains = chains.length === 0
  const chainLabelFor = () =>
    allChains
      ? 'every chain'
      : chains.length === 1
        ? (CHAINS.find((c) => c.id === chains[0])?.label ?? chains[0])
        : `${chains.length} chains`
  // the EVM wallet leads; a Solana-only user is still "somebody" everywhere a page shows you to yourself
  const account = viewAs && isAddr(viewAs) ? normAddr(viewAs) : address ?? sol.account?.address
  return <Ctx.Provider value={{ chains, setChains, toggleChain, chainIds, allChains, chainLabelFor, chainsFromLink, dismissLinkChains, account, signer: address?.toLowerCase(), solSigner: sol.account?.address, viewAs, setViewAs, isConnected: isConnected || !!sol.account }}>{children}</Ctx.Provider>
}
export const useApp = () => { const c = React.useContext(Ctx); if (!c) throw new Error('AppProvider missing'); return c }
