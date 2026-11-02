import React from 'react'

/**
 * What the shared ticket machinery and the social writer need from the app they run in, and nothing else: a scratchpad
 * that survives a trip to the wallet app, and the wallet's own hand-offs. The web fills it from
 * `sessionStorage`, its deep links and the Wallet Standard (`packages/web/src/state/platform.tsx`);
 * the phone from its own storage and AppKit.
 */
export interface Platform {
  /** per-session key/value text (the web's `sessionStorage`): ticket inputs, a ladder in flight */
  scratch: { get: (k: string) => string | null; set: (k: string, v: string) => void; remove: (k: string) => void }
  /** bring the wallet forward — called synchronously in the tap, before any await (iOS only follows a live gesture) */
  openWallet: (connectorId?: string) => void
  /** the request went out to a wallet in another app: the button brings it back instead of waiting disabled */
  isRemote: (connectorId?: string) => boolean
  /** a hook, the same function every render: switch the wallet to a chain */
  useSwitchTo: () => { switchTo: (chainId: number) => Promise<void>; switching: boolean }
  /** a hook, the same function every render: the connected Solana wallet */
  useSol: () => { account?: { address: string } | null }
  /** sign and send one serialized Solana transaction with the connected Solana wallet → its signature */
  solSignAndSend: (tx: Uint8Array) => Promise<Uint8Array>
  /** sign a text message with the connected Solana wallet (ed25519) → its signature: a Solana author's social writes */
  solSignMessage: (message: string) => Promise<Uint8Array>
  /**
   * a hook, the same function every render: an EVM key this app holds itself — the phone's paper
   * account — that signs social writes when no wallet is connected. Absent where the app's own
   * keys ride in as a wallet connector (the web's paper account).
   */
  useLocalSigner?: () => { address: string; signTypedData: (td: { domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }) => Promise<string> } | null
  /** real trading is behind the closed beta here (tickets/0002): a swap or bridge with a real wallet is refused */
  gated: () => boolean
}

const Ctx = React.createContext<Platform | null>(null)
export function PlatformProvider({ value, children }: { value: Platform; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export const usePlatform = () => {
  const c = React.useContext(Ctx)
  if (!c) throw new Error('PlatformProvider missing')
  return c
}
