import React from 'react'
import { useConnect, useDisconnect } from 'wagmi'
import { useApp } from '../state/AppState'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
/** Connect / disconnect, plus a "view as" address so positions can be read without a wallet. */
export function ConnectButton() {
  const { account, isConnected, viewAs, setViewAs } = useApp()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => { if (isConnected) setOpen(false) }, [isConnected])
  return (
    <>
      <button className={`btn sm ${account ? '' : 'pri'}`} onClick={() => setOpen(true)} title={account}>
        {account ? <><span className="dot" /><span className="addr">{short(account)}</span>{viewAs && <span className="t50"> · view</span>}</> : 'Connect wallet'}
      </button>
      {open && (
        <div className="scrim" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Wallet">
            <div className="th"><span className="n">Wallet</span><span className="sp" /><button className="x" onClick={() => setOpen(false)} aria-label="Close">✕</button></div>
            <div className="tsec">
              {isConnected ? (
                <div className="actions"><span className="addr" style={{ alignSelf: 'center' }}>{short(account ?? '')}</span><button className="btn" onClick={() => { disconnect(); setOpen(false) }}>Disconnect</button></div>
              ) : (
                <div className="actions" style={{ flexDirection: 'column' }}>
                  {connectors.map((c) => <button key={c.uid} className="btn pri" disabled={isPending} onClick={() => connect({ connector: c })}>{c.name}</button>)}
                  {connectors.length <= 1 && <p className="foot">Only the browser's injected wallet is available. On a phone, open this page inside your wallet app's browser.</p>}
                </div>
              )}
            </div>
            <div className="tsec">
              <span className="lbl">View as</span>
              <div className="amt" style={{ minHeight: 40 }}><input placeholder="0x… read positions without connecting" defaultValue={viewAs ?? ''} style={{ fontSize: 13 }} onBlur={(e) => setViewAs(e.target.value.trim() || undefined)} /></div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
