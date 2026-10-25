import React from 'react'

/**
 * What the shared ticket machinery needs from the app it runs in, and nothing else: a scratchpad
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
