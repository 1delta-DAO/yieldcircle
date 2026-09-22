/**
 * The home.
 *
 * It used to be the catalogue: every asset, sorted by the biggest number it
 * could earn. That answers "what pays most", which is a question a table
 * answers once and then never again — there is no reason to come back
 * tomorrow, because the table will say the same thing.
 *
 * So the home now answers a different question: **what are people doing?**
 * A live pulse, the markets that are actually busy (ranked on how often AND
 * how much, not on a headline rate), and the stream of moves as they land.
 * The catalogue has not gone anywhere — it is one tap away at `#/explore`,
 * and every hot row opens the same ticket it always did.
 */
import React from 'react'
import { useApp } from '../state/AppState'
import { useBook } from './useBook'
import { Hot } from './Hot'
import { Pulse, Stream } from './Stream'
import { AssetRows } from './Explorer'
import { GROUPS, type GroupId } from '../model/assets'
import { GroupIcon, Sk, pct, usd } from './bits'

export function Home() {
  const { account } = useApp()
  return (
    <>
      <Pulse />
      {account && <Yours />}
      <div className="home">
        <div className="home-main"><Hot limit={8} /></div>
        <div className="home-side"><Stream rows={14} /></div>
      </div>
      <section className="sec">
        <a className="explore-cta" href="#/explore">
          <span className="ec-t"><b>Explore everything</b><small>every asset, every strategy, what each one pays</small></span>
          <span className="sp" />
          <span className="ec-g">{GROUPS.map((g) => <GroupIcon key={g.id} id={g.id} color={g.color} size={22} />)}</span>
          <span className="t50">›</span>
        </a>
      </section>
    </>
  )
}

/**
 * Your own money, in one strip. It is the reason a returning user opens the
 * app at all, so it sits above the fold — but small, because the page is now
 * about what everyone is doing and not about a portfolio screen.
 *
 * These numbers come from the LIVE path, never from the index: the connected
 * user's own positions are the one thing the index must not serve.
 */
function Yours() {
  const b = useBook()
  const [open, setOpen] = React.useState(false)
  const tot = b.books.reduce((a, x) => a + x.totalUsd, 0)
  const idle = b.books.reduce((a, x) => a + x.idleUsd, 0)
  const work = b.books.reduce((a, x) => a + x.atWorkUsd, 0)
  const yearly = b.books.reduce((a, x) => a + x.yearlyUsd, 0)
  if (b.positionsLoading && !b.books.length)
    return <div className="yours"><Sk w={280} h={16} /></div>
  if (!b.books.length) return null
  const byGroup = (g: GroupId) => b.books.filter((x) => x.group === g)
  return (
    <>
      <button className="yours" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="y-t">Yours</span>
        <b className="y-v">{usd(tot)}</b>
        <span className="y-s">{usd(work)} at work{work ? ` at ${pct((yearly / work) * 100)}` : ''}</span>
        {idle >= 1 && <span className="y-idle">{usd(idle)} idle</span>}
        <span className="sp" />
        <span className="y-yr">≈ {usd(yearly)} / year</span>
        <span className="y-chev">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="gcards yours-open">
          {GROUPS.filter((g) => byGroup(g.id).length).map((g) => (
            <div key={g.id} className="card">
              <div className="ch"><GroupIcon id={g.id} color={g.color} size={24} /><span className="t">{g.name}</span>
                <span className="sp" /><span className="m">{usd(byGroup(g.id).reduce((a, x) => a + x.totalUsd, 0))}</span></div>
              <div className="list">{byGroup(g.id).map((x) => <AssetRows key={x.asset} b={x} />)}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
