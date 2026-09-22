import React from 'react'
import { Logo } from './Logo'
import { ConnectButton } from '../wallet/ConnectButton'
import { useApp, useRoute } from '../state/AppState'
import { CHAINS } from '../sdk/queries'
import { GROUPS } from '../model/assets'
import { Character } from '../identity/character'
import { useProfile } from '../social/queries'
import { useUnseen } from './Alerts'
import { ChainMark } from './ChainMark'

export function Shell({ children }: { children: React.ReactNode }) {
  const { chain, setChain, signer } = useApp()
  const r = useRoute()
  return (
    <>
      <header className="top"><div className="inner">
        <span className="brand"><Logo height={32} /></span>
        <nav>
          <a href="#/" aria-current={r.view === 'home' ? 'page' : undefined}>Home</a>
          <a href="#/feed" aria-current={r.view === 'feed' ? 'page' : undefined}>Feed</a>
          <a href="#/explore" aria-current={r.view === 'explore' ? 'page' : undefined}>Explore</a>
          {GROUPS.map((g) => <a key={g.id} className="hide-t" href={`#/${g.id}`} aria-current={r.group === g.id ? 'page' : undefined}>{g.id === 'MORE' ? 'More' : g.id}</a>)}
          <a href="#/board" aria-current={r.view === 'board' ? 'page' : undefined}>Board</a>
        </nav>
        <span className="sp" />
        <div className="seg chainseg" role="group" aria-label="Chain">
          <button aria-pressed={chain === 'all'} onClick={() => setChain('all')}>All</button>
          {CHAINS.map((c) => (
            <button key={c.id} aria-pressed={chain === c.id} onClick={() => setChain(c.id)} title={c.label}>
              <ChainMark chainId={c.id} size={15} />
              <span className="cn">{c.label}</span>
            </button>
          ))}
        </div>
        {signer && <AlertsBell active={r.view === 'alerts'} />}
        {signer && <Me addr={signer} active={r.view === 'me' || (r.view === 'wallet' && r.addr === signer)} />}
        <ConnectButton />
      </div></header>
      <main className="wrap">{children}</main>
    </>
  )
}

/** The face is the account menu: one tap to your own page, which is where the profile editor lives. */
function Me({ addr, active }: { addr: string; active: boolean }) {
  const p = useProfile(addr)
  return (
    <a className={`meface${active ? ' on' : ''}`} href={`#/w/${addr}`} aria-label="My page" title="My page">
      <Character addr={addr} avatarUrl={p.data?.profile?.avatarUrl} size={30} />
    </a>
  )
}

function AlertsBell({ active }: { active: boolean }) {
  const n = useUnseen()
  return (
    <a className={`bell${active ? ' on' : ''}`} href="#/alerts" aria-label={n ? `${n} new` : 'Alerts'} title="Alerts">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="M8 1.6a4 4 0 0 0-4 4v2.2L2.8 10.2h10.4L12 7.8V5.6a4 4 0 0 0-4-4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M6.4 12a1.6 1.6 0 0 0 3.2 0" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
      {n > 0 && <i className="ndot">{n > 9 ? '9+' : n}</i>}
    </a>
  )
}
