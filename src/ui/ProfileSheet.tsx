/**
 * Everything about the reader, behind their face in the top-left corner:
 * who they are, their page, their alerts, the wallet, and the two settings
 * that shape every list — which chains, and how curated the menu is.
 *
 * These were six things in the header (face, bell, chain row, gear, wallet
 * button, and the profile editor one page away). None of them is a place you
 * go; they are about you, so they live together, one tap from anywhere.
 */
import React from 'react'
import { marketHref, useApp, walletHref } from '../state/AppState'
import { useProfile, useProfiles } from '../social/queries'
import { entryKey, usePending } from '../social/pending'
import { labelFor } from '../identity/name'
import { parseLoopKey } from '../model/uid'
import { ConnectButton } from '../wallet/ConnectButton'
import { Who } from './social-bits'
import { ChainList } from './ChainPicker'
import { SettingsPanel } from './SettingsPanel'
import { useUnseen } from './Alerts'
import { MyStats } from './Stats'
import { useSettings } from '../state/Settings'

export function ProfileSheet() {
  const { account, signer, solSigner, viewAs, allChains, chainLabelFor } = useApp()
  const { widened } = useSettings()
  const p = useProfile(account)
  return (
    <div className="ps">
      <div className="ps-head">
        {account ? (
          <>
            <Who account={account} profile={p.data?.profile} size={44} plain sub={viewAs && !signer ? 'viewing as' : undefined} />
            <MyStats account={account} />
          </>
        ) : (
          <p className="ps-p">Connect a wallet to follow people, get alerts and see your own positions. Reading everyone else needs nothing.</p>
        )}
        <div className="ps-wallet"><ConnectButton /></div>
      </div>

      {account && (
        <nav className="ps-links" aria-label="You">
          <a href={walletHref(account)}>My page<span className="sp" />›</a>
          {signer && <a href="#/me">Edit profile<span className="sp" />›</a>}
          {signer && <AlertsLink />}
        </nav>
      )}

      <Fold label="Chains" state={allChains ? 'All chains' : chainLabelFor()} on={!allChains}><ChainList /></Fold>
      <Fold label="Filters" state={widened ? `${widened} widened` : 'Curated'} on={widened > 0}><SettingsPanel /></Fold>
      {/* a Solana-only wallet follows the same way: its queue is signed ed25519 */}
      {(signer ?? solSigner) && <PendingChanges />}
    </div>
  )
}

/** A setting that says its value while closed — fifteen chains need not push the filters off the screen. */
function Fold({ label, state, on, children }: { label: string; state: string; on: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <section className="ps-sec">
      <button className="ps-fold" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="lbl">{label}</span>
        <span className={`ps-state${on ? ' on' : ''}`}>{state}</span>
        <span className="sp" />
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden><path d="M2 4.2 6 8.2 10 4.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && children}
    </section>
  )
}

function AlertsLink() {
  const n = useUnseen()
  return <a href="#/alerts">Alerts{n > 0 && <i className="ndot inline">{n > 9 ? '9+' : n}</i>}<span className="sp" />›</a>
}

/**
 * What is waiting for a signature (docs/social.md §17): follows and a profile
 * edit made without a wallet prompt. One button signs them all as one batch;
 * the service applies all of it or none, and marks what it refused.
 */
function PendingChanges() {
  const pending = usePending()
  const { queue: q, count } = pending
  const names = useProfiles(q.follows.filter((f) => f.targetKind === 'wallet').map((f) => f.target))
  if (!count) return null
  const what = [
    q.follows.length && `${q.follows.length} follow${q.follows.length === 1 ? '' : 's'}`,
    q.profile && 'profile',
  ].filter(Boolean).join(' · ')
  return (
    <section className="ps-pend" aria-label="Pending changes">
      <div className="ps-pend-h"><b>Pending changes</b><span className="sp" /><span className="t50">{what}</span></div>
      <ul>
        {q.profile && (
          <li className={q.errors.profile ? 'bad' : undefined}>
            <a href="#/me">Profile edit</a>
            {q.errors.profile && <small>{q.errors.profile}</small>}
            <span className="sp" />
            <button className="x" onClick={pending.dropProfile} aria-label="Discard the profile edit">×</button>
          </li>
        )}
        {q.follows.map((f) => {
          const k = entryKey(f.targetKind, f.target)
          const loop = f.targetKind === 'strategy' ? parseLoopKey(f.target) : null
          const label = f.targetKind === 'wallet' ? labelFor(f.target, names.profile(f.target)).label
            : f.targetKind === 'market' ? f.target.split(':')[0]
            : loop ? `a loop on ${loop.long.split(':')[0]}`
            : f.target
          const href = f.targetKind === 'wallet' ? walletHref(f.target) : f.targetKind === 'market' ? marketHref(f.target)
            : loop ? marketHref(loop.long) : `#/c/${encodeURIComponent(f.target)}`
          return (
            <li key={k} className={q.errors[k] ? 'bad' : undefined}>
              <span className={f.action === 'follow' ? 'ok' : 'warn'}>{f.action === 'follow' ? 'Follow' : 'Unfollow'}</span>
              <a href={href}>{label}</a>
              {q.errors[k] && <small>{q.errors[k]}</small>}
              <span className="sp" />
              <button className="x" onClick={() => pending.dropFollow(f.targetKind, f.target)} aria-label={`Drop ${f.action} ${label}`}>×</button>
            </li>
          )
        })}
      </ul>
      {q.errors.batch && <div className="err">{q.errors.batch}</div>}
      <button className="btn pri wide" disabled={pending.applying} onClick={() => void pending.apply()}>
        {pending.applying ? 'Signing…' : `Sign & apply ${count === 1 ? 'it' : `all ${count}`}`}
      </button>
      <p className="foot">One signature for all of it. Until then, only you see these.</p>
    </section>
  )
}
