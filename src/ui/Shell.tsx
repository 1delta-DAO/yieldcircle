import React from 'react'
import { Logo } from './Logo'
import { ConnectButton } from '../wallet/ConnectButton'
import { useApp, useRoute } from '../state/AppState'
import { CHAINS } from '../sdk/queries'
import { GROUPS } from '../model/assets'

export function Shell({ children }: { children: React.ReactNode }) {
  const { chain, setChain } = useApp()
  const r = useRoute()
  return (
    <>
      <header className="top"><div className="inner">
        <span className="brand"><Logo height={32} /></span>
        <nav>
          <a href="#/" aria-current={r.group ? undefined : 'page'}>Explore</a>
          {GROUPS.map((g) => <a key={g.id} href={`#/${g.id}`} aria-current={r.group === g.id ? 'page' : undefined}>{g.id === 'MORE' ? 'More' : g.id}</a>)}
        </nav>
        <span className="sp" />
        <div className="seg chainseg" role="group" aria-label="Chain">
          <button aria-pressed={chain === 'all'} onClick={() => setChain('all')}>All</button>
          {CHAINS.map((c) => <button key={c.id} aria-pressed={chain === c.id} onClick={() => setChain(c.id)}>{c.label}</button>)}
        </div>
        <ConnectButton />
      </div></header>
      <main className="wrap">{children}</main>
    </>
  )
}
