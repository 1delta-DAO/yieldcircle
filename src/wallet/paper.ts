/**
 * The paper account as a wallet (tickets/0006 §B, §J): a wagmi connector for its EVM key and a
 * wallet-standard object for its Solana key, so everything that reads `useAccount` or
 * `useSolWallet` — the social signer, the chip, `isMe`, every ticket's `actor` — sees a connected
 * wallet and needs no paper branch. Both SIGN (social writes, paper ops) and both REFUSE to send:
 * a paper account never moves anything on chain.
 *
 * The session (the derived keys, never the password) lives in localStorage when "stay signed in"
 * is on, else sessionStorage; signing out wipes both.
 */
import { createConnector } from 'wagmi'
import { getAddress, numberToHex, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { useSyncExternalStore } from 'react'
import { connectSol, disconnectSol, solAddress, SOLANA_MAINNET, type SolAccount, type StdWallet } from './solana'
import { solPublicKey, solSign, type PaperKeys } from './paperKey'

// ----------------------------------------------------------------- the session
const LS = 'yieldcircle.paper.session'
let session: PaperKeys | null = read()
const subs = new Set<() => void>()
function read(): PaperKeys | null {
  for (const st of [() => localStorage, () => sessionStorage]) {
    try { const v = JSON.parse(st().getItem(LS) ?? 'null') as PaperKeys | null; if (v?.evmKey && v.evm && v.solKey && v.sol) return v } catch { /* private mode */ }
  }
  return null
}
const emit = () => { for (const f of subs) f() }
export const paperSession = () => session
export function setPaperSession(k: PaperKeys | null, remember = true) {
  session = k
  try { localStorage.removeItem(LS); sessionStorage.removeItem(LS) } catch { /* private mode */ }
  if (k) try { (remember ? localStorage : sessionStorage).setItem(LS, JSON.stringify(k)) } catch { /* private mode */ }
  emit()
}
export function usePaperSession(): PaperKeys | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => session)
}
/** Is this address one of the signed-in paper account's two? */
export const isPaperAddress = (a: string | undefined) => !!a && !!session && (a.toLowerCase() === session.evm || a === session.sol)

export const PAPER_CONNECTOR_ID = 'paper'
const REFUSE = 'A paper account never sends a transaction: nothing goes on chain.'

// ----------------------------------------------------------------- EVM: a wagmi connector
type Provider = { request: (a: { method: string; params?: unknown }) => Promise<unknown> }
export function paperConnector() {
  let chainId = 1
  let connected = false
  return createConnector<Provider>((config) => ({
    id: PAPER_CONNECTOR_ID,
    name: 'Paper account',
    type: 'paper',
    async setup() { chainId = config.chains[0].id },
    async connect({ chainId: want, withCapabilities } = {}) {
      if (!session) throw new Error('Sign in to a paper account first.')
      if (want && config.chains.some((c) => c.id === want)) chainId = want
      connected = true
      const a = getAddress(session.evm)
      return { accounts: (withCapabilities ? [{ address: a, capabilities: {} }] : [a]) as never, chainId }
    },
    async disconnect() { connected = false },
    async getAccounts() { return session && connected ? [getAddress(session.evm)] : [] },
    async getChainId() { return chainId },
    async isAuthorized() { return !!session },
    async switchChain({ chainId: id }) {
      const chain = config.chains.find((c) => c.id === id)
      if (!chain) throw new Error(`chain ${id} is not configured`)
      chainId = id
      config.emitter.emit('change', { chainId: id })
      return chain
    },
    onAccountsChanged(accounts) { if (!accounts.length) this.onDisconnect(); else config.emitter.emit('change', { accounts: accounts.map((a) => getAddress(a)) }) },
    onChainChanged(c) { config.emitter.emit('change', { chainId: Number(c) }) },
    onDisconnect() { connected = false; config.emitter.emit('disconnect') },
    async getProvider() {
      const request: Provider['request'] = async ({ method, params }) => {
        const p = (params ?? []) as unknown[]
        switch (method) {
          case 'eth_accounts': case 'eth_requestAccounts': return session ? [getAddress(session.evm)] : []
          case 'eth_chainId': return numberToHex(chainId)
          case 'wallet_switchEthereumChain': { chainId = Number((p[0] as { chainId: Hex }).chainId); config.emitter.emit('change', { chainId }); return null }
          case 'eth_signTypedData_v4': {
            if (!session) throw new Error('not signed in')
            const td = JSON.parse(p[1] as string) as { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }
            const { EIP712Domain: _, ...types } = td.types
            return privateKeyToAccount(session.evmKey).signTypedData({ domain: td.domain, types, primaryType: td.primaryType, message: td.message } as never)
          }
          case 'personal_sign': {
            if (!session) throw new Error('not signed in')
            return privateKeyToAccount(session.evmKey).signMessage({ message: { raw: p[0] as Hex } })
          }
          case 'eth_sendTransaction': case 'eth_sendRawTransaction': case 'wallet_sendCalls': case 'eth_signTransaction':
            throw new Error(REFUSE)
          default: throw new Error(`The paper account does not answer ${method}.`)
        }
      }
      return { request }
    },
  }))
}

// ----------------------------------------------------------------- Solana: a wallet-standard object
const ICON = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#f4b740"/><path d="M10 9h9l3 3v11H10z" fill="#fff"/></svg>')
function solWallet(k: PaperKeys): StdWallet {
  const account: SolAccount = { address: k.sol, publicKey: solPublicKey(k.solKey), chains: [SOLANA_MAINNET], features: ['solana:signMessage'] }
  return {
    name: 'Paper account', icon: ICON, chains: [SOLANA_MAINNET], accounts: [account],
    features: {
      'standard:connect': { connect: async () => ({ accounts: [account] }) },
      'standard:disconnect': { disconnect: async () => {} },
      'solana:signMessage': { signMessage: async ({ message }: { message: Uint8Array }) => [{ signature: solSign(k.solKey, message) }] },
      'solana:signAndSendTransaction': { signAndSendTransaction: async () => { throw new Error(REFUSE) } },
    },
  }
}
/** Connect the paper Solana key into the app's Solana slot (unless that slot already holds it). */
export async function connectPaperSol(k: PaperKeys) {
  if (solAddress() === k.sol) return
  await connectSol(solWallet(k))
}
/** Drop the Solana slot if it is the paper account's. */
export function disconnectPaperSol(k: PaperKeys | null) {
  if (k && solAddress() === k.sol) disconnectSol()
}
