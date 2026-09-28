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
import { useApp, walletHref } from '../state/AppState'
import { useProfile } from '../social/queries'
import { ConnectButton } from '../wallet/ConnectButton'
import { Who } from './social-bits'
import { ChainList } from './ChainPicker'
import { SettingsPanel } from './SettingsPanel'
import { useUnseen } from './Alerts'
import { MyStats } from './Stats'
import { useSettings } from '../state/Settings'

export function ProfileSheet() {
  const { account, signer, viewAs, allChains, chainLabelFor } = useApp()
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
