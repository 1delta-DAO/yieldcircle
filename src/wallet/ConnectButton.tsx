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
  const { account, viewAs, signer, solSigner } = useApp()
  const [open, setOpen] = React.useState(false)
  const { isConnected } = useApp()
  React.useEffect(() => { if (isConnected) setOpen(false) }, [isConnected])
  return (
    <>
      <button className={`btn sm ${account ? '' : 'pri'}`} onClick={() => setOpen(true)} title={account} aria-label={account ? 'Wallet' : 'Connect wallet'}>
        {account && !compact
          ? <Wallets signer={signer} solSigner={solSigner} viewAs={viewAs} account={account} />
          : account
          ? <><span className="dot" /><span className="addr">{compact ? tiny(account) : short(account)}</span>{viewAs && !compact && <span className="t50"> · view</span>}</>
          : compact ? 'Connect' : 'Connect wallet'}
      </button>
      {open && <ConnectSheet onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * In the profile sheet there is room to say every wallet that is connected —
 * one per VM — rather than only the one that leads, so a Solana wallet behind
 * the EVM one is not invisible.
 */
function Wallets({ signer, solSigner, viewAs, account }: { signer?: string; solSigner?: string; viewAs?: string; account: string }) {
  const rows: { vm: string; addr: string; live: boolean }[] = []
  if (viewAs) rows.push({ vm: 'View', addr: account, live: false })
  if (signer) rows.push({ vm: 'EVM', addr: signer, live: true })
  if (solSigner) rows.push({ vm: 'Solana', addr: solSigner, live: true })
  return (
    <span className="wl">
      {rows.map((r) => (
        <span key={r.vm} className="wl-row">
          <span className={r.live ? 'dot' : 'dot off'} />
          <span className="lbl">{r.vm}</span>
          <span className="sp" />
          <span className="addr">{short(r.addr)}</span>
        </span>
      ))}
    </span>
  )
}
