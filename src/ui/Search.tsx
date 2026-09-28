/**
 * One search box for everything the app has a page for: an asset to earn on,
 * a token the index lends, a curator's desk, a wallet.
 *
 * It replaces a nav link per kind of thing (Assets, and the USD / ETH / BTC /
 * More row beside it): a reader who knows what they want types it, and one
 * who does not has the tabs.
 *
 * Each source is asked only once the box has been opened, so the header costs
 * nothing on a page nobody searches from. The earn rows come from the
 * catalogue the app already holds; tokens are asked of the index by name (it
 * searches server-side); desks are the ranked list, filtered here. People are
 * found by address — there is no name search in the social service yet.
 */
import React from 'react'
import { useQuery } from '@tanstack/react-query'
import * as idx from '../index/api'
import { GROUPS, whatIs } from '../model/assets'
import { tokenHref, walletHref } from '../state/AppState'
import { useMenu } from './useMenu'
import { GroupIcon, Popover, Tok, pct, usdShort } from './bits'
import { shortAddr } from '../identity/name'

interface Hit { key: string; href: string; icon: React.ReactNode; label: React.ReactNode; sub: React.ReactNode }
const ADDR = /^0x[0-9a-fA-F]{40}$/
const MIN = 60_000

export function Search() {
  const box = React.useRef<HTMLDivElement>(null)
  const input = React.useRef<HTMLInputElement>(null)
  const [q, setQ] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [armed, setArmed] = React.useState(false)
  const [at, setAt] = React.useState(0)
  const needle = React.useDeferredValue(q.trim())
  const lo = needle.toLowerCase()

  // "/" focuses the box from anywhere that is not already a text field
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key !== '/' || e.metaKey || e.ctrlKey || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return
      e.preventDefault()
      input.current?.focus()
    }
    addEventListener('keydown', h)
    return () => removeEventListener('keydown', h)
  }, [])

  const menu = useMenu()
  const tokens = useQuery({
    enabled: armed && lo.length >= 2,
    queryKey: ['search-assets', lo],
    queryFn: ({ signal }) => idx.assets({ q: lo, limit: 5 }, signal),
    staleTime: 5 * MIN,
    retry: false,
    placeholderData: (prev) => prev,
  })
  // the same key as `useCurators()`, so a page that already listed desks answers this from cache
  const desks = useQuery({
    enabled: armed,
    queryKey: ['curators', 'all', 60],
    queryFn: () => idx.curators({ win: '30d', limit: 60 }),
    staleTime: 10 * MIN,
  })

  const hits: Hit[] = React.useMemo(() => {
    if (!lo) return []
    const out: Hit[] = []
    if (ADDR.test(needle)) out.push({ key: 'w', href: walletHref(needle), icon: <span className="sr-ic">⌂</span>, label: shortAddr(needle), sub: 'open this wallet' })
    // one row per asset the menu can earn on, carrying the best it pays
    const best = new Map<string, { group: string; rate: number; n: number }>()
    for (const s of menu.all) {
      if (!s.asset.toLowerCase().includes(lo)) continue
      const cur = best.get(s.asset)
      best.set(s.asset, { group: s.group, rate: Math.max(cur?.rate ?? -Infinity, s.rate), n: (cur?.n ?? 0) + 1 })
    }
    for (const [asset, b] of [...best].sort((x, y) => Number(!x[0].toLowerCase().startsWith(lo)) - Number(!y[0].toLowerCase().startsWith(lo)) || y[1].rate - x[1].rate).slice(0, 5))
      out.push({ key: `e:${asset}`, href: `#/${b.group}?u=${encodeURIComponent(asset)}`, icon: <Tok sym={asset} size={22} />, label: <>Earn on {asset}</>, sub: <>up to <span className="ok">{pct(b.rate)}</span> · {b.n} strateg{b.n === 1 ? 'y' : 'ies'}</> })
    for (const g of GROUPS) if (g.name.toLowerCase().includes(lo) || g.id.toLowerCase() === lo)
      out.push({ key: `g:${g.id}`, href: `#/${g.id}`, icon: <GroupIcon id={g.id} color={g.color} size={22} />, label: g.name, sub: g.desc })
    for (const r of tokens.data?.assets ?? [])
      out.push({ key: `t:${r.group}`, href: tokenHref(r.group), icon: <Tok sym={r.symbol ?? r.group} logo={r.logoUri ?? undefined} size={22} />, label: r.symbol ?? r.group, sub: <>{r.name ?? whatIs(r.symbol ?? '')} · {usdShort(r.depositsUsd)} lent</> })
    for (const c of (desks.data?.curators ?? []).filter((c) => (c.name ?? '').toLowerCase().includes(lo)).slice(0, 4))
      out.push({ key: `c:${c.curatorId}`, href: `#/c/${encodeURIComponent(c.curatorId)}`, icon: <span className="sr-ic">◇</span>, label: c.name, sub: 'curator' })
    return out
  }, [lo, needle, menu.all, tokens.data, desks.data])

  React.useEffect(() => setAt(0), [lo])
  const pick = (h: Hit | undefined) => {
    if (!h) return
    location.hash = h.href
    setQ('')
    setOpen(false)
    input.current?.blur()
  }
  const busy = (tokens.isFetching && lo.length >= 2) || menu.isLoading
  return (
    <div ref={box} className="search" role="search">
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden className="s-glass"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="m10.4 10.4 3.4 3.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      <input ref={input} type="search" value={q} placeholder="Search assets, desks, wallets" aria-label="Search"
        aria-expanded={open && !!lo} aria-controls="search-results" autoComplete="off" spellCheck={false}
        onFocus={() => { setArmed(true); setOpen(true) }}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(i + 1, hits.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(i - 1, 0)) }
          else if (e.key === 'Enter') { e.preventDefault(); pick(hits[at]) }
          else if (e.key === 'Escape') { setOpen(false); input.current?.blur() }
        }} />
      <Popover anchor={box} open={open && !!lo} onClose={() => setOpen(false)} width={380} align="left">
        <div id="search-results" className="sresults" role="listbox" aria-label="Results">
          {hits.map((h, i) => (
            <a key={h.key} href={h.href} role="option" aria-selected={i === at} className="sr"
              onMouseEnter={() => setAt(i)} onClick={(e) => { e.preventDefault(); pick(h) }}>
              {h.icon}
              <span className="sr-t"><b>{h.label}</b><small>{h.sub}</small></span>
            </a>
          ))}
          {!hits.length && <div className="sr-none">{busy ? 'Looking…' : <>Nothing called “{needle}”. A wallet is found by its full 0x address.</>}</div>}
        </div>
      </Popover>
    </div>
  )
}
