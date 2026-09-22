import React from 'react'
import { useAccount } from 'wagmi'
import { CHAINS } from '../sdk/queries'

/** Route = the hash: `#/` explorer · `#/USD?u=USDC&s=<strategy id>&k=loop` asset page. */
export type Mode = 'add' | 'reduce' | 'close' | 'manage'
export interface Route { group?: string; u: string; s?: string; k: 'simple' | 'loop' | undefined; m?: Mode }
export function parseRoute(hash = location.hash): Route {
  const h = hash.replace(/^#\/?/, '')
  const [path, q] = h.split('?')
  const p = new URLSearchParams(q ?? '')
  const seg = path.split('/').filter(Boolean)
  const m = p.get('m')
  return { group: seg[0], u: p.get('u') ?? 'all', s: p.get('s') ?? undefined, k: p.get('k') === 'loop' ? 'loop' : p.get('k') === 'simple' ? 'simple' : undefined, m: m === 'reduce' || m === 'close' || m === 'manage' ? m : m === 'add' ? 'add' : undefined }
}
export function go(path: string, params: Record<string, string | undefined | null> = {}) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '' && v !== 'all' && !(k === 'k' && v === 'simple')) q.set(k, v)
  const s = q.toString()
  location.hash = '#/' + path + (s ? '?' + s : '')
}
export function useRoute(): Route {
  const [r, setR] = React.useState(parseRoute)
  React.useEffect(() => { const h = () => setR(parseRoute()); addEventListener('hashchange', h); return () => removeEventListener('hashchange', h) }, [])
  return r
}

interface AppCtx {
  /** 'all' or one chain id */
  chain: string
  setChain: (c: string) => void
  chainIds: string[]
  /** connected address, or the "view as" address */
  account: string | undefined
  viewAs: string | undefined
  setViewAs: (a: string | undefined) => void
  isConnected: boolean
}
const Ctx = React.createContext<AppCtx | null>(null)
const LS = 'yieldcircle.chain'
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [chain, setChainRaw] = React.useState<string>(() => { try { return localStorage.getItem(LS) ?? 'all' } catch { return 'all' } })
  const setChain = (c: string) => { setChainRaw(c); try { localStorage.setItem(LS, c) } catch { /* private mode */ } }
  const [viewAs, setViewAs] = React.useState<string | undefined>(() => new URLSearchParams(location.search).get('as') ?? undefined)
  const { address, isConnected } = useAccount()
  const chainIds = chain === 'all' ? CHAINS.map((c) => c.id) : [chain]
  const account = viewAs && /^0x[0-9a-fA-F]{40}$/.test(viewAs) ? viewAs : address
  return <Ctx.Provider value={{ chain, setChain, chainIds, account, viewAs, setViewAs, isConnected }}>{children}</Ctx.Provider>
}
export const useApp = () => { const c = React.useContext(Ctx); if (!c) throw new Error('AppProvider missing'); return c }
