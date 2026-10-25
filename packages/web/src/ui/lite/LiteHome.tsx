import React from 'react'
import { useApp, liteHref } from '../../state/AppState'
import { useTrending } from '@yieldcircle/app/index/queries'
import { useProfiles } from '../../social/queries'
import { leverTag, type LiteRow } from '@yieldcircle/core/model/lite'
import { ConnectButton } from '../../wallet/ConnectButton'
import { PaperOffer } from '../PaperPanel'
import { totalsOf } from '../Positions'
import { Sk, pct, usd, usdShort } from '../bits'
import { LENSES, liteCards, useDayLog, useLiteMenu, type Lens } from '@yieldcircle/app/lite'
import { FollowedMoves, LiteCard, LiteCardSk, openRow } from './LiteBits'


/**
 * Lite's home (docs/lite.md §1): your balance and what it earns a day, then cards to copy through
 * three lenses — proven, trending, most held (fomo's verified · trending · most held) — then what
 * the people you follow did. No wallet yet: a paper bank to play the whole thing with.
 */
export function LiteHome() {
  const { isConnected, chainIds } = useApp()
  const L = useLiteMenu()
  const { b } = L
  const t = totalsOf(b)
  const day = useDayLog(b)
  const [lens, setLens] = React.useState<Lens>('proven')
  const trending = useTrending('7d', chainIds)
  const cards = React.useMemo(() => liteCards(lens, L.rows, L, trending.markets), [lens, L.rows, trending.markets, L.proofsHeld]) // eslint-disable-line react-hooks/exhaustive-deps
  const { profile } = useProfiles(cards.map((r) => L.proof(r.s)?.best?.account).filter((a): a is string => !!a))
  const loading = (b.isLoading && !L.rows.length) || (lens === 'trending' && trending.isLoading)
  // the money that sits idle, and the best row in its own category to put it in
  const idleBook = [...b.books].filter((x) => x.idleUsd >= 1).sort((x, y) => y.idleUsd - x.idleUsd)[0]
  const idleTo = idleBook ? L.rows.find((r) => r.s.group === idleBook.group && r.s.risk <= 2) : undefined
  const empty = isConnected && !b.paper && !b.positionsLoading && t.tot < 5
  return (
    <div className="lite-page lite-home">
      <header className="lite-hero">
        {b.account ? (
          <>
            <div className="lite-bal">{b.positionsLoading && !b.books.length ? <Sk w={160} h={40} /> : usd(t.tot)}</div>
            <div className="lite-bal-s">
              {t.yearly > 0 ? <><b className="ok">+{usd(t.yearly / 365)}</b> a day</> : <span className="t50">nothing earning yet</span>}
              {day.streak > 0 && <span className="lite-streak" title="Days in a row with money at work">🔥 {day.streak}</span>}
              {b.paper && <span className="pill paper">paper</span>}
            </div>
          </>
        ) : (
          <>
            <h1>Make your money work.</h1>
            <p className="t70">The best rates on dollars, ether and bitcoin, in plain words. Copy what real wallets do, in one tap.</p>
            {!isConnected && <div className="lite-cta"><ConnectButton /></div>}
          </>
        )}
        {(!isConnected || empty) && <div style={{ marginTop: 14 }}><PaperOffer empty={isConnected} /></div>}
        {idleBook && idleTo && (
          <button type="button" className="note lite-idle" onClick={() => openRow(idleTo.s)}>
            <span><b>{usdShort(idleBook.idleUsd)}</b> sits idle. {idleTo.title} pays <b className="ok">{pct(idleTo.s.rate)}</b>{idleTo.s.kind === 'loop' ? ` ${leverTag(idleTo.s.tiers.balanced)}` : ''}: about <b className="ok">{usdShort(idleBook.idleUsd * idleTo.s.rate / 100)}</b> a year.</span>
            <span className="btn sm pri">Put it to work</span>
          </button>
        )}
      </header>

      <div className="seg lite-lens" role="tablist" aria-label="Which cards">
        {LENSES.map((x) => <button key={x.id} role="tab" aria-selected={lens === x.id} aria-pressed={lens === x.id} onClick={() => setLens(x.id)}>{x.word}</button>)}
      </div>
      <p className="t50 lite-lens-why">{LENSES.find((x) => x.id === lens)!.why}</p>
      <div className="lcards" aria-busy={loading}>
        {loading ? [0, 1, 2, 3].map((i) => <LiteCardSk key={i} />)
          : !cards.length ? <div className="empty t50">Nothing here on these chains right now.</div>
          : cards.map((r) => <LiteCard key={r.s.id} r={r} get={L.get} proof={L.proof(r.s)} profile={profile} />)}
      </div>

      <FollowedMoves rows={L.rows} account={b.account} limit={5} />
      <p className="lite-more t50"><a href={liteHref('earn')}>Every category ›</a></p>
    </div>
  )
}
