import React from 'react'
import { useAccount } from 'wagmi'
import { SCOPE_CHAINS } from '../sdk/queries'

/**
 * Route = the hash. The catalogue's routes are unchanged; the social ones are
 * new segments beside them, so every social object is a URL and back, forward
 * and a pasted link all work without a router.
 *
 *   #/                       the home: pulse · hot · stream
 *   #/explore                the catalogue, by asset
 *   #/USD?u=USDC&s=<id>&k=loop   asset page + ticket
 *   #/feed                   the feed          (?t=following|everyone|menu)
 *   #/w/0x…                  a wallet
 *   #/m/<uid>                a market          (uid is percent-encoded: it has colons)
 *   #/board                  the leaderboard   (?w=24h|7d|30d|all)
 *   #/me                     profile editor
 *   #/alerts                 what happened while you were away
 */
export type Mode = 'add' | 'reduce' | 'close' | 'manage'
export type View = 'home' | 'explore' | 'group' | 'feed' | 'wallet' | 'market' | 'board' | 'me' | 'alerts' | 'curator'
export interface Route {
  view: View
  group?: string
  u: string
  s?: string
  k: 'simple' | 'loop' | undefined
  m?: Mode
  /** #/w/<addr> */
  addr?: string
  /** #/c/<curatorId> — a desk (pos-indexer tickets/0013) */
  curatorId?: string
  /** #/m/<uid> */
  uid?: string
  /** feed tab / board window — a plain `?t=` so a link carries it */
  t?: string
  /** who is being copied, when the ticket was opened from a feed card */
  copy?: string
}
const GROUP_IDS = new Set(['USD', 'ETH', 'BTC', 'MORE'])
const ADDR = /^0x[0-9a-fA-F]{40}$/

export function parseRoute(hash = location.hash): Route {
  const h = hash.replace(/^#\/?/, '')
  const [path, q] = h.split('?')
  const p = new URLSearchParams(q ?? '')
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent)
  const m = p.get('m')
  const base = {
    u: p.get('u') ?? 'all',
    s: p.get('s') ?? undefined,
    k: p.get('k') === 'loop' ? ('loop' as const) : p.get('k') === 'simple' ? ('simple' as const) : undefined,
    m: m === 'reduce' || m === 'close' || m === 'manage' ? (m as Mode) : m === 'add' ? ('add' as Mode) : undefined,
    t: p.get('t') ?? undefined,
    copy: p.get('copy') ?? undefined,
  }
  const head = seg[0]
  if (head === 'feed') return { view: 'feed', ...base }
  if (head === 'explore') return { view: 'explore', ...base }
  if (head === 'board') return { view: 'board', ...base }
  if (head === 'me') return { view: 'me', ...base }
  if (head === 'alerts') return { view: 'alerts', ...base }
  if (head === 'w' && seg[1] && ADDR.test(seg[1])) return { view: 'wallet', addr: seg[1].toLowerCase(), ...base }
  if (head === 'm' && seg[1]) return { view: 'market', uid: seg.slice(1).join('/'), ...base }
  // a desk id is a registry slug or `cand:<chain>:<address>` — the colons survive the hash
  if (head === 'c' && seg[1]) return { view: 'curator', curatorId: decodeURIComponent(seg.slice(1).join('/')), ...base }
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
export const walletHref = (a: string) => `#/w/${a.toLowerCase()}`

export function useRoute(): Route {
  const [r, setR] = React.useState(parseRoute)
  React.useEffect(() => { const h = () => setR(parseRoute()); addEventListener('hashchange', h); return () => removeEventListener('hashchange', h) }, [])
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
  /** connected address, or the "view as" address */
  account: string | undefined
  /** the CONNECTED wallet only — the one that can sign, and the one whose positions never come from the index */
  signer: string | undefined
  viewAs: string | undefined
  setViewAs: (a: string | undefined) => void
  isConnected: boolean
}
const Ctx = React.createContext<AppCtx | null>(null)
const LS = 'yieldcircle.chains'
const OLD_LS = 'yieldcircle.chain'
const ALL = () => SCOPE_CHAINS.map((c) => c.id)
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
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [chains, setChainsRaw] = React.useState<string[]>(readChains)
  const setChains = (c: string[]) => {
    const next = c.length === SCOPE_CHAINS.length ? [] : c
    setChainsRaw(next)
    try { localStorage.setItem(LS, JSON.stringify(next)) } catch { /* private mode */ }
  }
  const toggleChain = (c: string) =>
    setChains(chains.includes(c) ? chains.filter((x) => x !== c) : [...(chains.length ? chains : []), c])
  const [viewAs, setViewAs] = React.useState<string | undefined>(() => new URLSearchParams(location.search).get('as') ?? undefined)
  const { address, isConnected } = useAccount()
  const chainIds = chains.length ? chains : ALL()
  const allChains = chains.length === 0
  const chainLabelFor = () =>
    allChains
      ? 'every chain'
      : chains.length === 1
        ? (SCOPE_CHAINS.find((c) => c.id === chains[0])?.label ?? chains[0])
        : `${chains.length} chains`
  const account = viewAs && ADDR.test(viewAs) ? viewAs : address
  return <Ctx.Provider value={{ chains, setChains, toggleChain, chainIds, allChains, chainLabelFor, account, signer: address?.toLowerCase(), viewAs, setViewAs, isConnected }}>{children}</Ctx.Provider>
}
export const useApp = () => { const c = React.useContext(Ctx); if (!c) throw new Error('AppProvider missing'); return c }
