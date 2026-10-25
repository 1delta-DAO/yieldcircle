/**
 * The frame every page sits in: a bar across the top, four tabs, and two
 * sheets.
 *
 *   top-left    your face → the profile sheet (you, your page, alerts,
 *               wallet, chains, filters)
 *   then        one search box for everything the app has a page for
 *   top-right   your standing (rank or followers) and your balance → your
 *               positions; Connect in its place before there is a wallet
 *   the tabs    Home (where to start) · Feed (what people are doing)
 *               · Earn (deposit, and earn on it) · Borrow (put up what you hold
 *               and take liquidity out) · Board
 *
 * It used to be one bar holding eight destinations and six controls, which a
 * phone could not show: at 360px only "Home" was visible and the rest
 * scrolled off unannounced. The fix was fewer destinations, not a cleverer
 * menu — the feed moved onto the home, the asset groups and the asset book
 * moved into Earn and the search, and the controls moved into the sheets.
 *
 * Borrow became the fifth tab on purpose (tickets/0011): filed under Earn it
 * was three taps deep and under the wrong word. Five fit a 360px bar at 72px
 * each; nothing else gets a tab after this. A category page's Borrow segment
 * (`#/ETH?k=borrow`, the Stocks shelf's loans) lights Borrow, not Earn.
 *
 * The tabs sit in the top bar from 768px up and in a bar along the bottom
 * below that, where a thumb reaches them.
 *
 * A visitor in on the beta's access code gets one strip above the page asking
 * them to join the waitlist (`Waitlist`), until their wallet holds a place.
 */
import React from 'react'
import { normAddr } from '@yieldcircle/core/model/address'
import { Logo } from '@yieldcircle/design'
import { ConnectButton } from '../wallet/ConnectButton'
import { hrefIn, liteHref, useApp, useRoute, type Route, type View } from '../state/AppState'
import { Character } from '../identity/character'
import { useProfile } from '../social/queries'
import { useUnseen } from './Alerts'
import { useBack } from '../state/sticky'
import { Search } from './Search'
import { Drawer } from './Drawer'
import { ProfileSheet } from './ProfileSheet'
import { useQueue } from '../social/pending'
import { Positions, totalsOf } from './Positions'
import { MyStats, StatsChip } from './Stats'
import { useBook } from '@yieldcircle/app/book'
import { TxInFlight, TxTray } from './TxTray'
import { Sk, usd, usdShort } from './bits'
import { gated, onAccessCode, openGate, useOnList, WAITLIST_HREF } from '../wallet/gate'
import { usePaperSession } from '../wallet/paper'
import { useDayLog } from '@yieldcircle/app/lite'

const ic = { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
/**
 * Is this a borrow page: the Borrow tab itself, or a category page on its Borrow segment — asked
 * for (`k=borrow`), or the Stocks shelf, which opens on its loans unless a deposit row is picked.
 */
export const onBorrow = (r: Route) => r.view === 'borrow' || (r.view === 'group' && (r.k === 'borrow' || (r.group === 'STOCKS' && r.k == null && !(r.s && !r.s.startsWith('b:')))))
const TABS: { id: string; label: string; href: string; on: (r: Route) => boolean; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', href: '#/', on: (r) => r.view === 'home', icon: <svg {...ic}><path d="M3.5 9 10 3.8 16.5 9v7a1 1 0 0 1-1 1h-3.3v-4.6H7.8V17H4.5a1 1 0 0 1-1-1z" /></svg> },
  { id: 'feed', label: 'Feed', href: '#/feed', on: (r) => r.view === 'feed', icon: <svg {...ic}><path d="M2.5 10h3.2l2-5 3.4 10 2.1-5h4.3" /></svg> },
  { id: 'earn', label: 'Earn', href: '#/earn', on: (r) => (r.view === 'earn' || r.view === 'group' || r.view === 'token') && !onBorrow(r), icon: <svg {...ic}><ellipse cx="10" cy="5.8" rx="5.8" ry="2.4" /><path d="M4.2 5.8v4.1c0 1.3 2.6 2.4 5.8 2.4s5.8-1.1 5.8-2.4V5.8M4.2 9.9V14c0 1.3 2.6 2.4 5.8 2.4s5.8-1.1 5.8-2.4V9.9" /></svg> },
  // a vault with liquidity coming out of it: what you hold stays in, cash comes out
  { id: 'borrow', label: 'Borrow', href: '#/borrow', on: onBorrow, icon: <svg {...ic}><rect x="2.8" y="4.5" width="10.4" height="11" rx="2" /><circle cx="8" cy="10" r="2" /><path d="M10.6 10h7M15 7.4l2.6 2.6-2.6 2.6" /></svg> },
  { id: 'board', label: 'Board', href: '#/board', on: (r) => r.view === 'board', icon: <svg {...ic}><path d="M6.5 3.5h7v4.2a3.5 3.5 0 0 1-7 0zM6.5 5H3.8v.9a2.8 2.8 0 0 0 2.9 2.8M13.5 5h2.7v.9a2.8 2.8 0 0 1-2.9 2.8M10 11.2v2.6M7 16.5h6M8.2 13.8h3.6" /></svg> },
]
const ROOTS: View[] = ['home', 'feed', 'earn', 'borrow', 'board']
/**
 * Lite's three tabs (docs/lite.md): the home (cards to copy), Earn (four categories, one list
 * each) and Board (who earns, one number each, positions on a tap). You — positions, streak,
 * points, rank — is behind the balance chip top-right (`LiteYours`), the one button every page
 * has, so it is not a tab too. Borrow and the feed are Pro's.
 */
const LITE_TABS: typeof TABS = [
  { ...TABS[0], href: liteHref() },
  { ...TABS[2], href: liteHref('earn'), on: (r) => r.view === 'earn' || r.view === 'group' },
  { ...TABS[4], href: liteHref('board') },
]
// a picked category is the Earn page with a tile lit, not a page under it: no back arrow
const LITE_ROOTS: View[] = ['home', 'earn', 'group', 'board']

export function Shell({ children }: { children: React.ReactNode }) {
  const r = useRoute()
  const { back } = useBack()
  // the frame's mode on the body, so Lite's styles (styles/lite.css) scope under it and Pro's are
  // untouched. A Lite reader on a page only Pro has (a wallet, the board) keeps Lite's frame
  const lite = r.shell === 'lite'
  React.useEffect(() => { document.body.dataset.mode = lite ? 'lite' : 'pro' }, [lite])
  // Pro's tabs keep the reader in Pro: said out loud when the saved mode is Lite (`hrefIn`)
  const tabList = lite ? LITE_TABS : TABS.map((t) => ({ ...t, href: hrefIn(t.href, r) }))
  const roots = lite ? LITE_ROOTS : ROOTS
  const tabs = (cls: string) => (
    <nav className={cls} aria-label="Main">
      {tabList.map((t) => (
        <a key={t.id} href={t.href} aria-current={t.on(r) ? 'page' : undefined}>{t.icon}<span>{t.label}</span></a>
      ))}
    </nav>
  )
  return (
    <>
      <header className="top"><div className="inner">
        {/* one step back to the page you came from — its inputs are kept (useSticky), so a click away is never a loss */}
        {!roots.includes(r.view) && <button className="back" onClick={back} aria-label="Back" title="Back">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><path d="M10 3 5 8l5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>}
        <Me />
        <span className="brand"><Logo height={28} href={lite ? liteHref() : hrefIn('', r)} /></span>
        {tabs('tabs-top')}
        {lite ? <span className="sp" /> : <Search />}
        {lite ? <LiteYours /> : <Yours />}
      </div></header>
      <main className="wrap"><Waitlist />{children}</main>
      {tabs('tabbar')}
      <TxTray />
    </>
  )
}

/** The face, top-left: the way into everything about you. A dot says alerts are waiting. */
function Me() {
  const { account, signer, solSigner } = useApp()
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button className="meface" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label="You" title="You">
        {account ? <Face addr={account} /> : (
          <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><circle cx="10" cy="7" r="3.2" /><path d="M3.8 17c.9-3.2 3.3-4.8 6.2-4.8s5.3 1.6 6.2 4.8" strokeLinecap="round" /></svg>
        )}
        {signer && <UnseenDot />}
        <PendingDot account={signer ?? solSigner} />
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} side="left" label="You"><ProfileSheet /></Drawer>
    </>
  )
}
/** Your face as you last chose it — a pending, unsigned edit included, since only you see this one. */
function Face({ addr }: { addr: string }) {
  const p = useProfile(addr)
  const draft = useQueue(addr).profile
  return <Character addr={addr} avatarUrl={draft ? draft.avatarUrl : p.data?.profile?.avatarUrl} size={30} />
}
/** Follows or a profile edit waiting for one signature (docs/social.md §17); the sheet behind the face applies them. */
function PendingDot({ account }: { account: string | undefined }) {
  const q = useQueue(account)
  const n = q.follows.length + (q.profile ? 1 : 0)
  return n > 0 ? <i className="pdot" aria-label={`${n} unsigned change${n === 1 ? '' : 's'}`} /> : null
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
  const { account, signer, solSigner } = useApp()
  const [open, setOpen] = React.useState(false)
  const b = useBook()
  if (!account) return <ConnectButton compact />
  const t = totalsOf(b)
  const loading = b.positionsLoading && !b.books.length
  return (
    <>
      <StatsChip account={account} />
      {signer && <Bell />}
      <button className={`moneychip${b.paper ? ' paper' : ''}`} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label={`Your ${b.paper ? 'paper ' : ''}positions${loading ? '' : `, ${usd(t.tot)}`}`}>
        {loading ? <Sk w={64} /> : <><b>{usdShort(t.tot)}</b>{b.paper ? <small>paper{t.yearly > 0 ? ` · ≈ ${usdShort(t.yearly)}/yr` : ''}</small> : t.yearly > 0 && <small>≈ {usdShort(t.yearly)}/yr</small>}</>}
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} side="right" label="Your money">
        <div className="hide-d"><MyStats account={account} /></div>
        {/* the book on screen is the signer's own: what is on its way into it */}
        <TxInFlight account={normAddr(account) === signer ? signer : account === solSigner ? solSigner : undefined} />
        <Positions b={b} />
      </Drawer>
    </>
  )
}

/**
 * Lite's top-right: your money, as the way into You (positions, streak, points, rank — Lite
 * keeps them there rather than in Pro's sheet, with its Borrow and Put-to-work links). One pill:
 * the total, what it earns a day and the streak, lit while You is open. Connect before there is
 * a wallet.
 */
function LiteYours() {
  const { account } = useApp()
  const r = useRoute()
  const b = useBook()
  const day = useDayLog(b)
  if (!account) return <ConnectButton compact />
  const t = totalsOf(b)
  const loading = b.positionsLoading && !b.books.length
  const on = r.view === 'you'
  return (
    <a className={`lite-chip${b.paper ? ' paper' : ''}${on ? ' on' : ''}`} href={liteHref('you')} aria-current={on ? 'page' : undefined} aria-label={`You${loading ? '' : `: ${usd(t.tot)}`}${t.yearly > 0 ? `, earning ${usd(t.yearly / 365)} a day` : ''}`} title="Your money, streak and rank">
      <span className="lc-ic" aria-hidden><svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="5" width="15" height="11" rx="2.5" /><path d="M2.5 8.5h15" /><circle cx="13.5" cy="12.3" r="1.2" fill="currentColor" stroke="none" /></svg></span>
      <span className="lc-t">
        {loading ? <Sk w={64} h={14} /> : <b>{usdShort(t.tot)}</b>}
        {loading ? null : t.yearly > 0 ? <small className="ok">+{usdShort(t.yearly / 365)} a day</small> : <small>{b.paper ? 'paper money' : 'nothing earning yet'}</small>}
      </span>
      {day.streak > 0 && <span className="lc-streak" title={`${day.streak} day${day.streak === 1 ? '' : 's'} in a row with money at work`}>🔥{day.streak}</span>}
      <svg className="lc-chev" viewBox="0 0 12 12" width="10" height="10" aria-hidden><path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </a>
  )
}

/**
 * In on the access code, not on the list: the code is borrowed, a place in
 * line is theirs. Joining opens the gate's waitlist flow in a new tab, so the
 * page they were on stays. Gone once the connected wallet is listed or
 * waitlisted; "Later" hides it for this browser session only.
 */
const LATER_KEY = 'yc.waitlist-later'
function Waitlist() {
  const { account } = useApp()
  const onList = useOnList(account)
  const paper = !!usePaperSession()
  const [later, setLater] = React.useState(() => { try { return sessionStorage.getItem(LATER_KEY) === '1' } catch { return false } })
  const hide = () => { try { sessionStorage.setItem(LATER_KEY, '1') } catch { /* private mode */ } setLater(true) }
  // without beta access, browsing or on paper: everything but real trading works (tickets/0006)
  if (gated() && !later) return (
    <div className="waitnudge">
      <span>{paper ? "You're on paper. " : ''}Trading with a real wallet is in closed beta.</span>
      <button className="btn sm pri" onClick={() => openGate()}>Join the waitlist</button>
      <button className="btn sm ghost" onClick={hide}>Later</button>
    </div>
  )
  if (!onAccessCode() || later || onList.data) return null
  return (
    <div className="waitnudge">
      <span>You're in on an access code. Join the waitlist to hold a place of your own.</span>
      <a className="btn sm pri" href={WAITLIST_HREF} target="_blank" rel="noopener">Join the waitlist</a>
      <button className="btn sm ghost" onClick={hide}>Later</button>
    </div>
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
