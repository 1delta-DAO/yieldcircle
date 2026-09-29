/**
 * Your money, behind the balance chip in the top-right of the header.
 *
 * It used to be in three places: a strip on the home page, a block at the top
 * of Explore, and your own wallet page pointing back at Explore. It is one
 * sheet now, reachable from every page, because a returning reader's first
 * question is "how is mine doing" wherever they happen to be.
 *
 * These numbers come from the LIVE path, never from the index: the connected
 * user's own positions are the one thing the index must not serve.
 */
import React from 'react'
import { GROUPS, whatIs, type GroupId } from '../model/assets'
import { go } from '../state/AppState'
import { useBook } from './useBook'
import { GroupIcon, KindPill, Sk, Tok, amt, pct, usd } from './bits'
import type { AssetBook, Holding } from '../model/positions'
import { chainLabel } from '../sdk/queries'

type Book = ReturnType<typeof useBook>

/** The four numbers the chip and the sheet's head both show. */
export function totalsOf(b: Book) {
  const tot = b.books.reduce((a, x) => a + x.totalUsd, 0)
  const idle = b.books.reduce((a, x) => a + x.idleUsd, 0)
  const work = b.books.reduce((a, x) => a + x.atWorkUsd, 0)
  const yearly = b.books.reduce((a, x) => a + x.yearlyUsd, 0)
  return { tot, idle, work, yearly }
}

export function Positions({ b }: { b: Book }) {
  const byGroup = (g: GroupId) => b.books.filter((x) => x.group === g)
  const { tot, idle, work, yearly } = totalsOf(b)
  return (
    <>
      <div className="pos-head">
        <div className="lbl">Your positions</div>
        <div className="pos-v">{b.positionsLoading && !b.books.length ? <Sk w={120} h={24} /> : usd(tot)}</div>
        {b.books.length > 0 && (
          <div className="pos-s mono">
            {usd(work)} at work{work ? ` at ${pct(yearly / work * 100)}` : ''}
            {idle >= 1 && <span className="warn"> · {usd(idle)} idle</span>}
            {' · ≈ '}{usd(yearly)} / year
          </div>
        )}
      </div>
      {b.positionsError && <div className="err">Positions could not be read: {b.positionsError.message}</div>}
      {!b.positionsLoading && !b.books.length && !b.positionsError && (
        <div className="note">Nothing on the selected chains: no idle balance in a base asset, no deposit, no loop. <a className="pri" href="#/earn">Find something to earn ›</a></div>
      )}
      <div className="gcards">{GROUPS.filter((g) => byGroup(g.id).length).map((g) => <GroupCard key={g.id} gid={g.id} books={byGroup(g.id)} directional={b.holdings.filter((h) => h.directional && h.group === g.id)} />)}</div>
    </>
  )
}

/**
 * One group, one row: the total on the right, one pill per asset below it.
 * A pill says at a glance what the asset earns (green rate) and whether part
 * of it sits idle (the amber moon); tapping it goes to the asset. The full
 * breakdown — every venue, health, "put to work" — still exists, but behind
 * a tap on the row, because five nested tree rows per asset was unreadable.
 */
function GroupCard({ gid, books, directional }: { gid: GroupId; books: AssetBook[]; directional: Holding[] }) {
  const g = GROUPS.find((x) => x.id === gid)!
  const [open, setOpen] = React.useState(false)
  const total = books.reduce((a, b) => a + b.totalUsd, 0), idle = books.reduce((a, b) => a + b.idleUsd, 0), work = books.reduce((a, b) => a + b.atWorkUsd, 0), yearly = books.reduce((a, b) => a + b.yearlyUsd, 0)
  const dirUsd = directional.reduce((a, h) => a + h.valueUsd, 0)
  return (
    <div className="card gsum">
      <button type="button" className="gsum-h" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <GroupIcon id={g.id} color={g.color} size={22} />
        <span className="gsum-t"><span className="t">{g.name}</span>
          <small>{work >= 1 ? <>{pct(yearly / work * 100, 1)} on {usd(work)}</> : 'nothing at work'}{idle >= 1 && <span className="warn"> · {usd(idle)} idle</span>}</small></span>
        <span className="sp" />
        <span className="gsum-v">{usd(total)}{yearly >= 1 && <small className="ok">≈ {usd(yearly)}/yr</small>}</span>
        <svg className="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="apills">
        {books.map((b) => <AssetPill key={b.asset} b={b} />)}
        {dirUsd >= 1 && <button type="button" className="apill dir" onClick={() => setOpen(true)}
          title={`${directional.map((h) => h.label.replace(' loop', '')).join(', ')} — the debt is in another denomination, so it is a price bet rather than a carry. Not counted in the group total.`}>
          {directional.length} price bet{directional.length > 1 ? 's' : ''} <span className="m">{usd(dirUsd)}</span></button>}
      </div>
      {open && (
        <div className="list">
          {books.map((b) => <AssetRows key={b.asset} b={b} />)}
          {directional.length > 0 && <div className="empty" style={{ borderTop: '1px solid var(--line)' }}>{directional.length} directional loop{directional.length > 1 ? 's' : ''} ({directional.map((h) => h.label.replace(' loop', '')).join(', ')}) with {usd(dirUsd)} equity not shown: the debt is in another denomination, so it is a price bet rather than a carry.</div>}
        </div>
      )}
    </div>
  )
}
/** [icon USDC $2,499 4.1% ☾] — what you hold, what it earns, whether part is idle. Tap → the asset. */
function AssetPill({ b }: { b: AssetBook }) {
  const earning = b.atWorkUsd >= 1, idle = b.idleUsd >= 1
  const title = [`${b.asset} · ${whatIs(b.asset)}`,
    earning ? `${usd(b.atWorkUsd)} at work at ${pct(b.blended)}` : null,
    idle ? `${usd(b.idleUsd)} idle, earning nothing` : null].filter(Boolean).join('\n')
  return (
    <button type="button" className="apill" title={title} onClick={() => go(b.group, { u: b.asset })}>
      <Tok sym={b.asset} size={16} /><b>{b.asset}</b>
      <span className="m">{usd(b.totalUsd)}</span>
      {earning && <span className="ok">{pct(b.blended, 1)}</span>}
      {idle && <svg className="idlemark" viewBox="0 0 16 16" width="11" height="11" role="img" aria-label="part idle"><path d="M13.4 9.4A5.6 5.6 0 1 1 6.6 2.6a4.5 4.5 0 0 0 6.8 6.8z" fill="currentColor" /></svg>}
    </button>
  )
}
export function AssetRows({ b, sel }: { b: AssetBook; sel?: string }) {
  const g = GROUPS.find((x) => x.id === b.group)!
  return (
    <>
      <div className="row arow"><div className="nm"><Tok sym={b.asset} /><span>{b.asset}</span><span className="t50 hide-m" style={{ fontWeight: 400, fontSize: 12 }}>{whatIs(b.asset)}</span></div>
        <div className="v">{g.unit === '$' || !b.idle?.price ? usd(b.totalUsd) : amt(b.asset, b.idle.amount + b.atWorkUsd / b.idle.price)}<small>{b.holdings.length ? `${pct(b.blended)} on the part at work` : 'nothing at work'}</small></div></div>
      {b.idle && b.idle.usd >= 1 && (
        <button className={`row prow idle${b.holdings.length ? '' : ' last'}`} onClick={() => go(b.group, { u: b.asset })}>
          <div className="nm"><span className="tok" style={{ background: '#1f1f1f', color: 'var(--tx50)' }}>—</span><span>Idle <span className="t50">· in wallet, earning nothing</span></span></div>
          <div className="sub hide-m">{b.idle.chainId ? chainLabel(b.idle.chainId) : ''}</div>
          <div className="v">{amt(b.asset, b.idle.amount, b.idle.usd)}<small>{g.unit === '$' ? '0%' : usd(b.idle.usd)}</small></div>
          <div className="v t50" style={{ fontSize: 12.5 }}>Put to work ›</div>
        </button>
      )}
      {b.holdings.map((h, i) => (
        <button key={h.key} className={`row prow${i === b.holdings.length - 1 ? ' last' : ''}`} aria-selected={sel === h.earnUid} onClick={() => go(h.group, { u: h.asset, k: h.kind })}>
          <div className="nm"><Tok sym={h.label.split(' ')[0]} logo={h.logo} /><span>{h.label}</span><KindPill kind={h.kind} /></div>
          <div className="sub hide-m">{h.venue} · {chainLabel(h.chainId)}{h.health != null ? <> · health <span className={h.health < 1.15 ? 'warn' : ''}>{h.health.toFixed(2)}</span></> : ''}</div>
          <div className="v">{usd(h.valueUsd)}<small>{h.kind === 'loop' ? 'equity' : 'deposit'}</small></div>
          <div className="v ok">{h.apr != null ? pct(h.apr) : <span className="t40">—</span>}<small>{h.leverage && h.leverage > 1.05 ? `${h.leverage.toFixed(1)}× · ` : ''}≈ {usd(h.valueUsd * (h.apr ?? 0) / 100)}/yr</small></div>
        </button>
      ))}
    </>
  )
}

