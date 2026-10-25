/**
 * The paper account's state (tickets/0006 §B): who is signed in, the book, its prices, and `act` —
 * the one way an op happens. The book's truth is the server's (pos-indexer `paper.*`, applied with
 * the same `model/paper.ts`); the copy here is its cache, applied first so the screen answers at
 * once, and queued when the service cannot be reached.
 *
 * The paper account is a WALLET (wallet/paper.ts): signed in, it is the connected EVM account and
 * the connected Solana one, and `useBook` reads its money from here instead of the chain.
 */
import React from 'react'
import { paperId } from '@yieldcircle/core/model/paper'
import { useAccount, useConfig, useConnect, useDisconnect } from 'wagmi'
import { privateKeyToAccount } from 'viem/accounts'
import { apply, bookOf, emptyLedger, PaperError, starterOf, starterRef, tokenKey, type PaperBook, type PaperLedger, type PaperOp, type PriceFn } from '@yieldcircle/core/model/paper'
import { ledgerMeta, metaKey, paperHoldings, paperIdle, type TokenMeta } from '@yieldcircle/core/model/paperView'
import type { Holding, Idle } from '@yieldcircle/core/model/positions'
import { connectPaperSol, disconnectPaperSol, PAPER_CONNECTOR_ID, setPaperSession, usePaperSession } from '../wallet/paper'
import { solSign, type PaperKeys } from '../wallet/paperKey'
import { useSolWallet } from '../wallet/solana'
import { usePaperPrices } from '../social/queries'
import { paperBook, paperPrices, postPaperOp, type PaperOpEnvelope } from '../social/paperApi'
import * as social from '../social/api'
import { canonicalJson, DOMAIN, TYPES } from '../social/sign'
import { base58Encode } from '@yieldcircle/core/model/address'

const DAY = 86_400_000
const PAPER_TYPES = { PaperOp: [{ name: 'author', type: 'address' }, { name: 'op', type: 'string' }, { name: 'nonce', type: 'string' }, { name: 'signedAt', type: 'uint256' }] } as const
/** Fastify's own 404 (`error: 'Not Found'`): the service answers, but has no paper routes yet — not a refusal. */
export const missingRoute = (e: unknown) => (e as social.SocialError)?.status === 404 && (e as Error).message === 'Not Found'
// one id generator for ops and positions (core's, the phone uses it too)
const nonce = paperId
export { paperId }

interface Saved { ledger: PaperLedger | null; pending: PaperOpEnvelope[]; tokens: TokenMeta; skewDays: number }
const EMPTY: Saved = { ledger: null, pending: [], tokens: {}, skewDays: 0 }
const key = (a: string) => `yieldcircle.paper.${a}`
function load(a: string | undefined): Saved {
  if (!a) return EMPTY
  try { const v = JSON.parse(localStorage.getItem(key(a)) ?? 'null') as Saved | null; return v ? { ...EMPTY, ...v } : EMPTY } catch { return EMPTY }
}
function save(a: string, s: Saved) { try { localStorage.setItem(key(a), JSON.stringify(s)) } catch { /* private mode */ } }

export type PaperStatus = 'idle' | 'syncing' | 'ok' | 'offline'
interface PaperCtx {
  session: PaperKeys | null
  /** the connected account IS the paper account: every screen shows paper money */
  active: boolean
  ledger: PaperLedger | null
  book: PaperBook | null
  price: PriceFn
  pricesReady: boolean
  /** the paper clock: real time plus the preview offset — what values and accruals are shown at */
  viewNow: number
  skewDays: number
  setSkewDays: (d: number) => void
  holdings: Holding[]
  idle: (chainIds: string[]) => Idle[]
  tokens: TokenMeta
  status: PaperStatus
  /** a queued op the service refused, said once */
  notice: string | null
  clearNotice: () => void
  pending: number
  /** apply one op: here at once, then on the server. Throws with a readable reason when refused. */
  act: (op: PaperOp, names?: { chainId: string; address: string; symbol: string; decimals: number; logo?: string }[]) => Promise<PaperLedger>
  sync: () => Promise<void>
  /** sign in (or create) with derived keys; `create` also posts the profile and links the Solana key */
  signIn: (k: PaperKeys, o: { remember: boolean; create: boolean }) => Promise<void>
  signOut: () => Promise<void>
}
const Ctx = React.createContext<PaperCtx | null>(null)

/** The tokens to price, as `<chainId>:<token>`: every bank row, every bridge on its way, every position's legs. */
function wantOf(l: PaperLedger | null): string[] {
  const w = new Set<string>()
  const add = (c: string, t: string | undefined) => { if (t) w.add(`${c}:${tokenKey(c, t)}`) }
  for (const [c, b] of Object.entries(l?.bank ?? {})) for (const t of Object.keys(b)) add(c, t)
  for (const t of l?.inflight ?? []) add(t.toChainId, t.token)
  for (const p of l?.positions ?? []) { add(p.chainId, p.snap.held.address); add(p.chainId, p.snap.debt?.address); add(p.chainId, p.snap.money?.address) }
  return [...w]
}

/** Every token an op names, by chain — priced before the op is applied, so a token new to the book is valued like any other. */
function opTokens(op: PaperOp, l: PaperLedger | null): Record<string, string[]> {
  const w: Record<string, string[]> = {}
  const add = (c: string | undefined, t: string | undefined) => { if (c && t) (w[c] ??= []).push(tokenKey(c, t)) }
  const posChain = (id: string) => l?.positions.find((p) => p.id === id)?.chainId
  switch (op.t) {
    case 'topup': add(op.chainId, starterOf(op.chainId)?.dollar.address); break
    case 'swap': add(op.chainId, op.from); add(op.chainId, op.to); break
    case 'bridge': add(op.fromChainId, op.from); add(op.toChainId, op.to); break
    case 'open': add(op.chainId, op.pay.token); add(op.chainId, op.snap.held.address); add(op.chainId, op.snap.debt?.address); add(op.chainId, op.snap.money?.address); break
    case 'withdraw': add(posChain(op.id), op.receive.token); break
    case 'reduce': for (const r of op.receive) add(posChain(op.id), r.token); break
    case 'borrow': add(op.chainId, op.collateral.token); add(op.chainId, op.snap.held.address); add(op.chainId, op.snap.debt?.address); break
  }
  return w
}

export function PaperProvider({ children }: { children: React.ReactNode }) {
  const session = usePaperSession()
  const { address, connector } = useAccount()
  const config = useConfig()
  const { connectAsync } = useConnect()
  const { disconnectAsync } = useDisconnect()
  const sol = useSolWallet()
  const evm = session?.evm
  const active = !!session && address?.toLowerCase() === session.evm && connector?.id === PAPER_CONNECTOR_ID
  const [saved, setSavedRaw] = React.useState<Saved>(() => load(evm))
  const ref = React.useRef(saved)
  const setSaved = React.useCallback((s: Saved) => { ref.current = s; setSavedRaw(s); if (s.ledger?.account) save(s.ledger.account, s) }, [])
  React.useEffect(() => { const s = load(evm); ref.current = s; setSavedRaw(s) }, [evm])
  const [status, setStatus] = React.useState<PaperStatus>('idle')
  const [notice, setNotice] = React.useState<string | null>(null)
  // the value line moves while you watch: a re-render every 30 s re-accrues
  const [tick, setTick] = React.useState(0)
  React.useEffect(() => { if (!active) return; const t = setInterval(() => setTick((n) => n + 1), 30_000); return () => clearInterval(t) }, [active])

  const prices = usePaperPrices(React.useMemo(() => wantOf(saved.ledger), [saved.ledger]))
  // a starter token the feed misses (a blip, a rate limit) is shown at what it was put in at, never at nothing
  const price: PriceFn = React.useCallback((c: string, t: string) => prices.get(c, tokenKey(c, t)) ?? starterRef(c, t), [prices])

  // the Solana half rides along: signed in, the Solana slot holds the paper key unless a real Solana wallet holds it
  React.useEffect(() => { if (session && active && !sol.account) void connectPaperSol(session).catch(() => {}) }, [session?.sol, active, !!sol.account])

  // one op at a time, in order: the server applies them in the order they were signed
  const chain = React.useRef<Promise<unknown>>(Promise.resolve())
  const serial = <T,>(f: () => Promise<T>): Promise<T> => { const p = chain.current.then(f, f); chain.current = p.catch(() => {}); return p }

  const sign = async (op: PaperOp): Promise<PaperOpEnvelope> => {
    const k = session!
    const message = { author: k.evm, op: JSON.stringify(op), nonce: nonce(), signedAt: Math.floor(Date.now() / 1000) }
    const signature = await privateKeyToAccount(k.evmKey).signTypedData({ domain: DOMAIN, types: PAPER_TYPES, primaryType: 'PaperOp', message: { ...message, author: k.evm as `0x${string}`, signedAt: BigInt(message.signedAt) } })
    return { primaryType: 'PaperOp', message, signature }
  }
  /**
   * Post the queue in order. A refusal drops that op (the server's book wins) and is remembered;
   * anything else — the service down, a 429 — stops the flush and keeps the queue for later.
   */
  const flush = async (s0: Saved): Promise<{ s: Saved; refused: Map<string, string>; fromServer: boolean }> => {
    let s = s0
    let fromServer = false
    const refused = new Map<string, string>()
    while (s.pending.length) {
      const env = s.pending[0]
      try {
        const r = await postPaperOp(env)
        s = { ...s, ledger: r.ledger, pending: s.pending.slice(1) }; fromServer = true
      } catch (e) {
        const st = (e as social.SocialError).status
        // a service without the paper routes yet is a service out of reach, never a refusal
        if (st && st >= 400 && st < 500 && st !== 429 && !missingRoute(e)) { refused.set(env.message.nonce, (e as Error).message); s = { ...s, pending: s.pending.slice(1) }; continue }
        throw Object.assign(e as Error, { partial: s })
      }
    }
    if (refused.size) {
      // what was optimistic is gone: the server's book is the book
      try { const r = await paperBook(evm!); s = { ...s, ledger: r.ledger }; fromServer = true } catch { /* keep what the last answer said */ }
    }
    return { s, refused, fromServer }
  }

  const sync = React.useCallback(() => serial(async () => {
    if (!evm || !session) return
    setStatus('syncing')
    let s = ref.current
    try {
      const f = await flush(s); s = f.s
      if (f.refused.size) setNotice(`A paper action was refused by the server: ${[...f.refused.values()][0]}`)
      try {
        const r = await paperBook(evm)
        s = { ...s, ledger: r.ledger }
      } catch (e) {
        if ((e as social.SocialError).status !== 404 || missingRoute(e)) throw e
        // never seen by the server: a book made offline is sent (its genesis is first in the queue), else one is made now
        if (!s.ledger) {
          const g: PaperOp = { t: 'genesis', sol: session.sol }
          const local = apply(emptyLedger(evm, Date.now()), g, { now: Date.now(), price })
          const env = await sign(g)
          const r = await flush({ ...s, ledger: local, pending: [env] }); s = r.s
        }
      }
      setSaved(s); setStatus('ok')
    } catch (e) {
      const partial = (e as { partial?: Saved }).partial
      if (partial) setSaved(partial)
      setStatus('offline')
    }
  }), [evm, session, price]) // eslint-disable-line react-hooks/exhaustive-deps

  // signed in and connected: the server's book, then every 2 min (and a queued op retried)
  React.useEffect(() => {
    if (!active) return
    void sync()
    const t = setInterval(() => void sync(), 120_000)
    return () => clearInterval(t)
  }, [active, evm]) // eslint-disable-line react-hooks/exhaustive-deps

  const act: PaperCtx['act'] = (op, names) => serial(async () => {
    if (!session || !evm) throw new Error('Sign in to a paper account first.')
    if (ref.current.skewDays > 0) throw new Error('The paper clock is ahead (a preview). Set it back to today to trade.')
    const cur = ref.current
    // the op's own tokens, priced now: the book's feed only covers what it already holds
    const missing = Object.entries(opTokens(op, cur.ledger)).flatMap(([c, ts]) => ts.filter((t) => prices.get(c, t) == null).map((t) => `${c}:${t}`))
    const fresh = missing.length ? await paperPrices(missing).catch(() => ({} as Record<string, number | null>)) : {}
    const priceNow: PriceFn = (c, t) => price(c, t) ?? (fresh[`${c}:${tokenKey(c, t)}`] ?? undefined)
    const now = Date.now()
    let local: PaperLedger
    try { local = apply(cur.ledger ?? emptyLedger(evm, now), op, { now, price: priceNow }) }
    catch (e) { throw new Error(e instanceof PaperError ? e.message : (e as Error).message) }
    const env = await sign(op)
    const tokens = { ...cur.tokens }
    for (const n of names ?? []) tokens[metaKey(n.chainId, n.address)] = { symbol: n.symbol, decimals: n.decimals, logo: n.logo }
    let s: Saved = { ...cur, tokens, ledger: local, pending: [...cur.pending, env] }
    try {
      const f = await flush(s); s = f.s
      const why = f.refused.get(env.message.nonce)
      // refused, and no book from the server to replace it: the op never happened here either
      if (why && !f.fromServer) s = { ...s, ledger: cur.ledger }
      setSaved(s); setStatus('ok')
      if (why) throw new Error(why)
      for (const [n, m] of f.refused) if (n !== env.message.nonce) setNotice(`An earlier paper action was refused by the server: ${m}`)
    } catch (e) {
      const partial = (e as { partial?: Saved }).partial
      if (!partial) throw e
      // the service is out of reach: the op stands here and is sent when it is back
      setSaved(partial); setStatus('offline')
    }
    return ref.current.ledger!
  })

  const signIn: PaperCtx['signIn'] = async (k, o) => {
    setPaperSession(k, o.remember)
    const c = config.connectors.find((x) => x.id === PAPER_CONNECTOR_ID)
    if (!c) throw new Error('the paper connector is missing')
    await connectAsync({ connector: c })
    // a real Solana wallet keeps its slot; otherwise the paper key takes it
    if (!sol.account || sol.wallet?.name === 'Paper account') await connectPaperSol(k).catch(() => {})
    if (o.create) await createSocial(k)
  }
  const signOut: PaperCtx['signOut'] = async () => {
    const k = session
    if (connector?.id === PAPER_CONNECTOR_ID) await disconnectAsync({ connector }).catch(() => {})
    disconnectPaperSol(k)
    setPaperSession(null)
  }

  const value = React.useMemo<PaperCtx>(() => {
    const viewNow = Date.now() + saved.skewDays * DAY
    const l = saved.ledger
    const tokens = { ...ledgerMeta(l), ...saved.tokens }
    return {
      session, active, ledger: l, book: l ? bookOf(l, viewNow, price) : null, price, pricesReady: prices.ready,
      viewNow, skewDays: saved.skewDays, setSkewDays: (d) => setSaved({ ...ref.current, skewDays: Math.max(0, d) }),
      holdings: active && l ? paperHoldings(l, viewNow, price) : [],
      idle: (chainIds) => (active && l ? paperIdle(viewLedger(l, viewNow), chainIds, price, tokens) : []),
      tokens, status, notice, clearNotice: () => setNotice(null), pending: saved.pending.length,
      act, sync, signIn, signOut,
    }
  }, [session, active, saved, prices.stamp, status, notice, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
/** The bank as it stands at the paper clock: a bridge whose time is up has landed. */
function viewLedger(l: PaperLedger, at: number): PaperLedger {
  if (!l.inflight.some((t) => t.arrivesAt <= at)) return l
  const bank = Object.fromEntries(Object.entries(l.bank).map(([c, b]) => [c, { ...b }]))
  for (const t of l.inflight) if (t.arrivesAt <= at) { const b = (bank[t.toChainId] ??= {}); b[t.token] = (b[t.token] ?? 0) + t.units }
  return { ...l, bank, inflight: l.inflight.filter((t) => t.arrivesAt > at) }
}
export const usePaper = () => { const c = React.useContext(Ctx); if (!c) throw new Error('PaperProvider missing'); return c }

/**
 * A new paper account's public face: a profile with the name as its handle and the `paper` tag
 * (so every comment it writes reads as a paper account's), and its Solana key linked under it as
 * one person (docs/wallet-links.md). Both keys are at hand, so both halves are signed here.
 */
async function createSocial(k: PaperKeys) {
  const acct = privateKeyToAccount(k.evmKey)
  const at = () => Math.floor(Date.now() / 1000)
  const profile = { author: k.evm, handle: k.name, displayName: k.name, bio: '', avatarUrl: '', tags: ['paper'], visibility: 'public', nonce: nonce(), signedAt: at() }
  const ps = await acct.signTypedData({ domain: DOMAIN, types: TYPES, primaryType: 'Profile', message: { ...profile, author: k.evm as `0x${string}`, signedAt: BigInt(profile.signedAt) } } as never)
  await social.write('Profile', profile, ps)
  const n = nonce(), t = at()
  const primary = { author: k.evm, other: k.sol, otherVm: 'svm', role: 'primary', action: 'link', nonce: n, signedAt: t }
  const primarySig = await acct.signTypedData({ domain: DOMAIN, types: TYPES, primaryType: 'WalletLink', message: { ...primary, author: k.evm as `0x${string}`, signedAt: BigInt(t) } } as never)
  const member = { author: k.sol, other: k.evm, otherVm: 'evm', role: 'member', action: 'link', nonce: n, signedAt: t }
  const memberSig = base58Encode(solSign(k.solKey, new TextEncoder().encode(canonicalJson({ domain: DOMAIN, primaryType: 'WalletLink', message: member }))))
  await social.postWalletLink({ primaryType: 'WalletLink', message: primary, signature: primarySig }, { primaryType: 'WalletLink', message: member, signature: memberSig }).catch(() => { /* the profile stands; the link can be made from #/me */ })
}
