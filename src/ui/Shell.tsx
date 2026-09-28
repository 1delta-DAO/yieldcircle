/**
 * The frame every page sits in: a bar across the top, three tabs, and two
 * sheets.
 *
 *   top-left    your face → the profile sheet (you, your page, alerts,
 *               wallet, chains, filters)
 *   then        one search box for everything the app has a page for
 *   top-right   your standing (rank or followers) and your balance → your
 *               positions; Connect in its place before there is a wallet
 *   the tabs    Home (what people are doing) · Earn (the catalogue) · Board
 *
 * It used to be one bar holding eight destinations and six controls, which a
 * phone could not show: at 360px only "Home" was visible and the rest
 * scrolled off unannounced. The fix was fewer destinations, not a cleverer
 * menu — the feed moved onto the home, the asset groups and the asset book
 * moved into Earn and the search, and the controls moved into the sheets.
 *
 * The tabs sit in the top bar from 768px up and in a bar along the bottom
 * below that, where a thumb reaches them.
 */
import React from 'react'
import { Logo } from './Logo'
import { ConnectButton } from '../wallet/ConnectButton'
import { useApp, useRoute, type View } from '../state/AppState'
import { Character } from '../identity/character'
import { useProfile } from '../social/queries'
import { useUnseen } from './Alerts'
import { useBack } from '../state/sticky'
import { Search } from './Search'
import { Drawer } from './Drawer'
import { ProfileSheet } from './ProfileSheet'
import { Positions, totalsOf } from './Positions'
import { MyStats, StatsChip } from './Stats'
import { useBook } from './useBook'
import { Sk, usd, usdShort } from './bits'

const ic = { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
const TABS: { id: string; label: string; href: string; on: View[]; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', href: '#/', on: ['home'], icon: <svg {...ic}><path d="M3.5 9 10 3.8 16.5 9v7a1 1 0 0 1-1 1h-3.3v-4.6H7.8V17H4.5a1 1 0 0 1-1-1z" /></svg> },
  { id: 'earn', label: 'Earn', href: '#/earn', on: ['earn', 'group', 'token'], icon: <svg {...ic}><ellipse cx="10" cy="5.8" rx="5.8" ry="2.4" /><path d="M4.2 5.8v4.1c0 1.3 2.6 2.4 5.8 2.4s5.8-1.1 5.8-2.4V5.8M4.2 9.9V14c0 1.3 2.6 2.4 5.8 2.4s5.8-1.1 5.8-2.4V9.9" /></svg> },
  { id: 'board', label: 'Board', href: '#/board', on: ['board'], icon: <svg {...ic}><path d="M6.5 3.5h7v4.2a3.5 3.5 0 0 1-7 0zM6.5 5H3.8v.9a2.8 2.8 0 0 0 2.9 2.8M13.5 5h2.7v.9a2.8 2.8 0 0 1-2.9 2.8M10 11.2v2.6M7 16.5h6M8.2 13.8h3.6" /></svg> },
]
const ROOTS: View[] = ['home', 'earn', 'board']

export function Shell({ children }: { children: React.ReactNode }) {
  const r = useRoute()
  const { back } = useBack()
  const tabs = (cls: string) => (
    <nav className={cls} aria-label="Main">
      {TABS.map((t) => (
        <a key={t.id} href={t.href} aria-current={t.on.includes(r.view) ? 'page' : undefined}>{t.icon}<span>{t.label}</span></a>
      ))}
    </nav>
  )
  return (
    <>
      <header className="top"><div className="inner">
        {/* one step back to the page you came from — its inputs are kept (useSticky), so a click away is never a loss */}
        {!ROOTS.includes(r.view) && <button className="back" onClick={back} aria-label="Back" title="Back">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>}
        <Me />
        <span className="brand"><Logo height={28} href="#/" /></span>
        {tabs('tabs-top')}
        <Search />
        <Yours />
      </div></header>
      <main className="wrap">{children}</main>
      {tabs('tabbar')}
    </>
  )
}

/** The face, top-left: the way into everything about you. A dot says alerts are waiting. */
function Me() {
  const { account, signer } = useApp()
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button className="meface" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label="You" title="You">
        {account ? <Face addr={account} /> : (
          <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><circle cx="10" cy="7" r="3.2" /><path d="M3.8 17c.9-3.2 3.3-4.8 6.2-4.8s5.3 1.6 6.2 4.8" strokeLinecap="round" /></svg>
        )}
        {signer && <UnseenDot />}
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} side="left" label="You"><ProfileSheet /></Drawer>
    </>
  )
}
function Face({ addr }: { addr: string }) {
  const p = useProfile(addr)
  return <Character addr={addr} avatarUrl={p.data?.profile?.avatarUrl} size={30} />
}
function UnseenDot() {
  const n = useUnseen()
  return n > 0 ? <i className="ndot" aria-label={`${n} new`}>{n > 9 ? '9+' : n}</i> : null
}

/**
 * Top-right: your standing and your money, or Connect before there is a
 * wallet. The balance opens your positions; on a phone, where the standing
 * does not fit beside it, the sheet carries that too.
 */
function Yours() {
  const { account, signer } = useApp()
  const [open, setOpen] = React.useState(false)
  const b = useBook()
  if (!account) return <ConnectButton compact />
  const t = totalsOf(b)
  const loading = b.positionsLoading && !b.books.length
  return (
    <>
      <StatsChip account={account} />
      {signer && <Bell />}
      <button className="moneychip" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label={`Your positions${loading ? '' : `, ${usd(t.tot)}`}`}>
        {loading ? <Sk w={64} /> : <><b>{usdShort(t.tot)}</b>{t.yearly > 0 && <small>≈ {usdShort(t.yearly)}/yr</small>}</>}
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} side="right" label="Your money">
        <div className="hide-d"><MyStats account={account} /></div>
        <Positions b={b} />
      </Drawer>
    </>
  )
}

function Bell() {
  const r = useRoute()
  const n = useUnseen()
  return (
    <a className={`bell${r.view === 'alerts' ? ' on' : ''}`} href="#/alerts" aria-label={n ? `${n} new` : 'Alerts'} title="Alerts">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="M8 1.6a4 4 0 0 0-4 4v2.2L2.8 10.2h10.4L12 7.8V5.6a4 4 0 0 0-4-4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M6.4 12a1.6 1.6 0 0 0 3.2 0" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
      {n > 0 && <i className="ndot">{n > 9 ? '9+' : n}</i>}
    </a>
  )
}
