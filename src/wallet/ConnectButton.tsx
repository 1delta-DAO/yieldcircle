import React from 'react'
import { useApp } from '../state/AppState'
import { ConnectSheet } from './ConnectSheet'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
/** On a phone the header has four other things in it; the last four characters identify the account well enough. */
const tiny = (a: string) => `…${a.slice(-4)}`

/**
 * The trigger. Everything the dialog does lives in `ConnectSheet`, which is
 * mounted only while it is open — it holds the WalletConnect listeners.
 */
export function ConnectButton({ compact }: { compact?: boolean }) {
  const { account, viewAs } = useApp()
  const [open, setOpen] = React.useState(false)
  const { isConnected } = useApp()
  React.useEffect(() => { if (isConnected) setOpen(false) }, [isConnected])
  return (
    <>
      <button className={`btn sm ${account ? '' : 'pri'}`} onClick={() => setOpen(true)} title={account} aria-label={account ? 'Wallet' : 'Connect wallet'}>
        {account
          ? <><span className="dot" /><span className="addr">{compact ? tiny(account) : short(account)}</span>{viewAs && !compact && <span className="t50"> · view</span>}</>
          : compact ? 'Connect' : 'Connect wallet'}
      </button>
      {open && <ConnectSheet onClose={() => setOpen(false)} />}
    </>
  )
}
