import React from 'react'
import { encode } from 'uqr'
import { useAccount, useDisconnect } from 'wagmi'
import { useApp } from '../state/AppState'
import { useModalChrome } from '../ui/useModalChrome'
import { readTouch } from '../ui/useViewport'
import { useConnectFlow } from './useConnectFlow'
import { forgetWallet } from './deeplink'
import { WALLETS } from './wallets'
import { HAS_WC } from './wc'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const ADDR = /^0x[0-9a-fA-F]{40}$/

/**
 * The wallet dialog.
 *
 * On a phone browser this is the whole product: without a deep link into a
 * wallet app there is no way to sign, and the app can only be read. The states
 * are ordered by how good the outcome is — an injected provider (a wallet's own
 * in-app browser) beats a hand-off, and a hand-off beats a QR code.
 */
export function ConnectSheet({ onClose }: { onClose: () => void }) {
  const { account, isConnected, viewAs, setViewAs } = useApp()
  const { connector: active } = useAccount()
  const { disconnect } = useDisconnect()
  const box = React.useRef<HTMLDivElement>(null)
  useModalChrome(box, true, onClose)
  const touch = readTouch()
  const f = useConnectFlow()

  return (
    <div className="scrim" onPointerDown={onClose}>
      <div className="modal" ref={box} tabIndex={-1} onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Wallet">
        <div className="th"><span className="n">Wallet</span><span className="sp" /><button className="x" onClick={onClose} aria-label="Close">✕</button></div>

        {isConnected ? (
          <div className="tsec">
            <div className="actions">
              <span className="addr" style={{ alignSelf: 'center' }}>{short(account ?? '')}</span>
              <button className="btn" onClick={() => { disconnect(); forgetWallet(); onClose() }}>Disconnect</button>
            </div>
          </div>
        ) : f.phase === 'waiting' && f.picked ? (
          <Waiting name={f.picked.name} onReopen={f.reopen} onBack={f.cancel} />
        ) : (
          <Choose f={f} touch={touch} />
        )}

        {f.error && !isConnected && (
          <div className="tsec"><p className="err" style={{ margin: 0 }}>{f.error.message.split('\n')[0]}</p></div>
        )}

        <div className="tsec">
          <span className="lbl">View as</span>
          <ViewAs value={viewAs} onApply={setViewAs} />
          <p className="foot" style={{ marginTop: 6 }}>Read any wallet's positions without connecting. Signing still needs a wallet.</p>
        </div>
        {active && <div className="tsec"><p className="foot" style={{ margin: 0 }}>Connected with {active.name}.</p></div>}
      </div>
    </div>
  )
}

/** After the hand-off: the browser stays on this screen while the wallet is in front. */
function Waiting({ name, onReopen, onBack }: { name: string; onReopen: () => void; onBack: () => void }) {
  return (
    <div className="tsec wc-wait">
      <p className="plain">Approve the connection in <b>{name}</b>, then come back to this tab.</p>
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="btn pri" onClick={onReopen}>Open {name} again</button>
        <button className="btn" onClick={onBack}>Use a different wallet</button>
      </div>
      <p className="foot" style={{ marginTop: 8 }}>iOS drops the hand-off now and then. Re-opening uses the same request, so nothing is lost.</p>
    </div>
  )
}

function Choose({ f, touch }: { f: ReturnType<typeof useConnectFlow>; touch: boolean }) {
  const hasInjected = typeof window !== 'undefined' && !!(window as { ethereum?: unknown }).ethereum
  return (
    <>
      {f.injected && hasInjected && (
        <div className="tsec">
          <button className="btn pri wide" disabled={f.isPending} onClick={() => f.connect({ connector: f.injected! })}>{f.injected.name}</button>
          <p className="foot" style={{ marginTop: 6 }}>The wallet built into this browser.</p>
        </div>
      )}

      {!HAS_WC ? (
        <div className="tsec">
          <p className="err" style={{ margin: 0 }}>WalletConnect is not configured on this build, so a phone browser cannot connect.</p>
          <p className="foot" style={{ marginTop: 6 }}>Open this page inside your wallet app's browser, or set <span className="mono">VITE_WC_PROJECT_ID</span> and redeploy.</p>
        </div>
      ) : touch ? (
        <div className="tsec">
          <span className="lbl">Connect a wallet app</span>
          <div className="wgrid">
            {WALLETS.map((w) => (
              <button key={w.id} className="wtile" disabled={f.isPending} onClick={() => f.pick(w)}>{w.name}</button>
            ))}
          </div>
          <p className="foot" style={{ marginTop: 8 }}>Not listed? Connect from your wallet's own browser.</p>
        </div>
      ) : (
        <Qr f={f} />
      )}
    </>
  )
}

/** The desktop case: the wallet is a phone across the room. */
function Qr({ f }: { f: ReturnType<typeof useConnectFlow> }) {
  const [copied, setCopied] = React.useState(false)
  /**
   * ONCE. Keying this on `!f.uri && !f.isPending` instead re-fires the moment a
   * failed attempt settles — which is an unbounded reconnect loop against the
   * relay that starves the tab, and it is silent because each attempt looks
   * like the first. A retry here is the user's decision, not a reflex.
   */
  const started = React.useRef(false)
  React.useEffect(() => {
    if (started.current || !f.wc) return
    started.current = true
    f.connect({ connector: f.wc })
  }, [f.wc, f.connect])
  const retry = () => { if (f.wc) { f.cancel(); f.connect({ connector: f.wc }) } }
  return (
    <div className="tsec">
      <span className="lbl">Scan with your wallet</span>
      {f.uri
        ? <QrSvg text={f.uri} />
        : <div className="qrbox skel" aria-label={f.error ? 'Could not reach WalletConnect' : 'Preparing'}>
            <span className="t50" style={{ fontSize: 12, padding: 12, textAlign: 'center' }}>{f.error ? 'Could not reach WalletConnect' : 'Preparing…'}</span>
          </div>}
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="btn" disabled={!f.uri} onClick={() => { if (f.uri) { void navigator.clipboard?.writeText(f.uri); setCopied(true); setTimeout(() => setCopied(false), 1500) } }}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
        {f.error && <button className="btn" onClick={retry}>Try again</button>}
      </div>
    </div>
  )
}

/** One path, no canvas, no dependency beyond the 4 kB matrix encoder. */
function QrSvg({ text }: { text: string }) {
  const d = React.useMemo(() => {
    const { size, data } = encode(text, { ecc: 'M' })
    let path = ''
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (data[y][x]) path += `M${x} ${y}h1v1h-1z`
    return { path, size }
  }, [text])
  return (
    <div className="qrbox">
      <svg viewBox={`0 0 ${d.size} ${d.size}`} width="100%" height="100%" shapeRendering="crispEdges" role="img" aria-label="WalletConnect QR code">
        <rect width={d.size} height={d.size} fill="#fff" />
        <path d={d.path} fill="#000" />
      </svg>
    </div>
  )
}

/**
 * Committing on blur alone is undiscoverable on a phone — you tap Connect and
 * the address you just typed silently disappears. Enter and an explicit Use.
 */
function ViewAs({ value, onApply }: { value?: string; onApply: (a: string | undefined) => void }) {
  const [text, setText] = React.useState(value ?? '')
  React.useEffect(() => setText(value ?? ''), [value])
  const trimmed = text.trim()
  const bad = trimmed !== '' && !ADDR.test(trimmed)
  const apply = () => { if (!bad) onApply(trimmed || undefined) }
  return (
    <>
      <div className="amt sm">
        <input
          value={text}
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          aria-label="Address to view"
          placeholder="0x…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apply() }}
        />
        <button className="max" onClick={apply} disabled={bad}>{trimmed ? 'Use' : 'Clear'}</button>
      </div>
      {bad && <p className="err" style={{ margin: '6px 0 0' }}>That is not a 0x address.</p>}
    </>
  )
}
