import React from 'react'
import { useAccount } from 'wagmi'
import { isAddr, isEvmAddr, isSvmChain, normAddr } from '@yieldcircle/core/model/address'
import { canonGroup } from '@yieldcircle/core/model/assetGroup'
import { liteHash } from '@yieldcircle/core/model/liteLinks'
import { useSolWallet } from '../wallet/solana'
import { CHAINS } from '@yieldcircle/app/sdk/queries'
import { readFeedLink, readLinkChains } from './feedLink'
import { readMode, writeMode, type AppMode } from './mode'

/**
 * Route = the hash. The catalogue's routes are unchanged; the social ones are
 * new segments beside them, so every social object is a URL and back, forward
 * and a pasted link all work without a router.
 *
 *   #/                       the home: the beginner dashboard (src/ui/Start.tsx)
 *   #/feed                   pulse · hot · the feed  (?t=following|everyone|menu, filters: see feedLink.ts)
 *   #/earn                   the catalogue, by asset
 *   #/USD?u=USDC&s=<id>&k=loop   asset page + ticket (USD · ETH · BTC · STOCKS · MORE); `k=fixed` its Fixed rate books (tickets/0013)
 *   #/ETH?k=borrow&s=b:<coll>|<debt>   the loans against it, and a borrow ticket (tickets/0008);
 *                            `&h=<holding>&m=reduce` opens a running loan on Pay back; `&h=<holding>&m=roll` a
 *                            fixed-term position on Roll (a book lend, a Midnight or Lista loan)
 *   #/STOCKS?u=TSLA&k=borrow  tokenized stocks, one row per real-world ticker (tickets/0009)
 *   #/borrow                 borrowing, holdings first (tickets/0010); `?u=<asset>&s=b:…` opens a ticket;
 *                            the Borrow tab (tickets/0011). `out=ETH|BTC|MORE` on any borrow list
 *                            takes out that family instead of dollars; `hold=1|0` sets its
 *                            "Against what you hold" pill
 *   #/w/0x…                  a wallet
 *   #/m/<uid>                a market          (uid is percent-encoded: it has colons)
 *   #/board                  the earners board (strategies by today's APR by default; t=pnl|yield|day;
 *                            by=wallet|position|paper; x=usd|eth|btc|stocks… the held-in chip; s=<strategy key>;
 *                            c=ethereum,base sets the chains — `c=all` every chain, no `c` the reader's own)
 *   #/me                     profile editor
 *   #/alerts                 what happened while you were away
 *   #/t                      the asset book (every token the index lends)
 *   #/t/<group>              one asset (group percent-encoded: `Lista Staked BNB::slisBNB`)
 *
 * Old heads are still read, so links already out in the world land: `#/start`
 * is the home, a bare `#/?t=…` (the feed, when it was the home) is `#/feed`,
 * and `#/explore` is `#/earn`.
 *
 * Lite and Pro (docs/lite.md): any route may lead with `lite/` or `pro/`. Lite has four pages —
 * the home (`#/lite/`), Earn (`#/lite/earn`), a category's list with its ticket
 * (`#/lite/USD?s=…`; USD, ETH, BTC and MORE, no Stocks, no Borrow, no fixed-rate books), the
 * leaderboard (`#/lite/board`, `?t=perDay` for dollars a day), You (`#/lite/you`), search (`#/lite/search?q=…`)
 * and a wallet's profile (`#/lite/w/<addr>`, docs/lite-social-search.md). A route with no prefix opens in the saved mode (`state/mode.ts`) when Lite has
 * that page, so a shared link lands a first visitor in Lite; every other page is Pro's, whatever
 * the prefix says.
 */
/** `roll`: a fixed-term position's Roll tab — into a later date or term (`model/roll.ts`) */
export type Mode = 'add' | 'reduce' | 'close' | 'manage' | 'roll'
export type View = 'home' | 'feed' | 'earn' | 'borrow' | 'group' | 'wallet' | 'market' | 'board' | 'me' | 'alerts' | 'curator' | 'token' | 'join' | 'you' | 'search'
export interface Route {
  view: View
  /** the page opens in Lite (docs/lite.md): asked for, or saved, and a page Lite has */
  lite: boolean
  /** the frame around it: the mode asked for, else the saved one — a Lite reader on a page only Pro has keeps Lite's tabs */
  shell: AppMode
  /** the mode the address names (`#/lite/…`, `#/pro/…`), when it names one */
  asked?: AppMode
  group?: string
  u: string
  s?: string
  /** which list an asset page shows: deposits, fixed-rate books (`fixed`, tickets/0013), loops, or loans against the asset (`borrow`, tickets/0008) — and so which ticket `s=` opens */
  k: 'simple' | 'fixed' | 'loop' | 'borrow' | undefined
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
  /** Lite's search box (`#/lite/search?q=…`) */
  q?: string
  /** feed tab / board window — a plain `?t=` so a link carries it */
  t?: string
  /** the board's unit: a strategy (none), a position (`?by=position`) or a whole wallet (`?by=wallet`) */
  by?: string
  /** the board's exposure chip (`?x=eth`, pos-indexer tickets/0072) */
  x?: string
  /** who is being copied, when the ticket was opened from a feed card */
  copy?: string
  /** the leverage they run it at, so a copied loop opens on it (`?lev=3.2`) */
  lev?: number
  /** an off-menu row's narrowing token (`OffMenuRef.by`): `s=` names a row the catalogue does not hold */
  oa?: string
  /** #/w/<addr>?pos=<group key> — the position whose PnL history is open (pos-indexer tickets/0061) */
  pos?: string
  /** `talk=1`: the ticket opens on its thread (a row's 💬, a Talk card) — tickets/0005 */
  talk?: boolean
  /** what a borrow list takes out when it is not dollars: `ETH`, `BTC` or `MORE` (tickets/0011) */
  out?: 'ETH' | 'BTC' | 'MORE'
  /** one token out of that family (`?debt=USDT`); absent = any of them */
  debt?: string
  /** a borrow list's "Against what you hold" pill, set by hand (`1` on, `0` off); unset, it is on when the wallet holds something the list lends against */
  hold?: '1' | '0'
}
const GROUP_IDS = new Set(['USD', 'ETH', 'BTC', 'STOCKS', 'MORE'])

export function parseRoute(hash = location.hash): Route {
  const h = hash.replace(/^#\/?/, '')
  const [path, q] = h.split('?')
  const p = new URLSearchParams(q ?? '')
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent)
  const asked = seg[0] === 'lite' || seg[0] === 'pro' ? (seg.shift() as AppMode) : undefined
  const r = parsePage(seg, p, hash)
  const shell = asked ?? readMode()
  const lite = shell === 'lite' && liteHas(r)
  // You and the search page are Lite's: in Pro the same address is the home (Pro's search is in its header)
  return { ...r, lite, shell, asked, view: !lite && (r.view === 'you' || r.view === 'search') ? 'home' : r.view }
}

/** The pages Lite has: its home, Earn, You, search, a wallet's profile, and a dollar / ether / bitcoin / more list on its deposits or loops. */
export function liteHas(r: Page): boolean {
  if (r.view === 'home') return !r.t
  if (r.view === 'earn' || r.view === 'you' || r.view === 'search') return true
  // a wallet's profile; one position's PnL history (`pos=`) is Pro's drawer
  if (r.view === 'wallet') return !r.pos
  // the leaderboard: wallets by rate or by dollars a day; Pro's cuts (by strategy, an exposure chip, a strategy's holders, lifetime PnL) are Pro's
  if (r.view === 'board') return (!r.by || r.by === 'strategy' || r.by === 'wallet') && (!r.x || r.x === 'usd' || r.x === 'eth' || r.x === 'btc') && !r.s && (r.t == null || r.t === 'apr' || r.t === 'perDay')
  if (r.view !== 'group' || !r.group || !LITE_GROUPS.has(r.group)) return false
  // a running position named alone (`h=` with no row) is managed in Pro, where the off-menu tickets live
  return (r.k == null || r.k === 'simple' || r.k === 'loop') && !(r.h && !r.s)
}
const LITE_GROUPS = new Set(['USD', 'ETH', 'BTC', 'MORE'])

type Page = Omit<Route, 'lite' | 'shell' | 'asked'>
function parsePage(seg: string[], p: URLSearchParams, hash: string): Page {
  const m = p.get('m')
  const base = {
    u: p.get('u') ?? 'all',
    s: p.get('s') ?? undefined,
    h: p.get('h') ?? undefined,
    k: p.get('k') === 'loop' ? ('loop' as const) : p.get('k') === 'simple' ? ('simple' as const) : p.get('k') === 'borrow' ? ('borrow' as const) : p.get('k') === 'fixed' ? ('fixed' as const) : undefined,
    m: m === 'reduce' || m === 'close' || m === 'manage' || m === 'roll' ? (m as Mode) : m === 'add' ? ('add' as Mode) : undefined,
    t: p.get('t') ?? undefined,
    q: p.get('q') ?? undefined,
    by: p.get('by') ?? undefined,
    x: p.get('x') ?? undefined,
    copy: p.get('copy') ?? undefined,
    lev: Number(p.get('lev')) > 1 ? Number(p.get('lev')) : undefined,
    oa: p.get('oa') ?? undefined,
    pos: p.get('pos') ?? undefined,
    talk: p.get('talk') === '1',
    out: (['ETH', 'BTC', 'MORE'] as const).find((x) => x === p.get('out')),
    debt: p.get('debt') ?? undefined,
    hold: (['1', '0'] as const).find((x) => x === p.get('hold')),
  }
  const head = seg[0]
  if (head === 'earn' || head === 'explore') return { view: 'earn', ...base }
  if (head === 'borrow') return { view: 'borrow', ...base }
  // the beginner dashboard (src/ui/Start.tsx) is the home; `#/start` was its old address
  if (head === 'start') return { view: 'home', ...base }
  // the feed; a bare `#/` with a tab or a filter is a feed link from when the feed was the home
  if (head === 'feed' || (!head && (base.t || readFeedLink(hash)))) return { view: 'feed', ...base }
  // the investor deck moved to the landing (landing/Deck.tsx, served at /deck); `#/deck` here falls through to home
  if (head === 'join') return { view: 'join', ...base }
  if (head === 'board') return { view: 'board', ...base }
  if (head === 'me') return { view: 'me', ...base }
  if (head === 'alerts') return { view: 'alerts', ...base }
  if (head === 'you') return { view: 'you', ...base }
  if (head === 'search') return { view: 'search', ...base }
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
  // `k=simple` is the default and left out — except on the Stocks shelf, whose default is its loans
  // (without it, "Lend to them" there bounced straight back to Borrow)
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '' && v !== 'all' && !(k === 'k' && v === 'simple' && path !== 'STOCKS')) q.set(k, v)
  const s = q.toString()
  location.hash = hrefIn(path + (s ? '?' + s : ''))
}

/**
 * A page's address in the mode the reader is in. From a Lite page, a page Lite has stays Lite
 * (`#/lite/USD?…`). From a page opened in Pro on purpose (`#/pro/…`: a Lite ticket's Details) it
 * stays Pro — said out loud only when the saved mode is Lite, since an address with no prefix would
 * open there. From a page that is Pro's only because Lite has none (a wallet, the board), the
 * saved mode decides: a Lite reader's Copy on a wallet page opens Lite's ticket. A page Lite does
 * not have needs no prefix: it is Pro's anyway.
 */
export function hrefIn(rest: string, from: Route = parseRoute()): string {
  const bare = rest.replace(/^#?\/?/, '').replace(/^(lite|pro)(\/|$)/, '')
  const canLite = parseRoute('#/lite/' + bare).lite
  const pre = !canLite ? '' : from.lite ? 'lite/' : from.asked === 'pro' && readMode() === 'lite' ? 'pro/' : ''
  return '#/' + pre + bare
}
/** A Lite page's address, for Lite's own links: `liteHref('earn')` → `#/lite/earn`. */
export const liteHref = (rest = '') => '#/lite/' + rest.replace(/^#?\/?/, '')
/** The same page in Pro, for a Lite page's Details: a visit, so the saved mode stays. */
export const proHref = (hash = location.hash) => '#/pro/' + hash.replace(/^#\/?/, '').replace(/^(lite|pro)(\/|$)/, '')

/**
 * Switch for good: save the mode and open the page being read in it — or, from a page Lite does
 * not have, Lite's home. You (Lite's page) opens Pro's home.
 */
export function goMode(m: AppMode) {
  writeMode(m)
  const rest = location.hash.replace(/^#\/?/, '').replace(/^(lite|pro)(\/|$)/, '')
  const target = `#/${m}/${rest}`
  const next = m === 'lite' && !parseRoute(target).lite ? '#/lite/' : target
  if (next === location.hash) dispatchEvent(new HashChangeEvent('hashchange'))
  else location.hash = next
}
/** A copy link's `lev`: only a loop takes one, and only levered; two decimals is what the ticket shows. */
export const levParam = (s: { kind: string }, lev: number | null | undefined) => (s.kind === 'loop' && lev && lev > 1.05 ? lev.toFixed(2) : undefined)
/** A market uid carries colons and dots, so it is encoded — and its case is significant, never lowered. */
export const marketHref = (uid: string) => `#/m/${encodeURIComponent(uid)}`
export const walletHref = (a: string) => `#/w/${normAddr(a)}`
/** A wallet's profile in Lite (docs/lite-social-search.md §4.3): every face in Lite opens it. */
export const liteWalletHref = (a: string) => liteHash({ to: 'wallet', account: a })
/** An asset page. The group key is case-significant and may carry spaces and colons; a chain-local spelling opens its cross-chain page (`model/assetGroup.ts`). */
export const tokenHref = (group: string) => `#/t/${encodeURIComponent(canonGroup(group))}`

/**
 * A feed or board link followed in a tab that is already open — pasted, or Back onto a
 * feed or board view — sets the chains in the SAME listener that moves the route, so
 * both land in one render and the page mounts already scoped. A listener of
 * its own would run after this one, when the feed has already rendered, and
 * mirrored the old chains into the address.
 */
let followLinkChains: ((c: string[]) => void) | null = null
export function useRoute(): Route {
  const [r, setR] = React.useState(parseRoute)
  React.useEffect(() => {
    const h = () => {
      const link = readLinkChains()
      if (link) followLinkChains?.(link)
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
  /** who acts on `chainId`: that VM's own address — the Solana wallet on Solana, an EVM address (connected or "view as") on EVM; never one VM's address for the other */
  actorOn: (chainId: string | undefined) => string | undefined
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
/** the page load: a link's chains (a feed link with any filter, a board link with `c=`) over the stored ones */
function initChains(): { chains: string[]; fromLink: { prev: string[] } | null } {
  const stored = readChains()
  const link = readLinkChains()
  if (!link || sameSet(link, stored)) return { chains: stored, fromLink: null }
  return { chains: link, fromLink: { prev: stored } }
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
  // `account` falls back to the Solana address for a Solana-only user: fine for showing you to yourself, wrong as an EVM sender or receiver
  const actorOn = (chainId: string | undefined) => (isSvmChain(chainId) ? sol.account?.address : isEvmAddr(account) ? account : undefined)
  return <Ctx.Provider value={{ chains, setChains, toggleChain, chainIds, allChains, chainLabelFor, chainsFromLink, dismissLinkChains, account, signer: address?.toLowerCase(), solSigner: sol.account?.address, actorOn, viewAs, setViewAs, isConnected: isConnected || !!sol.account }}>{children}</Ctx.Provider>
}
export const useApp = () => { const c = React.useContext(Ctx); if (!c) throw new Error('AppProvider missing'); return c }
