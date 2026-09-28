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

function GroupCard({ gid, books, directional }: { gid: GroupId; books: AssetBook[]; directional: Holding[] }) {
  const g = GROUPS.find((x) => x.id === gid)!
  const total = books.reduce((a, b) => a + b.totalUsd, 0), idle = books.reduce((a, b) => a + b.idleUsd, 0), work = books.reduce((a, b) => a + b.atWorkUsd, 0), yearly = books.reduce((a, b) => a + b.yearlyUsd, 0)
  return (
    <div className="card">
      <div className="ch gch"><GroupIcon id={g.id} color={g.color} size={18} /><span className="t">{g.name}</span><span className="m">{usd(total)}</span><span className="sp" />
        <span className="m hide-m">idle {usd(idle)} · at work {usd(work)}{work ? ` · ${pct(yearly / work * 100)}` : ''}</span></div>
      <div className="list">{books.map((b) => <AssetRows key={b.asset} b={b} />)}</div>
      {directional.length > 0 && <div className="empty" style={{ borderTop: '1px solid var(--line)' }}>{directional.length} directional loop{directional.length > 1 ? 's' : ''} ({directional.map((h) => h.label.replace(' loop', '')).join(', ')}) with {usd(directional.reduce((a, h) => a + h.valueUsd, 0))} equity not shown: the debt is in another denomination, so it is a price bet rather than a carry.</div>}
    </div>
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

