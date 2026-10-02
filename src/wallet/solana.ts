/**
 * The Solana wallet, over the Wallet Standard (docs/solana.md §D).
 *
 * No SDK: the standard is a ~30-line window-event protocol — the app
 * announces itself (`wallet-standard:app-ready`) and every installed wallet
 * (Phantom, Solflare, Backpack, …) hands over its wallet object; each exposes
 * `standard:connect`, `solana:signAndSendTransaction` and
 * `solana:signMessage` features. Pulling `@solana/web3.js` in for this would
 * be hundreds of kB for calls the wallet makes itself; what little encoding
 * the app needs (base58) lives in `model/address.ts`.
 *
 * One store outside React (like `sdk/txTrace.ts`): the connected account
 * survives whichever sheet opened it, and `useSolWallet` is a
 * `useSyncExternalStore` view of it. One account per VM (plan decision 5):
 * this is the Solana one; wagmi keeps the EVM one; the page's chain decides
 * which one is "you".
 */
import { useSyncExternalStore } from 'react'

// --------------------------------------------------------- wallet-standard shapes (the parts used)
export interface SolAccount {
  address: string
  publicKey: Uint8Array
  chains: readonly string[]
  features: readonly string[]
}
interface ConnectFeature { connect(input?: { silent?: boolean }): Promise<{ accounts: readonly SolAccount[] }> }
interface DisconnectFeature { disconnect(): Promise<void> }
interface EventsFeature { on(event: 'change', cb: (p: { accounts?: readonly SolAccount[] }) => void): () => void }
interface SignAndSendFeature {
  signAndSendTransaction(input: { transaction: Uint8Array; account: SolAccount; chain: string }): Promise<readonly { signature: Uint8Array }[]>
}
interface SignMessageFeature {
  signMessage(input: { message: Uint8Array; account: SolAccount }): Promise<readonly { signature: Uint8Array }[]>
}
export interface StdWallet {
  name: string
  icon: string
  chains: readonly string[]
  accounts: readonly SolAccount[]
  features: Record<string, unknown>
}
const feature = <T,>(w: StdWallet, name: string) => w.features[name] as T | undefined

export const SOLANA_MAINNET = 'solana:mainnet'
/** A wallet this app can use: it talks Solana mainnet and can connect and sign-and-send. */
const usable = (w: StdWallet) =>
  w.chains.some((c) => c === SOLANA_MAINNET) && !!feature(w, 'standard:connect') && !!feature(w, 'solana:signAndSendTransaction')

// --------------------------------------------------------- discovery
interface State {
  wallets: StdWallet[]
  wallet: StdWallet | null
  account: SolAccount | null
  /** connect() rejected or threw — shown in the sheet, cleared on the next attempt */
  error: string | null
}
let state: State = { wallets: [], wallet: null, account: null, error: null }
const subs = new Set<() => void>()
const emit = () => { for (const f of subs) f() }
const set = (p: Partial<State>) => { state = { ...state, ...p }; emit() }

const LS = 'yieldcircle.solwallet'
const remembered = () => { try { return localStorage.getItem(LS) ?? undefined } catch { return undefined } }
const remember = (name: string | null) => { try { name ? localStorage.setItem(LS, name) : localStorage.removeItem(LS) } catch { /* private mode */ } }

function registered(w: StdWallet) {
  if (!usable(w) || state.wallets.some((x) => x.name === w.name)) return
  state = { ...state, wallets: [...state.wallets, w] }
  // the wallet remembered from last session reconnects silently; a decline is simply "not connected"
  if (!state.account && w.name === remembered()) void connectSol(w, true).catch(() => {})
  // account changes (switch in the wallet's own UI, revoke) land in the store
  feature<EventsFeature>(w, 'standard:events')?.on('change', (p) => {
    if (state.wallet?.name !== w.name || !p.accounts) return
    const a = p.accounts.find((x) => x.chains.some((c) => c === SOLANA_MAINNET)) ?? p.accounts[0] ?? null
    set({ account: a ?? null, ...(a ? {} : { wallet: null }) })
  })
  emit()
}
let started = false
function start() {
  if (started || typeof window === 'undefined') return
  started = true
  const api = { register: (...ws: StdWallet[]) => { ws.forEach(registered); return () => {} } }
  window.addEventListener('wallet-standard:register-wallet', (e) => {
    try { (e as CustomEvent<(a: typeof api) => void>).detail(api) } catch { /* a misbehaving wallet is not this app's crash */ }
  })
  try { window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api })) } catch { /* old browser */ }
}

// --------------------------------------------------------- connect / disconnect
export async function connectSol(w: StdWallet, silent = false): Promise<SolAccount | null> {
  set({ error: null })
  try {
    const r = await feature<ConnectFeature>(w, 'standard:connect')!.connect(silent ? { silent: true } : undefined)
    const a = r.accounts.find((x) => x.chains.some((c) => c === SOLANA_MAINNET)) ?? r.accounts[0] ?? null
    if (a) { set({ wallet: w, account: a }); remember(w.name) }
    return a
  } catch (e) {
    if (!silent) set({ error: (e as Error).message || 'the wallet declined' })
    throw e
  }
}
export function disconnectSol() {
  const w = state.wallet
  set({ wallet: null, account: null, error: null })
  remember(null)
  void (w && feature<DisconnectFeature>(w, 'standard:disconnect')?.disconnect().catch(() => {}))
}

// --------------------------------------------------------- signing
/**
 * Sign and send one serialized transaction (the API's base64 `transaction`
 * field, decoded). The wallet sets the signature and broadcasts; the base58
 * signature that comes back is what `txTrace` follows. The blob PERISHES
 * (~60–90 s blockhash): on an expiry error the caller re-calls the action
 * endpoint for a fresh one — never this function with the old bytes.
 */
export async function solSignAndSend(tx: Uint8Array): Promise<Uint8Array> {
  const { wallet, account } = state
  if (!wallet || !account) throw new Error('connect a Solana wallet first')
  const out = await feature<SignAndSendFeature>(wallet, 'solana:signAndSendTransaction')!.signAndSendTransaction({ transaction: tx, account, chain: SOLANA_MAINNET })
  if (!out[0]?.signature) throw new Error('the wallet returned no signature')
  return out[0].signature
}
/** ed25519 over a UTF-8 message — the Solana half of a social write, once the service accepts it (plan §F). */
export async function solSignMessage(message: string): Promise<Uint8Array> {
  const { wallet, account } = state
  if (!wallet || !account) throw new Error('connect a Solana wallet first')
  const f = feature<SignMessageFeature>(wallet, 'solana:signMessage')
  if (!f) throw new Error(`${wallet.name} cannot sign messages`)
  const out = await f.signMessage({ message: new TextEncoder().encode(message), account })
  if (!out[0]?.signature) throw new Error('the wallet returned no signature')
  return out[0].signature
}

// --------------------------------------------------------- the React view
const subscribe = (f: () => void) => { start(); subs.add(f); return () => { subs.delete(f) } }
const snapshot = () => state
/** The discovered wallets and the connected Solana account. Mounting anywhere starts discovery. */
export function useSolWallet(): State & { connect: typeof connectSol; disconnect: typeof disconnectSol } {
  const s = useSyncExternalStore(subscribe, snapshot)
  return { ...s, connect: connectSol, disconnect: disconnectSol }
}
/** The connected Solana address outside React (ladder callbacks, txTrace). */
export const solAddress = () => state.account?.address
