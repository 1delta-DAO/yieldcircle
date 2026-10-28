import React from 'react'
import { liteHref, liteWalletHref, proHref, useApp } from '../../state/AppState'
import { normAddr } from '@yieldcircle/core/model/address'
import { shortAddr } from '@yieldcircle/core/identity/name'
import { GROUPS } from '@yieldcircle/core/model/assets'
import { LITE_GROUPS, LITE_NAME, boardWallets, liteFind, type LiteRow } from '@yieldcircle/core/model/lite'
import type { FindHit } from '@yieldcircle/core/index/api'
import { usePeopleFind, useRateLeaders } from '@yieldcircle/app/index/queries'
import { useLiteMenu, useRecentPicks } from '@yieldcircle/app/lite'
import { useMyFollows, useProfiles } from '../../social/queries'
import { Character } from '../../identity/character'
import { Face, FollowButton, Who } from '../social-bits'
import { GroupIcon, Sk, pct, usdShort } from '../bits'
import { LiteRowView } from './LiteBits'


/** what a wallet's name rests on, in words: a name is not an identity (`hsaka.eth` is not Hsaka) */
const CLAIM: Record<string, string> = { seed: 'known', signed: 'signed', x: 'X', farcaster: 'Farcaster', primary: 'ENS', ens: 'ENS', basename: 'Basename', 'ens-text': 'X via ENS', sns: 'SNS', 'sns-owner': 'SNS', skr: 'Seeker', kolscan: 'kolscan', gmgn: 'GMGN', tag: 'explorer tag' }

/**
 * Lite's search (docs/lite-social-search.md §4.1, fomo's search in the tab bar): things to earn and
 * people, nothing else — Lite's own rows matched in words (`liteFind`), and wallets by name from the
 * index (`usePeopleFind`). Before a word is typed: recent picks, the people you follow, the top
 * earners, the four categories. Vaults, protocols and markets are Pro's, one link away.
 */
export function LiteSearch({ q0 }: { q0?: string }) {
  const { account } = useApp()
  const [q, setQ] = React.useState(q0 ?? '')
  const { recent, remember, clear } = useRecentPicks()
  const input = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => { input.current?.focus() }, [])
  // the query in the address, so Back from a result lands on the same results
  React.useEffect(() => {
    const t = setTimeout(() => history.replaceState(null, '', liteHref(q.trim() ? `search?q=${encodeURIComponent(q.trim())}` : 'search')), 300)
    return () => clearTimeout(t)
  }, [q])
  const L = useLiteMenu()
  const needle = q.trim()
  const rows = React.useMemo(() => liteFind(needle, L.rows), [needle, L.rows])
  const people = usePeopleFind(needle)
  const f = useMyFollows(account)
  // the best RATES, not the biggest wallets (docs/rate-boards.md): ordered as Lite's board orders them
  const board = useRateLeaders()
  const rateOf = React.useMemo(() => new Map((board.data?.rows ?? []).map((r) => [normAddr(r.account), r.netAprPct])), [board.data])
  const perDayOf = React.useMemo(() => new Map((board.data?.rows ?? []).map((r) => [normAddr(r.account), r.perDayUsd])), [board.data])
  const leaders = React.useMemo(() => boardWallets(board.data?.rows ?? [], 'apr').filter((r) => normAddr(r.account) !== normAddr(account ?? '')).slice(0, 5), [board.data, account])
  const { profile } = useProfiles([...people.hits.map((h) => h.key), ...f.wallets.slice(0, 8), ...leaders.map((r) => r.account)])

  const pickRow = (r: LiteRow) => remember({ id: `r:${r.s.id}`, title: r.title, href: liteHref(`${r.s.group}?s=${encodeURIComponent(r.s.id)}&k=${r.s.kind}`) })
  const openWallet = (h: FindHit) => remember({ id: `w:${h.key}`, title: h.title, href: liteWalletHref(h.key), addr: h.key })

  return (
    <div className="lite-page lite-search">
      <div className="lite-sbox" role="search">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m10.4 10.4 3.4 3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dollars, ETH, people…" aria-label="Search" autoComplete="off" spellCheck={false} />
        {q && <button type="button" className="s-clear" aria-label="Clear" onClick={() => { setQ(''); input.current?.focus() }}>×</button>}
      </div>

      {!needle ? (
        <>
          {recent.length > 0 && (
            <section className="lite-ss">
              <div className="sec-h"><h2>Recent</h2><button type="button" className="btn sm ghost" onClick={clear}>Clear</button></div>
              <div className="lite-chips">{recent.map((r) => (
                <a key={r.id} className="dchip" href={r.href}>{r.addr && <Face account={r.addr} size={16} />}{r.title}</a>
              ))}</div>
            </section>
          )}
          {f.wallets.length > 0 && (
            <section className="lite-ss">
              <div className="sec-h"><h2>People you follow</h2></div>
              <div className="lite-faces">{f.wallets.slice(0, 8).map((a) => (
                <a key={a} href={liteWalletHref(a)} aria-label={shortAddr(a)}><Face account={a} profile={profile(a)} size={44} /></a>
              ))}</div>
            </section>
          )}
          <section className="lite-ss">
            <div className="sec-h"><h2>Best rates right now</h2><a className="t50" href={liteHref('board?by=wallet')}>Board ›</a></div>
            <div className="card">
              {board.isLoading ? <div className="lite-sr"><Sk w={200} h={14} /></div>
                : leaders.map((r) => {
                  const day = perDayOf.get(normAddr(r.account))
                  return (
                  <div key={r.account} className="lite-sr">
                    <a className="lite-who" href={liteWalletHref(r.account)}><Who account={r.account} profile={profile(r.account)} size={28} plain sub={`${r.positions} position${r.positions === 1 ? '' : 's'}${day != null ? ` · ${usdShort(day)} a day` : ''}`} /></a>
                    <span className="lite-sr-v"><b className="ok">{pct(r.value, 1)}</b><small className="t50">a year</small></span>
                    <FollowButton kind="wallet" target={r.account} small quiet />
                  </div>
                  )
                })}
            </div>
          </section>
          <section className="lite-ss">
            <div className="sec-h"><h2>Earn on</h2></div>
            <div className="lite-chips">{GROUPS.filter((g) => LITE_GROUPS.includes(g.id)).map((g) => (
              <a key={g.id} className="dchip" href={liteHref(g.id)}><GroupIcon id={g.id} color={g.color} size={16} />{LITE_NAME[g.id]?.name ?? g.name}</a>
            ))}</div>
          </section>
        </>
      ) : (
        <>
          <section className="lite-ss">
            <div className="sec-h"><h2>Earn</h2></div>
            {rows.length ? <div className="lrows">{rows.map((r) => (
              <div key={r.s.id} onClickCapture={() => pickRow(r)}><LiteRowView r={r} get={L.get} proof={L.proof(r.s)} full /></div>
            ))}</div> : <p className="t50 lite-none">{L.rows.length ? `Nothing to earn on called “${needle}”.` : 'Reading the rates…'}</p>}
          </section>
          <section className="lite-ss">
            <div className="sec-h"><h2>People</h2>{people.loading && <span className="t50">looking…</span>}</div>
            {people.hits.length ? (
              <div className="card">{people.hits.map((h) => {
                const claim = h.match.typo ? 'did you mean' : CLAIM[h.match.source]
                const rate = rateOf.get(normAddr(h.key))
                return (
                  <div key={h.docId} className="lite-sr">
                    <a className="lite-who" href={liteWalletHref(h.key)} onClick={() => openWallet(h)}>
                      <Character addr={h.key} avatarUrl={profile(h.key)?.avatarUrl} size={28} />
                      <span className="wn"><b>{h.title}{claim && <span className="sr-claim">{claim}</span>}</b><small className="t50">{shortAddr(h.key)}{h.weightUsd > 0 ? ` · ${usdShort(h.weightUsd)} held` : ''}</small></span>
                    </a>
                    {rate != null && <span className="lite-sr-v"><b className="ok">{pct(rate, rate >= 10 ? 0 : 1)}</b><small className="t70">a year</small></span>}
                    <FollowButton kind="wallet" target={h.key} small quiet />
                  </div>
                )
              })}</div>
            ) : !people.loading && <p className="t50 lite-none">{needle.length < 2 ? 'Type a name, an ENS or an address.' : `Nobody called “${needle}”. A wallet is also found by its address.`}</p>}
          </section>
          <p className="lite-more t50"><a href={proHref(`#/?q=${encodeURIComponent(needle)}`)}>Vaults, protocols and markets for “{needle}”, in Pro ›</a></p>
        </>
      )}
    </div>
  )
}
