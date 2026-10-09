import React from 'react'
import { encode } from 'uqr'
import { useAccount, useDisconnect } from 'wagmi'
import { useApp } from '../state/AppState'
import { useModalChrome } from '../ui/useModalChrome'
import { readTouch } from '../ui/useViewport'
import { isAddr } from '../model/address'
import { SOCIAL_LINKS_READY } from '../social/api'
import { useSolWallet, type StdWallet } from './solana'
import type { Connector } from 'wagmi'
import { useConnectFlow, type ConnectFlow } from './useConnectFlow'
import { forgetWallet } from './deeplink'
import { WALLETS } from './wallets'
import { HAS_WC } from './wc'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/**
 * The wallet dialog.
 *
 * On a phone browser this is the whole product: without a deep link into a
 * wallet app there is no way to sign, and the app can only be read. The states
 * are ordered by how good the outcome is — an injected provider (a wallet's own
 * in-app browser) beats a hand-off, and a hand-off beats a QR code.
 */
/**
 * `onPick`: opened by the beta gate to choose the wallet that joins or signs in.
 * Nothing is taken for granted there: a wallet the app reconnected on its own
 * is offered as "Continue with …", never used unasked, and viewing as someone
 * (which cannot sign) is left out.
 */
export function ConnectSheet({ onClose, onPick }: { onClose: () => void; onPick?: (address: string) => void }) {
  const gate = !!onPick
  const { viewAs, setViewAs } = useApp()
  const box = React.useRef<HTMLDivElement>(null)
  useModalChrome(box, true, onClose)
  const touch = readTouch()
  const f = useConnectFlow()
  const sol = useSolWallet()
  const { isConnected: evmConnected } = useAccount()

  return (
    <div className="scrim" onPointerDown={onClose}>
      <div className="modal wallets" ref={box} tabIndex={-1} onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Wallet">
        <div className="th"><span className="n">Wallets</span><span className="sp" /><button className="x" onClick={onClose} aria-label="Close">✕</button></div>
        <p className="foot" style={{ margin: 0, padding: '10px 16px 0' }}>One wallet per chain family: an EVM wallet for Ethereum and its rollups, a Solana wallet for Solana. Both can be connected at once.</p>
        <EvmSection f={f} touch={touch} onPick={onPick} />
        <SolanaSection onPick={onPick} />
        {SOCIAL_LINKS_READY && evmConnected && !!sol.account && (
          <div className="tsec"><p className="foot" style={{ margin: 0 }}>These two wallets can share one profile — <a href="#/me">link them</a>.</p></div>
        )}
        {!gate && <div className="tsec">
          <span className="lbl">View as</span>
          <ViewAs value={viewAs} onApply={setViewAs} />
          <p className="foot" style={{ marginTop: 6 }}>Read any wallet's positions without connecting. Signing still needs a wallet.</p>
        </div>}
      </div>
    </div>
  )
}

/** The section's head: which family, and a green dot once a wallet of it is connected. */
function VmHead({ word, on, via }: { word: string; on: boolean; via?: string }) {
  return (
    <div className="vm-h">
      <span className={on ? 'dot' : 'dot off'} />
      <span className="lbl">{word}</span>
      <span className="sp" />
      {via && <span className="foot">{via}</span>}
    </div>
  )
}

/**
 * The EVM wallet: the connected one (address, Disconnect — or "Continue with" at
 * the gate), else the EVM wallets this browser announces and WalletConnect.
 */
function EvmSection({ f, touch, onPick }: { f: ConnectFlow; touch: boolean; onPick?: (address: string) => void }) {
  const { address, isConnected, connector: active } = useAccount()
  const { disconnect } = useDisconnect()
  return (
    <div className="tsec vm">
      <VmHead word="EVM wallet" on={isConnected} via={active ? `${active.name}` : undefined} />
      {isConnected && address && onPick ? (
        <div className="actions">
          <button className="btn pri" onClick={() => onPick(address)}>Continue with {short(address)}</button>
          <button className="btn" onClick={() => { disconnect(); forgetWallet() }}>Use a different wallet</button>
        </div>
      ) : isConnected && address ? (
        <div className="vm-on">
          <span className="addr">{short(address)}</span>
          <span className="sp" />
          <button className="btn sm" onClick={() => { disconnect(); forgetWallet() }}>Disconnect</button>
        </div>
      ) : f.phase === 'waiting' && f.picked ? (
        <Waiting name={f.picked.name} onReopen={f.reopen} onBack={f.cancel} />
      ) : (
        <Choose f={f} touch={touch} vm="evm" />
      )}
      {f.error && !isConnected && <p className="err" style={{ margin: '8px 0 0' }}>{f.error.message.split('\n')[0]}</p>}
    </div>
  )
}

/**
 * The Solana wallet — one per VM, beside the EVM one, never instead of it
 * (docs/solana.md §5). Wallet-standard discovery only finds extensions in THIS
 * browser (Phantom, Solflare, Backpack); a phone connects from the wallet
 * app's own browser.
 */
function SolanaSection({ onPick }: { onPick?: (address: string) => void }) {
  const sol = useSolWallet()
  const f = useConnectFlow()
  return (
    <div className="tsec vm">
      <VmHead word="Solana wallet" on={!!sol.account} via={sol.wallet?.name} />
      {sol.account && onPick ? (
        <div className="actions">
          <button className="btn pri" onClick={() => onPick(sol.account!.address)}>Continue with {short(sol.account.address)}</button>
          <button className="btn" onClick={() => sol.disconnect()}>Use a different wallet</button>
        </div>
      ) : sol.account ? (
        <div className="vm-on">
          <span className="addr">{short(sol.account.address)}</span>
          <span className="sp" />
          <button className="btn sm" onClick={() => sol.disconnect()}>Disconnect</button>
        </div>
      ) : (
        <Choose f={f} touch={false} vm="sol" />
      )}
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

/** One row per wallet, whichever VMs it speaks: the EIP-6963 announcements and the Wallet Standard ones, merged by name. */
interface Row { key: string; name: string; icon?: string; evm?: Connector; sol?: StdWallet }
const rowKey = (name: string) => name.toLowerCase().replace(/\s*wallet$/, '').trim()
function mergeWallets(evm: Connector[], sol: StdWallet[]): Row[] {
  const rows = new Map<string, Row>()
  for (const c of evm) {
    const key = rowKey(c.name)
    rows.set(key, { key, name: c.name, icon: c.icon, evm: c })
  }
  for (const w of sol) {
    const key = rowKey(w.name)
    const r = rows.get(key)
    if (r) { r.sol = w; r.icon ||= w.icon }
    else rows.set(key, { key, name: w.name, icon: w.icon, sol: w })
  }
  return [...rows.values()]
}

const WcIcon = () => (
  <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#3b99fc" /><path d="M9.6 12.9c3.5-3.4 9.3-3.4 12.8 0l.4.4a.4.4 0 0 1 0 .6l-1.5 1.4a.2.2 0 0 1-.3 0l-.6-.6c-2.5-2.4-6.5-2.4-9 0l-.6.6a.2.2 0 0 1-.3 0l-1.5-1.4a.4.4 0 0 1 0-.6zm15.8 2.9 1.3 1.3a.4.4 0 0 1 0 .6l-5.9 5.7a.4.4 0 0 1-.6 0l-4.2-4a.1.1 0 0 0-.2 0l-4.2 4a.4.4 0 0 1-.6 0l-5.9-5.7a.4.4 0 0 1 0-.6l1.3-1.3a.4.4 0 0 1 .6 0l4.2 4a.1.1 0 0 0 .2 0l4.2-4a.4.4 0 0 1 .6 0l4.2 4a.1.1 0 0 0 .2 0l4.2-4a.4.4 0 0 1 .6 0z" fill="#fff" /></svg>
)

function Choose({ f, touch, vm }: { f: ConnectFlow; touch: boolean; vm: 'evm' | 'sol' }) {
  const sol = useSolWallet()
  const rows = React.useMemo(() => mergeWallets(f.injected, sol.wallets).filter((r) => (vm === 'evm' ? !!r.evm : !!r.sol)), [f.injected, sol.wallets, vm])
  const [wc, setWc] = React.useState(false)
  const [picked, setPicked] = React.useState<string>()
  /**
   * The WalletConnect pairing is a pending connect until a phone scans it —
   * it must not grey out the extensions beside it (that is exactly what the
   * old sheet did: the QR auto-started and every injected tile sat disabled).
   */
  const busy = vm === 'evm' && f.isPending && !wc
  const toggleWc = () => { if (wc) f.cancel(); setWc(!wc) }
  const go = (r: Row) => {
    setPicked(r.name)
    if (vm === 'evm') { if (wc) { f.cancel(); setWc(false) } f.connect({ connector: r.evm! }) }
    else void sol.connect(r.sol!).catch(() => {})
  }
  const hasWc = vm === 'evm' && HAS_WC
  return (
    <>
      <div className="wl">
        {rows.map((r) => (
          <button key={r.key} className="wl-row" disabled={busy} onClick={() => go(r)}>
            {r.icon ? <img className="wl-ic" src={r.icon} alt="" /> : <span className="wl-ic wl-ic-x">{r.name[0]}</span>}
            <span className="wl-n">{r.name}</span>
            <span className="wl-vm static">connect</span>
          </button>
        ))}
        {hasWc && (
          <button className={`wl-row${wc ? ' on' : ''}`} disabled={busy} onClick={toggleWc}>
            <WcIcon />
            <span className="wl-n">WalletConnect<small>{touch ? 'Open a wallet app on this phone' : 'Scan with your phone'}</small></span>
            <span className="wl-vm static">connect</span>
          </button>
        )}
      </div>
      {wc && hasWc && (touch ? (
        <div className="wl" style={{ marginTop: 8 }}>
          {WALLETS.map((w) => (
            <button key={w.id} className="wl-row sub" disabled={busy} onClick={() => f.pick(w)}><span className="wl-n">{w.name}</span><span className="wl-vm static">open</span></button>
          ))}
          <p className="foot" style={{ margin: '4px 0 0' }}>Not listed? Connect from your wallet's own browser.</p>
        </div>
      ) : <Qr f={f} />)}
      {!rows.length && vm === 'sol' && <p className="foot" style={{ margin: '4px 0 0' }}>No Solana wallet extension in this browser (Phantom, Solflare, Backpack…). On a phone, open this page in the wallet app's browser.</p>}
      {!rows.length && vm === 'evm' && !HAS_WC && (
        <p className="foot" style={{ marginTop: 8 }}>No wallet in this browser, and WalletConnect is not configured on this build. Open this page inside your wallet app's browser, or set <span className="mono">VITE_WC_PROJECT_ID</span> and redeploy.</p>
      )}
      {!rows.length && vm === 'evm' && HAS_WC && !wc && <p className="foot" style={{ marginTop: 8 }}>No wallet extension in this browser — use WalletConnect, or open this page in your wallet app's browser.</p>}
      {busy && picked && !f.error && (
        <p className="foot wl-wait" style={{ marginTop: 8 }}><span className="spin" /> Waiting for <b>{picked}</b> — approve the connection in the extension. <button className="lnk" onClick={f.cancel}>Cancel</button></p>
      )}
      {vm === 'sol' && sol.error && <p className="err" style={{ margin: '8px 0 0' }}>{sol.error}</p>}
    </>
  )
}

/** The desktop case: the wallet is a phone across the room. */
function Qr({ f }: { f: ConnectFlow }) {
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
    <div className="wl-qr">
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
  const bad = trimmed !== '' && !isAddr(trimmed)
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
          placeholder="0x… or a Solana address"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apply() }}
        />
        <button className="max" onClick={apply} disabled={bad}>{trimmed ? 'Use' : 'Clear'}</button>
      </div>
      {bad && <p className="err" style={{ margin: '6px 0 0' }}>That is not a 0x or Solana address.</p>}
    </>
  )
}
